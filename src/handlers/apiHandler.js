const roomService = require('../services/roomService');
const tenantService = require('../services/tenantService');
const paymentService = require('../services/paymentService');

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

module.exports = {
  getDashboard,
  search,
  listUnlinkedTenants,
  listRooms,
  listPayments
};
