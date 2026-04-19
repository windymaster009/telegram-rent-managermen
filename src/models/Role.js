const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, default: '' },
    permissions: { type: [String], default: [] },
    isSystemRole: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', roleSchema);
