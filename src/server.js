const app = require('./app');
const env = require('./config/env');
const { connectDb } = require('./config/db');
const { setupBot } = require('./bot/setupBot');
const { startReminderJob } = require('./jobs/reminderJob');

async function bootstrap() {
  await connectDb();
  const bot = setupBot();
  if (bot) {
    await bot.launch();
    app.locals.bot = bot;
    startReminderJob(bot);
  }

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });

  process.once('SIGINT', () => bot?.stop('SIGINT'));
  process.once('SIGTERM', () => bot?.stop('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('Startup failed:', error);
  process.exit(1);
});
