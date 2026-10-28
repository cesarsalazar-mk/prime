'use strict'
const mysql = require('mysql2/promise')
const isOffline = process.env['IS_OFFLINE']
const { dbConfig } = require(`${isOffline ? '../..' : '.'}/commons/dbConfig`)
let { response, getBody, escapeFields } = require(`${isOffline ? '../..' : '.'}/commons/utils`)
let storage = require('./warehouseStorage')
const { getSendSMSviaSNSParams, sendSMSviaSNS ,createLogsviaSNS} = require(`${isOffline ? '..' : '.'}/Packages/functions`)

const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })

//Suppliers
module.exports.readSupplier = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const [suppliers] = await connection.execute(storage.readSuppliers())

    return response(200, suppliers, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.createSupplier = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const requiredFields = ['code', 'name', 'phone', 'address']
    const body = escapeFields(getBody(event))
    const errorFields = requiredFields.filter(k => !body[k])

    if (errorFields.length > 0) {
      throw new Error(`The fields ${errorFields.join(', ')} are required`)
    }

    const [suppliers] = await connection.execute(storage.createSupplier(body))

    return response(200, suppliers, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.updateSuppliers = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const id = event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : undefined
    const requiredFields = ['name', 'phone', 'address']
    const body = escapeFields(getBody(event))
    const errorFields = requiredFields.filter(k => !body[k])

    if (errorFields.length > 0) {
      throw new Error(`The fields ${errorFields.join(', ')} are required`)
    }

    const [Suppliers] = await connection.execute(storage.updateSuppliers(body, id))

    return response(200, Suppliers, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.deleteSupplier = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const id = event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : undefined

    const [supplier] = await connection.execute(storage.deleteSupplier(id))

    return await response(200, supplier, connection)
  } catch (error) {
    console.log(error)
    return await response(400, error, connection)
  }
}

//Carriers
module.exports.readCarries = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const [carries] = await connection.execute(storage.readCarries())

    return response(200, { message: carries }, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.createCarrie = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const requiredFields = ['code', 'name']
    const body = escapeFields(getBody(event))
    const errorFields = requiredFields.filter(k => !body[k])

    if (errorFields.length > 0) {
      throw new Error(`The fields ${errorFields.join(', ')} are required`)
    }

    const [carries] = await connection.execute(storage.createCarries(body))

    return response(200, carries, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.updateCarrie = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const id = event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : undefined
    const requiredFields = ['name']
    const body = escapeFields(getBody(event))
    const errorFields = requiredFields.filter(k => !body[k])

    if (errorFields.length > 0) {
      throw new Error(`The fields ${errorFields.join(', ')} are required`)
    }

    const [carries] = await connection.execute(storage.updateCarrie(body, id))

    return response(200, carries, connection)
  } catch (e) {
    console.log(e, 'catch')
    return response(400, e, connection)
  }
}

module.exports.deleteCarrie = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const id = event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : undefined

    const [carries] = await connection.execute(storage.deleteCarries(id))

    return await response(200, carries, connection)
  } catch (error) {
    console.log(error)
    return await response(400, error, connection)
  }
}

module.exports.createWarehouseEntry = async event => {
  const connection = await mysql.createConnection(dbConfig)  
  try {
    const requiredFields = [
      'client_id',
      'weight',
      'tracking',
      'package_description', // description
      'ing_date',
      'invoice_price', // costo_producto
      'supplier_id',
      'carrier_id',
      'manifest_id',
      'destination_id',
    ]

    const body = escapeFields(getBody(event))

    console.log("Request createWarehouseEntry: ",body)

    const errorFields = requiredFields.filter(k => !body[k])
    if (errorFields.length > 0 || !body) throw new Error(`The fields ${errorFields.join(', ')} are required`)

    const [manifest] = await connection.execute(storage.findManifestById(body.manifest_id))
    if (!manifest) throw new Error('Invalid manifest Id')

    const [trackingExists] = await connection.execute(storage.findPackagesByTracking(body.tracking))

    if(trackingExists.length > 0 && trackingExists[0].guia === null) {
      
      if(trackingExists[0].client_id !== body.client_id){
        throw new Error(`El paquete no puede ser asociado a un cliente diferente a ${trackingExists[0].client_id}`)
      }
  
      const [result] = await connection.execute(storage.findMaxPaqueteId())
      const newGuiaId_ = parseInt(result[0].id) + 1

      //Validate Guia
      const validateGuia = !!newGuiaId_            
      if(!validateGuia){
        console.log("No se ha creado la guia, intente nuevamente >> ",newGuiaId_)
        throw new Error("No se ha creado la guia, intente nuevamente")
      }
    
      console.log("UPDATE WITH NEW GUIDE ",newGuiaId_)      
            
      //update with new guia
      await connection.execute(storage.updatePackageWithGuide(body, trackingExists[0].package_id, manifest[0].manifest_id,newGuiaId_))

      const [[profileData]] = await connection.execute(storage.getUserInfo(body.client_id))
      const params = {
        ...getSendSMSviaSNSParams({ ...body, ...profileData }),
        warehouse: true,
      }
  
      await sendSMSviaSNS(params)
      
      //ledr-logs
      await createLogsviaSNS(body,"warehouse-update-package-guide-assignment")

      // Vouchers que quedaron en BD (pre-alerta del cliente), para que el front no los pise con la factura PRIME
      return await response(
        200,
        {
          guia: newGuiaId_,
          package_id: trackingExists[0].package_id,
          voucher_bill: body.voucher_bill.length > 5 ? body.voucher_bill : trackingExists[0].voucher_bill,
          voucher_payment: body.voucher_payment.length > 5 ? body.voucher_payment : trackingExists[0].voucher_payment,
        },
        connection
      )

    }else {

      if (trackingExists.length > 0) {      
        console.log("UPDATE")

        if(trackingExists[0].client_id !== body.client_id){
          throw new Error(`El paquete no puede ser asociado a un cliente diferente a ${trackingExists[0].client_id}`)
        }

        
        await connection.execute(storage.updatePackage(body, trackingExists[0].package_id, trackingExists[0].manifest_id))       
        
        //ledr-logs
        await createLogsviaSNS(body,"warehouse-update-package")

        console.log("UPDATE ",trackingExists[0].guia)

        return await response(200, { guia: trackingExists[0].guia }, connection)
      }
  
      console.log("-- CREATE PACKAGE NORMAL --")

      const [result] = await connection.execute(storage.findMaxPaqueteId())
      const newGuiaId = parseInt(result[0].id) + 1  
      console.log("New Guia Id >> ", newGuiaId)

      //Validate Guia
      const validateGuia = !!newGuiaId
      if(!validateGuia){
        console.log("No se ha creado la guia, intente nuevamente >> ",newGuiaId)
        throw new Error("No se ha creado la guia, intente nuevamente")
      }

      const [inserted] = await connection.execute(storage.createWarehouseEntry(body, newGuiaId))
      console.log("Guia insertada ",newGuiaId)

      const [[profileData]] = await connection.execute(storage.getUserInfo(body.client_id))
      const params = {
        ...getSendSMSviaSNSParams({ ...body, ...profileData }),
        warehouse: true,
      }
  
      await sendSMSviaSNS(params)
      
      //ledr-logs
      await createLogsviaSNS(body,"warehouse-create-package")

      return await response(200, { guia: newGuiaId, package_id: inserted.insertId }, connection)
    } 

    
    
  } catch (error) {
    const message = error.message ? error.message : error
    console.log("error >>",message)
    return await response(400, { error: message }, connection)
  }
}
