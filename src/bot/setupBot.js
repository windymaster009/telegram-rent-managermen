const { Telegraf, Markup, session } = require('telegraf');
const dayjs = require('dayjs');
const env = require('../config/env');
const { isAdminTelegramId, requireAdmin } = require('../middleware/auth');
const roomService = require('../services/roomService');
const tenantService = require('../services/tenantService');
const paymentService = require('../services/paymentService');
const Room = require('../models/Room');
const { runReminderCheckOnce, resendTenantReminder } = require('../jobs/reminderJob');
const { getAdminMainMenu, getTenantMainMenu, getRoomsMenu, getPaymentsMenu, getTenantsMenu, getSettingsMenu, getRoomActions } = require('../keyboards/menus');
const { paginate } = require('../utils/pagination');
const { safeEditOrReply } = require('../utils/safeEditOrReply');
const { formatRoomCard, formatPaymentCard, formatTenantCard, formatDashboardCard, getSectionHeader } = require('../formatters/cards');
const { chunkTwoColumns, getPaginationRow } = require('../navigation/panels');
const { clearFlow, startFlow } = require('../flows/state');
const { formatMoney } = require('../utils/format');
const { formatDate, daysBetween } = require('../utils/date');

function callback(parts) {
  return parts.join(':');
}

async function sendRoomCard(ctx, room, tenant, payment) {
  const caption = formatRoomCard(room, tenant, payment);
  const actions = getRoomActions(room._id);
  if (room.photoFileId || room.photoUrl) {
    const photo = room.photoFileId || room.photoUrl;
    try {
      const sent = await ctx.replyWithPhoto(photo, { caption, ...actions });
      ctx.session.panelMessageId = sent.message_id;
      return sent;
    } catch (_) {
      return ctx.reply(caption, actions);
    }
  }
  return ctx.reply(`ℹ️ No photo available\n\n${caption}`, actions);
}

async function renderPanel(ctx, text, keyboard) {
  const chatId = ctx.chat?.id || ctx.update?.callback_query?.message?.chat?.id;
  if (!chatId) return safeEditOrReply(ctx, text, keyboard);

  const messageId = ctx.session.panelMessageId;
  if (messageId) {
    try {
      await ctx.telegram.editMessageText(chatId, messageId, null, text, keyboard);
      return;
    } catch (_) {}
  }

  const sent = await ctx.reply(text, keyboard);
  ctx.session.panelMessageId = sent.message_id;
}

async function showHome(ctx) {
  if (isAdminTelegramId(ctx.from.id)) {
    await ctx.reply('Choose an option below.', getAdminMainMenu());
    return;
  }
  const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
  await ctx.reply('Choose an option below.', getTenantMainMenu(Boolean(tenant)));
}

async function openRoomsPanel(ctx) {
  return renderPanel(ctx, '🏠 Rooms\nChoose an option below:', getRoomsMenu());
}
async function openPaymentsPanel(ctx) {
  return renderPanel(ctx, '💳 Payments\nChoose an option below:', getPaymentsMenu());
}
async function openTenantsPanel(ctx) {
  return renderPanel(ctx, '👥 Tenants\nChoose an option below:', getTenantsMenu());
}
async function openSettingsPanel(ctx) {
  return renderPanel(ctx, '⚙️ Settings\nChoose an action:', getSettingsMenu());
}

async function showRoomList(ctx, type = 'all', page = 1) {
  const rooms = await roomService.listRooms(type === 'all' ? {} : { status: type });
  if (!rooms.length) return renderPanel(ctx, '🏠 Rooms\nNo rooms available.', getRoomsMenu());

  const p = paginate(rooms, page, 6);
  const buttons = p.data.map((room) => Markup.button.callback(`${room.roomNumber} ${room.status === 'rented' ? '🔴' : '🟢'}`, callback(['room', 'view', room._id])));
  const rows = chunkTwoColumns(buttons);
  rows.push(getPaginationRow(callback(['rooms', 'list', type]), p.currentPage, p.totalPages));
  rows.push([Markup.button.callback('🔙 Rooms Menu', 'panel:rooms')]);

  return renderPanel(ctx, `🏠 Rooms\n━━━━━━━━━━\n${type.toUpperCase()} • ${p.total} rooms`, { reply_markup: { inline_keyboard: rows } });
}

async function showRoomCard(ctx, roomId) {
  const room = await roomService.getRoomById(roomId);
  if (!room) return safeEditOrReply(ctx, 'Room not found.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Rooms', 'panel:rooms')]] } });
  const payment = await paymentService.getUnpaidForRoom(room._id);
  return sendRoomCard(ctx, room, room.tenantId, payment);
}

async function showPaymentsList(ctx, type = 'unpaid', page = 1) {
  let payments = [];
  if (type === 'duesoon') payments = await paymentService.listDueSoon(3);
  else payments = await paymentService.listPaymentsByStatus(type);

  if (!payments.length) return renderPanel(ctx, `💳 Payments\nNo ${type === 'duesoon' ? 'due soon payments' : type + ' payments'}.`, getPaymentsMenu());

  const p = paginate(payments, page, 6);
  const rows = p.data.map((pay) => [Markup.button.callback(`${pay.roomId?.roomNumber || '-'} • ${pay.tenantId?.fullName || '-'} ${pay.status === 'overdue' ? '⚠️' : '💳'}`, callback(['pay', 'view', pay._id]))]);
  rows.push(getPaginationRow(callback(['pay', 'list', type]), p.currentPage, p.totalPages));
  rows.push([Markup.button.callback('🔙 Payments', 'panel:payments')]);
  return renderPanel(ctx, '💳 Payments\nChoose a payment:', { reply_markup: { inline_keyboard: rows } });
}

async function showPaymentCard(ctx, paymentId) {
  const all = [
    ...(await paymentService.listPaymentsByStatus('unpaid')),
    ...(await paymentService.listPaymentsByStatus('overdue')),
    ...(await paymentService.listPaymentsByStatus('paid'))
  ];
  const payment = all.find((x) => String(x._id) === String(paymentId));
  if (!payment) return safeEditOrReply(ctx, 'Payment not found.');

  return safeEditOrReply(
    ctx,
    formatPaymentCard(payment),
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Mark Paid', callback(['pay', 'mark', payment.roomId._id]))],
      [Markup.button.callback('🧾 History', callback(['pay', 'history', payment.roomId._id]))],
      [Markup.button.callback('🔙 Payments', 'panel:payments')]
    ])
  );
}

async function showTenantsList(ctx, type = 'all', page = 1) {
  const tenants = type === 'unlinked' ? await tenantService.findTenantsWithoutTelegramLink() : await tenantService.listTenants();
  if (!tenants.length) return renderPanel(ctx, '👥 Tenants\nNo tenants.', getTenantsMenu());
  const p = paginate(tenants, page, 6);
  const rows = p.data.map((t) => [Markup.button.callback(`${t.fullName} • ${t.roomId?.roomNumber || '-'}`, callback(['tenant', 'view', t._id]))]);
  rows.push(getPaginationRow(callback(['tenant', 'list', type]), p.currentPage, p.totalPages));
  rows.push([Markup.button.callback('🔙 Tenants', 'panel:tenants')]);
  return renderPanel(ctx, '👥 Tenants\nChoose a tenant:', { reply_markup: { inline_keyboard: rows } });
}

async function showTenantCardPanel(ctx, tenantId) {
  const tenant = await tenantService.getTenantById(tenantId);
  if (!tenant) return safeEditOrReply(ctx, 'Tenant not found.');
  const payment = await paymentService.getTenantCurrentPayment(tenant._id);
  return safeEditOrReply(
    ctx,
    formatTenantCard(tenant, tenant.roomId, payment),
    Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Edit', callback(['tenant', 'edit', tenant._id])), Markup.button.callback('🚪 Vacate', callback(['tenant', 'vacate', tenant._id]))],
      [Markup.button.callback('💳 Record Payment', callback(['pay', 'record', 'room', tenant.roomId?._id]))],
      [Markup.button.callback('🔙 Tenants', 'panel:tenants')]
    ])
  );
}

async function showDashboard(ctx, editMode = false) {
  const stats = await roomService.dashboardSummary(await paymentService.getDashboardPaymentStats());
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'dashboard:refresh')],
    [Markup.button.callback('🏠 Rooms', 'panel:rooms'), Markup.button.callback('💳 Payments', 'panel:payments')]
  ]);
  if (editMode) return safeEditOrReply(ctx, formatDashboardCard(stats), keyboard);
  return renderPanel(ctx, formatDashboardCard(stats), keyboard);
}

function setupBot() {
  if (!env.telegramBotToken) return null;
  const bot = new Telegraf(env.telegramBotToken);

  bot.use(session());
  bot.use((ctx, next) => {
    ctx.session ??= {};
    ctx.session.flowData ??= {};
    return next();
  });

  bot.start(async (ctx) => {
    clearFlow(ctx);
    await showHome(ctx);
  });
  bot.command('help', showHome);

  // Fallback slash commands
  bot.command('rooms', requireAdmin, openRoomsPanel);
  bot.command('addroom', requireAdmin, async (ctx) => {
    startFlow(ctx, 'add_room', 'room');
    await safeEditOrReply(ctx, `${getSectionHeader('Add Room', '➕')}\nEnter room number (e.g., A01).`, {
      reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
    });
  });
  bot.command('addtenant', requireAdmin, async (ctx) => {
    startFlow(ctx, 'assign_tenant', 'room');
    await safeEditOrReply(ctx, `${getSectionHeader('Assign Tenant', '👤')}\nEnter room number.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
  });
  bot.command('pay', requireAdmin, async (ctx) => {
    startFlow(ctx, 'record_payment', 'room');
    await safeEditOrReply(ctx, `${getSectionHeader('Record Payment', '💳')}\nEnter room number.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
  });
  bot.command('dashboard', requireAdmin, async (ctx) => showDashboard(ctx));
  bot.command('link', async (ctx) => {
    startFlow(ctx, 'tenant_link', 'room');
    await safeEditOrReply(ctx, `${getSectionHeader('Link My Room', '🔗')}\nEnter your room number.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
  });

  bot.hears('🏠 Rooms', requireAdmin, openRoomsPanel);
  bot.hears('💳 Payments', requireAdmin, openPaymentsPanel);
  bot.hears('📊 Dashboard', requireAdmin, async (ctx) => showDashboard(ctx));
  bot.hears('👥 Tenants', requireAdmin, openTenantsPanel);
  bot.hears('⚙️ Settings', requireAdmin, openSettingsPanel);
  bot.hears('⚠️ Late Rent', requireAdmin, async (ctx) => showPaymentsList(ctx, 'overdue', 1));

  bot.hears('🔗 Link My Room', async (ctx) => {
    startFlow(ctx, 'tenant_link', 'room');
    await safeEditOrReply(ctx, `${getSectionHeader('Link My Room', '🔗')}\nEnter your room number.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
  });
  bot.hears('🏠 My Room', async (ctx) => {
    const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
    if (!tenant) return ctx.reply('Please link your room first.', getTenantMainMenu(false));
    const payment = await paymentService.getTenantCurrentPayment(tenant._id);
    return renderPanel(ctx, formatRoomCard(tenant.roomId, tenant, payment), Markup.inlineKeyboard([
      [Markup.button.callback('💳 My Payment', 'tenant:mypayment')],
      [Markup.button.callback('📞 Contact Admin', 'tenant:contact')]
    ]));
  });
  bot.hears('💳 My Payment', async (ctx) => {
    const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
    if (!tenant) return ctx.reply('Please link your room first.', getTenantMainMenu(false));
    const payment = await paymentService.getTenantCurrentPayment(tenant._id);
    if (!payment) return renderPanel(ctx, '💳 My Payment\nNo active payment.', Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'panel:tenanthome')]]));
    return renderPanel(ctx, formatPaymentCard(payment), Markup.inlineKeyboard([
      [Markup.button.callback('🧾 History', callback(['pay', 'history', tenant.roomId._id]))],
      [Markup.button.callback('📞 Contact Admin', 'tenant:contact')]
    ]));
  });
  bot.hears('📞 Contact Admin', async (ctx) => ctx.reply(env.adminTelegramIds.length ? `Admin IDs: ${env.adminTelegramIds.join(', ')}` : 'Admin contacts are not configured.'));

  bot.action(/.*/, async (ctx) => {
    try {
      const data = String(ctx.callbackQuery.data || '');
      if (data === 'noop') return ctx.answerCbQuery();
      if (data === 'panel:home') {
        await ctx.answerCbQuery();
        return showHome(ctx);
      }
      if (data === 'panel:rooms') return openRoomsPanel(ctx);
      if (data === 'panel:payments') return openPaymentsPanel(ctx);
      if (data === 'panel:tenants') return openTenantsPanel(ctx);
      if (data === 'panel:settings') return openSettingsPanel(ctx);
      if (data === 'flow:cancel') {
        clearFlow(ctx);
        return safeEditOrReply(ctx, 'Cancelled.');
      }
      if (data === 'flow:skipphoto') {
        if (ctx.session.flow === 'add_room' && ctx.session.step === 'photo') {
          const room = await roomService.addRoom({
            roomNumber: ctx.session.flowData.roomNumber,
            rentPrice: Number(ctx.session.flowData.rentPrice),
            notes: '',
            photoFileId: null
          });
          clearFlow(ctx);
          return safeEditOrReply(ctx, `Room ${room.roomNumber} added successfully.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Rooms', 'panel:rooms')]] } });
        }
        return ctx.answerCbQuery();
      }
      if (data === 'dashboard:refresh') return showDashboard(ctx, true);
      if (data === 'tenant:mypayment') return ctx.reply('Tap 💳 My Payment from main menu.');
      if (data === 'tenant:contact') return ctx.reply(env.adminTelegramIds.length ? `Admin IDs: ${env.adminTelegramIds.join(', ')}` : 'Admin contacts are not configured.');

      const [scope, action, p1, p2] = data.split(':');

      if (scope === 'rooms' && action === 'list') return showRoomList(ctx, p1, Number(p2 || 1));
      if (scope === 'rooms' && action === 'search') {
        startFlow(ctx, 'search_room', 'input');
        return safeEditOrReply(ctx, '🔎 Search Room\nPlease enter a room number like A01.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back', 'panel:rooms'), Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
        });
      }
      if (scope === 'rooms' && action === 'add') {
        startFlow(ctx, 'add_room', 'room');
        return safeEditOrReply(ctx, `${getSectionHeader('Add Room', '➕')}\nEnter room number.`, {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
        });
      }

      if (scope === 'room' && action === 'view') return showRoomCard(ctx, p1);
      if (scope === 'room' && action === 'assign') {
        const room = await roomService.getRoomById(p1);
        startFlow(ctx, 'assign_tenant', 'name', { roomNumber: room.roomNumber });
        return safeEditOrReply(ctx, `${getSectionHeader('Assign Tenant', '👤')}\nRoom: ${room.roomNumber}\nEnter tenant full name.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
      }
      if (scope === 'room' && action === 'vacate') {
        startFlow(ctx, 'vacate_room', 'confirm', { roomId: p1 });
        return safeEditOrReply(ctx, '🚪 Vacate Room\nType YES to confirm.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
      }
      if (scope === 'room' && action === 'photo') {
        startFlow(ctx, 'update_room_photo', 'photo', { roomId: p1 });
        return safeEditOrReply(ctx, '📸 Please send a photo of the room.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
        });
      }

      if (scope === 'pay' && action === 'list') return showPaymentsList(ctx, p1, Number(p2 || 1));
      if (scope === 'pay' && action === 'view') return showPaymentCard(ctx, p1);
      if (scope === 'pay' && action === 'record' && p1 === 'start') {
        startFlow(ctx, 'record_payment', 'room');
        return safeEditOrReply(ctx, `${getSectionHeader('Record Payment', '💳')}\nEnter room number.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
      }
      if (scope === 'pay' && action === 'record' && p1 === 'room') {
        const room = await roomService.getRoomById(p2);
        startFlow(ctx, 'record_payment', 'confirm', { roomNumber: room.roomNumber });
        return safeEditOrReply(ctx, `💳 Record Payment\nRoom: ${room.roomNumber}\nType YES to confirm.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
      }
      if (scope === 'pay' && action === 'mark') {
        await paymentService.recordPayment({ roomId: p1 });
        await ctx.answerCbQuery('Payment recorded');
        return showPaymentsList(ctx, 'unpaid', 1);
      }
      if (scope === 'pay' && action === 'history') {
        const history = await paymentService.listPaymentHistoryByRoom(p1);
        const text = history.length
          ? `${getSectionHeader('Payment History', '🧾')}\n${history.map((p) => `${formatDate(p.dueDate)} • ${formatMoney(p.amount)} • ${p.status}`).join('\n')}`
          : 'No payment history.';
        return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Payments', 'panel:payments')]] } });
      }

      if (scope === 'tenant' && action === 'list') return showTenantsList(ctx, p1, Number(p2 || 1));
      if (scope === 'tenant' && action === 'view') return showTenantCardPanel(ctx, p1);
      if (scope === 'tenant' && action === 'search') {
        startFlow(ctx, 'search_tenant', 'input');
        return safeEditOrReply(ctx, '🔎 Search Tenant\nPlease enter a name or phone.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back', 'panel:tenants'), Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
        });
      }
      if (scope === 'tenant' && action === 'add') {
        startFlow(ctx, 'assign_tenant', 'room');
        return safeEditOrReply(ctx, `${getSectionHeader('Add Tenant', '➕')}\nEnter room number.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
      }
      if (scope === 'tenant' && action === 'edit') {
        startFlow(ctx, 'edit_tenant', 'phone', { tenantId: p1 });
        return safeEditOrReply(ctx, '✏️ Edit Tenant\nEnter new phone number.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
      }
      if (scope === 'tenant' && action === 'vacate') {
        await tenantService.vacateTenant(p1);
        await ctx.answerCbQuery('Tenant vacated');
        return showTenantsList(ctx, 'all', 1);
      }

      if (scope === 'settings' && action === 'admins') return ctx.answerCbQuery(`Admins: ${env.adminTelegramIds.join(', ')}`);
      if (scope === 'settings' && action === 'seed') {
        const bulk = [];
        for (let i = 1; i <= 100; i += 1) {
          const roomNumber = String(i).padStart(3, '0');
          bulk.push({ updateOne: { filter: { roomNumber }, update: { $setOnInsert: { roomNumber, status: 'free', rentPrice: 500, tenantId: null, notes: '' } }, upsert: true } });
        }
        await Room.bulkWrite(bulk);
        return ctx.answerCbQuery('Rooms seeded');
      }
      if (scope === 'settings' && action === 'reminder') {
        await runReminderCheckOnce(bot);
        return ctx.answerCbQuery('Reminder check done');
      }

      return ctx.answerCbQuery('Action not available');
    } catch (error) {
      console.error(error);
      return safeEditOrReply(ctx, `Error: ${error.message}`);
    }
  });

  bot.on('photo', async (ctx, next) => {
    try {
      const photo = ctx.message.photo?.[ctx.message.photo.length - 1];
      if (!photo) return next();

      if (ctx.session.flow === 'add_room' && ctx.session.step === 'photo') {
        const room = await roomService.addRoom({
          roomNumber: ctx.session.flowData.roomNumber,
          rentPrice: Number(ctx.session.flowData.rentPrice),
          notes: '',
          photoFileId: photo.file_id
        });
        clearFlow(ctx);
        return safeEditOrReply(ctx, `✅ Room ${room.roomNumber} created with photo.`, {
          reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Rooms', 'panel:rooms')]] }
        });
      }

      if (ctx.session.flow === 'update_room_photo' && ctx.session.step === 'photo') {
        const room = await roomService.updateRoomPhoto(ctx.session.flowData.roomId, { photoFileId: photo.file_id });
        clearFlow(ctx);
        await safeEditOrReply(ctx, '✅ Room photo updated successfully', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Room', callback(['room', 'view', room._id]))]] }
        });
        return;
      }
    } catch (error) {
      return safeEditOrReply(ctx, `Error: ${error.message}`);
    }
    return next();
  });

  bot.on('text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (!ctx.session.flow) return next();

    try {
      const data = ctx.session.flowData || {};

      if ((ctx.session.flow === 'add_room' && ctx.session.step === 'photo') || (ctx.session.flow === 'update_room_photo' && ctx.session.step === 'photo')) {
        return safeEditOrReply(ctx, 'Please send an image file.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
        });
      }

      if (ctx.session.flow === 'search_room' && ctx.session.step === 'input') {
        const room = await roomService.getRoomByNumber(text);
        clearFlow(ctx);
        if (!room) {
          return safeEditOrReply(ctx, 'Room not found.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔎 Try Again', 'rooms:search:start'), Markup.button.callback('🔙 Back', 'panel:rooms')]] } });
        }
        return showRoomCard(ctx, room._id);
      }

      if (ctx.session.flow === 'search_tenant' && ctx.session.step === 'input') {
        const tenants = await tenantService.searchTenants(text);
        clearFlow(ctx);
        if (!tenants.length) return safeEditOrReply(ctx, 'No tenants found.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔎 Try Again', 'tenant:search:start'), Markup.button.callback('🔙 Back', 'panel:tenants')]] } });
        return showTenantCardPanel(ctx, tenants[0]._id);
      }

      if (ctx.session.flow === 'add_room') {
        if (ctx.session.step === 'room') {
          ctx.session.step = 'rent';
          data.roomNumber = text;
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter rent price.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
        }
        if (ctx.session.step === 'rent') {
          data.rentPrice = Number(text);
          ctx.session.step = 'photo';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, '📸 Please send a photo of the room (or skip).', {
            reply_markup: { inline_keyboard: [[Markup.button.callback('⏭ Skip', 'flow:skipphoto'), Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
          });
        }
      }

      if (ctx.session.flow === 'assign_tenant') {
        if (ctx.session.step === 'room') {
          data.roomNumber = text;
          ctx.session.step = 'name';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter tenant full name.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
        }
        if (ctx.session.step === 'name') {
          data.fullName = text;
          ctx.session.step = 'phone';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter tenant phone number.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
        }
        if (ctx.session.step === 'phone') {
          data.phone = text;
          ctx.session.step = 'moveIn';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter move-in date (YYYY-MM-DD) or TODAY.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
        }
        if (ctx.session.step === 'moveIn') {
          data.moveInDate = text.toUpperCase() === 'TODAY' ? dayjs().format('YYYY-MM-DD') : text;
          await tenantService.addTenantToRoom(data);
          clearFlow(ctx);
          return safeEditOrReply(ctx, 'Tenant assigned successfully.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Rooms', 'panel:rooms')]] } });
        }
      }

      if (ctx.session.flow === 'record_payment') {
        if (ctx.session.step === 'room') {
          await paymentService.recordPayment({ roomNumber: text });
          clearFlow(ctx);
          return safeEditOrReply(ctx, 'Payment recorded successfully.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Payments', 'panel:payments')]] } });
        }
        if (ctx.session.step === 'confirm') {
          if (text !== 'YES') return safeEditOrReply(ctx, 'Type YES to confirm or Cancel.');
          await paymentService.recordPayment({ roomNumber: data.roomNumber });
          clearFlow(ctx);
          return safeEditOrReply(ctx, 'Payment recorded successfully.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Payments', 'panel:payments')]] } });
        }
      }

      if (ctx.session.flow === 'vacate_room') {
        if (text !== 'YES') return safeEditOrReply(ctx, 'Type YES to confirm or Cancel.');
        await roomService.vacateRoomById(data.roomId);
        clearFlow(ctx);
        return safeEditOrReply(ctx, 'Room vacated successfully.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Rooms', 'panel:rooms')]] } });
      }

      if (ctx.session.flow === 'edit_tenant') {
        await tenantService.updateTenant(data.tenantId, { phone: text });
        clearFlow(ctx);
        return safeEditOrReply(ctx, 'Tenant updated successfully.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Tenants', 'panel:tenants')]] } });
      }

      if (ctx.session.flow === 'tenant_link') {
        if (ctx.session.step === 'room') {
          data.roomNumber = text;
          ctx.session.flowData = data;
          ctx.session.step = 'phone';
          return safeEditOrReply(ctx, 'Enter your phone number.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
        }
        if (ctx.session.step === 'phone') {
          await tenantService.linkTenantTelegram({ roomNumber: data.roomNumber, phone: text, chatId: ctx.chat.id, telegramUsername: ctx.from.username });
          clearFlow(ctx);
          return ctx.reply('Linked successfully ✅', getTenantMainMenu(true));
        }
      }
    } catch (error) {
      return safeEditOrReply(ctx, `Error: ${error.message}`);
    }
    return next();
  });

  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('Something went wrong. Please try again.');
  });

  return bot;
}

module.exports = { setupBot };
