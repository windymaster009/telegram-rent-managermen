const express = require('express');
const handler = require('../handlers/apiHandler');

const router = express.Router();

router.get('/health', (req, res) => {
  const startupError = req.app.locals.startupError;
  if (startupError) {
    return res.status(503).json({
      status: 'degraded',
      error: startupError.message
    });
  }

  return res.json({ status: 'ok' });
});
router.get('/dashboard', handler.getDashboard);
router.get('/search', handler.search);
router.get('/tenants/unlinked', handler.listUnlinkedTenants);
router.get('/rooms', handler.listRooms);
router.get('/payments', handler.listPayments);

module.exports = router;
