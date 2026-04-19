const dayjs = require('dayjs');
const { postJson } = require('./paywayService');
const paymentService = require('./paymentService');

function generateMerchantRef(payment, room) {
  return `RENT-${room.roomNumber}-${payment._id}-${Date.now()}`;
}

async function createQrPayment(payment, tenant, room) {
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

  const result = await postJson('/payments/qr', payload);
  const updated = await paymentService.saveGatewayData(payment._id, {
    gateway: 'payway',
    gatewayType: 'qr',
    gatewayMerchantRef: merchantRef,
    gatewayStatus: result.data?.status || 'pending',
    gatewayQrRaw: result.data?.qrRaw || null,
    gatewayQrImageUrl: result.data?.qrImageUrl || null,
    gatewayRawResponse: result,
    qrActive: true
  });
  return updated;
}

module.exports = { createQrPayment, generateMerchantRef };
