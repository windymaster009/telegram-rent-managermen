const env = require('../config/env');
const adminService = require('../services/adminService');

function isAdminTelegramId(id) {
  return env.adminTelegramIds.includes(Number(id));
}

async function hasAdminAccess(id) {
  if (isAdminTelegramId(id)) return true;
  const admin = await adminService.getAdminByTelegramId(id);
  return Boolean(admin);
}

async function requireAdmin(ctx, next) {
  const telegramId = ctx.from?.id;
  if (!(await hasAdminAccess(telegramId))) {
    return ctx.reply('⛔ This command is only for admins.');
  }
  return next();
}

module.exports = { isAdminTelegramId, hasAdminAccess, requireAdmin };
