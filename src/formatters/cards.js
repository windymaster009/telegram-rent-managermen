const dayjs = require('dayjs');
const { formatDate, daysBetween } = require('../utils/date');
const { formatMoney } = require('../utils/format');

function getSectionHeader(title, emoji) {
  return `${emoji} ${title}\n━━━━━━━━━━`;
}

function formatRoomCard(room, tenant, payment) {
  const lines = [
    getSectionHeader(`Room ${room.roomNumber}`, '🏠'),
    `Status: ${room.status === 'rented' ? '🔴 Rented' : '🟢 Free'}`,
    `Rent: ${formatMoney(room.rentPrice)}`
  ];

  if (tenant) {
    lines.push('', '👤 Tenant', `Name: ${tenant.fullName}`, `Phone: ${tenant.phone || '-'}`);
    lines.push('', '📅 Stay info', `Move-in: ${formatDate(tenant.moveInDate)}`, `Days stayed: ${daysBetween(tenant.moveInDate)}`);
  }

  if (payment && tenant) {
    lines.push('', '💳 Payment', `Status: ${payment.status}`, `Due date: ${formatDate(payment.dueDate)}`);
  }

  return lines.join('\n');
}

function formatTenantRoomCard(room, tenant, payment) {
  return [
    getSectionHeader('My Room', '🏠'),
    `Room: ${room.roomNumber}`,
    `Status: ${room.status === 'rented' ? '🔴 Rented' : '🟢 Available'}`,
    `Rent: ${formatMoney(room.rentPrice)}`,
    '',
    '📅 Stay Info',
    `Move-in: ${formatDate(tenant.moveInDate)}`,
    `Days stayed: ${daysBetween(tenant.moveInDate)}`,
    '',
    '💳 Current Payment',
    `Status: ${payment?.status || '-'}`,
    `Due date: ${payment ? formatDate(payment.dueDate) : '-'}`
  ].join('\n');
}

function formatGuestRoomCard(room) {
  return [
    getSectionHeader(`Room ${room.roomNumber}`, '🏠'),
    'Status: 🟢 Available',
    `Rent: ${formatMoney(room.rentPrice)}`,
    '',
    '📝 Details',
    `Room number: ${room.roomNumber}`,
    'Availability: Ready to rent',
    room.notes ? `Notes: ${room.notes}` : null
  ].filter(Boolean).join('\n');
}

function formatRentalRequestCard(request) {
  return [
    getSectionHeader('Rental Request', '📝'),
    `Room: ${request.roomNumber}`,
    `Name: ${request.fullName}`,
    `Phone: ${request.phone}`,
    `Telegram: ${request.telegramUsername ? `@${request.telegramUsername}` : 'No username'}`,
    `Requested at: ${formatDate(request.createdAt)}`,
    `Note: ${request.note || '-'}`,
    `Status: ${request.status}`
  ].join('\n');
}

function formatPaymentCard(payment) {
  return [
    getSectionHeader('Payment Details', '💳'),
    `Room: ${payment.roomId?.roomNumber || '-'}`,
    `Tenant: ${payment.tenantId?.fullName || '-'}`,
    `Amount: ${formatMoney(payment.amount)}`,
    `Status: ${payment.status}`,
    `Due: ${formatDate(payment.dueDate)}`
  ].join('\n');
}

function formatTenantCard(tenant, room, payment) {
  const lines = [
    getSectionHeader('Tenant Details', '👤'),
    `Name: ${tenant.fullName}`,
    `Phone: ${tenant.phone}`,
    `Room: ${room?.roomNumber || '-'}`,
    `Telegram: ${tenant.telegramChatId ? 'Linked ✅' : 'Not linked ❌'}`,
    `Move-in: ${formatDate(tenant.moveInDate)}`,
    `Days stayed: ${daysBetween(tenant.moveInDate)}`
  ];

  if (payment) {
    const overdueDays = payment.status === 'overdue' ? dayjs().diff(dayjs(payment.dueDate), 'day') : 0;
    lines.push('', '💳 Current Payment', `Status: ${payment.status}`, `Due: ${formatDate(payment.dueDate)}`, `Overdue days: ${overdueDays}`);
  }

  return lines.join('\n');
}

function formatDashboardCard(stats) {
  return [
    getSectionHeader('Dashboard', '📊'),
    '🏠 Rooms',
    `• Total: ${stats.totalRooms}`,
    `• Free: ${stats.freeRooms}`,
    `• Rented: ${stats.rentedRooms}`,
    '',
    '💳 Payments',
    `• Unpaid: ${stats.unpaidPayments}`,
    `• Overdue: ${stats.overduePayments}`,
    `• Due soon: ${stats.dueSoon}`,
    '',
    '💰 Revenue',
    `• Expected: ${formatMoney(stats.totalExpectedIncomeThisMonth)}`,
    `• Collected: ${formatMoney(stats.totalCollectedThisMonth)}`
  ].join('\n');
}

module.exports = {
  formatRoomCard,
  formatTenantRoomCard,
  formatGuestRoomCard,
  formatRentalRequestCard,
  formatPaymentCard,
  formatTenantCard,
  formatDashboardCard,
  getSectionHeader
};
