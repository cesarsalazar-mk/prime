function escapeSql(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "''")
}

function sqlString(value) {
  if (value == null || value === '') {
    return 'NULL'
  }

  return `'${escapeSql(value)}'`
}

function sqlNumber(value) {
  if (value == null || value === '') {
    return 'NULL'
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(parsed) : 'NULL'
}

function sqlInStrings(values) {
  return values.map(value => sqlString(value)).join(', ')
}

const findPackagesByGuias = guias => `
  SELECT
    p.package_id,
    p.guia,
    p.master,
    p.poliza,
    p.description,
    p.weight,
    p.status,
    p.costo_producto,
    p.tariff_code,
    p.tasa,
    p.dai,
    p.total_iva,
    p.importe,
    p.total_a_pagar,
    p.manifest_id,
    m.status AS manifest_status,
    m.description AS manifest_description
  FROM paquetes p
  LEFT JOIN manifest m ON m.manifest_id = p.manifest_id
  WHERE p.guia IN (${sqlInStrings(guias)})
`

const findTariffsByCodes = codes => `
  SELECT id, code, description, tasa
  FROM tariffs
  WHERE code IN (${sqlInStrings(codes)})
`

const findPreviousLoads = (declarationNumber, master) => `
  SELECT id, declaration_number, master, status, create_at, created_by
  FROM manifest_load
  WHERE declaration_number = ${sqlString(declarationNumber)}
    AND master = ${sqlString(master)}
    AND status IN ('PROCESSED', 'REPROCESSED')
  ORDER BY id DESC
`

const insertLoad = data => `
  INSERT INTO manifest_load (
    declaration_number,
    master,
    declaration_date,
    xml_count,
    found_count,
    updated_count,
    not_found_count,
    invalid_count,
    ambiguous_count,
    skipped_count,
    status,
    created_by,
    error_message,
    tipo_de_cambio,
    sub_total,
    monto_iva,
    monto_total,
    resultado_analisis_riesgo,
    manifest_id,
    manifest_description,
    create_at
  ) VALUES (
    ${sqlString(data.declaration_number)},
    ${sqlString(data.master)},
    ${sqlString(data.declaration_date)},
    ${sqlNumber(data.xml_count)},
    ${sqlNumber(data.found_count)},
    ${sqlNumber(data.updated_count)},
    ${sqlNumber(data.not_found_count)},
    ${sqlNumber(data.invalid_count)},
    ${sqlNumber(data.ambiguous_count)},
    ${sqlNumber(data.skipped_count)},
    ${sqlString(data.status)},
    ${sqlString(data.created_by)},
    ${sqlString(data.error_message)},
    ${sqlNumber(data.tipo_de_cambio)},
    ${sqlNumber(data.sub_total)},
    ${sqlNumber(data.monto_iva)},
    ${sqlNumber(data.monto_total)},
    ${sqlString(data.resultado_analisis_riesgo)},
    ${sqlString(data.manifest_id)},
    ${sqlString(data.manifest_description)},
    ${sqlString(data.create_at)}
  )
`

const insertLoadDetail = (loadId, item, createAt) => `
  INSERT INTO manifest_load_detail (
    load_id,
    guia,
    package_id,
    description,
    costo_producto,
    tariff_code_xml,
    tariff_id,
    tasa,
    dai,
    dai_xml,
    result,
    error_description,
    analisis_riesgo,
    manifest_id,
    previous_costo_producto,
    previous_tariff_code,
    previous_tasa,
    previous_dai,
    create_at
  ) VALUES (
    ${sqlNumber(loadId)},
    ${sqlString(item.guia)},
    ${sqlNumber(item.package_id)},
    ${sqlString(item.description)},
    ${sqlNumber(item.costo_producto)},
    ${sqlString(item.tariff_code_xml)},
    ${sqlNumber(item.tariff_id)},
    ${sqlNumber(item.tasa)},
    ${sqlNumber(item.dai)},
    ${sqlNumber(item.dai_xml)},
    ${sqlString(item.result)},
    ${sqlString(item.error_description)},
    ${sqlString(item.analisis_riesgo)},
    ${sqlNumber(item.manifest_id)},
    ${sqlNumber(item.previous_costo_producto)},
    ${sqlNumber(item.previous_tariff_code)},
    ${sqlNumber(item.previous_tasa)},
    ${sqlNumber(item.previous_dai)},
    ${sqlString(createAt)}
  )
`

const updatePackageCharges = (item, data) => `
  UPDATE paquetes SET
    costo_producto = ${sqlNumber(item.costo_producto)},
    tariff_code = ${item.tariff_id == null ? 'tariff_code' : sqlNumber(item.tariff_id)},
    tasa = ${sqlNumber(item.tasa)},
    dai = ${sqlNumber(item.dai)},
    total_iva = ${sqlNumber(item.total_iva)},
    cif = ${sqlNumber(item.cif)},
    importe = ${sqlNumber(item.importe)},
    total_a_pagar = ${sqlNumber(item.total_a_pagar)},
    poliza = ${sqlString(data.declaration_number)},
    master = ${sqlString(data.master)},
    status = 'Recoger en Prime',
    ing_date_gt = ${sqlString(data.create_at)}
  WHERE package_id = ${sqlNumber(item.package_id)}
`

const findGuide = (master, poliza) => `
  SELECT id, master, poliza, status
  FROM guides
  WHERE master = ${sqlString(master)}
    AND poliza = ${sqlString(poliza)}
  LIMIT 1
`

const insertClosedGuide = (master, poliza, date) => `
  INSERT INTO guides (master, poliza, status, date_closed)
  VALUES (
    ${sqlString(master)},
    ${sqlString(poliza)},
    'CLOSED',
    ${sqlString(date)}
  )
`

const closeGuide = (master, poliza, date) => `
  UPDATE guides SET
    date_closed = ${sqlString(date)},
    status = 'CLOSED'
  WHERE master = ${sqlString(master)}
    AND poliza = ${sqlString(poliza)}
`

const getUncompleteManifests = manifestIds => `
  SELECT manifest_id
  FROM paquetes
  WHERE manifest_id IN (${manifestIds.join(', ')})
    AND (master = '' OR master IS NULL OR status = 'On Hold')
    AND (poliza = '' OR poliza IS NULL OR status = 'On Hold')
`

const getUncompleteManifestsByHold = manifestIds => `
  SELECT manifest_id
  FROM paquetes
  WHERE manifest_id IN (${manifestIds.join(', ')})
    AND status = 'On Hold'
`

const manifestsBulkUpdate = manifestValues => `
  INSERT INTO manifest (manifest_id, status)
  VALUES ${manifestValues.join(', ')}
  ON DUPLICATE KEY UPDATE
    status = VALUES(status)
`

const getSMSData = packageIds => `
  SELECT
    p.package_id,
    p.tracking,
    p.weight,
    p.description,
    p.ing_date,
    p.status,
    p.total_a_pagar AS total,
    c.client_id,
    c.email,
    c.contact_name,
    c.client_name,
    c.phone
  FROM paquetes p
  INNER JOIN clientes c ON c.client_id = p.client_id
  WHERE p.package_id IN (${packageIds.join(', ')})
`

const affectedManifestDescriptionsSubquery = alias => `
    COALESCE(
      NULLIF(${alias}.manifest_description, ''),
      (
        SELECT GROUP_CONCAT(DISTINCT m.description ORDER BY m.description SEPARATOR ', ')
        FROM manifest_load_detail d
        INNER JOIN paquetes p ON p.package_id = d.package_id
        INNER JOIN manifest m ON m.manifest_id = p.manifest_id
        WHERE d.load_id = ${alias}.id
          AND d.result IN ('UPDATED', 'XML_RATE')
          AND m.description IS NOT NULL
          AND m.description <> ''
      )
    )
`

const affectedManifestIdsSubquery = alias => `
    COALESCE(
      NULLIF(${alias}.manifest_id, ''),
      (
        SELECT GROUP_CONCAT(DISTINCT p.manifest_id ORDER BY p.manifest_id SEPARATOR ', ')
        FROM manifest_load_detail d
        INNER JOIN paquetes p ON p.package_id = d.package_id
        WHERE d.load_id = ${alias}.id
          AND d.result IN ('UPDATED', 'XML_RATE')
          AND p.manifest_id IS NOT NULL
      )
    )
`

const listLoads = (offset, limit) => `
  SELECT
    id,
    declaration_number,
    master,
    declaration_date,
    xml_count,
    found_count,
    updated_count,
    not_found_count,
    invalid_count,
    ambiguous_count,
    skipped_count,
    status,
    created_by,
    error_message,
    tipo_de_cambio,
    sub_total,
    monto_iva,
    monto_total,
    resultado_analisis_riesgo,
    ${affectedManifestIdsSubquery('manifest_load')} AS manifest_id,
    ${affectedManifestDescriptionsSubquery('manifest_load')} AS manifest_description,
    create_at
  FROM manifest_load
  ORDER BY id DESC
  LIMIT ${sqlNumber(offset)}, ${sqlNumber(limit)}
`

const countLoads = () => `
  SELECT COUNT(*) AS total
  FROM manifest_load
`

const getLoadById = id => `
  SELECT
    id,
    declaration_number,
    master,
    declaration_date,
    xml_count,
    found_count,
    updated_count,
    not_found_count,
    invalid_count,
    ambiguous_count,
    skipped_count,
    status,
    created_by,
    error_message,
    tipo_de_cambio,
    sub_total,
    monto_iva,
    monto_total,
    resultado_analisis_riesgo,
    ${affectedManifestIdsSubquery('manifest_load')} AS manifest_id,
    ${affectedManifestDescriptionsSubquery('manifest_load')} AS manifest_description,
    create_at
  FROM manifest_load
  WHERE id = ${sqlNumber(id)}
`

const getLoadDetails = (id, offset, limit) => `
  SELECT
    d.id,
    d.load_id,
    d.guia,
    d.package_id,
    d.description,
    d.costo_producto,
    d.tariff_code_xml,
    d.tariff_id,
    d.tasa,
    d.dai,
    d.dai_xml,
    d.result,
    d.error_description,
    d.analisis_riesgo,
    COALESCE(d.manifest_id, p.manifest_id) AS manifest_id,
    m.description AS manifest_description,
    d.previous_costo_producto,
    d.previous_tariff_code,
    d.previous_tasa,
    d.previous_dai,
    d.create_at
  FROM manifest_load_detail d
  LEFT JOIN paquetes p ON p.package_id = d.package_id
  LEFT JOIN manifest m ON m.manifest_id = COALESCE(d.manifest_id, p.manifest_id)
  WHERE d.load_id = ${sqlNumber(id)}
  ORDER BY d.id ASC
  LIMIT ${sqlNumber(offset)}, ${sqlNumber(limit)}
`

const countLoadDetails = id => `
  SELECT COUNT(*) AS total
  FROM manifest_load_detail
  WHERE load_id = ${sqlNumber(id)}
`

module.exports = {
  findPackagesByGuias,
  findTariffsByCodes,
  findPreviousLoads,
  insertLoad,
  insertLoadDetail,
  updatePackageCharges,
  findGuide,
  insertClosedGuide,
  closeGuide,
  getUncompleteManifests,
  getUncompleteManifestsByHold,
  manifestsBulkUpdate,
  getSMSData,
  listLoads,
  countLoads,
  getLoadById,
  getLoadDetails,
  countLoadDetails,
}
