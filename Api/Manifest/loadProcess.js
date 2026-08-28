const storage = require('./loadStorage')
const { calculateCharges } = require('./charges')

const RESULT = {
  FOUND: 'FOUND',
  UPDATED: 'UPDATED',
  NOT_FOUND: 'NOT_FOUND',
  INVALID: 'INVALID',
  AMBIGUOUS: 'AMBIGUOUS',
  XML_RATE: 'XML_RATE',
  SKIPPED: 'SKIPPED',
  ERROR: 'ERROR',
}

function isUpdatableResult(result) {
  return result === RESULT.FOUND || result === RESULT.XML_RATE
}

function ratesMatch(left, right) {
  const xmlRate = Number(left)
  const tariffRate = Number(right)
  if (!Number.isFinite(xmlRate) || !Number.isFinite(tariffRate)) {
    return false
  }

  return Math.abs(xmlRate - tariffRate) < 0.0001
}

function xmlPercent(tasa) {
  return Number((Number(tasa) * 100).toFixed(2))
}

function missingTariffDetail(fraction) {
  const percent = xmlPercent(fraction.tasa)
  return `El inciso arancelario ${fraction.tariff_code_xml} no existe en la base de datos. Se procesó con la tasa del XML (${percent}%). No se asignó codigo de arancel.`
}

function resolveTariff(matchedByCode, xmlTasa) {
  if (matchedByCode.length === 0) {
    return {
      tariffId: null,
      hasMultipleTariffs: false,
      missingTariff: true,
    }
  }

  if (matchedByCode.length === 1) {
    return {
      tariffId: matchedByCode[0].id,
      hasMultipleTariffs: false,
    }
  }

  const matchedByRate = matchedByCode.filter(tariff => ratesMatch(xmlTasa, tariff.tasa))
  if (matchedByRate.length === 1) {
    return {
      tariffId: matchedByRate[0].id,
      hasMultipleTariffs: false,
    }
  }

  return {
    tariffId: null,
    hasMultipleTariffs: true,
    tariffCount: matchedByCode.length,
    rateMatchCount: matchedByRate.length,
  }
}

function processedDescription(fraction, resolvedTariff) {
  const xmlRateDescription = xmlRateErrorDescription(fraction, resolvedTariff)
  if (xmlRateDescription) {
    return xmlRateDescription
  }

  if (fraction.analisis_riesgo === 'Rojo') {
    return 'SAT modificó el valor declarado. Se aplicó el monto del XML.'
  }

  return null
}

function xmlRateErrorDescription(fraction, resolvedTariff) {
  if (resolvedTariff.missingTariff) {
    return missingTariffDetail(fraction)
  }

  if (resolvedTariff.hasMultipleTariffs) {
    return xmlRateDetail(fraction, resolvedTariff.tariffCount, resolvedTariff.rateMatchCount)
  }

  return null
}

function xmlRateDetail(fraction, tariffCount, rateMatchCount) {
  const percent = xmlPercent(fraction.tasa)
  if (rateMatchCount === 0) {
    return `El inciso arancelario ${fraction.tariff_code_xml} coincide con ${tariffCount} filas en la base de datos y ninguna tiene tasa ${percent}%. Se procesó con la tasa del XML (${percent}%). No se asignó codigo de arancel porque la partida no es única.`
  }

  return `El inciso arancelario ${fraction.tariff_code_xml} y la tasa ${percent}% coinciden con ${rateMatchCount} filas en la base de datos. Se procesó con la tasa del XML (${percent}%). No se asignó codigo de arancel porque la partida no es única.`
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = String(item[key] == null ? '' : item[key])
    if (!acc[value]) {
      acc[value] = []
    }
    acc[value].push(item)
    return acc
  }, {})
}

function countByResult(items) {
  return items.reduce(
    (acc, item) => {
      if (item.result === RESULT.FOUND || item.result === RESULT.UPDATED || item.result === RESULT.XML_RATE) {
        acc.found_count += 1
      } else if (item.result === RESULT.NOT_FOUND) {
        acc.not_found_count += 1
      } else if (item.result === RESULT.INVALID) {
        acc.invalid_count += 1
      } else if (item.result === RESULT.AMBIGUOUS) {
        acc.ambiguous_count += 1
      } else if (item.result === RESULT.SKIPPED) {
        acc.skipped_count += 1
      }

      if (item.result === RESULT.XML_RATE) {
        acc.xml_rate_count += 1
      }

      return acc
    },
    {
      found_count: 0,
      not_found_count: 0,
      invalid_count: 0,
      ambiguous_count: 0,
      skipped_count: 0,
      xml_rate_count: 0,
    }
  )
}

function packageMaster(pkg) {
  return pkg && pkg.master ? String(pkg.master).trim() : ''
}

function packagePoliza(pkg) {
  return pkg && pkg.poliza ? String(pkg.poliza).trim() : ''
}

function uniqueAffectedValues(items, key) {
  return [
    ...new Set(
      items
        .filter(item => isUpdatableResult(item.result) || item.result === RESULT.UPDATED)
        .map(item => item[key])
        .filter(value => value != null && value !== '')
    ),
  ].join(', ')
}

async function matchDeclaration(connection, parsed) {
  const guiaCounts = parsed.fractions.reduce((acc, fraction) => {
    if (!fraction.guia) {
      return acc
    }

    acc[fraction.guia] = (acc[fraction.guia] || 0) + 1
    return acc
  }, {})

  const guias = Object.keys(guiaCounts)
  const tariffCodes = [...new Set(parsed.fractions.map(fraction => fraction.tariff_code_xml).filter(Boolean))]

  const [packages] = guias.length > 0 ? await connection.execute(storage.findPackagesByGuias(guias)) : [[]]
  const [tariffs] = tariffCodes.length > 0 ? await connection.execute(storage.findTariffsByCodes(tariffCodes)) : [[]]
  const [previousLoads] = await connection.execute(storage.findPreviousLoads(parsed.declaration_number, parsed.master))

  const packagesByGuia = groupBy(packages, 'guia')
  const tariffsByCode = groupBy(tariffs, 'code')

  const items = parsed.fractions.map(fraction => {
    if (fraction.invalid) {
      return {
        ...fraction,
        result: RESULT.INVALID,
        error_description: fraction.invalid_message,
        package_id: null,
        tariff_id: null,
        dai: null,
        total_iva: null,
        cif: null,
        importe: null,
        total_a_pagar: null,
      }
    }

    if (guiaCounts[fraction.guia] > 1) {
      return {
        ...fraction,
        result: RESULT.AMBIGUOUS,
        error_description: `La guia ${fraction.guia} esta duplicada en el XML`,
        package_id: null,
        tariff_id: null,
        dai: null,
      }
    }

    const matchedTariffs = tariffsByCode[fraction.tariff_code_xml] || []
    const resolvedTariff = resolveTariff(matchedTariffs, fraction.tasa)
    const hasMultipleTariffs = resolvedTariff.hasMultipleTariffs
    const missingTariff = Boolean(resolvedTariff.missingTariff)
    const useXmlRate = hasMultipleTariffs || missingTariff
    const tariffId = resolvedTariff.tariffId

    const matchedPackages = packagesByGuia[fraction.guia] || []
    if (matchedPackages.length === 0) {
      return {
        ...fraction,
        result: RESULT.NOT_FOUND,
        error_description: `La guia ${fraction.guia} no fue encontrada en la base de datos`,
        package_id: null,
        tariff_id: tariffId,
        dai: null,
      }
    }

    if (matchedPackages.length > 1) {
      return {
        ...fraction,
        result: RESULT.AMBIGUOUS,
        error_description: `La guia ${fraction.guia} coincide con mas de un paquete`,
        package_id: null,
        tariff_id: tariffId,
        dai: null,
      }
    }

    const pkg = matchedPackages[0]
    if (pkg.status === 'Entregado') {
      return {
        ...fraction,
        result: RESULT.SKIPPED,
        error_description: `El paquete ${fraction.guia} ya fue entregado`,
        package_id: pkg.package_id,
        tariff_id: tariffId,
        dai: null,
        manifest_id: pkg.manifest_id,
        manifest_description: pkg.manifest_description,
        previous_costo_producto: pkg.costo_producto,
        previous_tariff_code: pkg.tariff_code,
        previous_tasa: pkg.tasa,
        previous_dai: pkg.dai,
      }
    }

    if (pkg.manifest_status === 'OPEN') {
      return {
        ...fraction,
        result: RESULT.SKIPPED,
        error_description: `El manifiesto del paquete ${fraction.guia} esta abierto`,
        package_id: pkg.package_id,
        tariff_id: tariffId,
        dai: null,
        manifest_id: pkg.manifest_id,
        manifest_description: pkg.manifest_description,
        previous_costo_producto: pkg.costo_producto,
        previous_tariff_code: pkg.tariff_code,
        previous_tasa: pkg.tasa,
        previous_dai: pkg.dai,
      }
    }

    if (pkg.manifest_status === 'CLOSED') {
      return {
        ...fraction,
        result: RESULT.SKIPPED,
        error_description: `El manifiesto del paquete ${fraction.guia} ya esta cerrado`,
        package_id: pkg.package_id,
        tariff_id: tariffId,
        dai: null,
        manifest_id: pkg.manifest_id,
        manifest_description: pkg.manifest_description,
        previous_costo_producto: pkg.costo_producto,
        previous_tariff_code: pkg.tariff_code,
        previous_tasa: pkg.tasa,
        previous_dai: pkg.dai,
      }
    }

    const currentMaster = packageMaster(pkg)
    const currentPoliza = packagePoliza(pkg)
    if (currentMaster && currentMaster !== String(parsed.master)) {
      return {
        ...fraction,
        result: RESULT.SKIPPED,
        error_description: `La guia ${fraction.guia} pertenece a otro master (${currentMaster})`,
        package_id: pkg.package_id,
        tariff_id: tariffId,
        dai: null,
        manifest_id: pkg.manifest_id,
        manifest_description: pkg.manifest_description,
        previous_costo_producto: pkg.costo_producto,
        previous_tariff_code: pkg.tariff_code,
        previous_tasa: pkg.tasa,
        previous_dai: pkg.dai,
      }
    }

    if (currentPoliza && currentPoliza !== String(parsed.declaration_number)) {
      return {
        ...fraction,
        result: RESULT.SKIPPED,
        error_description: `La guia ${fraction.guia} pertenece a otra poliza (${currentPoliza})`,
        package_id: pkg.package_id,
        tariff_id: tariffId,
        dai: null,
        manifest_id: pkg.manifest_id,
        manifest_description: pkg.manifest_description,
        previous_costo_producto: pkg.costo_producto,
        previous_tariff_code: pkg.tariff_code,
        previous_tasa: pkg.tasa,
        previous_dai: pkg.dai,
      }
    }

    const charges = calculateCharges({
      costoProducto: fraction.costo_producto,
      tasa: fraction.tasa,
      weight: pkg.weight,
    })

    return {
      ...fraction,
      ...charges,
      result: useXmlRate ? RESULT.XML_RATE : RESULT.FOUND,
      error_description: processedDescription(fraction, resolvedTariff),
      package_id: pkg.package_id,
      tariff_id: tariffId,
      manifest_id: pkg.manifest_id,
      manifest_description: pkg.manifest_description,
      previous_costo_producto: pkg.costo_producto,
      previous_tariff_code: pkg.tariff_code,
      previous_tasa: pkg.tasa,
      previous_dai: pkg.dai,
    }
  })

  const counts = countByResult(items)

  return {
    declaration_number: parsed.declaration_number,
    master: parsed.master,
    declaration_date: parsed.declaration_date,
    tipo_de_cambio: parsed.tipo_de_cambio,
    sub_total: parsed.sub_total,
    monto_iva: parsed.monto_iva,
    monto_total: parsed.monto_total,
    resultado_analisis_riesgo: parsed.resultado_analisis_riesgo,
    manifest_id: uniqueAffectedValues(items, 'manifest_id'),
    manifest_description: uniqueAffectedValues(items, 'manifest_description'),
    xml_count: parsed.fractions.length,
    already_processed: previousLoads.length > 0,
    previous_load_id: previousLoads.length > 0 ? previousLoads[0].id : null,
    items,
    ...counts,
  }
}

module.exports = {
  RESULT,
  matchDeclaration,
  countByResult,
  isUpdatableResult,
}
