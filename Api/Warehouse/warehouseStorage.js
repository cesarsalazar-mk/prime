const createSupplier = data => {
  const query = ` INSERT INTO suppliers
                  (name, address, code, phone, status)
                  VALUES('${data.name.toUpperCase()}', '${data.address}', '${data.code}', '${data.phone}', 'ACTIVE');`
  return query
}

const readSuppliers = () => {
  const query = ` SELECT *
                  FROM suppliers A
                  WHERE status = 'ACTIVE'
                  ORDER by A.id DESC`
  return query
}

const updateSuppliers = (data, id) => {
  const query = `UPDATE suppliers SET name='${data.name.toUpperCase()}', address='${data.address}', phone='${data.phone}' WHERE id=${id};`
  return query
}

const deleteSupplier = id => {
  const query = `UPDATE suppliers SET status = 'INACTIVE' WHERE id = '${id}'`
  return query
}

const createCarries = data => {
  const query = ` INSERT INTO carriers (name, status, code) VALUES('${data.name.toUpperCase()}', 'ACTIVE', '${data.code}');`
  return query
}

const readCarries = () => {
  const query = ` SELECT *
                  FROM carriers
                  WHERE status = 'ACTIVE'
                  ORDER by id DESC`
  return query
}

const updateCarrie = (data, id) => {
  const query = `UPDATE carriers SET name='${data.name.toUpperCase()}' WHERE id=${id}`
  return query
}

const deleteCarries = id => {
  const query = `UPDATE carriers SET status = 'INACTIVE' WHERE id = '${id}'`
  return query
}

const findMaxPaqueteId = () => 'SELECT IFNULL(MAX(CONVERT(guia, SIGNED INTEGER)), 0) AS id FROM paquetes'

const createWarehouseEntry = (data, guia) => `
    INSERT INTO paquetes (
        tracking,
        client_id,
        weight,
        description,
        category_id,
        total_a_pagar,
        ing_date,
        status,
        entregado,
        cancelado,
        delivery,
        create_by,
        costo_producto,
        dai,
        cif,
        importe,
        master,
        poliza,
        guia,
        tasa,
        total_iva,
        supplier_id,
        carrier_id,
        manifest_id,
        destination_id,
        voucher_bill,
        voucher_payment,
        measurements,
        valor_miami
    )
    VALUES (
        '${data.tracking}',
        '${data.client_id}',
        '${data.weight}',
        '${data.package_description}',                  
        ${data.category_id ? data.category_id : 1},
        ${data.total_a_pagar ? data.total_a_pagar : 0},
        '${data.ing_date}',
        'En Warehouse',
        0,
        0,
        0,
        'NEW_SYSTEM',
        ${data.invoice_price ? data.invoice_price : 0},
        ${data.dai ? data.dai : 0.0},
        ${data.cif ? data.cif : 0.0},
        ${data.importe ? data.importe : 0.0},
        '${data.pn_master ? data.pn_master.master : ''}',
        '${data.pn_master ? data.pn_master.poliza : ''}',
        '${guia}',
        ${data.tasa ? data.tasa : 0.0},
        ${data.iva ? data.iva : 0.0},
        ${data.supplier_id},
        ${data.carrier_id},
        ${data.manifest_id},
        ${data.destination_id},
        ${data.voucher_bill.length > 5 ? "'" + data.voucher_bill + "'" : null},
        ${data.voucher_payment.length > 5 ? "'" + data.voucher_payment + "'" : null},
        '${data.measurements ? data.measurements : ''}',
        ${data.invoice_price ? data.invoice_price : 0}
    );`

const createWarehouseEntryDetail = (
  data,
  package_id,
  date,
  status
) => `INSERT INTO paquetes_detail (package_id, status, fecha_registro, client_id, tba)
                  VALUES (${package_id},${status},'${date}','${data.client_id}',0)`

const findManifestById = manifest_id => `SELECT manifest_id FROM manifest WHERE manifest_id = ${manifest_id} AND status = 'OPEN'`

const findOpenManifest = manifest_id => `SELECT manifest_id FROM manifest WHERE status = 'OPEN'`

const findPackagesByTracking = tracking => `SELECT package_id, manifest_id,guia,client_id,voucher_bill,voucher_payment FROM paquetes WHERE tracking = '${tracking}'`

const getUserInfo = client_id => `
  SELECT client_id, email, contact_name, client_name, phone FROM clientes WHERE client_id = '${client_id}'
`

const updatePackage = (data,package_id,manifest_id) => {
  let query = `UPDATE paquetes SET 
            tracking = '${data.tracking}',                
            weight = '${data.weight}',
            valor_miami = ${data.invoice_price ? data.invoice_price : 0},
            costo_producto = ${data.invoice_price ? data.invoice_price : 0},
            description = '${data.package_description}',
            category_id = ${data.category_id ? data.category_id : 1},`

            if(data.voucher_bill.length > 5 ){
              query +=`voucher_bill = ${data.voucher_bill.length > 5 ? "'" + data.voucher_bill + "'" : null},`              
            }

            if(data.voucher_payment.length > 5){
              query += `voucher_payment = ${data.voucher_payment.length > 5 ? "'" + data.voucher_payment + "'" : null},`
            }

           query += `total_a_pagar = ${data.total_a_pagar ? data.total_a_pagar : 0},            
            destination_id = ${data.destination_id},            
            supplier_id = ${data.supplier_id},
            carrier_id = ${data.carrier_id},            
            measurements = '${data.measurements ? data.measurements : ''}',
            manifest_id = ${manifest_id ? manifest_id : data.manifest_id },
            status = 'En Warehouse'
            WHERE package_id = ${package_id}
            AND status IN ('En Warehouse','Registrado','Listo para Entrega a Domicilio');`
    console.log("updatePackage" ,query)
  return query
}

const updatePackageWithGuide = (data,package_id,manifest_id,guia) => {
  let query = `UPDATE paquetes SET 
            tracking = '${data.tracking}',
            guia = '${guia}',                
            weight = '${data.weight}',
            valor_miami = ${data.invoice_price ? data.invoice_price : 0},
            costo_producto = ${data.invoice_price ? data.invoice_price : 0},
            description = '${data.package_description}',
            category_id = ${data.category_id ? data.category_id : 1},
            total_a_pagar = ${data.total_a_pagar ? data.total_a_pagar : 0},`

            if(data.voucher_bill.length > 5 ){
              query +=`voucher_bill = ${data.voucher_bill.length > 5 ? "'" + data.voucher_bill + "'" : null},`              
            }

            if(data.voucher_payment.length > 5){
              query += `voucher_payment = ${data.voucher_payment.length > 5 ? "'" + data.voucher_payment + "'" : null},`
            }
            
      query += `destination_id = ${data.destination_id},            
            supplier_id = ${data.supplier_id},
            carrier_id = ${data.carrier_id},            
            measurements = '${data.measurements ? data.measurements : ''}',
            manifest_id = ${manifest_id ? manifest_id : data.manifest_id },
            status = 'En Warehouse'
            WHERE package_id = ${package_id}
            AND status IN ('En Warehouse','Registrado','Listo para Entrega a Domicilio');`

  console.log("updatePackageWithGuide" ,query)
  return query
}

module.exports = {
  createSupplier,
  readSuppliers,
  updateCarrie,
  deleteSupplier,
  createCarries,
  readCarries,
  updateSuppliers,
  deleteCarries,
  createWarehouseEntry,
  createWarehouseEntryDetail,
  findMaxPaqueteId,
  findManifestById,
  findPackagesByTracking,
  getUserInfo,
  updatePackage,
  updatePackageWithGuide,
  findOpenManifest
}
