const Payment = require('../models/Payment');

async function getTenantPaymentHistory(tenantId, page = 1, limit = 5) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(20, Number(limit) || 5));
  const [items, total] = await Promise.all([
    Payment.find({ tenantId, status: 'paid' }).populate('roomId').sort({ paidDate: -1, createdAt: -1 }).skip((p - 1) * l).limit(l),
    Payment.countDocuments({ tenantId, status: 'paid' })
  ]);
  return { items, total, page: p, totalPages: Math.max(1, Math.ceil(total / l)) };
}

module.exports = { getTenantPaymentHistory };
