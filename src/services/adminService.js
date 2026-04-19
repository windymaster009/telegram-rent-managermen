const env = require('../config/env');
const AdminAssignment = require('../models/AdminAssignment');
const Role = require('../models/Role');
const { ensureSystemRoles } = require('./roleService');

async function syncEnvAdmins() {
  await ensureSystemRoles();
  const superAdminRole = await Role.findOne({ name: 'Super Admin' });
  for (const id of env.adminTelegramIds) {
    const existing = await AdminAssignment.findOne({ telegramUserId: String(id) });
    if (!existing) {
      await AdminAssignment.create({ telegramUserId: String(id), roleId: superAdminRole._id, addedBy: 'env_sync' });
    }
  }
}

async function listAdmins() {
  await syncEnvAdmins();
  return AdminAssignment.find().populate('roleId').sort({ createdAt: -1 });
}

async function getAdminByTelegramId(telegramUserId) {
  await syncEnvAdmins();
  return AdminAssignment.findOne({ telegramUserId: String(telegramUserId) }).populate('roleId');
}

async function addAdmin(payload) {
  await syncEnvAdmins();
  const telegramUserId = payload.telegramUserId ? String(payload.telegramUserId) : null;
  return AdminAssignment.create({ ...payload, telegramUserId });
}

async function changeRole(adminId, roleId) {
  return AdminAssignment.findByIdAndUpdate(adminId, { roleId }, { new: true }).populate('roleId');
}

async function removeAdmin(adminId) {
  const admins = await listAdmins();
  const target = admins.find((a) => String(a._id) === String(adminId));
  if (!target) throw Object.assign(new Error('Admin not found.'), { status: 404 });
  const superAdmins = admins.filter((a) => a.roleId?.name === 'Super Admin');
  if (target.roleId?.name === 'Super Admin' && superAdmins.length <= 1) {
    throw Object.assign(new Error('Cannot remove the last Super Admin.'), { status: 400 });
  }
  await AdminAssignment.findByIdAndDelete(adminId);
}

async function updateAdmin(adminId, updates) {
  return AdminAssignment.findByIdAndUpdate(adminId, updates, { new: true }).populate('roleId');
}

async function hasPermission(telegramUserId, permission) {
  const admin = await getAdminByTelegramId(telegramUserId);
  if (!admin) return false;
  if (admin.roleId?.name === 'Super Admin') return true;
  return admin.roleId?.permissions?.includes(permission);
}

module.exports = { syncEnvAdmins, listAdmins, getAdminByTelegramId, addAdmin, changeRole, removeAdmin, updateAdmin, hasPermission };
