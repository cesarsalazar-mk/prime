'use strict'
const mysql = require('mysql2/promise')
let AWS = require('aws-sdk')
const bcrypt = require('bcryptjs')
const moment = require('moment-timezone')
let jwt_decode = require('jwt-decode')
const isOffline = process.env['IS_OFFLINE']
const { dbConfig } = require(`${isOffline ? '../..' : '.'}/commons/dbConfig`)
let { response, wakeUpLambda } = require(`${isOffline ? '../..' : '.'}/commons/utils`)
let storage = require('./userStorage')

const date = moment().tz('America/Guatemala').format('YYYY-MM-DD hh:mm:ss')

module.exports.read = async (event, context) => {
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me.' }, null)
  let page = 0
  let params = {
    name: '',
    email: '',
    type: '',
    client_id: null,
  }

  if (event.queryStringParameters && event.queryStringParameters.page) {
    page = event.queryStringParameters.page
  }

  if (event.queryStringParameters && event.queryStringParameters.type) {
    params.type = event.queryStringParameters.type
  }

  if (event.queryStringParameters && event.queryStringParameters.name) {
    params.name = event.queryStringParameters.name
  }

  if (event.queryStringParameters && event.queryStringParameters.email) {
    params.email = event.queryStringParameters.email
  }

  if (event.queryStringParameters && event.queryStringParameters.client_id) {
    params.client_id = event.queryStringParameters.client_id
  }

  if (event.queryStringParameters && event.queryStringParameters.package_id) {
    params.package_id = event.queryStringParameters.package_id
  }

  if (event.queryStringParameters && event.queryStringParameters.tracking) {
    params.tracking = event.queryStringParameters.tracking
  }

  if (event.queryStringParameters && event.queryStringParameters.phone) {
    params.phone = event.queryStringParameters.phone
  }
  let connection = await mysql.createConnection(dbConfig)
  try {
    const [users] = await connection.execute(storage.get(page, params))
    return response(200, users, connection)
  } catch (e) {
    return response(400, e, connection)
  }
}

module.exports.detail = async (event, context) => {
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me' }, null)
  let connection = await mysql.createConnection(dbConfig)
  try {
    const user_id = event.pathParameters && event.pathParameters.user_id ? JSON.parse(event.pathParameters.user_id) : undefined

    if (user_id === undefined) throw 'pathParameters missing.'

    const [users] = await connection.execute(storage.getByid(user_id))
    return response(200, users[0], connection)
  } catch (e) {
    return response(400, e, connection)
  }
}

module.exports.create = async (event, context) => {
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me' }, null)
  const connection = await mysql.createConnection(dbConfig)
  try {
    let data = JSON.parse(event.body)

    if (!data.name || !data.email || !data.password || !data.type) {
      throw 'missing parameters'
    }

    let obj = serializeData(data, false)
    const save = await connection.execute(storage.post(obj))
    //save the initial
    const _client = await generateID(connection)
    obj.client_id = _client
    if (save) await connection.execute(storage.createProfile(obj, save[0].insertId))

    if (!event.Records) {
      try {
        const sns = new AWS.SNS()
        await sns
          .publish({
            Message: JSON.stringify(data),
            TopicArn: 'arn:aws:sns:us-east-1:097890312429:users-pn-create-aereo',
          })
          .promise()
      } catch (snsError) {
        console.log(snsError, 'sns users-pn-create-aereo error')
      }
    }

    return response(200, data, connection)
  } catch (e) {
    console.log(e)
    return response(400, e.message ? e.message : e, connection)
  }
}

module.exports.update = async (event, context) => {
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me' }, null)
  try {
    const user_id = event.pathParameters && event.pathParameters.user_id ? JSON.parse(event.pathParameters.user_id) : undefined

    if (user_id === undefined) throw 'pathParameters missing'

    let data = JSON.parse(event.body)

    if (!data) throw 'no data to update'

    const connection = await mysql.createConnection(dbConfig)

    const update = await connection.execute(storage.put(data, user_id))

    if (update) await connection.execute(storage.updateProfile(serializeData(data, true), user_id))

    return response(200, update, connection)
  } catch (e) {
    return response(400, e, null)
  }
}

module.exports.delete = async (event, context) => {
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me' }, null)
  const connection = await mysql.createConnection(dbConfig)
  try {
    const user_id = event.pathParameters && event.pathParameters.user_id ? JSON.parse(event.pathParameters.user_id) : undefined

    console.log(user_id, 'user')

    if (user_id === undefined) throw 'pathParameters missing'

    const update = await connection.execute(storage.delete(user_id))

    return response(200, update, connection)
  } catch (e) {
    return response(400, e, connection)
  }
}

module.exports.search = async (event, context) => {
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me' }, null)
  const connection = await mysql.createConnection(dbConfig)
  try {
    let str = '',
      filter = ''

    if (event.queryStringParameters && event.queryStringParameters.str) {
      str = event.queryStringParameters.str
    }
    if (event.queryStringParameters && event.queryStringParameters.filter) {
      filter = event.queryStringParameters.filter
    }

    if (str === undefined) throw 'pathParameters missing'

    const update = await connection.execute(storage.findByStr(str, filter))

    return response(200, update[0], connection)
  } catch (e) {
    return response(400, e, connection)
  }
}

module.exports.migration = async (event, context) => {
  const connection = await mysql.createConnection(dbConfig)
  const sql = `SELECT * FROM usuarios WHERE email = '${event.userName}' AND activo = 'Y'`
  if (event.triggerSource == 'UserMigration_Authentication') {
    console.log(event.triggerSource, 'event')
    console.log(sql, 'sql')
    // authenticate the user with your existing user directory service
    const [users] = await connection.execute(sql)
    console.log(users[0])
    await connection.end()
    if (users[0]) {
      event.response.userAttributes = {
        email: users[0].email,
        email_verified: 'true',
        profile: users[0].type,
      }

      console.log(event.response.userAttributes, 'event.response.userAttributes')
      event.response.finalUserStatus = 'CONFIRMED'
      event.response.messageAction = 'SUPPRESS'
      //context.succeed(event)
      return event
    } else {
      // Return error to Amazon Cognito
      throw new Error('Bad password')
    }
  } else if (event.triggerSource == 'UserMigration_ForgotPassword') {
    // Lookup the user in your existing user directory service
    const [users] = await connection.execute(sql)
    if (users[0]) {
      await connection.end()
      event.response.userAttributes = {
        email: users[0].email,
        // required to enable password-reset code to be sent to user
        email_verified: 'true',
        profile: users[0].type,
      }
      event.response.messageAction = 'SUPPRESS'
      return event
    } else {
      // Return error to Amazon Cognito
      throw new Error('Bad password')
    }
  } else {
    // Return error to Amazon Cognito
    throw new Error('Bad triggerSource ' + event.triggerSource)
  }
}

module.exports.profile = async (event, context) => {
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me' }, null)
  const connection = await mysql.createConnection(dbConfig)
  try {
    const token = event.headers.Authorization

    if (!token) throw 'No token provider'

    const decode = jwt_decode(token)
    console.log(decode.email, 'decode')

    let [profile] = await connection.execute(storage.getProfile(decode.email))

    return response(200, profile, connection)
  } catch (Error) {
    console.log(Error, 'error')
    return response(400, { error: Error }, connection)
  }
}

module.exports.profileTest = async (event, context) => {
  try {
    console.log(event)
    return response(200, 'hola  undo', null)
  } catch (Error) {
    console.log(Error, 'error')
    return response(400, { error: Error }, null)
  }
}

module.exports.getPackagesUser = async (event, context) => {
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me' }, null)
  const connection = await mysql.createConnection(dbConfig)
  try {
    const token = event.headers.Authorization

    if (!token) throw 'No token provider'

    const decode = jwt_decode(token)

    let user_id = ''
    if (decode.profile === 'cliente') {
      let [user] = await connection.execute(storage.getProfile(decode.email))
      user_id = user[0].client_id
    } else {
      user_id = event.pathParameters && event.pathParameters.user_id ? event.pathParameters.user_id : undefined
    }

    if (user_id === undefined) throw 'pathParameters missing'

    let [packages] = await connection.execute(storage.getPackage(user_id))
    let [profile] = await connection.execute(storage.detailByClient(user_id))

    let output = {}
    output.profile = profile[0]
    output.packages = packages

    return response(200, output, connection)
  } catch (Error) {
    console.log(Error, 'ee')
    return response(400, { error: Error }, connection)
  }
}
module.exports.postConfirmation = async (event, context) => {
  console.log(event, 'event')
  if (wakeUpLambda(event)) return await response(200, { message: 'just warnUp me' }, null)
  try {
    if (event.triggerSource === 'PostConfirmation_ConfirmForgotPassword') return event

    const sql = `INSERT INTO usuarios (name, activo, email, type)
                  VALUES ('${event.request.userAttributes.name}','Y','${event.request.userAttributes.email}','cliente')`

    console.log(sql, 'sql')
    const connection = await mysql.createConnection(dbConfig)

    const client = await generateID(connection)

    console.log(client, 'client')
    const [users] = await connection.execute(sql)

    const query = `INSERT INTO clientes (entrega, phone, nit, main_address, message_user, cuota, date_created, id_usuario, client_name, email, client_id )
                  VALUES ('Entrega en Prime','','','','',65,'${date}',${users.insertId}, '${event.request.userAttributes.name}','${event.request.userAttributes.email}','${client}' )`

    await connection.execute(query)
    await connection.end()
    await cognitoSetGroup(event.request.userAttributes.name, event.request.userAttributes.email, 'cliente')

    return event
  } catch (e) {
    throw new Error('Bad triggerSource ' + e)
  }
}

const cognitoSetGroup = (name, email, type) => {
  AWS.config.region = 'us-east-1'
  AWS.config.update({
    credentials: new AWS.CognitoIdentityCredentials({ IdentityPoolId: process.env['IDENTITY'] }),
  })
  let cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider({
    credentials: { accessKeyId: process.env['ACCESS_KEY'], secretAccessKey: process.env['SECRET_KEY'] },
  })

  let params = {
    UserPoolId: process.env['USER_POOL'],
    Username: email,
    UserAttributes: [
      /* required */
      {
        Name: 'name' /* required */,
        Value: name,
      },
      {
        Name: 'profile' /* required */,
        Value: type,
      },
      {
        Name: 'email' /* required */,
        Value: email,
      },
    ],
  }

  return new Promise((resolve, reject) => {
    cognitoidentityserviceprovider.adminUpdateUserAttributes(params, function (err, data) {
      if (err) {
        console.log(err, 'fn')
        reject(err)
      }
      resolve(data)
    })
  })
}

const serializeData = (data, update) => {
  let dataToSave = {}

  if (!update) {
    const hash = bcrypt.hashSync(data.password, 10)
    dataToSave.password = hash
  }

  dataToSave.name = data.name
  dataToSave.email = data.email
  dataToSave.type = data.type
  ;((dataToSave.entrega = data.entrega ? data.entrega : 'Entrega en Prime'), //can be Entrega en Traestodo o Entrega a Domicilio
    (dataToSave.phone = data.phone ? data.phone : ''))
  dataToSave.nit = data.nit ? data.nit : ''
  dataToSave.main_address = data.main_address ? data.main_address : '' // client address
  dataToSave.message_user = data.message_user ? data.message_user : '' // observations
  dataToSave.cuota = data.cuota ? data.cuota : 60
  dataToSave.date_created = date
  dataToSave.flete = data.flete ? data.flete : 25.0
  dataToSave.desaduanaje = data.desaduanaje ? data.desaduanaje : 30.0

  return dataToSave
}

const generateID = async connection => {
  try {
    let [client_id] = await connection.execute(storage.findMaxId())

    //save the initial
    console.log(client_id, 'client_id')
    let initial = client_id[0].client_id[0]
    let secondPart = client_id[0].client_id.replace(/[A-Z]/g, '').length
    let maximum = parseInt(client_id[0].client_id.replace(/[A-Z]/g, '')) + 1
    let partNumeric = maximum.toString().length
    partNumeric = secondPart - partNumeric
    let _client = ''
    let _var = ''
    for (let i = 0; i < partNumeric; i++) {
      _var += `0`
      _client = `${initial}${_var}${maximum}`
    }
    return _client
  } catch (e) {
    console.log(e, 'ee')
  }
}
