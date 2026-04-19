const express = require('express');
const handler = require('../handlers/apiHandler');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.get('/dashboard', handler.getDashboard);
router.get('/search', handler.search);
router.get('/tenants/unlinked', handler.listUnlinkedTenants);
router.get('/rooms', handler.listRooms);
router.get('/payments', handler.listPayments);
router.post('/payments/payway/webhook', handler.paywayWebhook);

module.exports = router;
