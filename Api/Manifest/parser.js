const xml2js = require('xml2js')

const MAX_XML_BYTES = 1024 * 1024

function getText(node) {
  if (node == null || node === '') {
    return ''
  }

  if (Array.isArray(node)) {
    return getText(node[0])
  }

  if (typeof node === 'object') {
    if (node._ != null) {
      return String(node._).trim()
    }

    return ''
  }

  return String(node).trim()
}

function normalizeDeclaration(value) {
  return String(value || '').replace(/[\s-]/g, '')
}

function parseNumber(value) {
  if (value == null || value === '') {
    return null
  }

  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function parseTariffRate(value) {
  const parsed = parseNumber(value)
  if (parsed == null || parsed < 0) {
    return null
  }

  return parsed / 100
}

function parseMerchandiseDescription(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\S+)\s+(.+)$/)

  if (match) {
    return {
      guia: match[1],
      description: match[2].trim(),
    }
  }

  if (/^\S+$/.test(text)) {
    return {
      guia: text,
      description: '',
    }
  }

  return null
}

function assertSafeXml(xml) {
  if (typeof xml !== 'string' || xml.trim().length === 0) {
    throw new Error('El archivo XML es obligatorio')
  }

  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) {
    throw new Error('El archivo XML supera el tamano maximo permitido (1 MB)')
  }

  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new Error('El XML contiene declaraciones no permitidas')
  }
}

function parseXmlString(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(
      xml,
      {
        explicitArray: true,
        mergeAttrs: true,
        xmlns: false,
      },
      (error, result) => {
        if (error) {
          reject(new Error('El archivo no es un XML valido'))
          return
        }

        resolve(result)
      }
    )
  })
}

function mapFraction(fraccion, index) {
  const merchandise = parseMerchandiseDescription(getText(fraccion.descripcionMercancias))
  const costoProducto = parseNumber(getText(fraccion.valorEnQuetzales))
  const tasa = parseTariffRate(getText(fraccion.tasaArancelaria))
  const tariffCodeXml = getText(fraccion.incisoArancelario)
  const daiXml = parseNumber(getText(fraccion.impuestoGuia))
  const missingFields = []

  if (!merchandise || !merchandise.guia) {
    missingFields.push('descripcionMercancias')
  }

  if (!tariffCodeXml) {
    missingFields.push('incisoArancelario')
  }

  if (costoProducto == null || costoProducto < 0) {
    missingFields.push('valorEnQuetzales')
  }

  if (tasa == null) {
    missingFields.push('tasaArancelaria')
  }

  return {
    index,
    guia: merchandise ? merchandise.guia : '',
    description: merchandise ? merchandise.description : getText(fraccion.descripcionMercancias),
    pieces: parseNumber(getText(fraccion.numeroBultos)),
    tariff_code_xml: tariffCodeXml,
    tasa,
    costo_producto: costoProducto,
    dai_xml: daiXml,
    invalid: missingFields.length > 0,
    invalid_message: missingFields.length > 0 ? `Datos invalidos: ${missingFields.join(', ')}` : null,
  }
}

async function parseDeclarationXml(xml) {
  assertSafeXml(xml)

  const parsed = await parseXmlString(xml)
  const declarationNode = Array.isArray(parsed && parsed.declaracion)
    ? parsed.declaracion[0]
    : parsed && parsed.declaracion

  if (!declarationNode) {
    throw new Error('El XML no contiene el elemento declaracion')
  }

  const noDeclaracion = getText(declarationNode.noDeclaracion)
  const guiaEmbarque = getText(declarationNode.guiaEmbarque)
  const fractions = Array.isArray(declarationNode.fraccion)
    ? declarationNode.fraccion
    : declarationNode.fraccion
      ? [declarationNode.fraccion]
      : []

  if (!noDeclaracion) {
    throw new Error('El XML no contiene noDeclaracion')
  }

  if (!guiaEmbarque) {
    throw new Error('El XML no contiene guiaEmbarque')
  }

  if (fractions.length === 0) {
    throw new Error('El XML no contiene fracciones')
  }

  return {
    declaration_number: normalizeDeclaration(noDeclaracion),
    declaration_number_raw: noDeclaracion,
    master: guiaEmbarque,
    declaration_date: getText(declarationNode.fechaDeclaracion),
    fractions: fractions.map(mapFraction),
  }
}

module.exports = {
  parseDeclarationXml,
  normalizeDeclaration,
  MAX_XML_BYTES,
}
