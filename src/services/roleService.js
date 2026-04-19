const Role = require('../models/Role');

const DEFAULT_PERMISSIONS = [
  'view_rooms', 'manage_rooms', 'delete_rooms', 'view_tenants', 'manage_tenants',
  'view_payments', 'manage_payments', 'approve_requests', 'manage_admins',
  'manage_roles', 'run_reminders', 'view_dashboard'
];

const SYSTEM_ROLE_DEFINITIONS = [
  {
    name: 'Super Admin',
    description: 'Full access',
    permissions: DEFAULT_PERMISSIONS
  },
  {
    name: 'Manager',
    description: 'Operational manager',
    permissions: [
      'view_rooms',
      'manage_rooms',
      'view_tenants',
      'manage_tenants',
      'view_payments',
      'manage_payments',
      'approve_requests',
      'view_dashboard'
    ]
  },
  {
    name: 'Staff',
    description: 'Limited access',
    permissions: ['view_rooms', 'view_tenants', 'view_payments', 'view_dashboard']
  }
];

async function ensureSystemRoles() {
  for (const definition of SYSTEM_ROLE_DEFINITIONS) {
    const existingRole = await Role.findOne({ name: definition.name });
    if (!existingRole) {
      await Role.create({
        name: definition.name,
        description: definition.description,
        permissions: definition.permissions,
        isSystemRole: true
      });
      continue;
    }

    existingRole.description = definition.description;
    existingRole.permissions = definition.permissions;
    existingRole.isSystemRole = true;
    await existingRole.save();
  }
}

async function listRoles() {
  return Role.find().sort({ name: 1 });
}

async function getRoleById(roleId) {
  return Role.findById(roleId);
}

async function createRole(payload) {
  return Role.create(payload);
}

async function deleteRole(roleId) {
  const role = await Role.findById(roleId);
  if (!role) throw Object.assign(new Error('Role not found.'), { status: 404 });
  if (role.isSystemRole) throw Object.assign(new Error('System role cannot be deleted.'), { status: 400 });
  await role.deleteOne();
}

module.exports = { DEFAULT_PERMISSIONS, ensureSystemRoles, listRoles, getRoleById, createRole, deleteRole };
