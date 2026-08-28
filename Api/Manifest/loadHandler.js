'use strict'
const mysql = require('mysql2/promise')
const moment = require('moment-timezone')
const isOffline = process.env['IS_OFFLINE']
const { dbConfig } = require(`${isOffline ? '../..' : '.'}/commons/dbConfig`)
const { response, getBody } = require(`${isOffline ? '../..' : '.'}/commons/utils`)
const { sendSMSviaSNS, getSendSMSviaSNSParams } = require('./sms')
const storage = require('./loadStorage')
const { parseDeclarationXml } = require('./parser')
const { matchDeclaration, RESULT, isUpdatableResult } = require('./loadProcess')

const ADMIN_SMS_CONTACTS = [
  { contact_name: 'AdminChargeReport', phone: '35757882' },
  { contact_name: 'AdminChargeReport', phone: '52016022' },
  { contact_name: 'AdminChargeReport', phone: '54978132' },
  { contact_name: 'AdminChargeReport', phone: '32370023' },
  { contact_name: 'AdminChargeReport', phone: '+16095919448' },
]

function nowGuatemala() {
  return moment().tz('America/Guatemala').format('YYYY-MM-DD HH:mm:ss')
}

function parsePagination(query) {
  const parsedPage = Number(query && query.page)
  const parsedLimit = Number(query && query.limit)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(100, Math.floor(parsedLimit)) : 25

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  }
}

function paginationTotal(rows) {
  if (!rows || !rows[0] || rows[0].total == null) {
    return 0
  }

  return Number(rows[0].total)
}

function getErrorMessage(error) {
  if (!error) {
    return 'Error desconocido'
  }

  if (error.message) {
    return error.message
  }

  return String(error)
}

async function sendChargeSms(connection, packageIds) {
  if (!packageIds.length) {
    return
  }

  const [smsData] = await connection.execute(storage.getSMSData(packageIds))
  const sendSMSPromises = smsData.map(data => sendSMSviaSNS(getSendSMSviaSNSParams(data)))
  const sendSMSPromisesReport = ADMIN_SMS_CONTACTS.map(data => sendSMSviaSNS(getSendSMSviaSNSParams(data)))

  await Promise.all([...sendSMSPromises, ...sendSMSPromisesReport])
}

async function closeOrCreateGuide(connection, master, poliza, date) {
  const [existingGuides] = await connection.execute(storage.findGuide(master, poliza))

  if (existingGuides.length === 0) {
    await connection.execute(storage.insertClosedGuide(master, poliza, date))
    return
  }

  await connection.execute(storage.closeGuide(master, poliza, date))
}

async function updateManifestStatuses(connection, items) {
  const manifestIds = [...new Set(items.map(item => item.manifest_id).filter(Boolean))]
  if (manifestIds.length === 0) {
    return
  }

  const [uncompleteManifests] = await connection.execute(storage.getUncompleteManifests(manifestIds))
  const [uncompleteManifestsByHold] = await connection.execute(storage.getUncompleteManifestsByHold(manifestIds))

  const manifestValues = manifestIds.reduce((result, id) => {
    const isUncomplete = uncompleteManifests.some(row => Number(row.manifest_id) === Number(id))
    const isUncompleteByHold = uncompleteManifestsByHold.some(row => Number(row.manifest_id) === Number(id))

    if (isUncompleteByHold) {
      return [...result, `(${id}, 'PENDINGHOLD')`]
    }

    if (isUncomplete) {
      return result
    }

    return [...result, `(${id}, 'PENDINGCLOSED')`]
  }, [])

  if (manifestValues.length > 0) {
    await connection.execute(storage.manifestsBulkUpdate(manifestValues))
  }
}

module.exports.previewManifestLoad = async event => {
  const connection = await mysql.createConnection(dbConfig)

  try {
    const body = getBody(event)
    const parsed = await parseDeclarationXml(body.xml)
    const preview = await matchDeclaration(connection, parsed)

    return response(200, preview, connection)
  } catch (error) {
    console.log('previewManifestLoad error', error)
    return response(400, { error: getErrorMessage(error) }, connection)
  }
}

module.exports.confirmManifestLoad = async event => {
  const connection = await mysql.createConnection(dbConfig)
  const createAt = nowGuatemala()

  try {
    const body = getBody(event)
    const parsed = await parseDeclarationXml(body.xml)

    await connection.beginTransaction()

    const preview = await matchDeclaration(connection, parsed)
    const foundItems = preview.items.filter(item => isUpdatableResult(item.result))

    const [loadInsert] = await connection.execute(
      storage.insertLoad({
        declaration_number: preview.declaration_number,
        master: preview.master,
        declaration_date: preview.declaration_date,
        xml_count: preview.xml_count,
        found_count: preview.found_count,
        updated_count: foundItems.length,
        not_found_count: preview.not_found_count,
        invalid_count: preview.invalid_count,
        ambiguous_count: preview.ambiguous_count,
        skipped_count: preview.skipped_count,
        tipo_de_cambio: preview.tipo_de_cambio,
        sub_total: preview.sub_total,
        monto_iva: preview.monto_iva,
        monto_total: preview.monto_total,
        resultado_analisis_riesgo: preview.resultado_analisis_riesgo,
        manifest_id: preview.manifest_id,
        manifest_description: preview.manifest_description,
        status: preview.already_processed ? 'REPROCESSED' : 'PROCESSED',
        created_by: body.created_by || body.userLog || null,
        error_message: null,
        create_at: createAt,
      })
    )

    const loadId = loadInsert.insertId

    for (const item of foundItems) {
      await connection.execute(
        storage.updatePackageCharges(item, {
          declaration_number: preview.declaration_number,
          master: preview.master,
          create_at: createAt,
        })
      )
    }

    for (const item of preview.items) {
      await connection.execute(
        storage.insertLoadDetail(
          loadId,
          {
            ...item,
            result: item.result === RESULT.FOUND ? RESULT.UPDATED : item.result,
          },
          createAt
        )
      )
    }

    if (foundItems.length > 0) {
      await closeOrCreateGuide(connection, preview.master, preview.declaration_number, createAt)
      await updateManifestStatuses(connection, foundItems)
    }
    await connection.commit()

    try {
      await sendChargeSms(
        connection,
        foundItems.map(item => item.package_id)
      )
    } catch (smsError) {
      console.log('confirmManifestLoad SMS error', smsError)
    }

    return response(
      200,
      {
        load_id: loadId,
        declaration_number: preview.declaration_number,
        master: preview.master,
        xml_count: preview.xml_count,
        found_count: preview.found_count,
        updated_count: foundItems.length,
        not_found_count: preview.not_found_count,
        invalid_count: preview.invalid_count,
        ambiguous_count: preview.ambiguous_count,
        skipped_count: preview.skipped_count,
        xml_rate_count: preview.xml_rate_count,
        status: preview.already_processed ? 'REPROCESSED' : 'PROCESSED',
      },
      connection
    )
  } catch (error) {
    console.log('confirmManifestLoad error', error)

    try {
      await connection.rollback()
    } catch (rollbackError) {
      console.log('confirmManifestLoad rollback error', rollbackError)
    }

    return response(400, { error: getErrorMessage(error) }, connection)
  }
}

module.exports.listManifestLoads = async event => {
  const connection = await mysql.createConnection(dbConfig)

  try {
    const pagination = parsePagination(event && event.queryStringParameters)
    const [loads] = await connection.execute(storage.listLoads(pagination.offset, pagination.limit))
    const [countRows] = await connection.execute(storage.countLoads())

    return response(
      200,
      {
        items: loads,
        total: paginationTotal(countRows),
        page: pagination.page,
        limit: pagination.limit,
      },
      connection
    )
  } catch (error) {
    console.log('listManifestLoads error', error)
    return response(400, { error: getErrorMessage(error) }, connection)
  }
}

module.exports.getManifestLoadDetail = async event => {
  const connection = await mysql.createConnection(dbConfig)

  try {
    const id = event.pathParameters && event.pathParameters.id ? event.pathParameters.id : undefined
    if (!id) {
      throw new Error('id missing')
    }

    const pagination = parsePagination(event && event.queryStringParameters)
    const [loads] = await connection.execute(storage.getLoadById(id))
    if (!loads.length) {
      throw new Error('Procesamiento no encontrado')
    }

    const [details] = await connection.execute(storage.getLoadDetails(id, pagination.offset, pagination.limit))
    const [countRows] = await connection.execute(storage.countLoadDetails(id))

    return response(
      200,
      {
        ...loads[0],
        details,
        total: paginationTotal(countRows),
        page: pagination.page,
        limit: pagination.limit,
      },
      connection
    )
  } catch (error) {
    console.log('getManifestLoadDetail error', error)
    return response(400, { error: getErrorMessage(error) }, connection)
  }
}
