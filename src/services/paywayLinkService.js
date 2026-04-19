const dayjs = require('dayjs');
const { postJson } = require('./paywayService');
const paymentService = require('./paymentService');
const { generateMerchantRef } = require('./paywayQrService');

async function createPaymentLink(payment, tenant, room) {
  if (payment.status === 'paid') throw Object.assign(new Error('Payment already paid.'), { status: 400 });
  const merchantRef = payment.gatewayMerchantRef || generateMerchantRef(payment, room);

  const payload = {
    amount: payment.amount,
    currency: 'USD',
    merchantRef,
    description: `Rent ${room.roomNumber} ${dayjs(payment.dueDate).format('YYYY-MM-DD')}`,
    customerName: tenant.fullName,
    customerPhone: tenant.phone
  };

  const result = await postJson('/payments/link', payload);
  const updated = await paymentService.saveGatewayData(payment._id, {
    gateway: 'payway',
    gatewayType: 'link',
    gatewayMerchantRef: merchantRef,
    gatewayPaymentLink: result.data?.paymentLink || null,
    gatewayStatus: result.data?.status || 'pending',
    gatewayRawResponse: result
  });
  return updated;
}

module.exports = { createPaymentLink };
