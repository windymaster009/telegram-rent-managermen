const RentalRequest = require('../models/RentalRequest');
const Room = require('../models/Room');

async function createRentalRequest(payload) {
  const room = await Room.findById(payload.roomId);
  if (!room || room.status !== 'free') throw Object.assign(new Error('Room is not available.'), { status: 400 });

  const existing = await RentalRequest.findOne({
    roomId: room._id,
    telegramUserId: String(payload.telegramUserId),
    status: 'pending'
  });
  if (existing) throw Object.assign(new Error('You already have a pending request for this room.'), { status: 400 });

  return RentalRequest.create({
    ...payload,
    roomNumber: room.roomNumber,
    roomId: room._id,
    telegramUserId: String(payload.telegramUserId),
    telegramChatId: String(payload.telegramChatId)
  });
}

async function listRequests(status = 'pending') {
  return RentalRequest.find({ status }).sort({ createdAt: -1 }).populate('roomId');
}

async function getRequestById(id) {
  return RentalRequest.findById(id).populate('roomId');
}

async function updateRequestStatus(id, status, handledBy = null) {
  return RentalRequest.findByIdAndUpdate(id, { status, handledBy }, { new: true }).populate('roomId');
}

module.exports = { createRentalRequest, listRequests, getRequestById, updateRequestStatus };
