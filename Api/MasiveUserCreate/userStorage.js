const read = (page, params) => {
  let _limit = 25
  let _page = 0
  let where = ''
  let _inner = ''

  if (page && page > 1) {
    _page = (page - 1) * _limit
  } else {
    _page = 0
  }

  if (params.type) {
    where += ` AND A.type = '${params.type}' `
  } else {
    if (!params.client_id) {
      where += ` AND A.type != 'cliente' `
    }
  }

  if (params.email) {
    where += ` AND A.email = '${params.email}' `
  }

  if (params.name) {
    where += ` AND A.name like '%${params.name}%' `
  }

  if (params.client_id) {
    where += ` AND B.client_id = '${params.client_id}' `
  }

  if (params.phone) {
    where += ` AND B.phone like '%${params.phone}%' `
  }

  if (params.tracking) {
    _inner += ` INNER JOIN paquetes C on B.client_id = C.client_id AND C.tracking like '%${params.tracking}%' `
  }

  if (params.package_id) {
    _inner += ` INNER JOIN paquetes C on B.client_id = C.client_id AND C.package_id = ${params.package_id} `
  }

  const query = `SELECT A.id, A.name, A.email, A.type, A.activo, B.client_id, B.phone, B.entrega, B.cuota, B.date_created, B.preferences, B.message_user,
                  B.nit, B.main_address, B.flete, B.desaduanaje
                  FROM  usuarios A
                  INNER JOIN clientes B on A.id = B.id_usuario
                  ${_inner}
                  WHERE A.activo = 'Y'
                  ${where}
                  ORDER BY id DESC LIMIT ${_page},${_limit}`

  return query
}

const detail = user_id => {
  const query = `SELECT A.*, B.hashed_password, B.client_id, B.contact_name, B.client_name, B.phone, B.nit, B.invoice_name, B.main_address, B.entrega, B.preferences, B.cuota, B.id_usuario, B.date_created, B.flete, B.desaduanaje
                  FROM usuarios A
                  LEFT JOIN clientes B on A.id = B.id_usuario
                  WHERE A.id = ${user_id}`
  return query
}

const detailByClient = client => {
  const query = `SELECT A.name, A.email, B.entrega, B.phone, B.nit, B.main_address, B.message_user, B.client_id, A.type as profile, B.flete, B.desaduanaje
                 FROM clientes B
                 LEFT JOIN usuarios A on B.id_usuario = A.id
                 WHERE B.client_id = '${client}'`
  return query
}

const create = data => {
  const query = `INSERT INTO usuarios (type, email, name, hashed_password) VALUES ('${data.type}','${data.email}','${data.name}','${data.password}');`
  return query
}

const createProfile = (data, user_id) => {
  const query = `INSERT INTO clientes (client_id ,entrega, phone, nit, main_address, message_user, cuota, date_created, id_usuario, client_name, email, contact_name )
                  VALUES ('${data.client_id}','${data.entrega}','${data.phone}','${data.nit}','${data.main_address}','${data.message_user}',${data.cuota},'${data.date_created}',${user_id}, '${data.name}','${data.email}','${data.name}')`
  return query
}

const update = (data, user_id) => {
  const query = `UPDATE usuarios SET type = '${data.type}', name = '${data.name}' WHERE id = ${parseInt(user_id, 10)};`
  return query
}

const updateProfile = (data, user_id) => {
  const query = `UPDATE clientes SET entrega = '${data.entrega}',
                  phone = '${data.phone}',
                  nit = '${data.nit}',
                  main_address = '${data.main_address}',
                 message_user = '${data.message_user}',
                 flete = ${data.flete},
                 desaduanaje = ${data.desaduanaje}
                 WHERE id_usuario = ${parseInt(user_id, 10)};`
  return query
}

const remove = user_id => {
  const query = `UPDATE usuarios SET activo = 'N'  WHERE id = ${parseInt(user_id, 10)};`
  return query
}

const getProfile = email => {
  const query = `SELECT B.client_id, B.phone, B.main_address, B.nit, B.cuota, B.message_user, B.preferences, B.entrega, A.email,
                A.name, A.id as user_id, A.type, A.activo
                FROM usuarios A
                 LEFT JOIN clientes B on A.id = B.id_usuario
                 WHERE A.email = '${email}'`

  return query
}

const getPackage = id => {
  const query = `SELECT A.client_id, A.package_id, A.tracking, A.weight, A.ing_date, A.ent_date, A.total_a_pagar, A.anticipo, A.entregado,
                A.status, A.guia, A.master, A.poliza, A.costo_producto, A.total_iva, A.importe, A.dai, (SELECT name from suppliers where id =  A.supplier_id) AS supplier_name,
                A.voucher_bill,A.voucher_payment, A.description
                FROM paquetes A
                WHERE A.client_id = '${id}'
                ORDER BY A.ing_date DESC `

  return query
}

const findMaxId = () => {
  //const query = `SELECT id_usuario as id , client_id FROM clientes WHERE id_usuario = ( SELECT MAX(id_usuario ) FROM clientes )`;
  const query = `SELECT id_usuario as id , client_id FROM clientes WHERE client_id = ( SELECT MAX(client_id ) FROM clientes c WHERE c.client_id like 'P%')`;
  
  return query
}

const findByStr = (str, filter) => {
  let WHERE = ''
  if (filter === 'email') {
    WHERE = `WHERE A.email like '%${str}%'`
  } else {
    WHERE = `WHERE A.name like '%${str}%'`
  }

  const query = `SELECT A.name, A.email, B.client_id
                 FROM usuarios A
                 INNER JOIN clientes B on A.id = B.id_usuario
                 ${WHERE} `
  console.log(query, 'query')
  return query
}

module.exports = {
  get: read,
  post: create,
  put: update,
  delete: remove,
  getByid: detail,
  getProfile,
  createProfile,
  updateProfile,
  getPackage,
  findByStr,
  detailByClient,
  findMaxId
}
