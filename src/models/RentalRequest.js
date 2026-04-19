const mongoose = require('mongoose');

const rentalRequestSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    roomNumber: { type: String, required: true, index: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    telegramUserId: { type: String, required: true, index: true },
    telegramUsername: { type: String, default: null },
    telegramChatId: { type: String, required: true },
    note: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'contacted'], default: 'pending', index: true },
    adminNote: { type: String, default: '' },
    handledBy: { type: String, default: null }
  },
  { timestamps: true }
);

rentalRequestSchema.index({ roomId: 1, telegramUserId: 1, status: 1 });

module.exports = mongoose.model('RentalRequest', rentalRequestSchema);
