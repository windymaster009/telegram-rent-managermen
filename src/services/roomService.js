const Room = require('../models/Room');
const Tenant = require('../models/Tenant');
const { validateRoomNumber } = require('../utils/validators');

async function addRoom({ roomNumber, rentPrice, notes = '', photoFileId = null, photoUrl = null }) {
  if (!validateRoomNumber(roomNumber)) {
    throw Object.assign(new Error('Invalid room number format.'), { status: 400 });
  }
  if (!Number.isFinite(Number(rentPrice)) || Number(rentPrice) <= 0) {
    throw Object.assign(new Error('Rent price must be a positive number.'), { status: 400 });
  }
  return Room.create({ roomNumber: roomNumber.trim(), rentPrice: Number(rentPrice), notes, photoFileId, photoUrl });
}

async function listRooms(filter = {}) {
  return Room.find(filter).populate('tenantId').sort({ roomNumber: 1 });
}

async function getRoomByNumber(roomNumber) {
  return Room.findOne({ roomNumber }).populate('tenantId');
}

async function getRoomById(roomId) {
  return Room.findById(roomId).populate('tenantId');
}

async function searchRooms(term) {
  return Room.find({ roomNumber: { $regex: term, $options: 'i' } }).populate('tenantId').sort({ roomNumber: 1 });
}

async function vacateRoomById(roomId) {
  const room = await Room.findById(roomId);
  if (!room) throw Object.assign(new Error('Room not found.'), { status: 404 });
  if (room.tenantId) await Tenant.findByIdAndUpdate(room.tenantId, { isActive: false });
  room.status = 'free';
  room.tenantId = null;
  await room.save();
  return room;
}

async function vacateRoom(roomNumber) {
  const room = await Room.findOne({ roomNumber });
  if (!room) throw Object.assign(new Error('Room not found.'), { status: 404 });
  return vacateRoomById(room._id);
}

async function updateRoomPhoto(roomId, { photoFileId = null, photoUrl = null }) {
  const room = await Room.findById(roomId);
  if (!room) throw Object.assign(new Error('Room not found.'), { status: 404 });
  room.photoFileId = photoFileId || null;
  room.photoUrl = photoUrl || room.photoUrl || null;
  await room.save();
  return room;
}

async function dashboardSummary(paymentStats) {
  const [totalRooms, freeRooms, rentedRooms] = await Promise.all([
    Room.countDocuments(),
    Room.countDocuments({ status: 'free' }),
    Room.countDocuments({ status: 'rented' })
  ]);

  return {
    totalRooms,
    freeRooms,
    rentedRooms,
    ...paymentStats
  };
}

module.exports = {
  addRoom,
  listRooms,
  getRoomByNumber,
  getRoomById,
  searchRooms,
  vacateRoom,
  vacateRoomById,
  updateRoomPhoto,
  dashboardSummary
};
