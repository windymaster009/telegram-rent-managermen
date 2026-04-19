const env = require('../config/env');

function isAdminTelegramId(id) {
  return env.adminTelegramIds.includes(Number(id));
}

function requireAdmin(ctx, next) {
  const telegramId = ctx.from?.id;
  if (!isAdminTelegramId(telegramId)) {
    return ctx.reply('⛔ This command is only for admins.');
  }
  return next();
}

module.exports = { isAdminTelegramId, requireAdmin };
