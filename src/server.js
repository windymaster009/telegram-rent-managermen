const app = require('./app');
const env = require('./config/env');
const { connectDb } = require('./config/db');
const { setupBot } = require('./bot/setupBot');
const { startReminderJob } = require('./jobs/reminderJob');
const { startChatCleanupJob } = require('./jobs/chatCleanupJob');

async function initializeServices() {
  await connectDb();
  console.log('MongoDB connected');

  const bot = setupBot();
  if (!bot) {
    console.log('Telegram bot token not set. Running API only.');
    return null;
  }

  await bot.launch();
  console.log('Telegram bot launched');
  app.locals.bot = bot;
  startReminderJob(bot);
  startChatCleanupJob(bot);
  return bot;
}

const server = app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
});

initializeServices()
  .then((bot) => {
    process.once('SIGINT', () => {
      bot?.stop('SIGINT');
      server.close(() => process.exit(0));
    });
    process.once('SIGTERM', () => {
      bot?.stop('SIGTERM');
      server.close(() => process.exit(0));
    });
  })
  .catch((error) => {
    app.locals.startupError = error;
    console.error('Background startup failed:', error);
  });
