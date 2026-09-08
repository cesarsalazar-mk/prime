'use strict'
const mysql = require('mysql2/promise')
const isOffline = process.env['IS_OFFLINE']
const { dbConfig } = require(`${isOffline ? '../..' : '.'}/commons/dbConfig`)
let { response } = require(`${isOffline ? '../..' : '.'}/commons/utils`)
let storage = require('./reportStorage')

const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })

module.exports.reports = async (event, context) => {
  try {
    let total = 0
    let date = '',
      page = 0
    console.log('erer')
    if (event.queryStringParameters && event.queryStringParameters.total) {
      total = event.queryStringParameters.total
    }

    if (event.queryStringParameters && event.queryStringParameters.date) {
      date = event.queryStringParameters.date
    }

    if (event.queryStringParameters && event.queryStringParameters.page) {
      page = event.queryStringParameters.page
    }

    const connection = await mysql.createConnection(dbConfig)

    if (total) {
      const [totals] = await connection.execute(storage.totalsByDate(date))
      return response(200, totals, connection)
    }

    const [totals] = await connection.execute(storage.read(date, page))
    return response(200, totals, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, null)
  }
}

module.exports.entries = async event => {
  try {
    let total = false
    let date = '',
      page = 0

    if (event.queryStringParameters && event.queryStringParameters.total) {
      total = event.queryStringParameters.total
    }

    if (event.queryStringParameters && event.queryStringParameters.date) {
      date = event.queryStringParameters.date
    }

    const connection = await mysql.createConnection(dbConfig)

    if (total) {
      const [totals] = await connection.execute(storage.entryPackageTotal(date))
      return response(200, totals, connection)
    }

    const [totals] = await connection.execute(storage.entryPackageDetail(date, page))
    return response(200, totals, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, null)
  }
}

module.exports.entriesOnHold = async event => {
  try {
    let total = false
    let startDate = '',endDate = '',
      page = 0

    if (event.queryStringParameters && event.queryStringParameters.total) {
      total = event.queryStringParameters.total
    }

    if (event.queryStringParameters && event.queryStringParameters.startDate) {
      startDate = event.queryStringParameters.startDate
    }

    if (event.queryStringParameters && event.queryStringParameters.endDate) {
      endDate = event.queryStringParameters.endDate
    }

    const connection = await mysql.createConnection(dbConfig)

    if (total) {
      const [totals] = await connection.execute(storage.entryTicketPackageTotal(startDate,endDate))
      return response(200, totals, connection)
    }

    const [totals] = await connection.execute(storage.entryTicketPackageDetail(startDate,endDate, page))
    return response(200, totals, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, null)
  }
}

module.exports.route = async event => {
  try {
    let total = false
    let date = '',
      page = 0

    if (event.queryStringParameters && event.queryStringParameters.total) {
      total = event.queryStringParameters.total
    }

    const connection = await mysql.createConnection(dbConfig)

    if (total) {
      const [totals] = await connection.execute(storage.packagesOnRouteTotal(date))
      return response(200, totals, connection)
    }

    const [totals] = await connection.execute(storage.packagesOnRoute(date, page))
    return response(200, totals, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, null)
  }
}

module.exports.warehouse = async event => {
  try {
    let total = false
    
    let date = '', page = 0

    if (event.queryStringParameters && event.queryStringParameters.total) {
      total = event.queryStringParameters.total
    }

    const retenido = event.queryStringParameters && event.queryStringParameters.retenido

    const connection = await mysql.createConnection(dbConfig)

    if (total) {
      const [totals] = await connection.execute(retenido ? storage.packageRetenidoTotal() : storage.packageInWarehouseTotal())
      return response(200, totals, connection)
    }

    const [totals] = await connection.execute(retenido ? storage.packageRetenido() : storage.packageInWarehouse())

    return response(200, totals, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, null)
  }
}

module.exports.stateAccount = async event => {
  let client_id = 0
  let package_id = 0
  try {
    if (event.queryStringParameters && event.queryStringParameters.client_id) {
      client_id = event.queryStringParameters.client_id
    }

    if (event.queryStringParameters && event.queryStringParameters.package_id) {
      package_id = event.queryStringParameters.package_id
    }

    const connection = await mysql.createConnection(dbConfig)
    const [result] = await connection.execute(storage.stateAccount(client_id, package_id))

    return response(200, result, connection)
  } catch (e) {
    return response(400, e.message, null)
  }
}

module.exports.byMaster = async event => {
  let master = ''
  let poliza = ''
  
  try {
    if (event.queryStringParameters && event.queryStringParameters.master) {
      master = event.queryStringParameters.master
    }
    
    if (event.queryStringParameters && event.queryStringParameters.poliza) {
        poliza = event.queryStringParameters.poliza
    }
    
    if(!master) return response(400, 'missing params', null)
    
    const connection = await mysql.createConnection(dbConfig)
    const [result] = await connection.execute(storage.reportByMaster(master, poliza))
    
    return response(200, result, connection)
  } catch (e) {
    return response(400, e.message, null)
  }
}

module.exports.byMasterTotal = async event => {
  try{
    let master = ''
    let poliza = ''
    
    if (event.queryStringParameters && event.queryStringParameters.master) {
      master = event.queryStringParameters.master
    }
    if (event.queryStringParameters && event.queryStringParameters.poliza) {
      poliza = event.queryStringParameters.poliza
    }
    const connection = await mysql.createConnection(dbConfig)
    const [result] = await connection.execute(storage.byMasterTotal(master, poliza))
    
    return response(200, result, connection)
  } catch (e) {
    return response(400, e.message, null)
  }
}

module.exports.byInvoices = async event => {
  try{
    let date,store = ''    
    
    if (event.queryStringParameters && event.queryStringParameters.date) {
      date = event.queryStringParameters.date
      store = event.queryStringParameters.store
    }
    
    const connection = await mysql.createConnection(dbConfig)
    const [result] = await connection.execute(storage.getInvoices(date,store))
    
    return response(200, result, connection)
  } catch (e) {
    return response(400, e.message, null)
  }
}


module.exports.byConciliation = async event => {
  try{
    let date = '',
      store = '',type = ''
    if (event.queryStringParameters && event.queryStringParameters.date) {
      date = event.queryStringParameters.date
    }
  
    if (event.queryStringParameters && event.queryStringParameters.store) {
      store = event.queryStringParameters.store
    }

    if (event.queryStringParameters && event.queryStringParameters.type) {
      type = event.queryStringParameters.type
    }
    
    const connection = await mysql.createConnection(dbConfig)
    const [result] = await connection.execute(storage.getConciliation(date, store,type))
    
    return response(200, result, connection)
  } catch (e) {
    return response(400, e.message, null)
  }
}

module.exports.byGuiaDetail = async event => {
  try {
    let guia = null
    if (event.queryStringParameters && event.queryStringParameters.guia) {
      guia = event.queryStringParameters.guia
    }
  
    if(!guia) throw Error ('Missing_guia')
    
    const connection = await mysql.createConnection(dbConfig)
    const [result] = await connection.execute(storage.getGuiaDetail(guia))
  
    return response(200, result, connection)
  
  }catch (e){
    return response(400, e.message, null)
  }
}

