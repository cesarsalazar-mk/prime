'use strict'
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const moment = require('moment-timezone')
const isOffline = process.env['IS_OFFLINE']
const { dbConfig } = require(`${isOffline ? '../..' : '.'}/commons/dbConfig`)
let { response, wakeUpLambda } = require(`${isOffline ? '../..' : '.'}/commons/utils`)
let storage = require('./userStorage')
const date = moment().tz('America/Guatemala').format('YYYY-MM-DD hh:mm:ss')
const fs = require('fs')
const csv = require('csv-parser');

module.exports.create = async (event, context) => {    
    try{
      const myConsole = new console.Console(fs.createWriteStream('./output.txt'));      
      const data = await readFile() 
      const connection = await mysql.createConnection(dbConfig)                
      
      //paralelo
      // const saveOperations = data.map(user => processUser(user,connection,myConsole));
      // await Promise.all(saveOperations);

      //secuencial
      for (const user of data) {          
        await processUser(user,connection,myConsole)
      }      

      return response(200, {message:'FINISH ALL PROCESS'}, null)    
    }catch(error){
      console.log("OHHH nooo! >>>>",error)
      return response(400, {message:'ERROR'}, null)    
    }
    
}

const processUser = async (user,connection,myConsole)=>{

  try {    
    if (!user.name || !user.email || !user.password || !user.type) {      
      throw 'missing parameters'
    }  
    let obj = serializeData(user, false)    
    const save = await connection.execute(storage.post(obj))
    //save the initial
    const _client = await generateID(connection)
    obj.client_id = _client

    if (save) {
      await connection.execute(storage.createProfile(obj, save[0].insertId))
    }
    
    console.log("----SAVED----")
    console.log("ID = ",user.id)
    console.log("CLIENTID = ",_client)
    console.log("-------------")
    console.log("")

    myConsole.log("----SAVED----")
    myConsole.log("ID = ",user.id)
    myConsole.log("CLIENTID = ",_client)
    myConsole.log("-------------")
    myConsole.log("")

  } catch (e) {      
    console.log("----ERROR----")
    console.log("ID = ",user.id)
    console.log("Error = ",e.message)
    console.log("-------------")
    console.log("")

    myConsole.log("----ERROR----")
    myConsole.log("ID = ",user.id)
    myConsole.log("Error = ",e.message)
    myConsole.log("-------------")
    myConsole.log("")
  }


}

const readFile = async () => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('data_masive_users.csv')
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        resolve(results);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
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
  ;(dataToSave.entrega = data.entrega ? data.entrega : 'Entrega en Prime'), //can be Entrega en Traestodo o Entrega a Domicilio
    (dataToSave.phone = data.phone ? data.phone : '')
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