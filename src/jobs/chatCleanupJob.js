const cron = require('node-cron');
const dayjs = require('dayjs');
const { Markup } = require('telegraf');
const env = require('../config/env');
const adminService = require('../services/adminService');
const tenantService = require('../services/tenantService');
const roomService = require('../services/roomService');
const paymentService = require('../services/paymentService');
const chatHistoryService = require('../services/chatHistoryService');
const { getAdminMainMenu, getTenantMainMenu, getGuestMainMenu } = require('../keyboards/menus');
const { formatDashboardCard } = require('../formatters/cards');

async function resolveChatRole(chatId) {
  const admin = await adminService.getAdminByTelegramId(chatId);
  if (admin) return 'admin';
  const tenant = await tenantService.getTenantByChatId(chatId);
  if (tenant) return 'tenant';
  return 'guest';
}

async function sendPostCleanupMessages(bot, chatId, role) {
  const sentMessageIds = [];

  if (role === 'admin') {
    const welcome = await bot.telegram.sendMessage(chatId, 'Choose an option below.', getAdminMainMenu());
    sentMessageIds.push(welcome.message_id);

    const stats = await roomService.dashboardSummary(await paymentService.getDashboardPaymentStats());
    const dashboard = await bot.telegram.sendMessage(
      chatId,
      formatDashboardCard(stats),
      Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'dashboard:refresh'), Markup.button.callback('📥 Download Excel', 'dashboard:download')],
        [Markup.button.callback('🏠 Rooms', 'panel:rooms'), Markup.button.callback('💳 Payments', 'panel:payments')]
      ])
    );
    sentMessageIds.push(dashboard.message_id);
    return sentMessageIds;
  }

  if (role === 'tenant') {
    const welcome = await bot.telegram.sendMessage(chatId, 'Choose an option below.', getTenantMainMenu(true));
    sentMessageIds.push(welcome.message_id);
    return sentMessageIds;
  }

  const welcome = await bot.telegram.sendMessage(chatId, 'Welcome! Please choose an option below.', getGuestMainMenu());
  sentMessageIds.push(welcome.message_id);
  return sentMessageIds;
}

async function runChatCleanupOnce(bot) {
  if (!bot) return;

  const cutoff = dayjs().subtract(24, 'hour').toDate();
  const staleChats = await chatHistoryService.listInactiveChats(cutoff);

  for (const chat of staleChats) {
    await clearTrackedChat(bot, chat.chatId);
  }
}

async function clearTrackedChat(bot, chatId) {
  if (!bot || !chatId) return;

  const chatIdString = String(chatId);
  const chat = await chatHistoryService.getChatHistory(chatIdString);
  const messageIds = chat?.messageIds || [];

  for (const messageId of messageIds) {
    try {
      await bot.telegram.deleteMessage(chatIdString, Number(messageId));
    } catch (_) {}
  }

  const role = await resolveChatRole(chatIdString);
  let sentMessageIds = [];

  try {
    sentMessageIds = await sendPostCleanupMessages(bot, chatIdString, role);
  } catch (error) {
    console.error(`Chat cleanup resend failed for ${chatIdString}:`, error.message);
  }

  await chatHistoryService.replaceChatHistory({
    chatId: chatIdString,
    role,
    messageIds: sentMessageIds,
    cleanedAt: new Date()
  });

  return { role, messageIds: sentMessageIds };
}

function startChatCleanupJob(bot) {
  if (!bot) return;
  cron.schedule('0 * * * *', () => runChatCleanupOnce(bot), { timezone: env.timezone });
}

module.exports = {
  startChatCleanupJob,
  runChatCleanupOnce,
  clearTrackedChat
};
