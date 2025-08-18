'use strict'
const mysql = require('mysql2/promise')
const moment = require('moment-timezone')
const isOffline = process.env['IS_OFFLINE']
const { dbConfig } = require(`${isOffline ? '../..' : '.'}/commons/dbConfig`)
let { response, getBody, escapeFields, notifyEmail } = require(`${isOffline ? '../..' : '.'}/commons/utils`)
let storage = require('./packageStorage')
const request = require('request')
const date = moment().tz('America/Guatemala').format('YYYY-MM-DD')
const { openSession, getSendSMSviaSNSParams, sendSMSviaSNS, createLogsviaSNS } = require('./functions')

const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
const sns = new AWS.SNS()

module.exports.read = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    let page = 0
    let type = null
    let id = null

    if (event.queryStringParameters && event.queryStringParameters.page) {
      page = event.queryStringParameters.page
    }

    if (event.queryStringParameters && event.queryStringParameters.type) {
      type = event.queryStringParameters.type
    }

    if (event.queryStringParameters && event.queryStringParameters.id) {
      id = event.queryStringParameters.id
    }

    const [packages] = await connection.execute(storage.get(page, type, id))

    return response(200, packages, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.detail = async (event, context) => {
  let connection = await mysql.createConnection(dbConfig)
  try {
    console.log(event.pathParameter, 'event.pathParameter')
    const package_id = event.pathParameters && event.pathParameters.package_id ? JSON.parse(event.pathParameters.package_id) : undefined

    if (package_id === undefined) throw 'pathParameters missing'

    const [users] = await connection.execute(storage.getByid(package_id))
    return response(200, users, connection)
  } catch (e) {
    return response(400, e, connection)
  }
}

module.exports.readPackagesByTracking = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const tracking = event.pathParameters && event.pathParameters.tracking

    if (!tracking) throw 'pathParameters missing'

    const [rawPackages] = await connection.execute(storage.readPackagesByTracking(tracking))

    const packages = rawPackages.map(p => ({
      guia: p.guia,
      provider: p.supplier_id,
      carrier: p.carrier_id,
      description: p.description,
      billValue: p.costo_producto,
      destiny: p.destination_id,
      entranceDetail: {
        quantity: 1,
        grams: Math.round((Number(p.weight * 453.59237) + Number.EPSILON) * 100) / 100,
        weight: p.weight,
        pcs: 1,
      },
      tracking: p.tracking,
      tariff: p.tasa,
      measurements: p.measurements,
      providerNameTxt: p.provider_name,
      billVoucher: p.voucher_bill,
      paymentVoucher: p.voucher_payment,
      consignee: {
        id: p.id,
        name: p.client_name,
        email: p.email,
        client_id: p.client_id,
        phone: p.phone,
        entrega: p.entrega,
        cuota: p.cuota,
        date_created: p.date_created,
        preferences: p.preferences,
        message_user: p.message_user,
        nit: p.nit,
        main_address: p.main_address,
        flete: p.flete,
        desaduanaje: p.desaduanaje,
      },
    }))

    return response(200, packages, connection)
  } catch (e) {
    return response(400, e, connection)
  }
}

module.exports.create = async (event, context) => {
  let connection = await mysql.createConnection(dbConfig)
  let actionLog = 'package-create'
  try {
    let data = JSON.parse(event.body)
    if (!data.tracking || !data.client_id || !data.weight || !data.description) throw 'missing_parameter.'

    data.ing_date = date

    const [checkPackage] = await connection.execute(storage.findByTracking(data))

    if (checkPackage.length > 0) {
      //update package
      // actionLog = 'package-update'
      // console.log('update pkg', data)
      // const [update] = await connection.execute(storage.put(checkPackage[0], data, date, null))
      // if (update) await connection.execute(storage.postDetail(data, checkPackage[0].package_id, date))
      console.log('package-create - El paquete ya existe ', data)
      throw new Error('PAQUETE YA EXISTE')
    } else if (data.status === 'Registrado') {
      //created by client
      actionLog = 'package-create-by-client'
      console.log('create by client pkg', data)
      const [save] = await connection.execute(storage.createByClient(data))
      console.log('save object ', save)
      if (save) {
        console.log('post detail')
        const [postDetail_result] = await connection.execute(storage.postDetail(data, save.insertId, date, 'Registrado'))
        console.log('postDetail_result ', postDetail_result)
      }
    } else {
      // create by system
      console.log('create by system pkg', data)
      const [result] = await connection.execute(storage.findMaxPaqueteById())
      const newGuiaId = parseInt(result[0].id) + 1

      const validateGuia = !!newGuiaId
      if (!validateGuia) {
        console.log('No se ha creado la guia, intente nuevamente from createPackage >> ', newGuiaId)
        throw new Error('No se ha creado la guia, intente nuevamente')
      }

      const [save] = await connection.execute(storage.post(data, newGuiaId))

      if (save) await connection.execute(storage.postDetail(data, save.insertId, date))
    }

    const [userData] = await connection.execute(storage.getUserInfo(data.client_id))

    if (!data.status || data.status !== 'Registrado') {
      let template = prepareToSend(data, userData)
      const validate =
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      if (validate.test(String(userData[0].email).toLowerCase())) {
        //await notifyEmail(AWS, template)
      }

      let payload = {
        profile: userData,
        data: data,
      }
      const params = {
        Message: JSON.stringify(payload),
        TopicArn: `arn:aws:sns:us-east-1:${process.env['ACCOUNT_ID']}:sms-${process.env['STAGE']}-tigo`,
      }

      await new Promise((resolve, reject) => {
        sns.publish(params, error => {
          if (error) {
            console.log('SNS error ', error)
            reject(error)
          } else {
            console.log('added')
            resolve('added')
          }
        })
      })
    }

    //ledr-logs
    await createLogsviaSNS(data, actionLog)

    return response(200, data, connection)
  } catch (e) {
    // console.log(e)
    // return response(400, e, connection)
    const message = e.message ? e.message : e
    console.log('error >>', message)
    return await response(400, { error: message }, connection)
  }
}

module.exports.update = async (event, context) => {
  console.log('--UPDATE METHOD--')

  const connection = await mysql.createConnection(dbConfig)
  try {
    const package_id = event.pathParameters && event.pathParameters.package_id ? JSON.parse(event.pathParameters.package_id) : undefined

    const download =
      event.queryStringParameters && event.queryStringParameters.download ? JSON.parse(event.queryStringParameters.download) : undefined

    if (package_id === undefined) throw 'pathParameters missing'

    let data = JSON.parse(event.body)

    if (!data) throw 'no data to update'

    /* Status
     * En Transito
     * Listo para Entrega en Domicilio
     * Recoger en Traestodo
     * Entregado
     * Entregado con saldo pendiente
     * */
    if (download) {
      const update = await connection.execute(storage.downloadSimple(date, package_id))
    } else {
      console.log('2')
      const update = await connection.execute(storage.updateStatus(data, package_id, date, data.status))
    }

    //if (update && data.status === 'Entregado con saldo pendiente') {
    const today = moment().tz('America/Guatemala').format('YYYY-MM-DD hh:mm:ss')
    await connection.execute(storage.saveRemaining(data, today))
    //}

    //ledr-logs
    await createLogsviaSNS(data, 'package-update')

    return response(200, data, connection)
  } catch (e) {
    console.log(e, 't')
    return response(400, e, connection)
  }
}

module.exports.delete = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const package_id = event.pathParameters && event.pathParameters.package_id ? JSON.parse(event.pathParameters.package_id) : undefined

    if (package_id === undefined) throw 'pathParameters missing'

    const update = await connection.execute(storage.delete(package_id))

    return response(200, update, connection)
  } catch (e) {
    return response(400, e, connection)
  }
}

module.exports.updateStatus = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    let data = {}

    const package_id = event.pathParameters && event.pathParameters.package_id ? JSON.parse(event.pathParameters.package_id) : undefined

    if (event.queryStringParameters && event.queryStringParameters.status) {
      data.status_detail = event.queryStringParameters.status
    }

    const date = moment().tz('America/Guatemala').format('YYYY-MM-DD hh:mm:ss')

    const [packages] = await connection.execute(storage.postDetail(data, package_id, date))

    return response(200, packages, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.transfer = async (event, context) => {
  let connection = await mysql.createConnection(dbConfig)
  try {
    let data = JSON.parse(event.body)

    const [checkPackage] = await connection.execute(storage.transfer(data))

    const [log] = await connection.execute(storage.logPackage(data))

    return response(200, checkPackage, connection)
  } catch (e) {
    console.log(e, 'error')
    return response(200, e, connection)
  }
}

module.exports.transferClient = async (event, context) => {
  let connection = await mysql.createConnection(dbConfig)
  try {
    let data = JSON.parse(event.body)

    const [checkClients] = await connection.execute(storage.checkClient(data.client_id.toUpperCase()))

    if (checkClients.length === 0) {
      connection.end()
      throw Error('El codigo cliente no existe.')
    }

    const [checkNewCode] = await connection.execute(storage.checkClient(data.new_client_id.toUpperCase()))

    if (checkNewCode.length > 0) {
      connection.end()
      throw Error('El nuevo codigo existe asociado a otro client')
    }
    //update
    await connection.execute(storage.updateClient(data))
    await connection.execute(storage.updateClientPackages(data))
    const [log] = await connection.execute(storage.logPackage(data))

    return response(200, checkClients, connection)
  } catch (e) {
    console.log(e, 'error')
    return response(400, e.message, connection)
  }
}

function prepareToSend(user, profile) {
  let MSG = ``
  if (user.client_id.charAt(0) === 'P') {
    MSG = `<p><br />Queríamos informarle que ya tenemos un paquete listo en nuestras oficinas, puede ser enviado a domicilio o entregado en nuestras oficinas, los datos del paquete son los siguientes:<br />
                <div>
                  Tracking: ${user.tracking} <br />
                  Peso en Lbs: ${user.weight} <br />
                <div>
                </p>
                Nuestro horario de atención es de Lunes a Viernes de 9:00 a 18:00 horas, y nuestra dirección es:
                 5 Avenida 16-28 Local D, Zona 10 Guatemala, CA.
                 Envíanos un correo a : info@primenowcourier.com si quieres que te enviemos tu paquete a domicilio o llamanos Telefonos: 22193432 - 33481631 <br /> `
  } else {
    MSG = `<p><br />Le informamos que se ha recibido  un paquete en su casillero y se encuentra disponivoe en Guatemala, los datos del paquete son los siguientes:<br />
                <div>
                  Tracking: ${user.tracking} <br />
                  Peso en Lbs: ${user.weight} <br />
                <div>
                </p>
                Para coordinación de entrega comunicarse a el número 5803-2545 o correo eléctrico Info@rapiditoexpress.com <br /> `
  }

  const template = {
    mailList: [profile[0].email],
    from: 'info@primenowcourier.com',
    subject: `Paquete listo para entrega!!`,
    bcc: ['cesar.augs@gmail.com'],
    body: {
      Html: {
        Charset: 'UTF-8',
        Data: MSG,
      },
    },
  }
  return template
}

function prepareToSendOnHold(userData) {
  let MSG = `El paquete del cliente con codigo ${userData.data.client_id} tiene un paquete a ticket. Numero de Tracking: ${userData.data.tracking}`
  const template = {
    mailList: ['soporte@nowexpresscourier.com', 'ledr1993@gmail.com'],
    from: 'info@primenowcourier.com',
    subject: `Paquete en Ticket`,
    body: {
      Html: {
        Charset: 'UTF-8',
        Data: MSG,
      },
    },
  }
  return template
}

module.exports.sendPrime = async event => {
  try {
    const uuidv1 = require('uuid/v1')
    const id = uuidv1()

    let params = event.body
      ? typeof event.body === 'string'
        ? JSON.parse(event.body)
        : event.body
      : event.Records
      ? JSON.parse(event.Records[0].Sns.Message)
      : null

    console.log(params)
    //subir codigo de los mensajes.
    if (!params) throw 'no_params'

    let SMS = `NOW EXPRESS informa que su paquete con tracking ${params.data.tracking} ha sido recibido en nuestra bodega de Miami. Cualquier consulta contáctenos a 2376-4699 / 3237-0023.`

    if (!params.warehouse) {
      switch (params.data.client_id.charAt(0)) {
        case 'P':
          SMS = `NOW EXPRESS informa que tiene un paquete con tracking ${params.data.tracking}, Cliente: ${params.data.client_id}, Total: ${params.data.total}  en nuestras oficinas. Contactenos al telefono 2376-4699 / 3237-0023`
          break
        case 'T':
          SMS = `TRAESTODO informa que tiene un paquete con tracking ${params.data.tracking}, Cliente: ${params.data.client_id}, LBs: ${params.data.weight} . Para coordinación de entrega comunicarse al 4154-4275`
          break
        default:
          SMS = `Rapidito Express informa que tiene un paquete con tracking ${params.data.tracking}, Cliente: ${params.data.client_id}, LBs: ${params.data.weight} . Para coordinación de entrega comunicarse al 5803-2545 o email: Info@rapiditoexpress.com`
      }
    }

    const phone = `502${params.profile[0].phone}`

    let URL = `https://comunicador.tigo.com.gt/api/http/send_to_contact?msisdn=${phone}&message=${SMS}&api_key=${process.env['API_KEY_TIGO']}&id=${id}`

    return new Promise((resolve, reject) => {
      request(
        {
          url: URL,
          method: 'GET',
          headers: {
            'content-type': 'application/json',
          },
          json: true,
        },
        function (error, result, body) {
          console.log(body, 'body')
          if (error) reject(error)
          resolve(body)
        }
      )
    })
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, null)
  }
}

module.exports.sendSMSTigo = async event => {
  try {
    let params = event.body
      ? typeof event.body === 'string'
        ? JSON.parse(event.body)
        : event.body
      : event.Records
      ? JSON.parse(event.Records[0].Sns.Message)
      : null

    const session = await openSession()

    if (!session.access_token) throw Error('Api de tigo no responde.')

    console.log(params, 'params')

    //subir codigo de los mensajes.
    if (!params) throw 'no_params'

    let SMS = ''
    const action = params.profile[0].contact_name

    if (action === 'AdminChargeReport') {
      SMS = 'Se generó ingreso de carga de paquetería en el sistema.'
    } else if (params.data.status === 'On Hold') {
      SMS = `NOW EXPRESS su paquete con tracking ${params.data.tracking} a pasado a TICKET, por lo que le solicitamos se comunique a nuestro call center 2376-4699 / 5803-2545.`
    } else {
      switch (params.data.client_id.charAt(0)) {
        case 'P':
          SMS = params.warehouse
            ? `NOW EXPRESS, recibimos en MIAMI tu paquete. Tracking: ${params.data.tracking}. Para consultas bit.ly/3JDt0gl`
            : `NOW EXPRESS, Tu paquete esta en Guatemala. Tracking: ${params.data.tracking}, Total: ${params.data.total} . Coordina tu entrega aquí: bit.ly/3JDt0gl`
          break
        case 'T':
          SMS = params.warehouse
            ? `NOW EXPRESS, recibimos en MIAMI tu paquete. Tracking: ${params.data.tracking}. Para consultas bit.ly/3JDt0gl`
            : `NOW EXPRESS, Tu paquete esta en Guatemala. Tracking: ${params.data.tracking}, Total: ${params.data.total} . Coordina tu entrega aquí: bit.ly/3JDt0gl`
          break
        default:
          SMS = params.warehouse
            ? `NOW EXPRESS, recibimos en MIAMI tu paquete. Tracking: ${params.data.tracking}. Para consultas bit.ly/3JDt0gl`
            : `NOW EXPRESS, Tu paquete esta en Guatemala. Tracking: ${params.data.tracking}, Total: ${params.data.total} . Coordina tu entrega aquí: bit.ly/3JDt0gl`
      }
    }

    if (SMS.length > 160) {
      SMS = SMS.slice(0, 160)
    }

    let phoneFromRequest = params.profile[0].phone
    const phone = phoneFromRequest.includes('+1') ? phoneFromRequest : `502${params.profile[0].phone}`

    var options = {
      method: 'POST',
      url: process.env['URL_TIGO'],
      headers: {
        'Content-Type': 'application/json',
        APIKey: process.env['TIGO_API_KEY'],
        APISecret: process.env['TIGO_SECRET_KEY'],
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        protocol: 'sms',
        shortcodeId: 'NowExpres',
        shortcodeType: 'pretty_code',
        msisdn: phone,
        priority: 0,
        body: SMS,
      }),
    }
    let P = await new Promise((resolve, reject) => {
      request(options, function (error, response) {
        if (error) reject(error)
        console.log(response.body)
        resolve(response.body)
      })
    })

    //SEND SMS TO SUPPORT

    if (params.data.status === 'On Hold') {
      let template = prepareToSendOnHold(params)
      await notifyEmail(AWS, template)
    }

    return response(200, P, null)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, null)
  }
}

module.exports.sesTopic = async (event, context) => {
  try {
    console.log(event, 'check event')
    return response(200, event, null)
  } catch (e) {
    console.log(e, 'error')
    return response(400, e, null)
  }
}

module.exports.guides = async (event, context) => {
  let connection = await mysql.createConnection(dbConfig)
  try {
    let data = JSON.parse(event.body)
    if (!data.master || !data.poliza) throw 'missing_parameter'

    data.date_created = date

    //status [ACTIVE,CLOSED]
    const [checkCuide] = await connection.execute(storage.checkGuide(data))
    console.log(checkCuide, 'checkCuide')

    if (checkCuide.length === 0) {
      const [save] = await connection.execute(storage.postGuide(data))
    }

    return response(200, data, connection)
  } catch (e) {
    console.log(e)
    return response(400, e, connection)
  }
}

module.exports.getGuides = async (event, context) => {
  let connection = await mysql.createConnection(dbConfig)
  try {
    const [guides] = await connection.execute(storage.getGuides())

    return response(200, guides, connection)
  } catch (e) {
    console.log(e)
    return response(400, e, connection)
  }
}

module.exports.getGuidesOpen = async (event, context) => {
  let connection = await mysql.createConnection(dbConfig)
  try {
    const [guides] = await connection.execute(storage.getGuidesOpens())

    return response(200, guides, connection)
  } catch (e) {
    console.log(e)
    return response(400, e, connection)
  }
}

module.exports.closeGuides = async (event, context) => {
  let connection = await mysql.createConnection(dbConfig)
  try {
    console.log(event.queryStringParameters, 'queryStringParameters')
    const data = {
      master: event.queryStringParameters && event.queryStringParameters.master ? event.queryStringParameters.master : undefined,
      poliza: event.queryStringParameters && event.queryStringParameters.poliza ? event.queryStringParameters.poliza : undefined,
    }

    if (data.master === undefined) throw 'pathParameters missing'

    const date_closed = date

    //status [ACTIVE,CLOSED]
    const [checkCuide] = await connection.execute(storage.closeGuide(data, date_closed))

    return response(200, checkCuide, connection)
  } catch (e) {
    console.log(e)
    return response(400, e, connection)
  }
}

module.exports.getPackagesByManifestId = async event => {
  try {
    const connection = await mysql.createConnection(dbConfig)
    try {
      const id = event.pathParameters && event.pathParameters.manifest_id ? JSON.parse(event.pathParameters.manifest_id) : undefined

      const [packages] = await connection.execute(storage.getPackagesByManifest(id))

      return response(200, packages[0], connection)
    } catch (e) {
      return response(400, e, connection)
    }
  } catch (error) {}
}

module.exports.packagesBulkUpdate = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    /**
     * @typedef {Object} PackagesBulkUpdate
     * @property {String|Number} package_id
     * @property {Number} tasa
     * @property {Number} cif
     * @property {Number} dai
     * @property {Number} total_iva
     * @property {Number} importe
     * @property {Number} total_a_pagar
     * @property {Number} poliza
     * @property {String|Number} manifest_id
     * @property {Number} [master]
     */

    /**
     * Request body
     * @var {Object} data
     * @property {Array<PackagesBulkUpdate>} data
     */
    const data = JSON.parse(event.body)
    console.log('Request Body..', data)
    const requiredFields = ['package_id', 'total_a_pagar', 'poliza', 'manifest_id']
    const requiredErrorsArray = data.map((pack, index) => (requiredFields.some(k => !pack[k]) ? index : []))
    const requiredFieldsErrors = requiredErrorsArray.reduce((acc, item) => acc.concat(item), [])

    if (requiredFieldsErrors && requiredFieldsErrors.length > 0) throw `Missing parameter in packages with index: ${requiredFieldsErrors.join(', ')}`

    //const status = 'Recoger en Prime'
    const ing_date = moment().tz('America/Guatemala').format('YYYY-MM-DD hh:mm:ss')
    const { manifestIds, packagesIds, updateValues } = data.reduce((r, d) => {
      const packageId = d.package_id
      const status = d.on_hold ? 'On Hold' : 'Recoger en Prime'
      const value = `(
        ${d.package_id ? d.package_id : null},
        ${d.tasa ? d.tasa : 0},
        ${d.cif ? d.cif : null},        
        ${d.dai ? d.dai : 0},
        ${d.total_iva ? d.total_iva : 0},
        ${d.importe ? d.importe : 0},
        ${d.total_a_pagar ? `'${d.total_a_pagar}'` : 0},
        ${d.poliza ? `'${d.poliza}'` : null},
        ${d.master ? `'${d.master}'` : null},        
        '${ing_date}',
        '${status}',
        ${d.costo_producto ? d.costo_producto : null}
      )`

      const isDuplicate = r.manifestIds && r.manifestIds.some(id => Number(id) === Number(d.manifest_id))

      return {
        ...r,
        manifestIds: isDuplicate ? r.manifestIds : [...(r.manifestIds || []), d.manifest_id],
        packagesIds: [...(r.packagesIds || []), packageId],
        updateValues: [...(r.updateValues || []), value],
      }
    }, {})

    const [updateInfo] = await connection.execute(storage.packagesBulkUpdate(updateValues))
    console.log('Update Packages', updateValues)
    console.log('Update DB Info', updateInfo)
    if (updateInfo && updateInfo.affectedRows > 0) {
      const [uncompleteManifests] = await connection.execute(storage.getUncompleteManifests(manifestIds))
      const [uncompleteManifestsByHold] = await connection.execute(storage.getUncompleteManifestsByHold(manifestIds))

      const manifestValues = manifestIds.reduce((result, id) => {
        const isUncomplete = uncompleteManifests.some(um => Number(um.manifest_id) === Number(id))
        const isUncompleteByHold = uncompleteManifestsByHold.some(um => Number(um.manifest_id) === Number(id))

        if (isUncompleteByHold) return [...(result || []), `(${id}, 'PENDINGHOLD')`]

        if (isUncomplete) return result

        return [...(result || []), `(${id}, 'PENDINGCLOSED')`]
      }, [])

      if (manifestValues && manifestValues[0]) await connection.execute(storage.manifestsBulkUpdate(manifestValues))

      const [smsData] = await connection.execute(storage.getSMSData(packagesIds))
      console.log('SMS data', smsData)

      const sendSMSPromises = smsData.map(data => {
        const params = getSendSMSviaSNSParams(data)
        console.log('SMS params', params)
        return sendSMSviaSNS(params)
      })

      //report SMS
      await Promise.all(sendSMSPromises)

      let userData = [
        { contact_name: 'AdminChargeReport', phone: '35757882' },
        { contact_name: 'AdminChargeReport', phone: '52016022' },
        { contact_name: 'AdminChargeReport', phone: '54978132' },
        { contact_name: 'AdminChargeReport', phone: '32370023' },
        { contact_name: 'AdminChargeReport', phone: '+16095919448' },
      ]
      const sendSMSPromisesReport = userData.map(data => {
        const params = getSendSMSviaSNSParams(data)
        console.log('SMS Report params', params)
        return sendSMSviaSNS(params)
      })
      //report SMS by charge
      await Promise.all(sendSMSPromisesReport)
    }
    console.log('Response packages Ids', packagesIds)
    return response(200, { data: packagesIds }, connection)
  } catch (e) {
    console.log(e, 't')
    return response(400, e, connection)
  }
}

module.exports.readTariffs = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const params = event.queryStringParameters

    const [tariffs] = await connection.execute(storage.getTariffs(params))

    return response(200, tariffs, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.updateTariff = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const package_id = event.pathParameters && event.pathParameters.package_id ? JSON.parse(event.pathParameters.package_id) : undefined

    if (package_id === undefined) throw new Error('package_id missing')

    let data = JSON.parse(event.body)

    if (!data || !data.tariff_code) throw new Error('tariff_code missing')

    await connection.execute(storage.updatePackageTariff(data.tariff_code, package_id))

    return response(200, { package_id, tariff_code: data.tariff_code }, connection)
  } catch (e) {
    console.log(e, 't')
    return response(400, e, connection)
  }
}

module.exports.readGuide = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const master = event.pathParameters && event.pathParameters.master ? event.pathParameters.master : undefined

    if (master === undefined) throw new Error('master missing')

    const [guides] = await connection.execute(storage.readGuideByMaster(master))

    return response(200, guides, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}
