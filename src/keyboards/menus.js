const { Markup } = require('telegraf');

const MAP_URL = 'https://maps.app.goo.gl/GTdhzz28un6G98qT9';

function getAdminMainMenu() {
  return Markup.keyboard([
    ['🏠 Rooms', '💳 Payments'],
    ['📊 Dashboard', '👥 Tenants'],
    ['📨 Requests', '⚠️ Late Rent'],
    ['⚙️ Settings']
  ]).resize();
}

function getTenantMainMenu(isLinked = true) {
  if (!isLinked) {
    return Markup.keyboard([
      ['🔗 Link My Room'],
      ['📍 View Location', '📞 Contact Admin']
    ]).resize();
  }
  return Markup.keyboard([
    ['🏠 My Room', '💳 My Payment'],
    ['📍 View Location', '📞 Contact Admin']
  ]).resize();
}

function getGuestMainMenu() {
  return Markup.keyboard([
    ['📝 Register My Room', '🔎 Check Rooms to Rent'],
    ['📍 View Location', '📞 Contact Admin']
  ]).resize();
}

function getRoomsMenu({ totalRooms = 0, freeRooms = 0, rentedRooms = 0 } = {}) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`📋 All Rooms (${totalRooms})`, 'rooms:list:all:1')],
    [Markup.button.callback(`🟢 Free (${freeRooms})`, 'rooms:list:free:1'), Markup.button.callback(`🔴 Rented (${rentedRooms})`, 'rooms:list:rented:1')],
    [Markup.button.callback('🔍 Search by No.', 'rooms:search:start')],
    [Markup.button.callback('🔙 Back to Main', 'panel:home')]
  ]);
}

function getPaymentsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Record Payment', 'pay:record:start')],
    [Markup.button.callback('📋 Unpaid', 'pay:list:unpaid:1'), Markup.button.callback('⚠️ Overdue', 'pay:list:overdue:1')],
    [Markup.button.callback('⏰ Due Soon', 'pay:list:duesoon:1')],
    [Markup.button.callback('🔙 Back', 'panel:home')]
  ]);
}

function getTenantsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 All', 'tenant:list:all:1'), Markup.button.callback('🔎 Search', 'tenant:search:start')],
    [Markup.button.callback('🔗 Unlinked', 'tenant:list:unlinked:1'), Markup.button.callback('➕ Add', 'tenant:add:start')],
    [Markup.button.callback('🔙 Back', 'panel:home')]
  ]);
}

function getSettingsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👮 Admin IDs', 'settings:admins')],
    [Markup.button.callback('🌱 Seed Rooms', 'settings:seed')],
    [Markup.button.callback('🔔 Run Reminder Check', 'settings:reminder')],
    [Markup.button.callback('🔙 Back', 'panel:home')]
  ]);
}

function getRoomActions(roomId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👤 Assign', `room:assign:${roomId}`), Markup.button.callback('🚪 Vacate', `room:vacate:${roomId}`)],
    [Markup.button.callback('💳 Pay', `pay:record:room:${roomId}`), Markup.button.callback('🧾 History', `pay:history:${roomId}:1`)],
    [Markup.button.callback('🖼 Photo', `room:photo:${roomId}`), Markup.button.callback('🔙 Rooms', 'panel:rooms')]
  ]);
}

function getRequestMenu({ pendingCount = 0, approvedCount = 0, rejectedCount = 0 } = {}) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`🕒 PENDING REQUESTS (${pendingCount})`, 'request:list:pending:1')],
    [Markup.button.callback(`✅ APPROVED (${approvedCount})`, 'request:list:approved:1'), Markup.button.callback(`❌ REJECTED (${rejectedCount})`, 'request:list:rejected:1')],
    [Markup.button.callback('🔙 Back to Dashboard', 'panel:home')]
  ]);
}

module.exports = {
  getAdminMainMenu,
  getTenantMainMenu,
  getGuestMainMenu,
  getRoomsMenu,
  getPaymentsMenu,
  getTenantsMenu,
  getSettingsMenu,
  getRoomActions,
  getRequestMenu
};
