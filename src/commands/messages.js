const { formatDate, daysBetween } = require('../utils/date');
const { formatMoney } = require('../utils/format');

function roomSummary(room) {
  const tenant = room.tenantId;
  return `🏠 Room ${room.roomNumber}\nStatus: ${room.status}\nRent: ${formatMoney(room.rentPrice)}\nTenant: ${tenant ? tenant.fullName : '-'}${tenant?.moveInDate ? `\nDays stayed: ${daysBetween(tenant.moveInDate)} days` : ''}`;
}

function paymentSummary(payment) {
  if (!payment) return 'No active payment record found.';
  return `💳 Room ${payment.roomId?.roomNumber || '-'}\nAmount: ${formatMoney(payment.amount)}\nDue: ${formatDate(payment.dueDate)}\nStatus: ${payment.status}\nPaid date: ${formatDate(payment.paidDate)}`;
}

module.exports = { roomSummary, paymentSummary };
