#!/usr/bin/env node
'use strict'

// Reenvía los SMS de carga que no se enviaron cuando se procesó el manifiesto.
// Busca los paquetes de un load_id con status "Recoger en Prime" y los publica a SNS.
// Uso: node scripts/resend-charge-sms.js <load_id>          dry-run
//      node scripts/resend-charge-sms.js <load_id> --send   envía

const mysql = require('mysql2/promise')
const credentials = require('../../../commons/credentials.json')
const { getSendSMSviaSNSParams, sendSMSviaSNS } = require('../sms')

const ADMINS = [
  { contact_name: 'AdminChargeReport', phone: '35757882' },
  // { contact_name: 'AdminChargeReport', phone: '52016022' },
  // { contact_name: 'AdminChargeReport', phone: '54978132' },
  // { contact_name: 'AdminChargeReport', phone: '32370023' },
  // { contact_name: 'AdminChargeReport', phone: '+16095919448' },
]

async function main() {
  const loadId = Number(process.argv[2])
  const send = process.argv.includes('--send')

  if (!loadId) {
    console.log('Uso:')
    console.log('  node scripts/resend-charge-sms.js <load_id>          dry-run')
    console.log('  node scripts/resend-charge-sms.js <load_id> --send   envía')
    process.exit(1)
  }

  const stage = credentials.stage
  const cfg = credentials[stage]
  process.env.STAGE = stage
  process.env.ACCOUNT_ID = String(cfg.awsAccountId)
  process.env.AWS_ACCESS_KEY_ID = cfg.accessKeyId
  process.env.AWS_SECRET_ACCESS_KEY = cfg.secretAccessKey
  process.env.AWS_DEFAULT_REGION = 'us-east-1'

  const db = await mysql.createConnection({
    host: cfg.dbHost,
    port: Number(cfg.dbPort),
    user: cfg.dbUser,
    password: cfg.dbPassword,
    database: cfg.dbName,
  })

  const [packages] = await db.execute(
    `
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
      FROM manifest_load_detail d
      INNER JOIN paquetes p ON p.package_id = d.package_id
      INNER JOIN clientes c ON c.client_id = p.client_id
      WHERE d.load_id = ?
        AND d.result IN ('UPDATED', 'XML_RATE')
        AND p.status = 'Recoger en Prime'
    `,
    [loadId]
  )

  await db.end()

  if (!packages.length) {
    console.log(`No hay paquetes para load_id ${loadId}`)
    return
  }

  const messages = [...packages, ...ADMINS].map(getSendSMSviaSNSParams)

  console.log(`${send ? 'Enviando' : 'Dry-run'} ${messages.length} SMS (carga ${loadId})\n`)

  for (const params of messages) {
    const phone = params.profile[0].phone
    const tracking = params.data.tracking || 'admin'
    const total = params.data.total || '-'
    console.log(`${phone}  ${tracking}  total=${total}`)

    if (send) {
      await sendSMSviaSNS(params)
    }
  }

  if (!send) {
    console.log('\nNada se envió. Para enviar: node scripts/resend-charge-sms.js', loadId, '--send')
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
