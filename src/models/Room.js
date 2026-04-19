const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    roomNumber: { type: String, required: true, unique: true, trim: true, index: true },
    status: { type: String, enum: ['free', 'rented'], default: 'free', index: true },
    rentPrice: { type: Number, required: true, min: 0 },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
    notes: { type: String, default: '' },
    photoFileId: { type: String, default: null },
    photoUrl: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);
