const mongoose = require('mongoose');

const adminAssignmentSchema = new mongoose.Schema(
  {
    telegramUserId: { type: String, default: null, unique: true, sparse: true, index: true },
    fullName: { type: String, default: '' },
    telegramUsername: { type: String, default: null },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    addedBy: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminAssignment', adminAssignmentSchema);
