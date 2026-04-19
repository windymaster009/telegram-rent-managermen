const { Telegraf, Markup, session } = require('telegraf');
const dayjs = require('dayjs');
const env = require('../config/env');
const { isAdminTelegramId, requireAdmin } = require('../middleware/auth');
const roomService = require('../services/roomService');
const tenantService = require('../services/tenantService');
const paymentService = require('../services/paymentService');
const Room = require('../models/Room');
const { runReminderCheckOnce, resendTenantReminder } = require('../jobs/reminderJob');
const { getAdminMainMenu, getTenantMainMenu, getGuestMainMenu, getRoomsMenu, getPaymentsMenu, getTenantsMenu, getSettingsMenu, getRoomActions, getRequestMenu } = require('../keyboards/menus');
const { getSettingsMainMenu, getAdminRolesMenu, getRoomManagementMenu, getReminderToolsMenu } = require('../keyboards/settingsKeyboards');
const { paginate } = require('../utils/pagination');
const { safeEditOrReply } = require('../utils/safeEditOrReply');
const { formatRoomCard, formatTenantRoomCard, formatGuestRoomCard, formatRentalRequestCard, formatPaymentCard, formatTenantCard, formatDashboardCard, getSectionHeader } = require('../formatters/cards');
const { chunkTwoColumns, getPaginationRow } = require('../navigation/panels');
const { renderTextPanel, renderPhotoPanel, clearActivePanel, replaceActivePanel } = require('../navigation/panelManager');
const { clearFlow, startFlow } = require('../flows/state');
const { formatMoney } = require('../utils/format');
const { formatDate, daysBetween } = require('../utils/date');
const { createQrPayment } = require('../services/paywayQrService');
const { createPaymentLink } = require('../services/paywayLinkService');
const { getTenantPaymentHistory } = require('../services/paymentHistoryService');
const rentalRequestService = require('../services/rentalRequestService');
const adminService = require('../services/adminService');
const roleService = require('../services/roleService');
const reminderService = require('../services/reminderService');

function callback(parts) {
  return parts.join(':');
}

function adminChatButtonRow() {
  if (!env.adminTelegramUsername) return null;
  return [Markup.button.url('📞 Chat Admin', `https://t.me/${env.adminTelegramUsername.replace('@', '')}`)];
}

async function sendRoomDetailCard(ctx, room, caption, actions) {
  return replaceActivePanel(ctx, async () => {
    if (room.photoFileId || room.photoUrl) {
      const photo = room.photoFileId || room.photoUrl;
      try {
        return await renderPhotoPanel(ctx, photo, caption, actions);
      } catch (_) {
        return renderTextPanel(ctx, caption, actions);
      }
    }
    return renderTextPanel(ctx, `ℹ️ No photo available\n\n${caption}`, actions);
  });
}

async function sendRoomCard(ctx, room, tenant, payment) {
  return sendRoomDetailCard(ctx, room, formatRoomCard(room, tenant, payment), getRoomActions(room._id));
}

async function renderPanel(ctx, text, keyboard) {
  return replaceActivePanel(ctx, () => renderTextPanel(ctx, text, keyboard));
}

async function showHome(ctx) {
  await clearActivePanel(ctx);
  if (isAdminTelegramId(ctx.from.id)) {
    await ctx.reply('Choose an option below.', getAdminMainMenu());
    return;
  }
  const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
  if (tenant) {
    await ctx.reply('Choose an option below.', getTenantMainMenu(true));
    return;
  }
  await ctx.reply('Welcome! Please choose an option below.', getGuestMainMenu());
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
  return renderPanel(ctx, '⚙️ Settings\n━━━━━━━━━━\nManage admins, roles, room management, and reminder tools.', getSettingsMainMenu());
}
async function openRequestsPanel(ctx) {
  return renderPanel(ctx, '📨 Requests\nChoose an option below:', getRequestMenu());
}

async function openAdminRolesPanel(ctx) {
  const [admins, roles, canManage] = await Promise.all([
    adminService.listAdmins(),
    roleService.listRoles(),
    adminService.hasPermission(ctx.from.id, 'manage_admins')
  ]);
  return renderPanel(
    ctx,
    `👮 Admin & Roles\n━━━━━━━━━━\nTotal admins: ${admins.length}\nTotal roles: ${roles.length}`,
    getAdminRolesMenu(canManage)
  );
}

async function openRoomManagementPanel(ctx) {
  const [canManageRooms, canDeleteRooms] = await Promise.all([
    adminService.hasPermission(ctx.from.id, 'manage_rooms'),
    adminService.hasPermission(ctx.from.id, 'delete_rooms')
  ]);
  return renderPanel(ctx, '🏗 Room Management\n━━━━━━━━━━\nCreate, edit, delete, and maintain rooms.', getRoomManagementMenu(canManageRooms, canDeleteRooms));
}

async function openReminderToolsPanel(ctx) {
  const canRun = await adminService.hasPermission(ctx.from.id, 'run_reminders');
  return renderPanel(ctx, '🔔 Reminder Tools\n━━━━━━━━━━\nTest and run payment reminder jobs.', getReminderToolsMenu(canRun));
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

async function showAvailableRooms(ctx, page = 1) {
  const rooms = await roomService.listRooms({ status: 'free' });
  if (!rooms.length) return renderPanel(ctx, '🏠 Available Rooms\nNo free rooms right now.', { reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back', 'panel:home')]] } });
  const p = paginate(rooms, page, 6);
  const buttons = p.data.map((room) => Markup.button.callback(`${room.roomNumber} 🟢`, callback(['guest', 'room', room._id])));
  const rows = chunkTwoColumns(buttons);
  rows.push(getPaginationRow(callback(['guest', 'available']), p.currentPage, p.totalPages));
  rows.push([Markup.button.callback('🔙 Back', 'panel:home')]);
  return renderPanel(ctx, '🏠 Available Rooms\nChoose a room to view details.', { reply_markup: { inline_keyboard: rows } });
}

async function showGuestRoomCard(ctx, roomId) {
  const room = await roomService.getRoomById(roomId);
  if (!room || room.status !== 'free') return safeEditOrReply(ctx, 'Room is not available.');
  return sendRoomDetailCard(
    ctx,
    room,
    formatGuestRoomCard(room),
    { reply_markup: { inline_keyboard: [[Markup.button.callback('✅ Rent This Room', callback(['guest', 'rent', room._id]))], [Markup.button.callback('🔙 Back to Available Rooms', callback(['guest', 'available', '1']))]] } }
  );
}

async function showRequestList(ctx, status = 'pending', page = 1) {
  const requests = await rentalRequestService.listRequests(status);
  if (!requests.length) return renderPanel(ctx, `📨 Requests\nNo ${status} requests.`, getRequestMenu());
  const p = paginate(requests, page, 6);
  const rows = p.data.map((r) => [Markup.button.callback(`${r.roomNumber} • ${r.fullName}`, callback(['request', 'view', r._id]))]);
  rows.push(getPaginationRow(callback(['request', 'list', status]), p.currentPage, p.totalPages));
  rows.push([Markup.button.callback('🔙 Back', 'panel:requests')]);
  return renderPanel(ctx, `📨 ${status[0].toUpperCase()}${status.slice(1)} Requests`, { reply_markup: { inline_keyboard: rows } });
}

async function showRoomPickerForSettings(ctx, action, page = 1) {
  const rooms = await roomService.listRooms();
  if (!rooms.length) return renderPanel(ctx, 'No rooms available.');
  const p = paginate(rooms, page, 6);
  const rows = p.data.map((room) => [Markup.button.callback(`${room.roomNumber} ${room.status === 'rented' ? '🔴' : '🟢'}`, callback(['settings', 'roomselect', action, room._id]))]);
  rows.push(getPaginationRow(callback(['settings', 'roompicker', action]), p.currentPage, p.totalPages));
  rows.push([Markup.button.callback('🔙 Back', 'settings:room_mgmt')]);
  return renderPanel(ctx, `Select a room for ${action}:`, { reply_markup: { inline_keyboard: rows } });
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
    `${formatPaymentCard(payment)}\nGateway type: ${payment.gatewayType || '-'}\nTransaction: ${payment.gatewayTransactionId || '-'}\nQR active: ${payment.qrActive ? 'Yes' : 'No'}\nLink generated: ${payment.gatewayPaymentLink ? 'Yes' : 'No'}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Check Status', callback(['tenant', 'check', payment._id]))],
      [Markup.button.callback('📷 Resend QR', callback(['tenant', 'payqr', payment._id])), Markup.button.callback('💳 Regenerate Link', callback(['tenant', 'paylink', payment._id]))],
      [Markup.button.callback('✅ Mark Paid Manually', callback(['pay', 'mark', payment.roomId._id]))],
      [Markup.button.callback('📜 History', callback(['pay', 'history', payment.roomId._id]))],
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
  adminService.syncEnvAdmins().catch((e) => console.error('Admin sync failed', e.message));

  bot.use(session());
  bot.use((ctx, next) => {
    ctx.session ??= {};
    ctx.session.flowData ??= {};
    ctx.session.activePanelChatId ??= null;
    ctx.session.activePanelMessageId ??= null;
    ctx.session.activePanelKind ??= null;
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
  bot.hears('📨 Requests', requireAdmin, openRequestsPanel);
  bot.hears('⚙️ Settings', requireAdmin, openSettingsPanel);
  bot.hears('⚠️ Late Rent', requireAdmin, async (ctx) => showPaymentsList(ctx, 'overdue', 1));

  bot.hears('📝 Register My Room', async (ctx) => {
    startFlow(ctx, 'tenant_link', 'room');
    await safeEditOrReply(ctx, `${getSectionHeader('Register My Room', '📝')}\nEnter your room number.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
  });
  bot.hears('🔎 Check Rooms to Rent', async (ctx) => showAvailableRooms(ctx, 1));

  bot.hears('🔗 Link My Room', async (ctx) => {
    startFlow(ctx, 'tenant_link', 'room');
    await safeEditOrReply(ctx, `${getSectionHeader('Link My Room', '🔗')}\nEnter your room number.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
  });
  bot.hears('🏠 My Room', async (ctx) => {
    const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
    if (!tenant) return ctx.reply('Please link your room first.', getTenantMainMenu(false));
    const payment = await paymentService.getTenantCurrentPayment(tenant._id);
    const actions = Markup.inlineKeyboard([
      [Markup.button.callback('💳 My Payment', 'tenant:mypayment')],
      [env.adminTelegramUsername ? Markup.button.url('📞 Chat Admin', `https://t.me/${env.adminTelegramUsername.replace('@', '')}`) : Markup.button.callback('📞 Contact Admin', 'tenant:contact')],
      [Markup.button.callback('🔙 Back', 'panel:home')]
    ]);
    return sendRoomDetailCard(ctx, tenant.roomId, formatTenantRoomCard(tenant.roomId, tenant, payment), actions);
  });
  bot.hears('💳 My Payment', async (ctx) => {
    const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
    if (!tenant) return ctx.reply('Please link your room first.', getTenantMainMenu(false));
    const payment = await paymentService.getTenantCurrentPayment(tenant._id);
    if (!payment) return renderPanel(ctx, '💳 My Payment\nNo active payment.', Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'panel:tenanthome')]]));
    if (payment.status === 'paid') {
      return renderPanel(ctx, formatPaymentCard(payment), Markup.inlineKeyboard([
        [Markup.button.callback('📜 Payment History', callback(['tenant', 'history', '1']))],
        [Markup.button.callback('🔙 Back', 'panel:tenanthome')]
      ]));
    }

    const rows = [
      [Markup.button.callback('📷 Pay by QR', callback(['tenant', 'payqr', payment._id]))],
      [Markup.button.callback('💳 Pay by Link', callback(['tenant', 'paylink', payment._id]))],
      adminChatButtonRow() || [Markup.button.callback('📞 Contact Admin', 'tenant:contact')],
      [Markup.button.callback('🔙 Back', 'panel:tenanthome')]
    ];

    return renderPanel(
      ctx,
      `💳 Rent Payment\n━━━━━━━━━━\nRoom: ${tenant.roomId.roomNumber}\nAmount: ${formatMoney(payment.amount)}\nDue date: ${formatDate(payment.dueDate)}\nStatus: ${payment.status}`,
      { reply_markup: { inline_keyboard: rows.filter(Boolean) } }
    );
  });
  bot.hears('📞 Contact Admin', async (ctx) => {
    if (env.adminTelegramUsername) {
      return ctx.reply(`Support: @${env.adminTelegramUsername.replace('@', '')}`, Markup.inlineKeyboard([adminChatButtonRow()]));
    }
    return ctx.reply('Support is available. Please contact building management.');
  });

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
      if (data === 'panel:requests') return openRequestsPanel(ctx);
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
      if (data === 'flow:skipnote') {
        if (ctx.session.flow === 'rental_request' && ctx.session.step === 'note') {
          ctx.session.flowData.note = '';
          ctx.session.step = 'confirm';
          const d = ctx.session.flowData;
          return safeEditOrReply(ctx, `📝 Rental Request\n━━━━━━━━━━\nRoom: ${d.roomNumber}\nName: ${d.fullName}\nPhone: ${d.phone}\nTelegram: @${ctx.from.username || '-'}\nNote: -`, {
            reply_markup: { inline_keyboard: [[Markup.button.callback('✅ Submit Request', 'flow:submitrequest'), Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
          });
        }
        return ctx.answerCbQuery();
      }
      if (data === 'flow:submitrequest') {
        if (ctx.session.flow === 'rental_request' && ctx.session.step === 'confirm') {
          const d = ctx.session.flowData;
          const request = await rentalRequestService.createRentalRequest({
            roomId: d.roomId,
            fullName: d.fullName,
            phone: d.phone,
            telegramUserId: ctx.from.id,
            telegramUsername: ctx.from.username,
            telegramChatId: ctx.chat.id,
            note: d.note || ''
          });
          clearFlow(ctx);
          for (const adminId of env.adminTelegramIds) {
            const rows = [];
            if (request.telegramUsername) rows.push([Markup.button.url('💬 Chat User', `https://t.me/${request.telegramUsername}`)]);
            rows.push([Markup.button.callback('✅ Approve', callback(['request', 'approve', request._id])), Markup.button.callback('❌ Reject', callback(['request', 'reject', request._id]))]);
            rows.push([Markup.button.callback('📋 View Requests', callback(['request', 'list', 'pending', '1']))]);
            await ctx.telegram.sendMessage(adminId, `🆕 New Rental Request\n━━━━━━━━━━\nRoom: ${request.roomNumber}\nName: ${request.fullName}\nPhone: ${request.phone}\nTelegram: ${request.telegramUsername ? '@' + request.telegramUsername : 'No username'}\nUser ID: ${request.telegramUserId}\nNote: ${request.note || '-'}`, { reply_markup: { inline_keyboard: rows } });
          }
          const successRows = [];
          if (env.adminTelegramUsername) successRows.push([Markup.button.url('📞 Chat Admin', `https://t.me/${env.adminTelegramUsername.replace('@', '')}`)]);
          successRows.push([Markup.button.callback('🔎 Check Rooms to Rent', callback(['guest', 'available', '1']))]);
          successRows.push([Markup.button.callback('🔙 Back', 'panel:home')]);
          return safeEditOrReply(ctx, '✅ Your rental request has been sent to the admin.\nWe will contact you soon.', { reply_markup: { inline_keyboard: successRows } });
        }
      }
      if (data.startsWith('flow:roleperm:')) {
        if (ctx.session.flow !== 'create_role') return ctx.answerCbQuery();
        const perm = data.split(':')[2];
        const selected = ctx.session.flowData.permissions || [];
        ctx.session.flowData.permissions = selected.includes(perm) ? selected.filter((p) => p !== perm) : [...selected, perm];
        const rows = roleService.DEFAULT_PERMISSIONS.map((p) => [Markup.button.callback(`${ctx.session.flowData.permissions.includes(p) ? '✅' : '⬜'} ${p}`, callback(['flow', 'roleperm', p]))]);
        rows.push([Markup.button.callback('💾 Save Role', 'flow:saverole')]);
        return renderPanel(ctx, 'Select permissions (tap to toggle):', { reply_markup: { inline_keyboard: rows } });
      }
      if (data === 'flow:saverole') {
        if (ctx.session.flow !== 'create_role') return ctx.answerCbQuery();
        await roleService.createRole({
          name: ctx.session.flowData.name,
          description: ctx.session.flowData.description || '',
          permissions: ctx.session.flowData.permissions || []
        });
        clearFlow(ctx);
        return safeEditOrReply(ctx, 'Role created successfully.');
      }
      if (data.startsWith('flow:adminrole:')) {
        if (ctx.session.flow !== 'add_admin') return ctx.answerCbQuery();
        const roleId = data.split(':')[2];
        await adminService.addAdmin({
          telegramUserId: ctx.session.flowData.telegramUserId,
          telegramUsername: ctx.session.flowData.telegramUsername,
          fullName: ctx.session.flowData.fullName || '',
          roleId,
          addedBy: String(ctx.from.id)
        });
        clearFlow(ctx);
        return safeEditOrReply(ctx, 'Admin added successfully.');
      }
      if (data.startsWith('flow:editroom:')) {
        if (ctx.session.flow !== 'edit_room') return ctx.answerCbQuery();
        ctx.session.flowData.field = data.split(':')[2];
        ctx.session.step = 'value';
        return safeEditOrReply(ctx, `Enter new value for ${ctx.session.flowData.field}.`);
      }
      if (data === 'dashboard:refresh') return showDashboard(ctx, true);
      if (data === 'tenant:mypayment') return ctx.reply('Tap 💳 My Payment from main menu.');
      if (data === 'tenant:contact') {
        if (env.adminTelegramUsername) {
          return safeEditOrReply(ctx, `Support: @${env.adminTelegramUsername.replace('@', '')}`, { reply_markup: { inline_keyboard: [adminChatButtonRow()] } });
        }
        return safeEditOrReply(ctx, 'Support is available. Please contact building management.');
      }

      const [scope, action, p1, p2] = data.split(':');

      if (scope === 'rooms' && action === 'list') return showRoomList(ctx, p1, Number(p2 || 1));
      if (scope === 'guest' && action === 'available') return showAvailableRooms(ctx, Number(p1 || 1));
      if (scope === 'guest' && action === 'room') return showGuestRoomCard(ctx, p1);
      if (scope === 'guest' && action === 'rent') {
        const room = await roomService.getRoomById(p1);
        if (!room || room.status !== 'free') return safeEditOrReply(ctx, 'Room is no longer available.');
        startFlow(ctx, 'rental_request', 'name', { roomId: room._id, roomNumber: room.roomNumber });
        return safeEditOrReply(ctx, 'Please enter your full name.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
      }
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
      if (scope === 'request' && action === 'list') return showRequestList(ctx, p1, Number(p2 || 1));
      if (scope === 'request' && action === 'view') {
        const req = await rentalRequestService.getRequestById(p1);
        if (!req) return safeEditOrReply(ctx, 'Request not found.');
        const rows = [];
        if (req.telegramUsername) rows.push([Markup.button.url('💬 Chat User', `https://t.me/${req.telegramUsername.replace('@', '')}`)]);
        rows.push([Markup.button.callback('✅ Approve', callback(['request', 'approve', req._id])), Markup.button.callback('❌ Reject', callback(['request', 'reject', req._id]))]);
        rows.push([Markup.button.callback('🔙 Back', callback(['request', 'list', req.status, '1']))]);
        return safeEditOrReply(ctx, formatRentalRequestCard(req), { reply_markup: { inline_keyboard: rows } });
      }
      if (scope === 'request' && action === 'approve') {
        const req = await rentalRequestService.updateRequestStatus(p1, 'approved', String(ctx.from.id));
        if (req?.telegramChatId) {
          await ctx.telegram.sendMessage(req.telegramChatId, `✅ Your request for room ${req.roomNumber} was approved.`);
        }
        return safeEditOrReply(ctx, 'Request approved. Do you want to assign this person now?', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('✅ Assign Now', callback(['request', 'assign', req._id])), Markup.button.callback('Later', callback(['request', 'view', req._id]))]] }
        });
      }
      if (scope === 'request' && action === 'assign') {
        const req = await rentalRequestService.getRequestById(p1);
        if (!req) return safeEditOrReply(ctx, 'Request not found.');
        startFlow(ctx, 'assign_tenant', 'moveIn', { roomNumber: req.roomNumber, fullName: req.fullName, phone: req.phone });
        return safeEditOrReply(ctx, `Assigning ${req.fullName} to room ${req.roomNumber}.\nEnter move-in date (YYYY-MM-DD) or TODAY.`);
      }
      if (scope === 'request' && action === 'reject') {
        const req = await rentalRequestService.updateRequestStatus(p1, 'rejected', String(ctx.from.id));
        if (req?.telegramChatId) {
          await ctx.telegram.sendMessage(req.telegramChatId, `❌ Your request for room ${req.roomNumber} was not approved.`);
        }
        return safeEditOrReply(ctx, 'Request rejected.');
      }
      if (scope === 'tenant' && action === 'payqr') {
        const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
        const payment = await paymentService.getPaymentById(p1);
        if (!tenant || !payment || String(payment.tenantId?._id) !== String(tenant._id)) return safeEditOrReply(ctx, 'Payment not available.');
        if (payment.status === 'paid') return safeEditOrReply(ctx, 'This payment is already paid.');
        const qrPayment = await createQrPayment(payment, tenant, tenant.roomId);
        const caption = `📷 Rent Payment QR\n━━━━━━━━━━\nRoom: ${tenant.roomId.roomNumber}\nAmount: ${formatMoney(qrPayment.amount)}\nDue date: ${formatDate(qrPayment.dueDate)}\nStatus: Waiting for payment\n\nPlease scan this QR and complete payment.`;
        const keyboardRows = [
          [Markup.button.callback('🔄 Check Status', callback(['tenant', 'check', qrPayment._id]))],
          adminChatButtonRow() || [Markup.button.callback('📞 Contact Admin', 'tenant:contact')],
          [Markup.button.callback('❌ Cancel QR', callback(['tenant', 'cancelqr', qrPayment._id]))]
        ];
        const qrMessage = await ctx.replyWithPhoto(qrPayment.gatewayQrImageUrl || qrPayment.gatewayQrRaw, { caption, reply_markup: { inline_keyboard: keyboardRows.filter(Boolean) } });
        await paymentService.markQrSession(qrPayment._id, { qrMessageId: qrMessage.message_id, qrChatId: ctx.chat.id, qrActive: true });
        return ctx.answerCbQuery('QR generated');
      }
      if (scope === 'tenant' && action === 'paylink') {
        const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
        const payment = await paymentService.getPaymentById(p1);
        if (!tenant || !payment || String(payment.tenantId?._id) !== String(tenant._id)) return safeEditOrReply(ctx, 'Payment not available.');
        if (payment.status === 'paid') return safeEditOrReply(ctx, 'This payment is already paid.');
        const linkPayment = await createPaymentLink(payment, tenant, tenant.roomId);
        return safeEditOrReply(ctx, '💳 Payment Link\n━━━━━━━━━━\nTap the button below to pay securely.', {
          reply_markup: { inline_keyboard: [[Markup.button.url('🌐 Open Payment Page', linkPayment.gatewayPaymentLink || 'https://example.com')], [Markup.button.callback('🔄 Check Status', callback(['tenant', 'check', linkPayment._id]))]] }
        });
      }
      if (scope === 'tenant' && action === 'check') {
        const payment = await paymentService.getPaymentById(p1);
        if (!payment) return safeEditOrReply(ctx, 'Payment not found.');
        if (payment.status === 'paid') {
          return safeEditOrReply(ctx, `✅ Payment confirmed\n━━━━━━━━━━\nRoom: ${payment.roomId?.roomNumber}\nAmount: ${formatMoney(payment.amount)}\nPaid at: ${formatDate(payment.paidAt || payment.paidDate)}\nTransaction: ${payment.gatewayTransactionId || '-'}`, {
            reply_markup: { inline_keyboard: [[Markup.button.callback('📜 Payment History', callback(['tenant', 'history', '1']))], [Markup.button.callback('🏠 My Room', 'panel:tenanthome'), Markup.button.callback('💳 My Payment', 'tenant:mypayment')]] }
          });
        }
        return ctx.answerCbQuery('Still waiting for payment');
      }
      if (scope === 'tenant' && action === 'cancelqr') {
        await paymentService.cancelQrSession(p1);
        return safeEditOrReply(ctx, 'QR payment canceled.');
      }
      if (scope === 'tenant' && action === 'history') {
        const tenant = await tenantService.getTenantByChatId(ctx.chat.id);
        if (!tenant) return safeEditOrReply(ctx, 'Please link your room first.');
        const history = await getTenantPaymentHistory(tenant._id, Number(p1 || 1), 5);
        const lines = history.items.map((item, idx) => `Payment #${idx + 1}\nRoom: ${item.roomId?.roomNumber}\nAmount: ${formatMoney(item.amount)}\nDate: ${formatDate(item.paidAt || item.paidDate)}\nMethod: ${item.paymentMethod || 'N/A'}\nTransaction: ${item.gatewayTransactionId || '-'}\nStatus: Paid`);
        const text = `📜 Payment History\n━━━━━━━━━━\n${lines.length ? lines.join('\n\n') : 'No paid history yet.'}`;
        const nav = [[Markup.button.callback('⬅️ Prev', callback(['tenant', 'history', Math.max(1, history.page - 1)])), Markup.button.callback(`Page ${history.page}/${history.totalPages}`, 'noop'), Markup.button.callback('Next ➡️', callback(['tenant', 'history', Math.min(history.totalPages, history.page + 1)]))]];
        nav.push([Markup.button.callback('💳 My Payment', 'tenant:mypayment')]);
        return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: nav } });
      }
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

      if (scope === 'settings' && action === 'admins_roles') return openAdminRolesPanel(ctx);
      if (scope === 'settings' && action === 'room_mgmt') return openRoomManagementPanel(ctx);
      if (scope === 'settings' && action === 'reminder_tools') return openReminderToolsPanel(ctx);
      if (scope === 'settings' && action === 'admins' && p1 === 'list') {
        const admins = await adminService.listAdmins();
        const rows = admins.map((a) => {
          const displayName = a.fullName || (a.telegramUsername ? `@${a.telegramUsername}` : 'Unnamed admin');
          return [Markup.button.callback(`${displayName} • ${a.roleId?.name || '-'}`, callback(['settings', 'admins', 'view', a._id]))];
        });
        rows.push([Markup.button.callback('🔙 Back', 'settings:admins_roles')]);
        return renderPanel(ctx, '👤 Admins', { reply_markup: { inline_keyboard: rows } });
      }
      if (scope === 'settings' && action === 'admins' && p1 === 'view') {
        const admin = (await adminService.listAdmins()).find((a) => String(a._id) === String(p2));
        if (!admin) return safeEditOrReply(ctx, 'Admin not found.');
        return renderPanel(
          ctx,
          `👤 Admin Profile\n==========\nName: ${admin.fullName || '-'}\nUsername: ${admin.telegramUsername ? '@' + admin.telegramUsername : 'No username'}\nTelegram ID: ${admin.telegramUserId || 'Not linked yet'}\nRole: ${admin.roleId?.name || '-'}\n----------\nChat link: ${admin.telegramUsername ? `https://t.me/${admin.telegramUsername}` : 'No public username'}\nUser link: ${admin.telegramUserId ? `tg://user?id=${admin.telegramUserId}` : 'Not linked yet'}`,
          { reply_markup: { inline_keyboard: [[Markup.button.callback('✏️ Edit Name', callback(['settings', 'admins', 'editname', admin._id]))], [Markup.button.callback('✏️ Change Role', callback(['settings', 'admins', 'changerole', admin._id]))], [Markup.button.callback('❌ Remove Admin', callback(['settings', 'admins', 'remove', admin._id]))], [Markup.button.callback('🔙 Back', 'settings:admins:list')]] } }
        );
      }
      if (scope === 'settings' && action === 'admins' && p1 === 'add') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_admins'))) return ctx.answerCbQuery('No permission');
        startFlow(ctx, 'add_admin', 'username');
        return safeEditOrReply(ctx, 'Enter admin username (example: @nhimkevin).');
      }
      if (scope === 'settings' && action === 'admins' && p1 === 'editname') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_admins'))) return ctx.answerCbQuery('No permission');
        startFlow(ctx, 'edit_admin_name', 'fullName', { adminId: p2 });
        return safeEditOrReply(ctx, 'Enter admin full name.');
      }
      if (scope === 'settings' && action === 'admins' && p1 === 'remove') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_admins'))) return ctx.answerCbQuery('No permission');
        await adminService.removeAdmin(p2);
        return safeEditOrReply(ctx, 'Admin removed.');
      }
      if (scope === 'settings' && action === 'admins' && p1 === 'changerole') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_admins'))) return ctx.answerCbQuery('No permission');
        const roles = await roleService.listRoles();
        const rows = roles.map((r) => [Markup.button.callback(r.name, callback(['settings', 'admins', 'setrole', p2, r._id]))]);
        rows.push([Markup.button.callback('🔙 Back', callback(['settings', 'admins', 'view', p2]))]);
        return renderPanel(ctx, 'Choose a new role:', { reply_markup: { inline_keyboard: rows } });
      }
      if (scope === 'settings' && action === 'admins' && p1 === 'setrole') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_admins'))) return ctx.answerCbQuery('No permission');
        await adminService.changeRole(p2, data.split(':')[4]);
        return safeEditOrReply(ctx, 'Role updated successfully.');
      }
      if (scope === 'settings' && action === 'roles' && p1 === 'list') {
        const roles = await roleService.listRoles();
        const rows = roles.map((r) => [Markup.button.callback(r.name, callback(['settings', 'roles', 'view', r._id]))]);
        rows.push([Markup.button.callback('🔙 Back', 'settings:admins_roles')]);
        return renderPanel(ctx, '🪪 Roles', { reply_markup: { inline_keyboard: rows } });
      }
      if (scope === 'settings' && action === 'roles' && p1 === 'view') {
        const role = await roleService.getRoleById(p2);
        if (!role) return safeEditOrReply(ctx, 'Role not found.');
        const perms = roleService.DEFAULT_PERMISSIONS.map((perm) => `${role.permissions.includes(perm) ? '✅' : '❌'} ${perm}`).join('\n');
        const rows = [[Markup.button.callback('✏️ Edit Permissions', callback(['settings', 'roles', 'edit', role._id]))]];
        if (!role.isSystemRole) rows.push([Markup.button.callback('❌ Delete Role', callback(['settings', 'roles', 'delete', role._id]))]);
        rows.push([Markup.button.callback('🔙 Back', 'settings:roles:list')]);
        return renderPanel(ctx, `🪪 Role: ${role.name}\n━━━━━━━━━━\nPermissions:\n${perms}`, { reply_markup: { inline_keyboard: rows } });
      }
      if (scope === 'settings' && action === 'roles' && p1 === 'create') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_roles'))) return ctx.answerCbQuery('No permission');
        startFlow(ctx, 'create_role', 'name', { permissions: [] });
        return safeEditOrReply(ctx, 'Enter role name.');
      }
      if (scope === 'settings' && action === 'roles' && p1 === 'delete') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_roles'))) return ctx.answerCbQuery('No permission');
        await roleService.deleteRole(p2);
        return safeEditOrReply(ctx, 'Role deleted.');
      }
      if (scope === 'settings' && action === 'roles' && p1 === 'edit') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_roles'))) return ctx.answerCbQuery('No permission');
        const role = await roleService.getRoleById(p2);
        if (!role) return safeEditOrReply(ctx, 'Role not found.');
        startFlow(ctx, 'edit_role_permissions', 'select', { roleId: role._id, permissions: [...role.permissions] });
        const rows = roleService.DEFAULT_PERMISSIONS.map((perm) => [Markup.button.callback(`${role.permissions.includes(perm) ? '✅' : '⬜'} ${perm}`, callback(['settings', 'roleperm', role._id, perm]))]);
        rows.push([Markup.button.callback('💾 Save', callback(['settings', 'roleperm_save', role._id]))]);
        return renderPanel(ctx, `Select permissions for ${role.name}:`, { reply_markup: { inline_keyboard: rows } });
      }
      if (scope === 'settings' && action === 'roleperm') {
        const [,,,, perm] = data.split(':');
        const role = await roleService.getRoleById(p2);
        if (!role) return safeEditOrReply(ctx, 'Role not found.');
        role.permissions = role.permissions.includes(perm) ? role.permissions.filter((x) => x !== perm) : [...role.permissions, perm];
        await role.save();
        const rows = roleService.DEFAULT_PERMISSIONS.map((p) => [Markup.button.callback(`${role.permissions.includes(p) ? '✅' : '⬜'} ${p}`, callback(['settings', 'roleperm', role._id, p]))]);
        rows.push([Markup.button.callback('💾 Save', callback(['settings', 'roleperm_save', role._id]))]);
        return renderPanel(ctx, `Select permissions for ${role.name}:`, { reply_markup: { inline_keyboard: rows } });
      }
      if (scope === 'settings' && action === 'roleperm_save') return safeEditOrReply(ctx, 'Permissions saved.');
      if (scope === 'settings' && action === 'room' && p1 === 'create') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_rooms'))) return ctx.answerCbQuery('No permission');
        startFlow(ctx, 'add_room', 'room');
        return safeEditOrReply(ctx, 'Enter room number.');
      }
      if (scope === 'settings' && action === 'room' && p1 === 'bulk') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_rooms'))) return ctx.answerCbQuery('No permission');
        startFlow(ctx, 'bulk_create_rooms', 'prefix', {});
        return safeEditOrReply(ctx, 'Enter room prefix (e.g., A, F).');
      }
      if (scope === 'settings' && action === 'room' && p1 === 'delete') {
        if (!(await adminService.hasPermission(ctx.from.id, 'delete_rooms'))) return ctx.answerCbQuery('No permission');
        return showRoomPickerForSettings(ctx, 'delete', 1);
      }
      if (scope === 'settings' && action === 'room' && p1 === 'photo') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_rooms'))) return ctx.answerCbQuery('No permission');
        return showRoomPickerForSettings(ctx, 'photo', 1);
      }
      if (scope === 'settings' && action === 'room' && p1 === 'edit') {
        if (!(await adminService.hasPermission(ctx.from.id, 'manage_rooms'))) return ctx.answerCbQuery('No permission');
        return showRoomPickerForSettings(ctx, 'edit', 1);
      }
      if (scope === 'settings' && action === 'roompicker') return showRoomPickerForSettings(ctx, p1, Number(p2 || 1));
      if (scope === 'settings' && action === 'roomselect') {
        const [,,, mode, roomId] = data.split(':');
        const room = await roomService.getRoomById(roomId);
        if (!room) return safeEditOrReply(ctx, 'Room not found.');
        if (mode === 'delete') {
          if (room.status === 'rented') return safeEditOrReply(ctx, 'Cannot delete room with active tenant.');
          startFlow(ctx, 'delete_room', 'confirm', { roomId: room._id, roomNumber: room.roomNumber });
          return renderPanel(ctx, `⚠️ Delete Room\n━━━━━━━━━━\nRoom: ${room.roomNumber}\nStatus: ${room.status}\nThis action cannot be undone.`, { reply_markup: { inline_keyboard: [[Markup.button.callback('🗑 Confirm Delete', 'flow:confirmdelete'), Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
        }
        if (mode === 'photo') {
          startFlow(ctx, 'update_room_photo', 'photo', { roomId: room._id });
          return safeEditOrReply(ctx, `Send a new photo for room ${room.roomNumber}.`);
        }
        if (mode === 'edit') {
          startFlow(ctx, 'edit_room', 'field', { roomId: room._id, roomNumber: room.roomNumber });
          return renderPanel(ctx, 'Choose field to edit:', { reply_markup: { inline_keyboard: [[Markup.button.callback('Room Number', 'flow:editroom:roomNumber')], [Markup.button.callback('Rent Price', 'flow:editroom:rentPrice')], [Markup.button.callback('Notes', 'flow:editroom:notes')], [Markup.button.callback('🔙 Back', 'settings:room_mgmt')]] } });
        }
      }
      if (scope === 'settings' && action === 'reminder' && p1 === 'run') {
        if (!(await adminService.hasPermission(ctx.from.id, 'run_reminders'))) return ctx.answerCbQuery('No permission');
        const result = await reminderService.runReminderNow(bot);
        return renderPanel(ctx, `⚡ Reminder Run Complete\n━━━━━━━━━━\nPayments checked: ${result.checked}\n3-day reminders sent: ${result.threeDaysBefore}\nDue today reminders sent: ${result.dueToday}\nOverdue admin alerts sent: ${result.overdue}`);
      }
      if (scope === 'settings' && action === 'reminder' && p1 === 'preview') {
        const preview = await reminderService.previewReminderResults();
        return renderPanel(ctx, `📋 Reminder Preview\n━━━━━━━━━━\n3 days before due: ${preview.threeDaysBefore}\nDue today: ${preview.dueToday}\nOverdue: ${preview.overdue}\n\nWould notify ${preview.wouldNotifyTenants} tenants and ${preview.wouldNotifyAdmins} admin alerts.`);
      }
      if (scope === 'settings' && action === 'reminder' && p1 === 'schedule') {
        return renderPanel(ctx, `⏰ Reminder Schedule\n━━━━━━━━━━\nCron: ${env.reminderCron}\nTimezone: ${env.timezone}\nMeaning: every day at 9:00 AM`);
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

      if (ctx.session.flow === 'rental_request') {
        if (ctx.session.step === 'name') {
          data.fullName = text;
          ctx.session.step = 'phone';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Please enter your phone number.', { reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Cancel', 'flow:cancel')]] } });
        }
        if (ctx.session.step === 'phone') {
          data.phone = text;
          ctx.session.step = 'note';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Any message for the admin? (or tap Skip)', {
            reply_markup: { inline_keyboard: [[Markup.button.callback('⏭ Skip', 'flow:skipnote'), Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
          });
        }
        if (ctx.session.step === 'note') {
          data.note = text;
          ctx.session.step = 'confirm';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, `📝 Rental Request\n━━━━━━━━━━\nRoom: ${data.roomNumber}\nName: ${data.fullName}\nPhone: ${data.phone}\nTelegram: @${ctx.from.username || '-'}\nNote: ${data.note || '-'}`, {
            reply_markup: { inline_keyboard: [[Markup.button.callback('✅ Submit Request', 'flow:submitrequest'), Markup.button.callback('❌ Cancel', 'flow:cancel')]] }
          });
        }
      }

      if (ctx.session.flow === 'create_role') {
        if (ctx.session.step === 'name') {
          data.name = text;
          ctx.session.step = 'description';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter role description (or type SKIP).');
        }
        if (ctx.session.step === 'description') {
          data.description = text.toUpperCase() === 'SKIP' ? '' : text;
          ctx.session.step = 'permissions';
          ctx.session.flowData = data;
          const rows = roleService.DEFAULT_PERMISSIONS.map((perm) => [Markup.button.callback(`⬜ ${perm}`, callback(['flow', 'roleperm', perm]))]);
          rows.push([Markup.button.callback('💾 Save Role', 'flow:saverole')]);
          return renderPanel(ctx, 'Select permissions (tap to toggle):', { reply_markup: { inline_keyboard: rows } });
        }
      }

      if (ctx.session.flow === 'add_admin') {
        if (ctx.session.step === 'username') {
          data.telegramUsername = text.toUpperCase() === 'SKIP' ? null : text.replace('@', '');
          ctx.session.step = 'fullName';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter admin full name (or type SKIP).');
        }
        if (ctx.session.step === 'fullName') {
          data.fullName = text.toUpperCase() === 'SKIP' ? '' : text;
          const roles = await roleService.listRoles();
          const rows = roles.map((r) => [Markup.button.callback(r.name, callback(['flow', 'adminrole', r._id]))]);
          return renderPanel(ctx, 'Choose role:', { reply_markup: { inline_keyboard: rows } });
        }
      }

      if (ctx.session.flow === 'edit_admin_name' && ctx.session.step === 'fullName') {
        await adminService.updateAdmin(ctx.session.flowData.adminId, { fullName: text });
        clearFlow(ctx);
        return safeEditOrReply(ctx, 'Admin name updated successfully.');
      }

      if (ctx.session.flow === 'bulk_create_rooms') {
        if (ctx.session.step === 'prefix') {
          data.prefix = text.toUpperCase();
          ctx.session.step = 'start';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter start number.');
        }
        if (ctx.session.step === 'start') {
          data.start = Number(text);
          ctx.session.step = 'end';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter end number.');
        }
        if (ctx.session.step === 'end') {
          data.end = Number(text);
          ctx.session.step = 'rent';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, 'Enter default rent price.');
        }
        if (ctx.session.step === 'rent') {
          const rentPrice = Number(text);
          let created = 0;
          for (let i = data.start; i <= data.end; i += 1) {
            const roomNumber = `${data.prefix}${String(i).padStart(2, '0')}`;
            try {
              await roomService.addRoom({ roomNumber, rentPrice, notes: '' });
              created += 1;
            } catch (_) {}
          }
          clearFlow(ctx);
          return safeEditOrReply(ctx, `Bulk creation completed. Created ${created} rooms.`);
        }
      }

      if (ctx.session.flow === 'delete_room') {
        if (ctx.session.step === 'roomNumber') {
          const room = await roomService.getRoomByNumber(text);
          if (!room) return safeEditOrReply(ctx, 'Room not found.');
          if (room.status === 'rented') return safeEditOrReply(ctx, 'Cannot delete room with active tenant.');
          data.roomId = room._id;
          data.roomNumber = room.roomNumber;
          ctx.session.step = 'confirm';
          ctx.session.flowData = data;
          return safeEditOrReply(ctx, `⚠️ Delete Room\n━━━━━━━━━━\nRoom: ${room.roomNumber}\nStatus: ${room.status}\nThis action cannot be undone.\nType DELETE to confirm.`);
        }
        if (ctx.session.step === 'confirm') {
          if (text !== 'DELETE') return safeEditOrReply(ctx, 'Type DELETE to confirm.');
          await Room.findByIdAndDelete(data.roomId);
          clearFlow(ctx);
          return safeEditOrReply(ctx, 'Room deleted successfully.');
        }
      }

      if (ctx.session.flow === 'update_room_photo_manual' && ctx.session.step === 'roomNumber') {
        const room = await roomService.getRoomByNumber(text);
        if (!room) return safeEditOrReply(ctx, 'Room not found.');
        ctx.session.flowData.roomId = room._id;
        ctx.session.flow = 'update_room_photo';
        ctx.session.step = 'photo';
        return safeEditOrReply(ctx, `Send a new photo for room ${room.roomNumber}.`);
      }

      if (ctx.session.flow === 'edit_room') {
        if (ctx.session.step === 'roomNumber') {
          const room = await roomService.getRoomByNumber(text);
          if (!room) return safeEditOrReply(ctx, 'Room not found.');
          ctx.session.flowData = { roomId: room._id, roomNumber: room.roomNumber };
          ctx.session.step = 'field';
          return renderPanel(ctx, 'Choose field to edit:', { reply_markup: { inline_keyboard: [[Markup.button.callback('Room Number', 'flow:editroom:roomNumber')], [Markup.button.callback('Rent Price', 'flow:editroom:rentPrice')], [Markup.button.callback('Notes', 'flow:editroom:notes')]] } });
        }
        if (ctx.session.step === 'value') {
          const room = await roomService.getRoomById(ctx.session.flowData.roomId);
          if (ctx.session.flowData.field === 'roomNumber') room.roomNumber = text;
          if (ctx.session.flowData.field === 'rentPrice') room.rentPrice = Number(text);
          if (ctx.session.flowData.field === 'notes') room.notes = text;
          await room.save();
          clearFlow(ctx);
          return safeEditOrReply(ctx, 'Room updated successfully.');
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
