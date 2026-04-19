const { Markup } = require('telegraf');

function getSettingsMainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👮 Admin & Roles', 'settings:admins_roles')],
    [Markup.button.callback('🏗 Room Management', 'settings:room_mgmt')],
    [Markup.button.callback('🔔 Reminder Tools', 'settings:reminder_tools')],
    [Markup.button.callback('🔙 Back', 'panel:home')]
  ]);
}

function getAdminRolesMenu(canManage = true) {
  const rows = [
    [Markup.button.callback('👤 View Admins', 'settings:admins:list')],
    [Markup.button.callback('🪪 View Roles', 'settings:roles:list')]
  ];
  if (canManage) {
    rows.push([Markup.button.callback('➕ Add Admin', 'settings:admins:add')]);
    rows.push([Markup.button.callback('➕ Create Role', 'settings:roles:create')]);
  }
  rows.push([Markup.button.callback('🔙 Back', 'panel:settings')]);
  return Markup.inlineKeyboard(rows);
}

function getRoomManagementMenu(canManageRooms = true, canDeleteRooms = false) {
  const rows = [];
  if (canManageRooms) {
    rows.push([Markup.button.callback('➕ Create Room', 'settings:room:create')]);
    rows.push([Markup.button.callback('✏️ Edit Room', 'settings:room:edit')]);
    rows.push([Markup.button.callback('🖼 Update Room Photo', 'settings:room:photo')]);
    rows.push([Markup.button.callback('🌱 Bulk Create Rooms', 'settings:room:bulk')]);
  }
  if (canDeleteRooms) rows.push([Markup.button.callback('🗑 Delete Room', 'settings:room:delete')]);
  rows.push([Markup.button.callback('🔙 Back', 'panel:settings')]);
  return Markup.inlineKeyboard(rows);
}

function getReminderToolsMenu(canRun = true) {
  const rows = [];
  if (canRun) rows.push([Markup.button.callback('⚡ Run Payment Reminder Now', 'settings:reminder:run')]);
  rows.push([Markup.button.callback('📋 Preview Reminder Results', 'settings:reminder:preview')]);
  rows.push([Markup.button.callback('⏰ Reminder Schedule', 'settings:reminder:schedule')]);
  rows.push([Markup.button.callback('🔙 Back', 'panel:settings')]);
  return Markup.inlineKeyboard(rows);
}

module.exports = { getSettingsMainMenu, getAdminRolesMenu, getRoomManagementMenu, getReminderToolsMenu };
