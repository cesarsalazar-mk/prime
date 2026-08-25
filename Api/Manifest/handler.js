'use strict'
const mysql = require('mysql2/promise')
const isOffline = process.env['IS_OFFLINE']
const { dbConfig } = require(`${isOffline ? '../..' : '.'}/commons/dbConfig`)
const { response, fileResponse, getBody, escapeFields, pad } = require(`${isOffline ? '../..' : '.'}/commons/utils`)
const storage = require('./manifestStorage')

const AWS = require('aws-sdk')
const Excel = require('exceljs')
AWS.config.update({ region: 'us-east-1' })

module.exports.readManifest = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const params = {
      status: event.queryStringParameters && event.queryStringParameters.status,
      description: event.queryStringParameters && event.queryStringParameters.description,
    }

    const [manifests] = await connection.execute(storage.readManifest(params))

    return response(200, manifests, connection)
  } catch (error) {
    const message = error.message ? error.message : error

    return await response(400, { error: message }, connection)
  }
}

module.exports.createManifest = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const requiredFields = ['description']
    const body = escapeFields(getBody(event))
    const errorFields = requiredFields.filter(k => !body[k])

    if (errorFields.length > 0 || !body) {
      throw new Error(`The fields ${errorFields.join(', ')} are required`)
    }

    const [manifest] = await connection.execute(storage.createManifest(body))

    return response(200, manifest, connection)
  } catch (error) {
    const message = error.message ? error.message : error

    return await response(400, { error: message }, connection)
  }
}

module.exports.updateManifest = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const id = event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : undefined
    const requiredFields = ['description', 'status']
    const body = escapeFields(getBody(event))
    const errorFields = requiredFields.filter(k => !body[k])

    if (errorFields.length > 0) {
      throw new Error(`The fields ${errorFields.join(', ')} are required`)
    }

    const [manifest] = await connection.execute(storage.updateManifest(body, id))

    if (body.status === 'PENDING') {
      const [[{ manifest_id: lastManifestId }]] = await connection.execute(storage.getMAXManifest())

      const newManifestId = lastManifestId + 1
      const newManifestDescription = `${pad(newManifestId, 4)}-${new Date().getFullYear()}`

      await connection.execute(storage.createManifest({ manifest_id: newManifestId, description: newManifestDescription }))
    }

    return response(200, manifest, connection)
  } catch (error) {
    const message = error.message ? error.message : error

    return await response(400, { error: message }, connection)
  }
}

module.exports.readMaxManifest = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const [manifest] = await connection.execute(storage.getMAXManifest())

    return response(200, manifest, connection)
  } catch (error) {
    const message = error.message ? error.message : error

    return await response(400, { error: message }, connection)
  }
}

module.exports.readPackagesByManifest = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const params = {
      manifest_id: event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : undefined,
      polizaFilter: event.queryStringParameters ? event.queryStringParameters.poliza : '',
      noNullMaster: event.queryStringParameters && event.queryStringParameters.no_null_master,
    }

    let [result] = await connection.execute(storage.getPackagesByManifestId(params))

    return response(200, result, connection)
  } catch (error) {
    const message = error.message ? error.message : error

    return await response(400, { error: message }, connection)
  }
}

module.exports.exportManifest = async event => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    const params = {
      manifest_id: event.pathParameters && event.pathParameters.id ? JSON.parse(event.pathParameters.id) : null,
      includeTariff: event.queryStringParameters && event.queryStringParameters.include_tariff,
      callCenter: event.queryStringParameters && event.queryStringParameters.call_center,
    }

    let [result] = await connection.execute(storage.getPackagesByManifestId(params))
    let report
    let file

    const poundToKgFactor = 0.453592
    const hasVoucherDocument = value => value != null && String(value).trim() !== ''
    const manifestData =
      result && result[0]
        ? result.map(row => {
            const mapped = Object.keys(row).reduce((r, k) => {
              if (k === 'weight') {
                return {
                  ...r,
                  [k]: row[k],
                  pesoKg: Number(row[k] * poundToKgFactor).toFixed(2),
                  valorFlete: 6.0, //Number(row[k] * poundToKgFactor * 2).toFixed(2), (Cambio requerido por Pauline Koleter 14/10/2022)
                }
              }

              return { ...r, [k]: row[k] }
            }, {})

            mapped.facturaRecibo =
              hasVoucherDocument(row.voucher_bill) || hasVoucherDocument(row.voucher_payment) ? 'Si' : 'No'

            return mapped
          })
        : []

    console.log('manifestData ', manifestData)

    let manifestoHeaders = [
      { name: 'Tracking', column: 'tracking', width: 33.5 },
      { name: 'WareHouse', column: 'warehouse', width: 9.83 },
      { name: 'Proveedor', column: 'supplier_name', width: 15 },
      { name: 'Consignatario', column: 'client_name', width: 43.33 },
      { name: 'Piezas', column: 'pieces', width: 6 },
      { name: 'Peso Kg', column: 'pesoKg', width: 6.33 },
      { name: 'Valor Flete', column: 'valorFlete', width: 15 },
      { name: 'Descripcion', column: 'description', width: 51.5 },
      {
        name: 'Valor Declarado',
        column: 'costo_producto',
        width: 16.17,
        numFmt: '"$"#,##0.00',
      },
      { name: 'Factura/Recibo', column: 'facturaRecibo', width: 16 },
    ]

    if (params.includeTariff) {
      const tariffHeaders = [
        { name: 'Numero de partida Arancelaria', column: 'tariff_nro_partida', width: 15 },
        // { name: 'Descripcion', column: 'tariff_description', width: 30 },
        { name: 'Valor', column: 'tariff_tasa', width: 6, numFmt: '"%"#,##0' },
      ]

      manifestoHeaders.push(...tariffHeaders)
    }

    if (params.callCenter) {
      const callCenterHeaders = [
        { name: 'Casillero', column: 'casillero', width: 12 },
        { name: 'Telefono', column: 'telefono', width: 15 },
        { name: 'Email', column: 'Email', width: 30 },
        { name: 'Direccion', column: 'Direccion', width: 40 },
      ]
      manifestoHeaders.push(...callCenterHeaders)
    }

    let weightHeaders = [
      { name: 'TULA', column: 'tula', width: 18 },
      { name: 'PESOS', column: 'pesos', width: 18 },
    ]

    report = await standardReport({
      sheets: [
        {
          name: `MANIFIESTO`,
          headers: manifestoHeaders,
          data: manifestData,
        },
        {
          name: 'PESOS',
          headers: weightHeaders,
          data: [],
        },
      ],
    })

    file = await report.xlsx.writeBuffer()

    return await fileResponse(200, file.toString('base64'), connection, params.manifest_id)
  } catch (error) {
    const message = error.message ? error.message : error

    return await response(400, { error: message }, connection)
  }
}

const standardReport = data =>
  new Promise((resolve, reject) => {
    let workbook = new Excel.Workbook()
    workbook.creator = 'TraesTodo'
    workbook.created = new Date()

    let auxCol = null

    if (data && data.sheets && data.sheets.length > 0) {
      data.sheets.forEach((sheet, i) => {
        let newSheet = workbook.addWorksheet(sheet.name, {
          headerFooter: {
            firstHeader: 'Hello Exceljs',
            firstFooter: 'Hello World',
          },
        })

        newSheet.columns = sheet.headers.map(header => ({
          header: header.name,
          key: header.column,
          width: header.width || 15,
        }))

        newSheet.getRow(1).font = { bold: true, color: { argb: 'ffffff' } }

        newSheet.getRow(1).alignment = { wrapText: true }

        newSheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '053E81' },
        }

        newSheet.addRows(sheet.data.map(d => d))

        sheet.headers.forEach((h, c) => {
          if (h.formula) {
            auxCol = newSheet.getColumn(h.column)
            auxCol.eachCell((cell, i) => {
              if (i > 1) {
                cell.value = { formula: h.formula.replace(/#/g, i) }
              }
            })
          }

          if (h.numFmt) {
            newSheet.getColumn(h.column).numFmt = h.numFmt
          }
        })

        if (sheet.totals && sheet.totals.length > 0) {
          sheet.totals.forEach(t => {
            newSheet.getCell(`${t}${sheet.data.length + 2}`).value = {
              formula: `SUM(${t}2:${t}${sheet.data.length + 1})`,
            }
            newSheet.getCell(`${t}${sheet.data.length + 2}`).font = {
              bold: true,
            }
          })
        }
        if (sheet.individualCells && sheet.individualCells.length > 0) {
          sheet.individualCells.forEach(cell => {
            newSheet.getCell(`${cell.name}`).value = cell.value ? cell.value : { formula: `${cell.formula}` }
            newSheet.getCell(`${cell.name}`).font = { bold: cell.bold }
          })
        }
      })
    }

    resolve(workbook)
  })
