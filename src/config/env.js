const dotenv = require('dotenv');

dotenv.config();

const toNumberList = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rent_management',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  adminTelegramIds: toNumberList(process.env.ADMIN_TELEGRAM_IDS),
  reminderCron: process.env.REMINDER_CRON || '0 9 * * *',
  timezone: process.env.TZ || 'Etc/UTC',
  adminTelegramUsername: process.env.ADMIN_TELEGRAM_USERNAME || '',
  paywayBaseUrl: process.env.PAYWAY_BASE_URL || '',
  paywayMerchantId: process.env.PAYWAY_MERCHANT_ID || '',
  paywayApiKey: process.env.PAYWAY_API_KEY || '',
  paywayMerchantAuth: process.env.PAYWAY_MERCHANT_AUTH || '',
  paywayHashKey: process.env.PAYWAY_HASH_KEY || '',
  paywayWebhookSecret: process.env.PAYWAY_WEBHOOK_SECRET || '',
  paywayReturnUrl: process.env.PAYWAY_RETURN_URL || '',
  paywayCancelUrl: process.env.PAYWAY_CANCEL_URL || '',
  paywayWebhookUrl: process.env.PAYWAY_WEBHOOK_URL || '',
  paywayMode: process.env.PAYWAY_MODE || 'sandbox'
};
