const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
const sns = new AWS.SNS()

async function sendSMSviaSNS(params) {
  const payload = {
    warehouse: params.warehouse,
    profile: params.profile,
    data: params.data,
  }

  await sns
    .publish({
      Message: JSON.stringify(payload),
      TopicArn: `arn:aws:sns:us-east-1:${process.env['ACCOUNT_ID']}:sms-${process.env['STAGE']}-tigo`,
    })
    .promise()
}

function getSendSMSviaSNSParams(data) {
  return {
    data: {
      package_id: data.package_id,
      tracking: data.tracking,
      client_id: data.client_id,
      weight: data.weight,
      description: data.description,
      ing_date: data.ing_date,
      status: data.status,
      total: data.total,
    },
    profile: [
      {
        client_id: data.client_id,
        email: data.email,
        contact_name: data.contact_name,
        client_name: data.client_name,
        phone: data.phone,
      },
    ],
  }
}

module.exports = {
  sendSMSviaSNS,
  getSendSMSviaSNSParams,
}
