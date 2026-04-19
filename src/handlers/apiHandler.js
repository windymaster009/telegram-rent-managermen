const roomService = require('../services/roomService');
const tenantService = require('../services/tenantService');
const paymentService = require('../services/paymentService');
const { handlePaywayWebhook } = require('../services/paywayWebhookService');
const env = require('../config/env');
const { formatMoney } = require('../utils/format');
const { formatDate } = require('../utils/date');

async function getDashboard(req, res, next) {
  try {
    const paymentStats = await paymentService.getDashboardPaymentStats();
    const summary = await roomService.dashboardSummary(paymentStats);
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

async function search(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ message: 'q is required' });

    const [rooms, tenants] = await Promise.all([
      roomService.listRooms({ roomNumber: { $regex: q, $options: 'i' } }),
      require('../models/Tenant').find({ fullName: { $regex: q, $options: 'i' }, isActive: true }).populate('roomId')
    ]);

    res.json({ rooms, tenants });
  } catch (error) {
    next(error);
  }
}

async function listUnlinkedTenants(req, res, next) {
  try {
    const tenants = await tenantService.findTenantsWithoutTelegramLink();
    res.json(tenants);
  } catch (error) {
    next(error);
  }
}

async function listRooms(req, res, next) {
  try {
    const status = req.query.status;
    const filter = status ? { status } : {};
    const rooms = await roomService.listRooms(filter);
    res.json(rooms);
  } catch (error) {
    next(error);
  }
}

async function listPayments(req, res, next) {
  try {
    const status = req.query.status || 'unpaid';
    const payments = await paymentService.listPaymentsByStatus(status);
    res.json(payments);
  } catch (error) {
    next(error);
  }
}

async function paywayWebhook(req, res, next) {
  try {
    const result = await handlePaywayWebhook(req.body, req.headers);
    const bot = req.app.locals.bot;
    if (result.updated && bot) {
      const payment = result.payment;
      if (payment.successNotifiedAt) {
        return res.json({ ok: true, updated: true, duplicate: true });
      }
      if (payment.qrActive && payment.qrChatId && payment.qrMessageId) {
        try {
          await bot.telegram.deleteMessage(payment.qrChatId, Number(payment.qrMessageId));
        } catch (_) {}
      }

      if (payment.tenantId?.telegramChatId) {
        await bot.telegram.sendMessage(
          payment.tenantId.telegramChatId,
          `✅ Payment successful\n━━━━━━━━━━\nRoom: ${payment.roomId?.roomNumber}\nAmount: ${formatMoney(payment.amount)}\nPaid at: ${formatDate(payment.paidAt || payment.paidDate)}\nTransaction: ${payment.gatewayTransactionId || '-'}\n\nThank you. Your rent payment has been received.`
        );
      }

      for (const adminId of env.adminTelegramIds) {
        await bot.telegram.sendMessage(
          adminId,
          `✅ Rent payment received\nRoom: ${payment.roomId?.roomNumber}\nTenant: ${payment.tenantId?.fullName}\nAmount: ${formatMoney(payment.amount)}\nTransaction: ${payment.gatewayTransactionId || '-'}`
        );
      }
      await paymentService.saveGatewayData(payment._id, { successNotifiedAt: new Date(), qrActive: false });
    }
    res.json({ ok: true, updated: result.updated });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboard,
  search,
  listUnlinkedTenants,
  listRooms,
  listPayments,
  paywayWebhook
};
