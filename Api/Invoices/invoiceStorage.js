const read = (page, type, id) => {
  let _limit = 25
  let _page = 0
  let where = ''

  if (page && page > 1) {
    _page = (page - 1) * _limit
  } else {
    _page = 0
  }
  switch (type) {
    case 'tracking':
      where = `WHERE tracking like '%${id}%'`
      break
    case 'client_id':
      where = `WHERE A.client_id = '${id}'`
      _limit = 1000
      break
    case 'package_id':
      where = `WHERE A.package_id = ${parseInt(id, 10)}`
      _limit = 1000
      break
    case 'phone':
      where = `WHERE C.phone like '%${id}%'`
      _limit = 1000
      break
    case 'guide':
      where = `WHERE A.guia = '${id}'`
      _limit = 1000
      break
  }

  const query = `SELECT A.package_id, A.client_id, A.tracking, A.total_a_pagar, A.description, C.contact_name, A.ing_date, A.ent_date, A.status,
                 A.weight, A.anticipo, A.total_a_pagar, A.dai, A.cif, A.importe, A.costo_producto, A.tasa, A.guia, A.total_iva, A.poliza
                FROM  paquetes A
                LEFT JOIN clientes C on A.client_id = C.client_id
                ${where}
                ORDER BY A.package_id DESC LIMIT ${_page},${_limit}`

  return query
}

const create = (data,date,correlative) => {
  let amount = 0
  if(data.document_type !== 'TARIFA_INDIVIDUAL')
    amount = calculateToTal(data.items)
  
  const seguro = data.seguro != null && data.seguro !== '' ? Number(data.seguro) : 0

  const query = `INSERT INTO documents (client_id, nit, address, type_doc, num_control,
                  total, sub_total, total_cta, observations,status,created_at,created_by, payment_id, store_id,discount,seguro)
                  VALUES ('${data.client_id}',
                  '${data.nit}',
                  '${data.address}',
                  ${data.type_doc},
                  '${correlative ? correlative : 'A00000'}',
                  ${amount === 0 ? data.total : amount},
                  ${amount === 0 ? data.sub_total: amount},
                  ${amount === 0 ? data.total_cta : amount },
                  '${data.observations}',
                  1,
                  '${date}',
                  '${data.created_by}',
                  ${data.payment_type},
                  ${data.store_id},${data.discount},${isNaN(seguro) ? 0 : seguro}) `
  
  return query
}

const updatedDocument = (data, id) => {
  
  const query = `UPDATE documents SET num_serie_sat = '${data.sat_number}',
                                      num_authorization_sat = '${data.autorization_number}',
                                      delivery_date_sat = '${data.create_at}',
                                      certification_date_date = '${data.certification_date}',
                                      status = 2
                                      WHERE id = ${id}`
  
  return query
}

const createDetail = (data,id) => {
  
  const query = `INSERT INTO document_details (id_document,package_id,description,qty,amount,sub_total,unitario,descuento,item, cod_service)
                  VALUES (${id},'${data.package_id}','${data.description}',${data.qty},${data.amount},${data.sub_total},${data.unitario},${data.descuento},'${data.item}', ${data.cod_service});`
  return query
}

const downloadSimple = (date, package_id) => {
  const query = `UPDATE paquetes SET ent_date = '${date}',
                  delivery = '0',
                  entregado = '0',
                  cancelado = 0,
                  anticipo = '0',
                  pending_amount = 0,
                  status = 'Entregado'
                  WHERE package_id = ${package_id};`
  return query
}
const isEmpty = (obj) => {
  for(let key in obj) {
    if(obj[key] === '' ){
      
      return key
    }
  }
  return false;
}

const makeRequestApi = async (url, method, data) =>{
  const axios = require('axios');
  const headers = {
    headers: { 'Content-Type': 'application/xml', SOAPAction:'execute' }
  }
  
  let dta = await new Promise((resolve, reject) => {
    axios({
      method: method,
      url:url ,
      ...headers,
      data : data,
    })
      .then(data => { //console.log(data,'ressss')
        if (data.errors) reject(data.errors[0].message)
        else resolve(data.data)
      })
      .catch(err => {console.log(err,'err')
        if (err.response && err.response.data) return reject(err.response.data.message)
        reject({ message: 'Unknown error' })
      })
  });
  
  return dta
}

const makeRequestSoap = async (SOAP, url, data) => {
  let resp = await new Promise(((resolve, reject) => {
    SOAP.createClient(url, function(err, Client) {
      Client.Execute(data, function(err, result) {
        if(err) {
          console.log(err,'err')
          reject(err)
        }
        resolve(result)
      });
    });
  }))
  return resp
}

const parseToJson = async (xml, xml2js) =>
  await new Promise(((resolve, reject) => {
    xml2js.parseString(xml, { mergeAttrs: true }, (err, result) => {
      if (err) {
        reject(err);
      }
      const json = JSON.parse(JSON.stringify(result, null, 2));
      resolve(json)
    });
  }))

const saveToLog = (data,date,insertId) => {
  const query = ` INSERT INTO log_documents (request,create_at, document_id)
                  VALUES('${JSON.stringify(data)}','${date}',${insertId});`
  return query
}

const updatedToLog = (data,date,id_log) => {
  const query = ` UPDATE log_documents SET response_pdf = '${data.pdf}', response_xml = '${data.xml}',
                   response_data = '${data.create_at} - ${data.certification_date} - ${data.autorization_number} - ${data.sat_number}', error = '${data.error ? JSON.stringify(data.error) : 'NO ERRORS'}',
                   update_at = '${date}' WHERE document_id = ${id_log};`
  return query
}

const findMaxId = () => {
  const query = `SELECT id , transaction_number FROM documents WHERE transaction_number = ( SELECT MAX(transaction_number ) FROM documents )`;
  
  return query
}

const getCorrelative = () => {
  const query = `SELECT id, num_control FROM documents WHERE num_control = ( SELECT MAX(num_control ) FROM documents )`;
  
  return query
}

const get = (params) => {
  let query = `SELECT  D.*, ds.name as status_invoices, DATE_FORMAT(D.created_at, '%d-%m-%Y') AS created_at_date, s.description,ar.recorded_at, ar.status
              FROM documents D
              INNER JOIN document_status ds on D.status = ds.id
              INNER JOIN stores s on D.store_id = s.id
              LEFT JOIN account_reconciliation ar on D.id = ar.document_id
              ORDER By id DESC LIMIT 150`
  switch (params.type) {
    case 'client':
      query = `SELECT  D.*, ds.name as status_invoices, DATE_FORMAT(D.created_at, '%d-%m-%Y') AS created_at_date, s.description, ar.recorded_at, ar.status
                FROM documents D
                INNER JOIN clientes C  on D.client_id = C.client_id
                INNER JOIN document_status ds on D.status = ds.id
                INNER JOIN stores s on D.store_id = s.id
                LEFT JOIN account_reconciliation ar on D.id = ar.document_id
                WHERE D.client_id = '${params.id}'`
      break
    case 'control':
      query = `SELECT  D.*, ds.name as status_invoices, DATE_FORMAT(D.created_at, '%d-%m-%Y') AS created_at_date,s.description, ar.recorded_at, ar.status
                FROM documents D
                INNER JOIN document_status ds on D.status = ds.id
                INNER JOIN stores s on D.store_id = s.id
                LEFT JOIN account_reconciliation ar on D.id = ar.document_id
                WHERE D.id = '${params.id}'`
      break
    case 'sat_number':
      query = `SELECT  D.*, ds.name as status_invoices, DATE_FORMAT(D.created_at, '%d-%m-%Y') AS created_at_date,s.description, ar.recorded_at, ar.status
                FROM documents D
                INNER JOIN document_status ds on D.status = ds.id
                INNER JOIN stores s on D.store_id = s.id
                LEFT JOIN account_reconciliation ar on D.id = ar.document_id
                WHERE D.num_serie_sat = '${params.id}'`
      break
    case 'sucursal':
      query = `SELECT  D.*, ds.name as status_invoices, DATE_FORMAT(D.created_at, '%d-%m-%Y') AS created_at_date,s.description, ar.recorded_at, ar.status
                FROM documents D
                INNER JOIN document_status ds on D.status = ds.id
                INNER JOIN stores s on D.store_id = s.id
                LEFT JOIN account_reconciliation ar on D.id = ar.document_id
                WHERE s.id = '${params.id}'`
      break
  }
  return query
}

const getDetail = (id) => {
  const query = `SELECT D.id, client_id, nit, D.address, created_at, created_by, num_serie_sat, num_authorization_sat, num_control, total, sub_total, total_cta, observations,
                transaction_number, delivery_date_sat, certification_date_date, annulation_date, reason, annul_by, D.discount, D.seguro,
                ds.name as status, dt.description,s.description
                FROM documents D
                INNER JOIN document_status ds on D.status = ds.id
                INNER JOIN document_types dt on D.type_doc = dt.id
                INNER JOIN stores s on D.store_id = s.id
                WHERE D.id = ${id}`;
  return query
}

const getDetailPDF = (id) => {
  const query = `SELECT response_pdf FROM log_documents WHERE document_id = ${id}`;
  return query
}

const getDocumentByClient = (id) => {
  const query = `SELECT description,master,poliza,dai,cif,guia,importe,tracking,weight,client_id,package_id,total_a_pagar,costo_producto,total_iva
                  FROM paquetes
                  WHERE client_id = '${id}' AND ent_date = '0000-00-00' AND status NOT IN ('Registrado','On Hold','Entregado','En Warehouse')`;
  return query
}

const getClientInfo = (id) => {
  // const query = `SELECT contact_name, client_name, email, phone, nit, main_address
  //                FROM clientes
  //                WHERE client_id = '${id}'`;

const query = `SELECT 
                A.client_id,
                B.name as contact_name,
                B.name as client_name,
                A.email,
                A.phone,
                A.nit,
                A.main_address
            FROM clientes A
            INNER JOIN usuarios B on A.id_usuario = B.id 
                WHERE A.client_id = '${id}'`;
  return query
}

const products = () => {
  const query = `SELECT id, name, price, description_sat
                  FROM products;`;
  return query
}

const invoiceAnnul = (data, date, id, status) => {
  let query = ''
  if(data){
    query = `UPDATE documents SET reason = '${data.reason}',
    annulation_date = '${date}',
    annul_by = '${data.annuled_by}',
    status = ${status}
    WHERE id = ${id}`
  }else{
    query = `UPDATE documents SET reason = NULL,
                                      annulation_date = NULL,
                                      annul_by = NULL,
                                      status = ${status}
                                      WHERE id = ${id}`
  }
  
  console.log("query >> ",query)
  return query
}

const payments = () => {
  const query = `SELECT id, name FROM primedb.payment_types WHERE status = 'ACTIVE';`;
  return query
}

const stores = () => {
  const query = `SELECT * FROM stores WHERE status = 'ACTIVE';`;
  return query
}

const createReconciliation = (document_id, date) => {
  const query = `INSERT INTO account_reconciliation
                 (document_id, created_at, status)
                  VALUES(${document_id}, '${date}', 'PENDING');`;
  return query
}

const updateReconciliation = (data, id, date) => {
  const query = `UPDATE account_reconciliation
                 SET recorded_at='${date}', recorded_by='${data.recorded_by}', status='DONE'
                 WHERE document_id = ${id};`;
  return query
}
const getReconciliation = (params) => {
  
  let query = `SELECT D.id,
                      D.client_id,
                      num_control,
                      total,
                      observations,
                      D.created_at,
                      a.status as status_conciliation ,
                      D.total as subtotal_discount ,
                      D.discount,
                      (D.total - D.discount) as total_discount
                      FROM documents D
                 INNER JOIN account_reconciliation a on D.id = a.document_id
                 WHERE a.status = 'PENDING' ORDER BY D.id DESC`
  
  switch (params.type) {
    case 'client':
      query = `SELECT D.id,D.client_id,num_control,total,observations,D.created_at,a.status as status_conciliation,
                D.total as subtotal_discount ,
                D.discount,
                (D.total - D.discount) as total_discount
                FROM documents D
                INNER JOIN clientes C  on D.client_id = C.client_id
                INNER JOIN account_reconciliation a on D.id = a.document_id
                WHERE D.client_id = '${params.id}' AND a.status = 'PENDING' ORDER BY D.id DESC`
      break
    case 'date':
      query = `SELECT D.id,D.client_id,num_control,total,observations,D.created_at,a.status as status_conciliation,
                      D.total as subtotal_discount ,
                      D.discount,
                      (D.total - D.discount) as total_discount
                FROM documents D
                INNER JOIN clientes C  on D.client_id = C.client_id
                INNER JOIN account_reconciliation a on D.id = a.document_id
                WHERE a.created_at >= '${params.start}' AND a.created_at <= '${params.end}'
                AND a.status = 'PENDING' ORDER BY D.id DESC`
      break
  }
  
  return query
}

const revertPackage = (id) => {
  const query = ` update paquetes SET status = 'Recoger en Prime', ent_date = '0000-00-00'
                  WHERE package_id in (SELECT dd.package_id
                  FROM documents d
                  INNER JOIN document_details dd on d.id = dd.id_document
                  where d.id = ${id})`
  
  return query
}

const revertConciliation = (id,date) => {
  const query = `update account_reconciliation SET status = 'CANCELLED', recorded_at = '${date}' where document_id = ${id}`
  console.log(query, 'query');
  return query
}

//it calculte the total only for all include method
const calculateToTal = (data) => {
  let amount = 0
    data.forEach(x => {
         return amount = amount + ( x.qty * x.unitario)
  })
  return amount
}

const getPackagesDescription = (items) => {
  const query = `select guia,description from paquetes
                where guia in (${items.join(',')})`;  
  return query
}

const SEGURO_FEE_KEY = 'seguro_fee'
const SEGURO_FEE_ENABLED_KEY = 'seguro_fee_enabled'

const getSeguroFee = () => {
  const query = `SELECT setting_key, setting_value, updated_at, updated_by
                 FROM settings
                 WHERE setting_key IN ('${SEGURO_FEE_KEY}', '${SEGURO_FEE_ENABLED_KEY}')`
  return query
}

const upsertSeguroFee = (value, date, updatedBy) => {
  const query = `INSERT INTO settings (setting_key, setting_value, updated_at, updated_by)
                 VALUES ('${SEGURO_FEE_KEY}', '${value}', '${date}', '${updatedBy || ''}')
                 ON DUPLICATE KEY UPDATE
                   setting_value = '${value}',
                   updated_at = '${date}',
                   updated_by = '${updatedBy || ''}'`
  return query
}

const upsertSeguroFeeEnabled = (enabled, date, updatedBy) => {
  const query = `INSERT INTO settings (setting_key, setting_value, updated_at, updated_by)
                 VALUES ('${SEGURO_FEE_ENABLED_KEY}', '${enabled ? '1' : '0'}', '${date}', '${updatedBy || ''}')
                 ON DUPLICATE KEY UPDATE
                   setting_value = '${enabled ? '1' : '0'}',
                   updated_at = '${date}',
                   updated_by = '${updatedBy || ''}'`
  return query
}

module.exports = {
  post: create,
  isEmpty,
  createDetail,
  downloadSimple,
  makeRequestApi,
  makeRequestSoap,
  parseToJson,
  saveToLog,
  updatedToLog,
  findMaxId,
  updatedDocument,
  getCorrelative,
  get,
  getDetail,
  getDetailPDF,
  getDocumentByClient,
  invoiceAnnul,
  getClientInfo,
  payments,
  createReconciliation,
  updateReconciliation,
  getReconciliation,
  products,
  revertPackage,
  revertConciliation,
  stores,
  getPackagesDescription,
  getSeguroFee,
  upsertSeguroFee,
  upsertSeguroFeeEnabled,
}
