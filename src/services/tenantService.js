const Room = require('../models/Room');
const Tenant = require('../models/Tenant');
const Payment = require('../models/Payment');
const { validatePhone } = require('../utils/validators');
const { addMonth } = require('../utils/date');

async function addTenantToRoom(payload) {
  const { roomNumber, fullName, phone, telegramUsername, telegramChatId, moveInDate, rentPrice } = payload;

  if (!validatePhone(phone)) {
    throw Object.assign(new Error('Invalid phone number format.'), { status: 400 });
  }

  const room = await Room.findOne({ roomNumber });
  if (!room) throw Object.assign(new Error('Room not found.'), { status: 404 });
  if (room.status === 'rented') {
    throw Object.assign(new Error('This room is already rented.'), { status: 400 });
  }

  if (rentPrice && Number.isFinite(Number(rentPrice)) && Number(rentPrice) > 0) {
    room.rentPrice = Number(rentPrice);
  }

  const tenant = await Tenant.create({
    fullName,
    phone,
    telegramUsername: telegramUsername || null,
    telegramChatId: telegramChatId ? String(telegramChatId) : null,
    moveInDate: moveInDate ? new Date(moveInDate) : new Date(),
    roomId: room._id,
    isActive: true
  });

  room.status = 'rented';
  room.tenantId = tenant._id;
  await room.save();

  await Payment.create({
    roomId: room._id,
    tenantId: tenant._id,
    amount: room.rentPrice,
    dueDate: addMonth(new Date(), 1),
    status: 'unpaid'
  });

  return tenant;
}

async function linkTenantTelegram({ roomNumber, phone, chatId, telegramUsername }) {
  const room = await Room.findOne({ roomNumber });
  if (!room || !room.tenantId) {
    throw Object.assign(new Error('No active tenant found for this room.'), { status: 404 });
  }

  const tenant = await Tenant.findOne({ _id: room.tenantId, phone, isActive: true });
  if (!tenant) {
    throw Object.assign(new Error('Verification failed. Check room number/phone.'), { status: 404 });
  }

  tenant.telegramChatId = String(chatId);
  tenant.telegramUsername = telegramUsername || tenant.telegramUsername;
  await tenant.save();
  return tenant;
}

async function getTenantByChatId(chatId) {
  return Tenant.findOne({ telegramChatId: String(chatId), isActive: true }).populate('roomId');
}

async function findTenantsWithoutTelegramLink() {
  return Tenant.find({ isActive: true, $or: [{ telegramChatId: null }, { telegramChatId: '' }] }).populate('roomId');
}

async function listTenants(filter = {}) {
  return Tenant.find({ isActive: true, ...filter }).populate('roomId').sort({ fullName: 1 });
}

async function searchTenants(term) {
  return Tenant.find({
    isActive: true,
    $or: [{ fullName: { $regex: term, $options: 'i' } }, { phone: { $regex: term, $options: 'i' } }]
  }).populate('roomId');
}

async function getTenantById(id) {
  return Tenant.findById(id).populate('roomId');
}

async function updateTenant(tenantId, data) {
  if (data.phone && !validatePhone(data.phone)) {
    throw Object.assign(new Error('Invalid phone number format.'), { status: 400 });
  }
  return Tenant.findByIdAndUpdate(tenantId, data, { new: true }).populate('roomId');
}

async function vacateTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw Object.assign(new Error('Tenant not found.'), { status: 404 });
  tenant.isActive = false;
  await tenant.save();
  await Room.findByIdAndUpdate(tenant.roomId, { status: 'free', tenantId: null });
  return tenant;
}

module.exports = {
  addTenantToRoom,
  linkTenantTelegram,
  getTenantByChatId,
  findTenantsWithoutTelegramLink,
  listTenants,
  searchTenants,
  getTenantById,
  updateTenant,
  vacateTenant
};
