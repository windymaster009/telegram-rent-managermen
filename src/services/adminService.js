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

async function getAdminByUsername(username) {
  await syncEnvAdmins();
  const cleanUsername = username ? String(username).replace(/^@/, '').trim() : '';
  if (!cleanUsername) return null;
  return AdminAssignment.findOne({ telegramUsername: new RegExp(`^${cleanUsername}$`, 'i') }).populate('roleId');
}

async function getAdminByTelegramId(telegramUserId) {
  await syncEnvAdmins();
  return AdminAssignment.findOne({ telegramUserId: String(telegramUserId) }).populate('roleId');
}

async function syncAdminIdentity(actor = {}) {
  await syncEnvAdmins();

  const telegramUserId = actor.id ? String(actor.id) : null;
  const cleanUsername = actor.username ? String(actor.username).replace(/^@/, '').trim() : '';

  if (telegramUserId) {
    const existingById = await AdminAssignment.findOne({ telegramUserId }).populate('roleId');
    if (existingById) {
      if (cleanUsername && existingById.telegramUsername !== cleanUsername) {
        existingById.telegramUsername = cleanUsername;
        await existingById.save();
      }
      return existingById;
    }
  }

  if (!cleanUsername) return null;

  const existingByUsername = await AdminAssignment.findOne({
    telegramUsername: new RegExp(`^${cleanUsername}$`, 'i')
  }).populate('roleId');

  if (!existingByUsername) return null;
  if (existingByUsername.telegramUserId && existingByUsername.telegramUserId !== telegramUserId) return null;

  if (telegramUserId && existingByUsername.telegramUserId !== telegramUserId) {
    existingByUsername.telegramUserId = telegramUserId;
  }
  if (existingByUsername.telegramUsername !== cleanUsername) {
    existingByUsername.telegramUsername = cleanUsername;
  }
  await existingByUsername.save();
  return existingByUsername;
}

async function addAdmin(payload) {
  await syncEnvAdmins();
  const doc = {
    ...payload,
    telegramUsername: payload.telegramUsername ? String(payload.telegramUsername).replace(/^@/, '') : null
  };

  if (payload.telegramUserId) {
    doc.telegramUserId = String(payload.telegramUserId);
  } else {
    delete doc.telegramUserId;
  }

  return AdminAssignment.create(doc);
}

async function changeRole(adminId, roleId) {
  return AdminAssignment.findByIdAndUpdate(adminId, { roleId }, { new: true }).populate('roleId');
}

async function removeAdmin(adminId) {
  const admins = await listAdmins();
  const target = admins.find((a) => String(a._id) === String(adminId));
  if (!target) throw Object.assign(new Error('Admin not found.'), { status: 404 });
  if (target.telegramUserId && env.adminTelegramIds.includes(Number(target.telegramUserId))) {
    throw Object.assign(new Error('This is the Developer of this bot. You can not delete him.'), { status: 403 });
  }
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

function isDeveloperAdmin(admin) {
  return Boolean(admin?.telegramUserId && env.adminTelegramIds.includes(Number(admin.telegramUserId)));
}

async function getRandomContactAdmin() {
  const admins = await listAdmins();
  const contactableAdmins = admins
    .filter((admin) => admin.roleId?.name === 'Staff' && (admin.telegramUsername || admin.telegramUserId))
    .map((admin) => {
      const cleanUsername = admin.telegramUsername ? String(admin.telegramUsername).replace(/^@/, '') : null;
      const labelName = admin.fullName || (cleanUsername ? `@${cleanUsername}` : 'Staff');
      const roleName = admin.roleId?.name || 'Staff';

      if (cleanUsername) {
        return {
          label: `${labelName} • ${roleName}`,
          url: `https://t.me/${cleanUsername}`
        };
      }

      return {
        label: `${labelName} • ${roleName}`,
        url: `tg://user?id=${admin.telegramUserId}`
      };
    });

  if (!contactableAdmins.length) return null;
  return contactableAdmins[Math.floor(Math.random() * contactableAdmins.length)];
}

module.exports = { syncEnvAdmins, listAdmins, getAdminByUsername, getAdminByTelegramId, syncAdminIdentity, addAdmin, changeRole, removeAdmin, updateAdmin, hasPermission, isDeveloperAdmin, getRandomContactAdmin };
