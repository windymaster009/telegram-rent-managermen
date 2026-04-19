const env = require('../config/env');
const { signPayload } = require('./paywayService');
const paymentService = require('./paymentService');

function verifyWebhook(payload, headers = {}) {
  if (!env.paywayWebhookSecret) return true;
  const signature = headers['x-payway-signature'] || headers['X-PayWay-Signature'];
  const expected = signPayload({ ...payload, secret: env.paywayWebhookSecret });
  return signature === expected;
}

async function handlePaywayWebhook(payload, headers = {}) {
  if (!verifyWebhook(payload, headers)) {
    throw Object.assign(new Error('Invalid webhook signature'), { status: 401 });
  }

  const merchantRef = payload.merchantRef || payload.merchant_ref;
  const txId = payload.transactionId || payload.transaction_id;
  const status = String(payload.status || '').toLowerCase();

  const payment = await paymentService.getPaymentByMerchantRef(merchantRef);
  if (!payment) throw Object.assign(new Error('Payment not found for merchantRef'), { status: 404 });

  if (['success', 'paid', 'completed'].includes(status)) {
    const finalized = await paymentService.finalizeSuccessfulPayment(payment._id, {
      status: 'success',
      transactionId: txId,
      raw: payload,
      method: payment.gatewayType === 'link' ? 'PayWay Link' : 'PayWay QR'
    });
    return { updated: true, payment: finalized };
  }

  await paymentService.saveGatewayData(payment._id, {
    gatewayStatus: status || payment.gatewayStatus,
    gatewayRawResponse: payload,
    webhookReceivedAt: new Date()
  });
  return { updated: false, payment };
}

module.exports = { handlePaywayWebhook, verifyWebhook };
