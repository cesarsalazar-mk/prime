const accounting = require('accounting-js')

const buildXML = (data, moment) => {
  //build XML Header
  //build XML Header
  
  let _xml_header = headerInvoice(data, moment)
  
  //build XML detail
  let line = 1
  let _xml_detail = ``
  let oea = ''
  let _dai =0
  let _iva =0
  data.items.forEach( (x)=> {
    let str = `<stdTWS.stdTWSCIt.stdTWSDIt>
                  <TrnLiNum>${line}</TrnLiNum>
                  <TrnArtCod>${ x.description === 'Desaduanaje' ? 'D' : x.description === 'Flete' ? 'F': 'E'}</TrnArtCod>
                  <TrnArtNom>${ x.description }</TrnArtNom>
                  <TrnCan>${x.qty}</TrnCan>
                  <TrnVUn>${x.unitario && x.cod_service !== 4 ? x.unitario : x.amount }</TrnVUn>
                  <TrnUniMed>UNI</TrnUniMed>
                  <TrnVDes>${x.descuento ? x.descuento.toFixed(2) : '0.0'}</TrnVDes>
                  <TrnArtBienSer>S</TrnArtBienSer>
                  <TrnArtImpAdiCod>0</TrnArtImpAdiCod>
                  <TrnArtImpAdiUniGrav>0</TrnArtImpAdiUniGrav>
                 </stdTWS.stdTWSCIt.stdTWSDIt>`
     oea = x.item;
    if(x.package_id && x.cod_service === 1 ){
      _dai += x.dai
      _iva += parseFloat(x.total_iva)
    }
    _xml_detail = _xml_detail + str
  })
  _xml_detail = `<stdTWSD>${_xml_detail}</stdTWSD>
                 <stdTWSCA1>
                    <stdTWS.stdTWSCA1.stdTWSCA1It>
                        <Columna1>${oea} IVA</Columna1>
                        <Columna2>Texto Col 2</Columna2>
                        <Columna3>Texto Col 3</Columna3>
                        <Columna4>Texto Col 4</Columna4>
                        <Columna5>${_iva !== 0 ? accounting.toFixed(_iva, 2) : 0.000001}</Columna5>
                        <Columna6>Texto Col 6</Columna6>
                        <Columna7>Texto Col 7</Columna7>
                        <Columna8>Texto Col 8</Columna8>
                    </stdTWS.stdTWSCA1.stdTWSCA1It>
                    <stdTWS.stdTWSCA1.stdTWSCA1It>
                        <Columna1>${oea} DAI</Columna1>
                        <Columna2>Texto Col 2</Columna2>
                        <Columna3>Texto Col 3</Columna3>
                        <Columna4>Texto Col 4</Columna4>
                        <Columna5>${ _dai !== 0 ? accounting.toFixed(_dai, 2) : 0.000001}</Columna5>
                        <Columna6>Texto Col 6</Columna6>
                        <Columna7>Texto Col 7</Columna7>
                        <Columna8>Texto Col 8</Columna8>
                     </stdTWS.stdTWSCA1.stdTWSCA1It>
                    </stdTWSCA1>
                  </stdTWS>`
  
  let xml = _xml_header + _xml_detail
  xml = xml.replace(/\n/g,'')
  return xml
}

const buildXMLAllInclude = (data, moment) => {
  //build XML Header
  let _xml_header = headerInvoice(data, moment)
  //build XML detail
  let line = 1
  let _xml_detail = ''
  let oea = ''
  let amount_cuenta_ajena =0
  data.items.forEach( (x)=> {
  
    if(x.package_id && x.cod_service === 6 ){
      amount_cuenta_ajena += parseFloat(x.amount)
    }
    if(x.cod_service !== 6){
      let str = `<stdTWS.stdTWSCIt.stdTWSDIt>
                  <TrnLiNum>${line}</TrnLiNum>
                  <TrnArtCod>${ x.description === 'Servicio Courier' ? 'S' : x.description === 'Cuenta Ajena' ? 'C': 'E'}</TrnArtCod>
                  <TrnArtNom>${ x.description }</TrnArtNom>
                  <TrnCan>${x.qty}</TrnCan>
                  <TrnVUn>${x.unitario && x.cod_service !== 4 ? x.unitario : x.amount }</TrnVUn>
                  <TrnUniMed>UNI</TrnUniMed>
                  <TrnVDes>${x.descuento ? x.descuento.toFixed(2) : '0.0'}</TrnVDes>
                  <TrnArtBienSer>S</TrnArtBienSer>
                  <TrnArtImpAdiCod>0</TrnArtImpAdiCod>
                  <TrnArtImpAdiUniGrav>0</TrnArtImpAdiUniGrav>
                 </stdTWS.stdTWSCIt.stdTWSDIt>`
      oea = x.item;
     
      _xml_detail = _xml_detail + str
    }
  })
  _xml_detail = `<stdTWSD>${_xml_detail}</stdTWSD>
                 <stdTWSCA1>
                    <stdTWS.stdTWSCA1.stdTWSCA1It>
                        <Columna1>${oea} Cuenta Ajena</Columna1>
                        <Columna2>Texto Col 2</Columna2>
                        <Columna3>Texto Col 3</Columna3>
                        <Columna4>Texto Col 4</Columna4>
                        <Columna5>${amount_cuenta_ajena !== 0 ? accounting.toFixed(amount_cuenta_ajena, 2) : 0.000001}</Columna5>
                        <Columna6>Texto Col 6</Columna6>
                        <Columna7>Texto Col 7</Columna7>
                        <Columna8>Texto Col 8</Columna8>
                    </stdTWS.stdTWSCA1.stdTWSCA1It>
                    </stdTWSCA1>
                  </stdTWS>`
  
  let xml = _xml_header + _xml_detail
  xml = xml.replace(/\n/g,'')
  return xml
}

const headerInvoice = (data, moment) => {
  return `<stdTWS xmlns="FEL">
                    <TrnEstNum>${data.store_id}</TrnEstNum>
                    <TipTrnCod>FACT</TipTrnCod>
                    <TrnNum>${data.transaction_number}</TrnNum>
                    <TrnFec>${moment().tz('America/Guatemala').format('YYYY-MM-DD')}</TrnFec>
                    <MonCod>GTQ</MonCod>
                    <TrnBenConNIT>${data.nit}</TrnBenConNIT>
                    <TrnExp>0</TrnExp>
                    <TrnExento>0</TrnExento>
                    <TrnFraseTipo>0</TrnFraseTipo>
                    <TrnEscCod>0</TrnEscCod>
                    <TrnEFACECliCod/>
                    <TrnEFACECliNom>${data.client_name}</TrnEFACECliNom>
                    <TrnEFACECliDir>${data.address}</TrnEFACECliDir>
                    <TrnObs>${data.guiaDetails}</TrnObs>
                    <TrnEmail>${data.email_client}</TrnEmail>`
}

const generateCorrelative = async (connection, query) => {
  try {
    let [num_control] = await connection.execute(query)
    //save the initial
    let initial = num_control[0].num_control[0]
    let secondPart = num_control[0].num_control.replace(/[A-Z]/g,'').length
    let maximum = parseInt(num_control[0].num_control.replace(/[A-Z]/g,'')) + 1
    let partNumeric = maximum.toString().length
    partNumeric = secondPart - partNumeric
    let _num_control = ''
    let _var = ''
    for (let i = 0 ; i < partNumeric; i++ ){
      _var += `0`
      _num_control = `${initial}${_var}${maximum}`
    }
    return _num_control
  }catch (e) {
    console.log(e,'ee')
  }
}

const calc = (theform) => {
  let num = theform.original.value, rounded = theform.rounded
  let with2Decimals = num.toString().match(/^-?\d+(?:\.\d{0,2})?/)[0]
  rounded.value = with2Decimals
}

const money = value => accounting.toFixed(Number(value) || 0, 2)

const pdfEscape = text =>
  String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ')

const pdfLine = text => `0 -16 Td (${pdfEscape(text)}) Tj\n`

const buildDevInvoicePdf = (data, sat) => {
  const items = data.items || []
  const discount = Number(data.discount) || 0
  const seguro = Number(data.seguro) || 0
  const total = Number(data.total) || 0

  let content = 'BT\n/F1 14 Tf\n50 760 Td\n'
  content += `(*** FACTURA DE PRUEBA DEV ***) Tj\n`
  content += `/F1 10 Tf\n`
  content += pdfLine('No es un DTE certificado. Ecofactura esta deshabilitado en este ambiente.')
  content += pdfLine(`Serie: ${sat.sat_number}`)
  content += pdfLine(`Autorizacion: ${sat.autorization_number}`)
  content += pdfLine(`Fecha: ${sat.create_at}`)
  content += pdfLine(`Cliente: ${data.client_name || data.client_id || ''}`)
  content += pdfLine(`NIT: ${data.nit || ''}`)
  content += pdfLine(`Observaciones: ${data.observations || ''}`)
  content += pdfLine('')
  content += pdfLine('Descripcion                         Cant     Monto')
  content += pdfLine('------------------------------------------------')

  items.forEach(item => {
    const description = String(item.description || '').slice(0, 32).padEnd(32, ' ')
    const qty = String(item.qty == null ? 1 : item.qty).padStart(4, ' ')
    const amount = money(item.amount).padStart(10, ' ')
    content += pdfLine(`${description} ${qty} ${amount}`)
  })

  content += pdfLine('------------------------------------------------')
  content += pdfLine(`Subtotal: Q ${money(data.sub_total)}`)
  content += pdfLine(`Descuento: Q ${money(discount)}`)
  content += pdfLine(`Seguro: Q ${money(seguro)}`)
  content += pdfLine(`Total: Q ${money(total - discount)}`)
  content += 'ET\n'

  const stream = Buffer.from(content, 'latin1')
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${stream.length} >> stream\n${content}endstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj\n',
  ]

  let pdf = '%PDF-1.1\n'
  const offsets = [0]
  objects.forEach(object => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += object
  })

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return Buffer.from(pdf, 'latin1').toString('base64')
}

module.exports = {
  buildXML,
  generateCorrelative,
  buildXMLAllInclude,
  buildDevInvoicePdf,
}