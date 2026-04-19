const { Telegraf, Markup, session } = require('telegraf');
const dayjs = require('dayjs');
const env = require('../config/env');
const { isAdminTelegramId, requireAdmin } = require('../middleware/auth');
const roomService = require('../services/roomService');
const tenantService = require('../services/tenantService');
const paymentService = require('../services/paymentService');
const Room = require('../models/Room');
const { runReminderCheckOnce, resendTenantReminder } = require('../jobs/reminderJob');
const {
  getAdminMainMenu,
  getTenantMainMenu,
  getBackKeyboard,
  getCancelKeyboard,
  getRoomsMenu,
  getPaymentsMenu,
  getTenantsMenu,
  getSettingsMenu,
  getRoomActions
} = require('../keyboards/menus');
const { paginate, pagerButtons } = require('../utils/pagination');
const { clearFlow, startFlow } = require('../flows/state');
const { formatMoney } = require('../utils/format');
const { formatDate, daysBetween } = require('../utils/date');

function parseCallback(data) {
  return String(data || '').split(':');
}

async function showMainMenu(ctx) {
  const isAdmin = isAdminTelegramId(ctx.from.id);
  if (isAdmin) {
    clearFlow(ctx);
    return ctx.reply('Please choose an option below.', getAdminMainMenu());
  }
  const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
  clearFlow(ctx);
  if (tenant) return ctx.reply('Please choose an option below.', getTenantMainMenu(true));
  return ctx.reply('Welcome! Please link your room first.', getTenantMainMenu(false));
}

async function formatRoomDetail(room) {
  const payment = await paymentService.getUnpaidForRoom(room._id);
  const tenant = room.tenantId;
  return [
    `🏠 Room: ${room.roomNumber}`,
    `Status: ${room.status}`,
    `Rent: ${formatMoney(room.rentPrice)}`,
    `Tenant: ${tenant?.fullName || '-'}`,
    `Phone: ${tenant?.phone || '-'}`,
    `Move-in: ${tenant?.moveInDate ? formatDate(tenant.moveInDate) : '-'}`,
    `Days stayed: ${tenant?.moveInDate ? daysBetween(tenant.moveInDate) : 0}`,
    `Payment: ${payment ? `${payment.status} (${formatDate(payment.dueDate)})` : '-'}`
  ].join('\n');
}

async function showRoomsList(ctx, status = 'all', page = 1, edit = true) {
  const filter = status === 'all' ? {} : { status };
  const rooms = await roomService.listRooms(filter);
  if (!rooms.length) {
    return edit ? ctx.editMessageText('No rooms found.', getRoomsMenu()) : ctx.reply('No rooms found.', getRoomsMenu());
  }
  const p = paginate(rooms, page, 8);
  const rows = p.data.map((room) => [Markup.button.callback(`${room.roomNumber} • ${room.status}`, `room:view:${room._id}`)]);
  const nav = pagerButtons(`rooms:list:${status}`, p.currentPage, p.totalPages, 'menu:rooms');
  const keyboardRows = nav ? [...rows, ...nav.reply_markup.inline_keyboard] : [...rows, [Markup.button.callback('🔙 Back', 'menu:rooms')]];
  const text = `Select a room (${status})\nPage ${p.currentPage}/${p.totalPages}`;
  if (edit) return ctx.editMessageText(text, { reply_markup: { inline_keyboard: keyboardRows } });
  return ctx.reply(text, { reply_markup: { inline_keyboard: keyboardRows } });
}

async function showPaymentsList(ctx, type = 'unpaid', page = 1) {
  let payments = [];
  if (type === 'duesoon') payments = await paymentService.listDueSoon(3);
  else payments = await paymentService.listPaymentsByStatus(type);
  if (!payments.length) return ctx.editMessageText('No payments found.', getPaymentsMenu());

  const p = paginate(payments, page, 8);
  const rows = p.data.map((pay) => [
    Markup.button.callback(
      `${pay.roomId?.roomNumber || '-'} • ${pay.tenantId?.fullName || '-'} • ${pay.status}`,
      `pay:view:${pay._id}`
    )
  ]);
  const nav = pagerButtons(`pay:list:${type}`, p.currentPage, p.totalPages, 'menu:payments');
  const keyboardRows = nav ? [...rows, ...nav.reply_markup.inline_keyboard] : [...rows, [Markup.button.callback('🔙 Back', 'menu:payments')]];
  return ctx.editMessageText(`Select a payment (${type})\nPage ${p.currentPage}/${p.totalPages}`, {
    reply_markup: { inline_keyboard: keyboardRows }
  });
}

async function showTenantList(ctx, type = 'all', page = 1) {
  let tenants = [];
  if (type === 'unlinked') tenants = await tenantService.findTenantsWithoutTelegramLink();
  else tenants = await tenantService.listTenants();
  if (!tenants.length) return ctx.editMessageText('No tenants found.', getTenantsMenu());
  const p = paginate(tenants, page, 8);
  const rows = p.data.map((tenant) => [Markup.button.callback(`${tenant.fullName} • ${tenant.roomId?.roomNumber || '-'}`, `tenant:view:${tenant._id}`)]);
  const nav = pagerButtons(`tenant:list:${type}`, p.currentPage, p.totalPages, 'menu:tenants');
  const keyboardRows = nav ? [...rows, ...nav.reply_markup.inline_keyboard] : [...rows, [Markup.button.callback('🔙 Back', 'menu:tenants')]];
  return ctx.editMessageText(`Select a tenant\nPage ${p.currentPage}/${p.totalPages}`, { reply_markup: { inline_keyboard: keyboardRows } });
}

async function seed100Rooms() {
  const bulk = [];
  for (let i = 1; i <= 100; i += 1) {
    const roomNumber = String(i).padStart(3, '0');
    bulk.push({
      updateOne: {
        filter: { roomNumber },
        update: { $setOnInsert: { roomNumber, status: 'free', rentPrice: 500, tenantId: null, notes: '' } },
        upsert: true
      }
    });
  }
  await Room.bulkWrite(bulk);
}

function setupBot() {
  if (!env.telegramBotToken) {
    console.warn('TELEGRAM_BOT_TOKEN missing. Bot disabled.');
    return null;
  }

  const bot = new Telegraf(env.telegramBotToken);
  bot.use(session());
  bot.use((ctx, next) => {
    if (!ctx.session) ctx.session = {};
    if (!ctx.session.flowData) ctx.session.flowData = {};
    return next();
  });

  bot.start(async (ctx) => showMainMenu(ctx));
  bot.command('help', async (ctx) => showMainMenu(ctx));

  // Fallback slash commands
  bot.command('rooms', requireAdmin, async (ctx) => {
    await ctx.reply('Rooms menu opened.', getAdminMainMenu());
    await ctx.reply('Select a room action.', getRoomsMenu());
  });
  bot.command('addroom', requireAdmin, async (ctx) => {
    startFlow(ctx, 'add_room', 'roomNumber');
    await ctx.reply('Enter room number (e.g., A01).', getBackKeyboard());
  });
  bot.command('addtenant', requireAdmin, async (ctx) => {
    startFlow(ctx, 'assign_tenant', 'roomNumber', {});
    await ctx.reply('Enter room number for new tenant.', getBackKeyboard());
  });
  bot.command('pay', requireAdmin, async (ctx) => {
    startFlow(ctx, 'record_payment', 'roomNumber');
    await ctx.reply('Enter room number to record payment.', getBackKeyboard());
  });
  bot.command('unpaid', requireAdmin, async (ctx) => {
    const payments = await paymentService.listPaymentsByStatus('unpaid');
    await ctx.reply(payments.length ? `Unpaid count: ${payments.length}` : 'No unpaid payments found.');
  });
  bot.command('overdue', requireAdmin, async (ctx) => {
    const payments = await paymentService.listPaymentsByStatus('overdue');
    await ctx.reply(payments.length ? `Overdue count: ${payments.length}` : 'No overdue payments found.');
  });
  bot.command('room', requireAdmin, async (ctx) => {
    const roomNumber = ctx.message.text.split(' ')[1];
    if (!roomNumber) return ctx.reply('Usage: /room <roomNumber>');
    const room = await roomService.getRoomByNumber(roomNumber);
    if (!room) return ctx.reply('Room not found.');
    return ctx.reply(await formatRoomDetail(room));
  });
  bot.command('vacate', requireAdmin, async (ctx) => {
    const roomNumber = ctx.message.text.split(' ')[1];
    if (!roomNumber) return ctx.reply('Usage: /vacate <roomNumber>');
    await roomService.vacateRoom(roomNumber);
    return ctx.reply('Room vacated successfully.');
  });
  bot.command('dashboard', requireAdmin, async (ctx) => {
    const stats = await roomService.dashboardSummary(await paymentService.getDashboardPaymentStats());
    await ctx.reply(`📊 Dashboard\nTotal: ${stats.totalRooms}\nFree: ${stats.freeRooms}\nRented: ${stats.rentedRooms}\nUnpaid: ${stats.unpaidPayments}\nOverdue: ${stats.overduePayments}\nDue soon: ${stats.dueSoon}\nExpected: ${formatMoney(stats.totalExpectedIncomeThisMonth)}\nCollected: ${formatMoney(stats.totalCollectedThisMonth)}`);
  });
  bot.command('link', async (ctx) => {
    startFlow(ctx, 'tenant_link', 'roomNumber');
    await ctx.reply('Enter your room number.', getBackKeyboard());
  });
  bot.command('myroom', async (ctx) => {
    const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
    if (!tenant) return ctx.reply('Please link your room first.', getTenantMainMenu(false));
    return ctx.reply(`🏠 Room ${tenant.roomId.roomNumber}\nStatus: ${tenant.roomId.status}\nMove-in: ${formatDate(tenant.moveInDate)}\nDays stayed: ${daysBetween(tenant.moveInDate)}\nRent: ${formatMoney(tenant.roomId.rentPrice)}`);
  });
  bot.command('mypayment', async (ctx) => {
    const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
    if (!tenant) return ctx.reply('Please link your room first.', getTenantMainMenu(false));
    const payment = await paymentService.getTenantCurrentPayment(tenant._id);
    if (!payment) return ctx.reply('No current payment found.');
    const overdueDays = payment.status === 'overdue' ? dayjs().diff(dayjs(payment.dueDate), 'day') : 0;
    return ctx.reply(`💰 Amount: ${formatMoney(payment.amount)}\nDue: ${formatDate(payment.dueDate)}\nStatus: ${payment.status}\nOverdue days: ${overdueDays}`);
  });

  bot.hears('🔙 Back', async (ctx) => showMainMenu(ctx));
  bot.hears('❌ Cancel', async (ctx) => {
    clearFlow(ctx);
    await ctx.reply('Cancelled.');
    await showMainMenu(ctx);
  });

  bot.hears('🏠 Rooms', requireAdmin, (ctx) => ctx.reply('Select a room action.', getRoomsMenu()));
  bot.hears('💰 Payments', requireAdmin, (ctx) => ctx.reply('Select a payment action.', getPaymentsMenu()));
  bot.hears('👤 Tenants', requireAdmin, (ctx) => ctx.reply('Select a tenant action.', getTenantsMenu()));
  bot.hears('⚙️ Settings', requireAdmin, (ctx) => ctx.reply('Settings', getSettingsMenu()));
  bot.hears('⚠️ Late Rent', requireAdmin, async (ctx) => {
    const overdue = await paymentService.listPaymentsByStatus('overdue');
    if (!overdue.length) return ctx.reply('No overdue payments found.');
    const rows = overdue.slice(0, 20).map((p) => [Markup.button.callback(`${p.roomId.roomNumber} • ${p.tenantId.fullName}`, `late:view:${p._id}`)]);
    rows.push([Markup.button.callback('🔙 Back', 'menu:admin')]);
    return ctx.reply('Late rent list:', { reply_markup: { inline_keyboard: rows } });
  });

  bot.hears('📊 Dashboard', requireAdmin, async (ctx) => {
    const stats = await roomService.dashboardSummary(await paymentService.getDashboardPaymentStats());
    return ctx.reply(
      `📊 Dashboard\nTotal rooms: ${stats.totalRooms}\nFree: ${stats.freeRooms}\nRented: ${stats.rentedRooms}\nUnpaid: ${stats.unpaidPayments}\nOverdue: ${stats.overduePayments}\nDue soon: ${stats.dueSoon}\nExpected: ${formatMoney(stats.totalExpectedIncomeThisMonth)}\nCollected: ${formatMoney(stats.totalCollectedThisMonth)}`,
      Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', 'dashboard:refresh')]])
    );
  });

  bot.hears('🔗 Link My Room', async (ctx) => {
    startFlow(ctx, 'tenant_link', 'roomNumber');
    await ctx.reply('Enter your room number.', getBackKeyboard());
  });

  bot.hears('🏠 My Room', async (ctx) => {
    const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
    if (!tenant) return ctx.reply('Please link your room first.', getTenantMainMenu(false));
    return ctx.reply(
      `🏠 Room ${tenant.roomId.roomNumber}\nStatus: ${tenant.roomId.status}\nMove-in: ${formatDate(tenant.moveInDate)}\nDays stayed: ${daysBetween(tenant.moveInDate)}\nRent: ${formatMoney(tenant.roomId.rentPrice)}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('💰 My Payment', 'tenant:mypayment')],
        [Markup.button.callback('📞 Contact Admin', 'tenant:contact')],
        [Markup.button.callback('🔙 Back', 'menu:tenant')]
      ])
    );
  });

  bot.hears('💰 My Payment', async (ctx) => {
    const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
    if (!tenant) return ctx.reply('Please link your room first.', getTenantMainMenu(false));
    const payment = await paymentService.getTenantCurrentPayment(tenant._id);
    if (!payment) return ctx.reply('No current payment found.');
    const overdueDays = payment.status === 'overdue' ? dayjs().diff(dayjs(payment.dueDate), 'day') : 0;
    return ctx.reply(
      `💰 Amount: ${formatMoney(payment.amount)}\nDue: ${formatDate(payment.dueDate)}\nStatus: ${payment.status}\nOverdue days: ${overdueDays}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📄 Payment History', `pay:history:room:${tenant.roomId._id}:1`)],
        [Markup.button.callback('📞 Contact Admin', 'tenant:contact')],
        [Markup.button.callback('🔙 Back', 'menu:tenant')]
      ])
    );
  });

  bot.hears('📞 Contact Admin', async (ctx) => {
    const adminText = env.adminTelegramIds.length
      ? `Please contact admin IDs: ${env.adminTelegramIds.join(', ')}`
      : 'Admin contacts are not configured yet.';
    await ctx.reply(adminText);
  });

  bot.action(/.*/, async (ctx) => {
    try {
      const parts = parseCallback(ctx.callbackQuery.data);
      const [scope, action, a3, a4] = parts;

      if (scope === 'menu' && action === 'admin') {
        await ctx.answerCbQuery();
        await ctx.reply('Admin menu', getAdminMainMenu());
        return;
      }
      if (scope === 'menu' && action === 'tenant') {
        await ctx.answerCbQuery();
        await ctx.reply('Tenant menu', getTenantMainMenu(true));
        return;
      }
      if (scope === 'menu' && action === 'rooms') return ctx.editMessageText('Select a room action.', getRoomsMenu());
      if (scope === 'menu' && action === 'payments') return ctx.editMessageText('Select a payment action.', getPaymentsMenu());
      if (scope === 'menu' && action === 'tenants') return ctx.editMessageText('Select a tenant action.', getTenantsMenu());

      if (scope === 'rooms' && action === 'list') return showRoomsList(ctx, a3, Number(a4 || 1));
      if (scope === 'rooms' && action === 'search') {
        startFlow(ctx, 'search_room', 'term');
        return ctx.reply('Enter room number to search.', getBackKeyboard());
      }
      if (scope === 'rooms' && action === 'add') {
        startFlow(ctx, 'add_room', 'roomNumber');
        return ctx.reply('Enter room number (e.g., A01).', getBackKeyboard());
      }

      if (scope === 'room' && action === 'view') {
        const room = await roomService.getRoomById(a3);
        if (!room) return ctx.answerCbQuery('Room not found');
        return ctx.editMessageText(await formatRoomDetail(room), getRoomActions(room._id));
      }

      if (scope === 'room' && action === 'assign') {
        const room = await roomService.getRoomById(a3);
        startFlow(ctx, 'assign_tenant', 'fullName', { roomNumber: room.roomNumber });
        return ctx.reply(`Assign tenant for room ${room.roomNumber}.\nEnter tenant full name.`, getBackKeyboard());
      }

      if (scope === 'room' && action === 'vacate') {
        startFlow(ctx, 'vacate_room', 'confirm', { roomId: a3 });
        return ctx.reply('Are you sure to vacate this room? Type YES to confirm.', getCancelKeyboard());
      }

      if (scope === 'pay' && action === 'list') return showPaymentsList(ctx, a3, Number(a4 || 1));
      if (scope === 'pay' && action === 'record' && a3 === 'start') {
        startFlow(ctx, 'record_payment', 'roomNumber');
        return ctx.reply('Enter room number to record payment.', getBackKeyboard());
      }
      if (scope === 'pay' && action === 'record' && a3 === 'room') {
        const room = await roomService.getRoomById(a4);
        startFlow(ctx, 'record_payment', 'confirm', { roomNumber: room.roomNumber });
        return ctx.reply(`Mark payment as paid for room ${room.roomNumber}? Type YES to confirm.`, getCancelKeyboard());
      }
      if (scope === 'pay' && action === 'view') {
        const payment = (await paymentService.listPaymentsByStatus('unpaid')).concat(await paymentService.listPaymentsByStatus('overdue')).find((x) => String(x._id) === a3)
          || (await paymentService.listPaymentsByStatus('paid')).find((x) => String(x._id) === a3);
        if (!payment) return ctx.answerCbQuery('Payment not found');
        return ctx.editMessageText(
          `Room: ${payment.roomId?.roomNumber}\nTenant: ${payment.tenantId?.fullName}\nAmount: ${formatMoney(payment.amount)}\nDue: ${formatDate(payment.dueDate)}\nStatus: ${payment.status}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Mark Paid', `pay:mark:${payment.roomId._id}`)],
            [Markup.button.callback('📄 View History', `pay:history:room:${payment.roomId._id}:1`)],
            [Markup.button.callback('🔙 Back', 'menu:payments')]
          ])
        );
      }
      if (scope === 'pay' && action === 'mark') {
        await paymentService.recordPayment({ roomId: a3 });
        return ctx.answerCbQuery('Payment recorded successfully');
      }
      if (scope === 'pay' && action === 'history') {
        const history = await paymentService.listPaymentHistoryByRoom(a4);
        if (!history.length) return ctx.answerCbQuery('No history found');
        return ctx.reply(history.map((p) => `${formatDate(p.dueDate)} • ${formatMoney(p.amount)} • ${p.status}`).join('\n'));
      }

      if (scope === 'dashboard' && action === 'refresh') {
        const stats = await roomService.dashboardSummary(await paymentService.getDashboardPaymentStats());
        return ctx.editMessageText(
          `📊 Dashboard\nTotal rooms: ${stats.totalRooms}\nFree: ${stats.freeRooms}\nRented: ${stats.rentedRooms}\nUnpaid: ${stats.unpaidPayments}\nOverdue: ${stats.overduePayments}\nDue soon: ${stats.dueSoon}\nExpected: ${formatMoney(stats.totalExpectedIncomeThisMonth)}\nCollected: ${formatMoney(stats.totalCollectedThisMonth)}`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', 'dashboard:refresh')]])
        );
      }

      if (scope === 'tenant' && action === 'list') return showTenantList(ctx, a3, Number(a4 || 1));
      if (scope === 'tenant' && action === 'search') {
        startFlow(ctx, 'search_tenant', 'term');
        return ctx.reply('Enter tenant name or phone.', getBackKeyboard());
      }
      if (scope === 'tenant' && action === 'add') {
        startFlow(ctx, 'assign_tenant', 'roomNumber', {});
        return ctx.reply('Enter room number for new tenant.', getBackKeyboard());
      }
      if (scope === 'tenant' && action === 'view') {
        const tenant = await tenantService.getTenantById(a3);
        if (!tenant) return ctx.answerCbQuery('Tenant not found');
        const payment = await paymentService.getTenantCurrentPayment(tenant._id);
        return ctx.editMessageText(
          `👤 ${tenant.fullName}\nPhone: ${tenant.phone}\nRoom: ${tenant.roomId?.roomNumber || '-'}\nTelegram: ${tenant.telegramUsername || '-'}\nChatId linked: ${tenant.telegramChatId ? 'Yes' : 'No'}\nMove-in: ${formatDate(tenant.moveInDate)}\nDays stayed: ${daysBetween(tenant.moveInDate)}\nPayment: ${payment?.status || 'n/a'}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Edit Tenant', `tenant:edit:${tenant._id}`)],
            [Markup.button.callback('🚪 Vacate Tenant', `tenant:vacate:${tenant._id}`)],
            [Markup.button.callback('🔙 Back', 'menu:tenants')]
          ])
        );
      }
      if (scope === 'tenant' && action === 'edit') {
        startFlow(ctx, 'edit_tenant', 'phone', { tenantId: a3 });
        return ctx.reply('Enter new phone number for tenant.', getBackKeyboard());
      }
      if (scope === 'tenant' && action === 'vacate') {
        await tenantService.vacateTenant(a3);
        return ctx.answerCbQuery('Tenant vacated');
      }
      if (scope === 'tenant' && action === 'mypayment') return ctx.reply('Please tap 💰 My Payment from main menu.');
      if (scope === 'tenant' && action === 'contact') return ctx.reply('Please tap 📞 Contact Admin from main menu.');

      if (scope === 'late' && action === 'view') {
        const overdue = await paymentService.listPaymentsByStatus('overdue');
        const payment = overdue.find((p) => String(p._id) === a3);
        if (!payment) return ctx.answerCbQuery('Not found');
        return ctx.editMessageText(
          `⚠️ ${payment.tenantId.fullName}\nRoom: ${payment.roomId.roomNumber}\nPhone: ${payment.tenantId.phone}\nAmount: ${formatMoney(payment.amount)}\nDue: ${formatDate(payment.dueDate)}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('📞 Contact Info', `late:contact:${payment._id}`)],
            [Markup.button.callback('💵 Record Payment', `pay:mark:${payment.roomId._id}`)],
            [Markup.button.callback('🔔 Resend Reminder', `late:resend:${payment._id}`)],
            [Markup.button.callback('🔙 Back', 'menu:admin')]
          ])
        );
      }
      if (scope === 'late' && action === 'contact') {
        const payment = (await paymentService.listPaymentsByStatus('overdue')).find((p) => String(p._id) === a3);
        return ctx.answerCbQuery(payment ? `${payment.tenantId.phone}` : 'Not found');
      }
      if (scope === 'late' && action === 'resend') {
        const payment = (await paymentService.listPaymentsByStatus('overdue')).find((p) => String(p._id) === a3);
        if (!payment) return ctx.answerCbQuery('Not found');
        const result = await resendTenantReminder(bot, payment);
        return ctx.answerCbQuery(result.success ? 'Reminder sent' : result.message.slice(0, 100));
      }

      if (scope === 'settings' && action === 'admins') return ctx.answerCbQuery(`Admins: ${env.adminTelegramIds.join(', ')}`);
      if (scope === 'settings' && action === 'seed') {
        await seed100Rooms();
        return ctx.answerCbQuery('Seeded rooms');
      }
      if (scope === 'settings' && action === 'reminder') {
        await runReminderCheckOnce(bot);
        return ctx.answerCbQuery('Reminder check completed');
      }

      return ctx.answerCbQuery('Action not implemented');
    } catch (error) {
      console.error(error);
      return ctx.reply(`Error: ${error.message}`);
    }
  });

  bot.on('text', async (ctx, next) => {
    try {
      const message = ctx.message.text.trim();
      const flow = ctx.session.flow;

      if (!flow) return next();

      if (flow === 'search_room' && ctx.session.step === 'term') {
        const rooms = await roomService.searchRooms(message);
        clearFlow(ctx);
        if (!rooms.length) return ctx.reply('No rooms found.');
        const rows = rooms.slice(0, 20).map((room) => [Markup.button.callback(`${room.roomNumber} • ${room.status}`, `room:view:${room._id}`)]);
        rows.push([Markup.button.callback('🔙 Back', 'menu:rooms')]);
        return ctx.reply('Search result:', { reply_markup: { inline_keyboard: rows } });
      }

      if (flow === 'search_tenant' && ctx.session.step === 'term') {
        const tenants = await tenantService.searchTenants(message);
        clearFlow(ctx);
        if (!tenants.length) return ctx.reply('No tenants found.');
        const rows = tenants.slice(0, 20).map((t) => [Markup.button.callback(`${t.fullName} • ${t.roomId?.roomNumber || '-'}`, `tenant:view:${t._id}`)]);
        rows.push([Markup.button.callback('🔙 Back', 'menu:tenants')]);
        return ctx.reply('Search result:', { reply_markup: { inline_keyboard: rows } });
      }

      if (flow === 'add_room') {
        if (ctx.session.step === 'roomNumber') {
          ctx.session.flowData.roomNumber = message;
          ctx.session.step = 'rentPrice';
          return ctx.reply('Enter rent price.', getBackKeyboard());
        }
        if (ctx.session.step === 'rentPrice') {
          ctx.session.flowData.rentPrice = Number(message);
          ctx.session.step = 'notes';
          return ctx.reply('Enter notes (or type - to skip).', getBackKeyboard());
        }
        if (ctx.session.step === 'notes') {
          const room = await roomService.addRoom({
            roomNumber: ctx.session.flowData.roomNumber,
            rentPrice: ctx.session.flowData.rentPrice,
            notes: message === '-' ? '' : message
          });
          clearFlow(ctx);
          return ctx.reply(`Room ${room.roomNumber} added successfully.`, getAdminMainMenu());
        }
      }

      if (flow === 'assign_tenant') {
        if (ctx.session.step === 'roomNumber') {
          ctx.session.flowData.roomNumber = message;
          ctx.session.step = 'fullName';
          return ctx.reply('Enter tenant full name.', getBackKeyboard());
        }
        if (ctx.session.step === 'fullName') {
          ctx.session.flowData.fullName = message;
          ctx.session.step = 'phone';
          return ctx.reply('Enter tenant phone number.', getBackKeyboard());
        }
        if (ctx.session.step === 'phone') {
          ctx.session.flowData.phone = message;
          ctx.session.step = 'moveInDate';
          return ctx.reply('Enter move-in date (YYYY-MM-DD) or type TODAY.', getBackKeyboard());
        }
        if (ctx.session.step === 'moveInDate') {
          ctx.session.flowData.moveInDate = message.toUpperCase() === 'TODAY' ? dayjs().format('YYYY-MM-DD') : message;
          ctx.session.step = 'rentPrice';
          return ctx.reply('Enter rent amount override or type SKIP.', getBackKeyboard());
        }
        if (ctx.session.step === 'rentPrice') {
          ctx.session.flowData.rentPrice = message.toUpperCase() === 'SKIP' ? undefined : Number(message);
          ctx.session.step = 'confirm';
          const d = ctx.session.flowData;
          return ctx.reply(`Confirm tenant assignment?\nRoom: ${d.roomNumber}\nName: ${d.fullName}\nPhone: ${d.phone}\nMove-in: ${d.moveInDate}\nRent override: ${d.rentPrice || 'No'}\nType YES to confirm.`, getCancelKeyboard());
        }
        if (ctx.session.step === 'confirm') {
          if (message !== 'YES') return ctx.reply('Type YES to confirm, or ❌ Cancel.');
          const d = ctx.session.flowData;
          const tenant = await tenantService.addTenantToRoom(d);
          clearFlow(ctx);
          return ctx.reply(`Tenant ${tenant.fullName} assigned successfully.`, getAdminMainMenu());
        }
      }

      if (flow === 'record_payment') {
        if (ctx.session.step === 'roomNumber') {
          ctx.session.flowData.roomNumber = message;
          const payment = await paymentService.recordPayment({ roomNumber: message, paidDate: new Date() });
          clearFlow(ctx);
          return ctx.reply(`Payment recorded successfully for ${payment.roomId.roomNumber}.`, getAdminMainMenu());
        }
        if (ctx.session.step === 'confirm') {
          if (message !== 'YES') return ctx.reply('Type YES to confirm, or ❌ Cancel.');
          const payment = await paymentService.recordPayment({ roomNumber: ctx.session.flowData.roomNumber });
          clearFlow(ctx);
          return ctx.reply(`Payment recorded successfully for ${payment.roomId.roomNumber}.`, getAdminMainMenu());
        }
      }

      if (flow === 'vacate_room' && ctx.session.step === 'confirm') {
        if (message !== 'YES') return ctx.reply('Type YES to confirm, or ❌ Cancel.');
        await roomService.vacateRoomById(ctx.session.flowData.roomId);
        clearFlow(ctx);
        return ctx.reply('Room vacated successfully.', getAdminMainMenu());
      }

      if (flow === 'edit_tenant' && ctx.session.step === 'phone') {
        await tenantService.updateTenant(ctx.session.flowData.tenantId, { phone: message });
        clearFlow(ctx);
        return ctx.reply('Tenant updated successfully.', getAdminMainMenu());
      }

      if (flow === 'tenant_link') {
        if (ctx.session.step === 'roomNumber') {
          ctx.session.flowData.roomNumber = message;
          ctx.session.step = 'phone';
          return ctx.reply('Enter your phone number.', getBackKeyboard());
        }
        if (ctx.session.step === 'phone') {
          const tenant = await tenantService.linkTenantTelegram({
            roomNumber: ctx.session.flowData.roomNumber,
            phone: message,
            chatId: ctx.chat.id,
            telegramUsername: ctx.from.username
          });
          clearFlow(ctx);
          return ctx.reply(`Linked successfully, ${tenant.fullName}.`, getTenantMainMenu(true));
        }
      }
    } catch (error) {
      return ctx.reply(`Error: ${error.message}`);
    }

    return next();
  });

  bot.catch((err, ctx) => {
    console.error('Bot error', err);
    ctx.reply('Something went wrong. Please try again.');
  });

  return bot;
}

module.exports = { setupBot };
