const { Markup } = require('telegraf');

function getAdminMainMenu() {
  return Markup.keyboard([
    ['🏠 Rooms', '💰 Payments'],
    ['📊 Dashboard', '👤 Tenants'],
    ['⚠️ Late Rent', '⚙️ Settings']
  ]).resize();
}

function getTenantMainMenu(isLinked = true) {
  if (!isLinked) {
    return Markup.keyboard([['🔗 Link My Room'], ['📞 Contact Admin']]).resize();
  }
  return Markup.keyboard([
    ['🏠 My Room', '💰 My Payment'],
    ['📞 Contact Admin']
  ]).resize();
}

function getBackKeyboard() {
  return Markup.keyboard([['🔙 Back', '❌ Cancel']]).resize();
}

function getCancelKeyboard() {
  return Markup.keyboard([['❌ Cancel']]).resize();
}

function getRoomsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 All Rooms', 'rooms:list:all:1')],
    [Markup.button.callback('🟢 Free Rooms', 'rooms:list:free:1')],
    [Markup.button.callback('🔴 Rented Rooms', 'rooms:list:rented:1')],
    [Markup.button.callback('🔍 Search Room', 'rooms:search:start')],
    [Markup.button.callback('➕ Add Room', 'rooms:add:start')],
    [Markup.button.callback('🔙 Back', 'menu:admin')]
  ]);
}

function getPaymentsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💵 Record Payment', 'pay:record:start')],
    [Markup.button.callback('📋 Unpaid Payments', 'pay:list:unpaid:1')],
    [Markup.button.callback('⚠️ Overdue Payments', 'pay:list:overdue:1')],
    [Markup.button.callback('📅 Due Soon', 'pay:list:duesoon:1')],
    [Markup.button.callback('🔙 Back', 'menu:admin')]
  ]);
}

function getTenantsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 All Tenants', 'tenant:list:all:1')],
    [Markup.button.callback('🔍 Search Tenant', 'tenant:search:start')],
    [Markup.button.callback('🔗 Unlinked Telegram', 'tenant:list:unlinked:1')],
    [Markup.button.callback('➕ Add Tenant', 'tenant:add:start')],
    [Markup.button.callback('🔙 Back', 'menu:admin')]
  ]);
}

function getSettingsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👮 Admin IDs', 'settings:admins')],
    [Markup.button.callback('🧪 Seed Rooms', 'settings:seed')],
    [Markup.button.callback('🔁 Run Reminder Check', 'settings:reminder')],
    [Markup.button.callback('🔙 Back', 'menu:admin')]
  ]);
}

function getRoomActions(roomId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👤 Assign Tenant', `room:assign:${roomId}`)],
    [Markup.button.callback('🚪 Vacate Room', `room:vacate:${roomId}`)],
    [Markup.button.callback('💵 Record Payment', `pay:record:room:${roomId}`)],
    [Markup.button.callback('📄 Payment History', `pay:history:room:${roomId}:1`)],
    [Markup.button.callback('🔙 Back to Rooms', 'menu:rooms')]
  ]);
}

module.exports = {
  getAdminMainMenu,
  getTenantMainMenu,
  getBackKeyboard,
  getCancelKeyboard,
  getRoomsMenu,
  getPaymentsMenu,
  getTenantsMenu,
  getSettingsMenu,
  getRoomActions
};
