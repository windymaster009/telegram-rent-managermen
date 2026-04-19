const mongoose = require('mongoose');

const reminderLogSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['three_days_before', 'due_date', 'overdue_admin_notify'], required: true },
    sentAt: { type: Date, default: Date.now },
    target: { type: String, enum: ['tenant', 'admin'], required: true },
    success: { type: Boolean, default: true },
    message: { type: String, default: '' }
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true, index: true },
    paidDate: { type: Date, default: null },
    status: { type: String, enum: ['paid', 'unpaid', 'overdue'], default: 'unpaid', index: true },
    remindedThreeDaysBefore: { type: Boolean, default: false },
    remindedOnDueDate: { type: Boolean, default: false },
    reminderLog: { type: [reminderLogSchema], default: [] }
  },
  { timestamps: true }
);

paymentSchema.index({ roomId: 1, dueDate: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
