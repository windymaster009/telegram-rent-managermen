const dayjs = require('dayjs');
const Payment = require('../models/Payment');
const Room = require('../models/Room');
const { addMonth, startOfCurrentMonth, endOfCurrentMonth } = require('../utils/date');

async function getUnpaidForRoom(roomId) {
  return Payment.findOne({ roomId, status: { $in: ['unpaid', 'overdue'] } }).sort({ dueDate: 1 }).populate('tenantId roomId');
}

async function recordPayment({ roomNumber, roomId, dueDate, paidDate }) {
  const room = roomId ? await Room.findById(roomId) : await Room.findOne({ roomNumber });
  if (!room || !room.tenantId) {
    throw Object.assign(new Error('Rented room not found.'), { status: 404 });
  }

  const filter = {
    roomId: room._id,
    tenantId: room.tenantId,
    status: { $in: ['unpaid', 'overdue'] }
  };
  if (dueDate) {
    filter.dueDate = { $gte: dayjs(dueDate).startOf('day').toDate(), $lte: dayjs(dueDate).endOf('day').toDate() };
  }

  const payment = await Payment.findOne(filter).sort({ dueDate: 1 });
  if (!payment) throw Object.assign(new Error('No unpaid payment found for this room.'), { status: 404 });

  payment.status = 'paid';
  payment.paidDate = paidDate ? new Date(paidDate) : new Date();
  await payment.save();

  const nextDueDate = addMonth(payment.dueDate, 1);
  const existingNext = await Payment.findOne({ roomId: payment.roomId, tenantId: payment.tenantId, dueDate: nextDueDate });
  if (!existingNext) {
    await Payment.create({
      roomId: payment.roomId,
      tenantId: payment.tenantId,
      amount: payment.amount,
      dueDate: nextDueDate,
      status: 'unpaid'
    });
  }

  return payment.populate('tenantId roomId');
}

async function listPaymentsByStatus(status) {
  return Payment.find({ status }).populate('tenantId roomId').sort({ dueDate: 1 });
}

async function listDueSoon(days = 3) {
  const start = dayjs().startOf('day').toDate();
  const end = dayjs().add(days, 'day').endOf('day').toDate();
  return Payment.find({ status: 'unpaid', dueDate: { $gte: start, $lte: end } }).populate('tenantId roomId').sort({ dueDate: 1 });
}

async function getTenantCurrentPayment(tenantId) {
  return Payment.findOne({ tenantId, status: { $in: ['unpaid', 'overdue'] } }).sort({ dueDate: 1 }).populate('roomId tenantId');
}

async function getPaymentById(paymentId) {
  return Payment.findById(paymentId).populate('tenantId roomId');
}

async function getPaymentByMerchantRef(merchantRef) {
  if (!merchantRef) return null;
  return Payment.findOne({ gatewayMerchantRef: merchantRef }).populate('tenantId roomId');
}

async function listPaymentHistoryByRoom(roomId) {
  return Payment.find({ roomId }).populate('tenantId roomId').sort({ dueDate: -1 }).limit(12);
}

async function saveGatewayData(paymentId, updates = {}) {
  return Payment.findByIdAndUpdate(paymentId, { $set: updates }, { new: true }).populate('tenantId roomId');
}

async function markQrSession(paymentId, updates = {}) {
  return saveGatewayData(paymentId, updates);
}

async function cancelQrSession(paymentId) {
  return saveGatewayData(paymentId, {
    qrActive: false,
    gatewayStatus: 'canceled'
  });
}

async function finalizeSuccessfulPayment(paymentId, details = {}) {
  const payment = await Payment.findById(paymentId).populate('tenantId roomId');
  if (!payment) {
    throw Object.assign(new Error('Payment not found.'), { status: 404 });
  }

  payment.status = 'paid';
  payment.paidDate = new Date();
  payment.paidAt = payment.paidDate;
  payment.paymentMethod = details.method || payment.paymentMethod || 'Online Payment';
  payment.gatewayStatus = details.status || 'success';
  payment.gatewayTransactionId = details.transactionId || payment.gatewayTransactionId;
  payment.gatewayRawResponse = details.raw || payment.gatewayRawResponse;
  payment.qrActive = false;
  await payment.save();

  const nextDueDate = addMonth(payment.dueDate, 1);
  const existingNext = await Payment.findOne({ roomId: payment.roomId, tenantId: payment.tenantId, dueDate: nextDueDate });
  if (!existingNext) {
    await Payment.create({
      roomId: payment.roomId,
      tenantId: payment.tenantId,
      amount: payment.amount,
      dueDate: nextDueDate,
      status: 'unpaid'
    });
  }

  return Payment.findById(paymentId).populate('tenantId roomId');
}

async function markOverduePayments() {
  const now = dayjs().startOf('day').toDate();
  return Payment.updateMany(
    { status: 'unpaid', dueDate: { $lt: now } },
    { $set: { status: 'overdue' } }
  );
}

async function getDashboardPaymentStats() {
  const [unpaidPayments, overduePayments, dueSoon, expectedIncomeAgg, collectedAgg] = await Promise.all([
    Payment.countDocuments({ status: 'unpaid' }),
    Payment.countDocuments({ status: 'overdue' }),
    Payment.countDocuments({ status: 'unpaid', dueDate: { $gte: dayjs().startOf('day').toDate(), $lte: dayjs().add(3, 'day').endOf('day').toDate() } }),
    Payment.aggregate([
      { $match: { dueDate: { $gte: startOfCurrentMonth(), $lte: endOfCurrentMonth() } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      { $match: { status: 'paid', paidDate: { $gte: startOfCurrentMonth(), $lte: endOfCurrentMonth() } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);

  return {
    unpaidPayments,
    overduePayments,
    dueSoon,
    totalExpectedIncomeThisMonth: expectedIncomeAgg[0]?.total || 0,
    totalCollectedThisMonth: collectedAgg[0]?.total || 0
  };
}

async function getReminderCandidates() {
  const today = dayjs().startOf('day');
  const in3Days = today.add(3, 'day');

  const [threeDaysBefore, dueToday, overdue] = await Promise.all([
    Payment.find({
      status: 'unpaid',
      remindedThreeDaysBefore: false,
      dueDate: { $gte: in3Days.startOf('day').toDate(), $lte: in3Days.endOf('day').toDate() }
    }).populate('tenantId roomId'),
    Payment.find({
      status: 'unpaid',
      remindedOnDueDate: false,
      dueDate: { $gte: today.startOf('day').toDate(), $lte: today.endOf('day').toDate() }
    }).populate('tenantId roomId'),
    Payment.find({ status: 'overdue' }).populate('tenantId roomId')
  ]);

  return { threeDaysBefore, dueToday, overdue };
}

module.exports = {
  getUnpaidForRoom,
  recordPayment,
  listPaymentsByStatus,
  listDueSoon,
  getTenantCurrentPayment,
  getPaymentById,
  getPaymentByMerchantRef,
  listPaymentHistoryByRoom,
  saveGatewayData,
  markQrSession,
  cancelQrSession,
  finalizeSuccessfulPayment,
  markOverduePayments,
  getDashboardPaymentStats,
  getReminderCandidates
};
