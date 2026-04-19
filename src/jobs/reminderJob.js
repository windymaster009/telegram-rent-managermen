const cron = require('node-cron');
const dayjs = require('dayjs');
const env = require('../config/env');
const paymentService = require('../services/paymentService');
const Payment = require('../models/Payment');

function reminderText(type, roomNumber, amount, dueDate) {
  const base = `Room ${roomNumber} rent ${amount} due on ${dayjs(dueDate).format('YYYY-MM-DD')}.`;
  if (type === 'three') return `⏰ Reminder: ${base} (3 days remaining)`;
  if (type === 'due') return `⚠️ Due Today: ${base} Please pay today.`;
  return `🚨 Overdue: ${base} is overdue.`;
}

async function safeSend(bot, chatId, message) {
  try {
    await bot.telegram.sendMessage(chatId, message);
    return { success: true, message: 'sent' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function runReminderCheckOnce(bot) {
  if (!bot) return;
  await paymentService.markOverduePayments();
  const { threeDaysBefore, dueToday, overdue } = await paymentService.getReminderCandidates();

  for (const payment of threeDaysBefore) {
    const chatId = payment.tenantId?.telegramChatId;
    const result = chatId
      ? await safeSend(bot, chatId, reminderText('three', payment.roomId.roomNumber, payment.amount, payment.dueDate))
      : { success: false, message: 'Tenant not linked to bot' };

    payment.remindedThreeDaysBefore = true;
    payment.reminderLog.push({
      type: 'three_days_before',
      target: 'tenant',
      success: result.success,
      message: result.message
    });
    await payment.save();
  }

  for (const payment of dueToday) {
    const chatId = payment.tenantId?.telegramChatId;
    const result = chatId
      ? await safeSend(bot, chatId, reminderText('due', payment.roomId.roomNumber, payment.amount, payment.dueDate))
      : { success: false, message: 'Tenant not linked to bot' };

    payment.remindedOnDueDate = true;
    payment.reminderLog.push({
      type: 'due_date',
      target: 'tenant',
      success: result.success,
      message: result.message
    });
    await payment.save();
  }

  for (const payment of overdue) {
    for (const adminId of env.adminTelegramIds) {
      const result = await safeSend(
        bot,
        adminId,
        reminderText('overdue', payment.roomId.roomNumber, payment.amount, payment.dueDate)
      );

      payment.reminderLog.push({
        type: 'overdue_admin_notify',
        target: 'admin',
        success: result.success,
        message: `admin:${adminId} ${result.message}`
      });
    }
    await Payment.findByIdAndUpdate(payment._id, { reminderLog: payment.reminderLog });
  }
}

async function resendTenantReminder(bot, payment) {
  const chatId = payment.tenantId?.telegramChatId;
  if (!chatId) return { success: false, message: 'Tenant not linked to bot' };
  const result = await safeSend(bot, chatId, reminderText('due', payment.roomId.roomNumber, payment.amount, payment.dueDate));
  payment.reminderLog.push({ type: 'due_date', target: 'tenant', success: result.success, message: `manual: ${result.message}` });
  await payment.save();
  return result;
}

function startReminderJob(bot) {
  if (!bot) return;
  cron.schedule(env.reminderCron, () => runReminderCheckOnce(bot), { timezone: env.timezone });
}

module.exports = { startReminderJob, runReminderCheckOnce, resendTenantReminder };
