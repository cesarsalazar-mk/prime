const readList = (date, page) => {
  let _limit = 600;
  let _page = 0;
  let where = "";

  if (page && page > 1) {
    _page = (page - 1) * _limit;
  } else {
    _page = 0;
  }

  if (date) {
    where = `WHERE ent_date = '${date}'`;
  }

  const query = `SELECT A.package_id, A.client_id, A.tracking, A.total_a_pagar, A.description, C.contact_name, A.ing_date, A.ent_date, A.status, A.weight, A.guia
                FROM  paquetes A
                LEFT JOIN clientes C on A.client_id = C.client_id
                ${where}
                ORDER BY A.package_id ASC LIMIT ${_page},${_limit}`;

  return query;
};

const totalsByDate = date => {
  const query = `SELECT count(package_id) as tota_paquetes, sum(total_a_pagar) as total_cobrado ,sum(weight) as total_libras
                FROM paquetes
                WHERE ent_date = '${date}';`;

  return query;
};

const entryPackageDetail = date => {
  const query = `SELECT A.package_id, A.client_id, A.tracking, A.total_a_pagar, A.description, C.contact_name, A.ing_date, A.ent_date, A.status, A.weight
                FROM  paquetes A
                LEFT JOIN clientes C on A.client_id = C.client_id
                WHERE ing_date = '${date}' AND status NOT IN ('Registrado' ,'On Hold')
                ORDER BY A.package_id ASC ;`;
  return query;
};

const entryPackageTotal = date => {
  const query = `SELECT count(package_id) as tota_paquetes, sum(weight) as total_libras
                FROM paquetes
                WHERE ing_date = '${date}' AND status NOT IN ('Registrado' ,'On Hold')`;
  return query;
};

const entryTicketPackageTotal = (startDate,endDate) => {  

  let where = ''
  
  if(startDate === 'null' && endDate === 'null'){
    where = `WHERE status = 'On Hold' `
  }else if (startDate !== 'null' && endDate === 'null'){
    where = `WHERE ing_date = '${startDate}' AND status = 'On Hold' `
  }else if(startDate === 'null' && endDate !== 'null'){
    where = `WHERE ing_date = '${endDate}' AND status = 'On Hold' `
  }else{
    where = `WHERE str_to_date(ing_date, '%Y-%m-%d') between '${startDate}' and '${endDate}' AND status = 'On Hold' `
  }
  
  const query = `SELECT count(package_id) as tota_paquetes, sum(weight) as total_libras
                FROM paquetes
                ${where};`;
  return query;
};

const entryTicketPackageDetail = (startDate,endDate) => {
  let where = ''
  
  if(startDate === 'null' && endDate === 'null'){
    where = `WHERE status = 'On Hold' `
  }else if (startDate !== 'null' && endDate === 'null'){
    where = `WHERE ing_date = '${startDate}' AND status = 'On Hold' `
  }else if(startDate === 'null' && endDate !== 'null'){
    where = `WHERE ing_date = '${endDate}' AND status = 'On Hold' `
  }else{
    where = `WHERE str_to_date(ing_date, '%Y-%m-%d') between '${startDate}' and '${endDate}' AND status = 'On Hold' `
  }

  const query = `SELECT A.package_id, A.guia, A.client_id, A.tracking, A.total_a_pagar, A.description, C.contact_name, A.ing_date, A.ent_date, A.status, A.weight
                FROM  paquetes A
                LEFT JOIN clientes C on A.client_id = C.client_id
                ${where}
                ORDER BY A.package_id ASC ;`;
                console.log("entryTicketPackageDetail ",query)
  return query;
};

const packagesOnRouteTotal = () => {
  const query = `SELECT count(package_id) as tota_paquetes, sum(weight) as total_libras, sum(total_a_pagar) as total_por_cobrar from paquetes A
                inner join clientes B on A.client_id = B.client_id
                where B.entrega = 'Entrega a Domicilio'  AND (ent_date = '' OR ent_date ='0000-00-00') AND A.status != 'Registrado' AND A.status != 'Entregado'`;
  console.log(query, "query 11");
  return query;
};

const packagesOnRoute = _ => {
  const query = `select * from paquetes A
                inner join clientes B on A.client_id = B.client_id
                where B.entrega = 'Entrega a Domicilio' AND (ent_date = '' OR ent_date ='0000-00-00') AND A.status != 'Registrado' AND A.status != 'Entregado'`;

  return query;
};

const packageInWarehouse = () => {
  const query = `select A.*, B.entrega from paquetes A
                  inner join clientes B on A.client_id = B.client_id
                  where ent_date ='0000-00-00' 
                  AND A.status != 'Registrado'
                  AND A.status != 'En Warehouse'
                  AND A.status != 'Retenido'
                  ORDER BY A.client_id DESC;`;
  return query;
};

const packageInWarehouseTotal = () => {
  /*const query = `SELECT count(package_id) as tota_paquetes, sum(weight) as total_libras, sum(total_a_pagar) as total_por_cobrar from paquetes A
                  inner join clientes B on A.client_id = B.client_id
                  where (ent_date = '' OR ent_date ='0000-00-00') AND A.status != 'Registrado';`;*/
  const query = `SELECT count(package_id) as tota_paquetes, sum(weight) as total_libras, sum(total_a_pagar) as total_por_cobrar from paquetes A
                 inner join clientes B on A.client_id = B.client_id
                 where ent_date ='0000-00-00' 
                 AND A.status != 'Registrado' 
                 AND A.status != 'En Warehouse'
                 AND A.status != 'Retenido'`
  return query;
};

const packageRetenido = () => {
  const query = `select A.*, B.entrega from paquetes A
                  inner join clientes B on A.client_id = B.client_id
                  where A.status = 'Retenido'
                  ORDER BY A.client_id DESC;`;
  return query;
};

const packageRetenidoTotal = () => {
  const query = `SELECT count(package_id) as tota_paquetes, sum(weight) as total_libras, sum(total_a_pagar) as total_por_cobrar from paquetes A
                 inner join clientes B on A.client_id = B.client_id
                 where A.status = 'Retenido'`
  return query;
};

const stateAccount = (client_id, package_id) => {
  let where = "";
  let query = "";
  if (client_id > 0) {
    where = ` AND a.client_id = ${client_id} `;
  }

  if (package_id > 0) {
    query = `SELECT date, remaining, a.client_id, package_id, amount, charge, C.contact_name
                  FROM accounts_receivable a
                  INNER JOIN clientes C on a.client_id = C.client_id
                  WHERE package_id = ${package_id}`;
    return query;
  }

  query = `SELECT date, remaining, a.client_id, package_id, amount, charge, C.contact_name
                  FROM accounts_receivable AS a
                  INNER JOIN clientes C on a.client_id = C.client_id
                  WHERE date = (
                      SELECT MAX(date)
                      FROM accounts_receivable AS b
                      WHERE a.package_id = b.package_id
                        AND a.client_id = b.client_id )
                ${where}
                HAVING remaining > 0;`;
  return query;
};

const reportByMaster = (master, poliza) => {
  
  let _poliza =  poliza ? ` AND p.poliza = '${poliza}'` : ''
  const query = `SELECT package_id,client_id,weight,tasa,tracking,status, importe, guia, dai, cif, total_a_pagar, costo_producto, poliza, master, total_iva
                 FROM paquetes p WHERE p.master = '${master}' ${_poliza} `
  
  return query
}

const byMasterTotal = (master, poliza) => {
  let _poliza =  poliza ? ` AND p.poliza = '${poliza}'` : ''
  const query = `SELECT count(package_id) as total_paquetes,
                 sum(weight) as total_libras,
                 sum(dai) as sub_total,
                 sum(total_iva ) as iva,
                 sum(costo_producto ) as costo_producto
                 FROM paquetes p WHERE p.master = '${master}' ${_poliza}`
  
  return query
}

const getInvoices = (date,store) => {
  let query = `SELECT client_id,nit,num_serie_sat, num_authorization_sat,num_control,certification_date_date, total_cta, created_at, 
                  ds.name as status, pt.name as payment, d.observations, d.id as transaction_id
                  FROM documents d 
                  INNER JOIN document_status ds on d.status = ds.id
                  INNER JOIN payment_types pt on d.payment_id = pt.id 
                  where created_at = '${date}'`    
  if(store) query += ` and store_id = ${store}`

  return query
}

const getConciliation = (date,store,type) => {
  console.log("TYPE >> ",type)
  let query = ''
  if(type == 'FACTM'){
    console.log("TYPE >> A")
    query = `SELECT
    d2.client_id,
    d2.observations as guia,
    d2.total_cta,
    ar.status,
    d2.num_control,
    d2.id as transaction_id,
    d2.store_id,
    d2.total_cta as subtotal_discount ,
    d2.discount,
    (d2.total_cta - d2.discount) as total_discount
    FROM  documents d2
    INNER JOIN account_reconciliation ar on d2.id = ar.document_id AND ar.status = 'DONE'
    WHERE recorded_at = '${date}'
      and d2.type_doc = 4
      and d2.store_id = ${parseInt(store)}
    GROUP by d2.id;`
  }else{
    console.log("TYPE >> B")
    query = `SELECT COUNT(DISTINCT p.package_id) as package_id, 
    p.client_id, 
    SUM(p.weight) as weight, 
    d2.observations as guia,
    d2.total_cta,
    ar.status,
    d2.num_control,
    d2.id as transaction_id,
    GROUP_CONCAT(DISTINCT p.guia SEPARATOR ',') as guia_wron,
    d2.store_id,
    d2.total_cta as subtotal_discount ,
    d2.discount,
    (d2.total_cta - d2.discount) as total_discount
    FROM paquetes p
    INNER JOIN document_details dd on p.package_id = dd.package_id AND dd.cod_service in (${parseInt(store) === 2 ? '5,7' : '1,7'})
    INNER JOIN documents d2 on dd.id_document = d2.id
    INNER JOIN account_reconciliation ar on d2.id = ar.document_id AND ar.status = 'DONE'
    WHERE recorded_at = '${date}' and d2.store_id = ${parseInt(store)}  GROUP by d2.id`
  }
  console.log("QUERY >> ",query)
  return query
}
const getGuiaDetail = (guia) => {
  const query = `SELECT ar.recorded_at, ar.status, ar.document_id, p3.guia, p3.package_id, p3.client_id, p3.total_a_pagar, p3.client_id, p3.status
                  FROM paquetes p3
                  LEFT join document_details dd on p3.package_id = dd.package_id
                  LEFT join account_reconciliation ar on dd.id_document = ar.document_id
                  WHERE p3.guia =${guia}
                  GROUP BY p3.guia`
  return query
}

module.exports = {
  read: readList,
  totalsByDate,
  entryPackageDetail,
  entryPackageTotal,
  packageInWarehouse,
  packageInWarehouseTotal,
  packageRetenido,
  packageRetenidoTotal,
  packagesOnRoute,
  packagesOnRouteTotal,
  stateAccount,
  reportByMaster,
  byMasterTotal,
  getInvoices,
  getConciliation,
  getGuiaDetail,
  entryTicketPackageTotal,
  entryTicketPackageDetail
};
