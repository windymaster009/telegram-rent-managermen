const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ['admin', 'tenant', 'guest'], default: 'guest', index: true },
    messageIds: { type: [Number], default: [] },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    lastCleanupAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
