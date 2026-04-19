const paymentService = require('./paymentService');
const { runReminderCheckOnce } = require('../jobs/reminderJob');
const env = require('../config/env');

async function previewReminderResults() {
  await paymentService.markOverduePayments();
  const { threeDaysBefore, dueToday, overdue } = await paymentService.getReminderCandidates();
  return {
    threeDaysBefore: threeDaysBefore.length,
    dueToday: dueToday.length,
    overdue: overdue.length,
    wouldNotifyTenants: threeDaysBefore.length + dueToday.length,
    wouldNotifyAdmins: overdue.length * Math.max(1, env.adminTelegramIds.length)
  };
}

async function runReminderNow(bot) {
  const preview = await previewReminderResults();
  await runReminderCheckOnce(bot);
  return {
    checked: preview.threeDaysBefore + preview.dueToday + preview.overdue,
    ...preview
  };
}

module.exports = { previewReminderResults, runReminderNow };
