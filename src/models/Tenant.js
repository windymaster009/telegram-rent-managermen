const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    telegramUsername: { type: String, default: null, trim: true },
    telegramChatId: { type: String, default: null, index: true },
    moveInDate: { type: Date, required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tenant', tenantSchema);
