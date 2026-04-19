const crypto = require('crypto');
const env = require('../config/env');

function signPayload(payload) {
  const base = JSON.stringify(payload || {});
  return crypto.createHmac('sha256', env.paywayHashKey || 'dev').update(base).digest('hex');
}

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': env.paywayApiKey,
    'x-merchant-auth': env.paywayMerchantAuth,
    ...extra
  };
}

async function postJson(path, payload) {
  if (!env.paywayBaseUrl) {
    // fallback mock mode for local dev
    return {
      success: true,
      data: {
        qrRaw: `PAYWAY-MOCK-QR:${payload?.merchantRef}`,
        qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(`PAYWAY:${payload?.merchantRef}:${payload?.amount}`)}`,
        paymentLink: `https://payway.local/pay/${payload?.merchantRef}`,
        status: 'pending'
      }
    };
  }

  const response = await fetch(`${env.paywayBaseUrl}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'x-signature': signPayload(payload) }),
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.message || 'PayWay request failed'), { status: 502 });
  }
  return data;
}

module.exports = { postJson, signPayload };
