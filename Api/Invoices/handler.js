'use strict'
const mysql = require('mysql2/promise')
const moment = require('moment-timezone')
const isOffline = process.env['IS_OFFLINE']
const { dbConfig } = require(`${isOffline ? '../..' : '.'}/commons/dbConfig`)
const { response, wakeUpLambda } = require(`${isOffline ? '../..' : '.'}/commons/utils`)
const { buildXML, generateCorrelative, buildXMLAllInclude } = require('./functions')
const xml2js = require('xml2js')
const SOAP = require('soap')
const AWS = require('aws-sdk')
const warmer = require('lambda-warmer')
AWS.config.update({ region: 'us-east-1' })
const SNS = new AWS.SNS()

let storage = require('./invoiceStorage')

module.exports.create = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    let data = JSON.parse(event.body)
    console.log(data)
    const validation = storage.isEmpty(data)
    if (validation) throw `missing_parameter. ${validation}`

    const date = moment().tz('America/Guatemala').format('YYYY-MM-DD')

    const correlative = await generateCorrelative(connection, storage.getCorrelative())
    console.log(correlative, 'tt')

    await connection.beginTransaction()
    // header invoice

    const [create] = await connection.execute(storage.post(data, date, correlative))

    if (!create) throw Error('Error creating Header Invoices')

    data.transaction_number = create.insertId
    let xml_form = ''
    //build XML
    if (data.document_type === 'TARIFA_INDIVIDUAL') xml_form = buildXML(data, moment)
    else xml_form = buildXMLAllInclude(data, moment)

    //return response(200, xml_form, connection)

    let invoiceData = {
      Cliente: process.env['CLIENT_FACT_DEV'],
      Usuario: process.env['USER_FACT_DEV'],
      Clave: process.env['PASSWORD_FACT_DEV_ID'],
      Nitemisor: process.env['NIT_FACT_DEV'],
      Xmldoc: xml_form,
    }
    const log = await connection.execute(storage.saveToLog(invoiceData, date, create.insertId))
    if (!log[0].insertId) throw Error('Error creating log')
    console.log('making request')
    const xml_response = await storage.makeRequestSoap(SOAP, process.env['URL_DEV_FACT'], invoiceData)
    console.log('finishing request')
    const json = await storage.parseToJson(xml_response.Respuesta, xml2js, date)

    if (json.Errores) throw Error(JSON.stringify(json.Errores.Error))

    const date_download = moment().tz('America/Guatemala').format('YYYY-MM-DD')
    //create detail
    if (create.affectedRows > 0) {
      await Promise.all(
        data.items.map(async x => {
          let detail = await connection.execute(storage.createDetail(x, create.insertId))
          //download to Inventory
          if (x.package_id && (x.cod_service === 1 || x.cod_service === 5 || x.cod_service === 7))
            await connection.execute(storage.downloadSimple(date_download, x.package_id))
          return detail
        })
      )
    }

    let serializerResponse = {
      create_at: json.DTE ? json.DTE.FechaEmision[0] : null,
      certification_date: json.DTE.FechaCertificacion ? json.DTE.FechaCertificacion[0] : null,
      autorization_number: json.DTE.NumeroAutorizacion ? json.DTE.NumeroAutorizacion[0] : null,
      sat_number: json.DTE.Numero ? json.DTE.Numero[0] : null,
      error: json.DTE.Error ? json.DTE.Error[0] : null,
      pdf: json.DTE.Pdf[0],
      xml: json.DTE.Xml[0],
    }
    //console.log(serializerResponse, 'serializerResponse')

    await connection.execute(storage.updatedToLog(serializerResponse, date, create.insertId))
    await connection.execute(storage.updatedDocument(serializerResponse, create.insertId))
    //create account
    await connection.execute(storage.createReconciliation(create.insertId, date))

    await connection.commit()

    if (serializerResponse.error) throw new Error(JSON.stringify(serializerResponse.error))

    delete serializerResponse.pdf
    delete serializerResponse.xml

    return response(200, serializerResponse, connection)
  } catch (e) {
    console.log(e)
    //await connection.rollback()
    //await connection.end()
    return response(400, e.message, connection)
  }
}

module.exports.documents = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    let params = {
      id: null,
      type: null,
    }

    if (event.queryStringParameters && event.queryStringParameters.type) {
      params.type = event.queryStringParameters.type
    }

    if (event.queryStringParameters && event.queryStringParameters.id) {
      params.id = event.queryStringParameters.id
    }

    const [documents] = await connection.execute(storage.get(params))
    
    //get packages descriptions
    let packagesList = documents.map(element => element.observations.replace('Guias # ','').replace(/\s/g, '').slice(0, -1).split(','))
    let packagesIds = [...new Set([].concat.apply([], packagesList))]
    let packagesIdsString = packagesIds.map(element => `'${element}'`)
    const [packagesDescriptions] = await connection.execute(storage.getPackagesDescription(packagesIdsString))
    
    documents.forEach(element=>{      
      element.descripcionPaquetes = packagesDescriptions.filter(el => element.observations.includes(el.guia))
    })

    return response(200, documents, connection)
  } catch (e) {
    return response(400, e.message, connection)
  }
}

module.exports.document = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const id = event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : undefined

    if (!id) throw Error('Missing_id')

    const [documents] = await connection.execute(storage.getDetail(id))

    return response(200, documents, connection)
  } catch (e) {
    return response(400, e.message, connection)
  }
}

module.exports.documentPDF = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const id = event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : undefined

    if (!id) throw Error('Missing_id')

    const [documents] = await connection.execute(storage.getDetailPDF(id))

    return response(200, documents && documents[0] ? documents[0] : [], connection)
  } catch (e) {
    return response(400, e.message, connection)
  }
}

module.exports.documentByClient = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const client = event.pathParameters && event.pathParameters.id ? event.pathParameters.id : undefined

    if (!client) throw Error('Missing_client')

    const [documents] = await connection.execute(storage.getDocumentByClient(client))

    //if (documents.length === 0) throw Error('This client does not have packages to generate an Invoice')

    const [client_info] = await connection.execute(storage.getClientInfo(client))

    const [services] = await connection.execute(storage.products())

    let data = {
      packages: documents,
      client: client_info[0],
      services: services,
    }

    return response(200, data, connection)
  } catch (e) {
    return response(400, e.message, connection)
  }
}

module.exports.annul = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    if (await warmer(event)) return response(200, { message: 'just warnUp me' }, null)
    let data = JSON.parse(event.body)
    //id document
    const id = event.pathParameters && event.pathParameters.id ? event.pathParameters.id : undefined
    const validation = storage.isEmpty(data)
    if (validation) throw `missing_parameter. ${validation}`

    const [documents] = await connection.execute(storage.getDetail(id))

    if (documents.length === 0 || !documents[0].num_authorization_sat) throw new Error(`Error the autorization number is required`)

    let invoiceData = {
      Cliente: process.env['CLIENT_FACT_DEV'],
      Usuario: process.env['USER_FACT_DEV'],
      Clave: process.env['PASSWORD_FACT_DEV_ID'],
      Nitemisor: process.env['NIT_FACT_DEV'],
      Numautorizacionuuid: documents[0].num_authorization_sat,
      Motivoanulacion: data.reason,
    }

    const dataToSns = {
      invoice: invoiceData,
      id: id,
      userData: data,
    }
    console.log(dataToSns, 'sending data to annul')
    const date = moment().tz('America/Guatemala').format('YYYY-MM-DD')
    await connection.execute(storage.invoiceAnnul(data, date, id, 1))
    let snsParams = {
      Message: JSON.stringify(dataToSns),
      TopicArn: `arn:aws:sns:us-east-1:${process.env['ACCOUNT_ID']}:annulSNSprod`,
      //TopicArn: `arn:aws:sns:us-east-1:${process.env['ACCOUNT_ID']}:annulSNSdev`,
    }
    await SNS.publish(snsParams).promise()

    return response(200, { message: `Procesando la anulación factura: ${id}` }, connection)
  } catch (e) {
    console.log(e)
    return response(400, e.message, connection)
  }
}

module.exports.annulSNS = async event => {
  let body = event.body
    ? typeof event.body === 'string'
      ? JSON.parse(event.body)
      : event.body
    : event.Records
    ? JSON.parse(event.Records[0].Sns.Message)
    : null
  console.log(body)
  try {
    const date = moment().tz('America/Guatemala').format('YYYY-MM-DD hh:mm:ss')
    console.log(process.env['URL_DEV_FACT_CANCEL'], 'url')
    const xml_response = await storage.makeRequestSoap(SOAP, process.env['URL_DEV_FACT_CANCEL'], body.invoice)
    console.log('eco factura Response: ')
    if (xml_response && xml_response.Envelope === null) throw new Error(`Error connecting with Ecofactura`)

    if (xml_response.Fault) throw new Error(`${xml_response.Fault.faultstring}`)

    const json = await storage.parseToJson(xml_response.Respuesta, xml2js)

    if (json.Errores) throw Error(JSON.stringify(json.Errores.Error))

    const connection = await mysql.createConnection(dbConfig)
    await connection.execute(storage.invoiceAnnul(body.userData, date, body.id, 3))

    let serializerResponse = {
      create_at: json.DTE ? json.DTE.FechaAnulacion[0] : null,
      certification_date: json.DTE.FechaCertificacion ? json.DTE.FechaCertificacion[0] : null,
      error: json.DTE.Error ? json.DTE.Error[0] : null,
      pdf: json.DTE.Pdf[0],
      xml: json.DTE.Xml[0],
    }

    //validate if exists an error
    const validateResponse = serializerResponse.hasOwnProperty('error')
    
    if(!!validateResponse && serializerResponse.error != null){      
      
      console.log("ERROR >>> ",serializerResponse)
      
      let alreadyAnnul = serializerResponse.error['_']

      if(alreadyAnnul == "EL DOCUMENTO YA ESTA ANULÁDO"){        
        await connection.execute(storage.updatedToLog(serializerResponse, date, body.id))
        await connection.execute(storage.revertPackage(body.id))
        await connection.execute(storage.revertConciliation(body.id, date))
        console.log("EL DOCUMENTO YA ESTA ANULÁDO")
        return response(400, { message: 'EL DOCUMENTO YA ESTA ANULÁDO' }, connection)
      } 

      throw new Error(`Error on invoice validate`)      
    }

    //update packages info
    await connection.execute(storage.updatedToLog(serializerResponse, date, body.id))
    await connection.execute(storage.revertPackage(body.id))
    await connection.execute(storage.revertConciliation(body.id, date))
    
    console.log('** all updated **')
    delete serializerResponse.pdf
    delete serializerResponse.xml    
    console.log('finished', serializerResponse)
    
    return response(200, serializerResponse, connection)

  } catch (e) {
    const connection = await mysql.createConnection(dbConfig)
    await connection.execute(storage.invoiceAnnul('', '', body.id, 5))    
    console.log(e, 'annulSNS-ERROR')
    return response(400, { message: 'Error' }, connection)
  }
}

module.exports.payments = async () => {
  try {
    const connection = await mysql.createConnection(dbConfig)

    const [documents] = await connection.execute(storage.payments())

    return response(200, documents, connection)
  } catch (e) {
    return response(400, e.message, null)
  }
}

module.exports.getStores = async () => {
  try {
    const connection = await mysql.createConnection(dbConfig)

    const [stores] = await connection.execute(storage.stores())

    return response(200, stores, connection)
  } catch (e) {
    return response(400, e.message, null)
  }
}
/// Accounts reconciliation Section

module.exports.updateReconciliation = async event => {
  try {
    let data = JSON.parse(event.body)

    const validation = storage.isEmpty(data)
    if (validation) throw `missing_parameter. ${validation}`

    const id = event.pathParameters && event.pathParameters.id ? event.pathParameters.id : undefined

    const connection = await mysql.createConnection(dbConfig)

    const date = moment().tz('America/Guatemala').format('YYYY-MM-DD')

    const [update] = await connection.execute(storage.updateReconciliation(data, id, date))

    if (!update) throw Error('Error creating the record')

    return response(200, update, connection)
  } catch (e) {
    console.log(e)
    return response(400, e.message, null)
  }
}

module.exports.reconciliation = async event => {
  try {
    let params = {
      id: null,
      type: null,
    }

    if (event.queryStringParameters && event.queryStringParameters.type) {
      params.type = event.queryStringParameters.type
    }

    if (event.queryStringParameters && event.queryStringParameters.id) {
      params.id = event.queryStringParameters.id
    }
    if (params.type === 'date') {
      const date = moment(params.id).format('YYYY-MM-DD 00:00:00')

      params.start = date
      params.end = moment(date).format('YYYY-MM-DD 23:59:99')
    }
    const connection = await mysql.createConnection(dbConfig)
    const [accounts] = await connection.execute(storage.getReconciliation(params))
    return response(200, accounts, connection)
  } catch (e) {
    console.log(e)
    return response(400, e.message, null)
  }
}

module.exports.getCreditCardFee = async () => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const [rows] = await connection.execute(storage.getCreditCardFee())
    const creditCardFeePercent = rows[0] ? parseFloat(rows[0].setting_value) : null

    return response(
      200,
      {
        creditCardFeePercent,
        updated_at: rows[0] ? rows[0].updated_at : null,
        updated_by: rows[0] ? rows[0].updated_by : null,
      },
      connection
    )
  } catch (e) {
    console.log(e)
    return response(400, e.message, connection)
  }
}

module.exports.updateCreditCardFee = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const data = JSON.parse(event.body)
    const creditCardFeePercent = data.creditCardFeePercent

    if (creditCardFeePercent === null || creditCardFeePercent === undefined || creditCardFeePercent === '') {
      throw Error('creditCardFeePercent is required')
    }

    const fee = parseFloat(creditCardFeePercent)
    if (isNaN(fee) || fee < 0 || fee > 100) {
      throw Error('creditCardFeePercent must be a number between 0 and 100')
    }

    const date = moment().tz('America/Guatemala').format('YYYY-MM-DD HH:mm:ss')
    await connection.execute(storage.upsertCreditCardFee(fee, date, data.updated_by))

    return response(200, { creditCardFeePercent: fee }, connection)
  } catch (e) {
    console.log(e)
    return response(400, e.message, connection)
  }
}
