const dayjs = require('dayjs');
const Room = require('../models/Room');
const Payment = require('../models/Payment');
const { formatDate } = require('../utils/date');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount) {
  return Number(amount || 0).toFixed(2);
}

async function getDashboardReportRows() {
  const rooms = await Room.find().populate('tenantId').sort({ roomNumber: 1 });
  const payments = await Payment.find().populate('tenantId roomId').sort({ dueDate: -1, createdAt: -1 });
  const paymentByRoomId = new Map();

  for (const payment of payments) {
    const roomId = String(payment.roomId?._id || payment.roomId);
    if (roomId && !paymentByRoomId.has(roomId)) {
      paymentByRoomId.set(roomId, payment);
    }
  }

  return rooms.map((room) => {
    const payment = paymentByRoomId.get(String(room._id));
    const isPaid = payment?.status === 'paid';
    const amountPaid = isPaid ? Number(payment.amount || 0) : 0;
    const balance = room.status === 'rented' ? Math.max(Number(room.rentPrice || 0) - amountPaid, 0) : 0;

    return {
      roomNumber: room.roomNumber,
      status: room.status === 'rented' ? 'Rented' : 'Free',
      tenantName: room.tenantId?.fullName || '-',
      rentAmount: formatCurrency(room.rentPrice),
      dueDate: payment?.dueDate ? formatDate(payment.dueDate) : '-',
      amountPaid: formatCurrency(amountPaid),
      balance: formatCurrency(balance),
      paymentStatus: payment?.status ? payment.status[0].toUpperCase() + payment.status.slice(1) : '-'
    };
  });
}

async function buildDashboardReport({ requestedBy }) {
  const rows = await getDashboardReportRows();
  const requestedAt = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const tableRows = rows.map((row) => {
    const statusBadge = row.status === 'Rented' ? '🔴 Rented' : '🟢 Free';
    const paymentBadge = row.paymentStatus === 'Paid'
      ? '✅ Paid'
      : row.paymentStatus === 'Unpaid'
        ? '🟡 Unpaid'
        : row.paymentStatus === 'Overdue'
          ? '🔴 Overdue'
          : '—';

    return `
      <tr>
        <td>${escapeHtml(row.roomNumber)}</td>
        <td>${escapeHtml(statusBadge)}</td>
        <td>${escapeHtml(row.tenantName)}</td>
        <td>$${escapeHtml(row.rentAmount)}</td>
        <td>${escapeHtml(row.dueDate)}</td>
        <td>$${escapeHtml(row.amountPaid)}</td>
        <td>$${escapeHtml(row.balance)}</td>
        <td>${escapeHtml(paymentBadge)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Arial, sans-serif; color: #111827; }
      .title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
      .meta { margin-bottom: 4px; }
      table { border-collapse: collapse; width: 100%; margin-top: 18px; }
      th, td { border: 1px solid #d1d5db; padding: 10px 12px; text-align: left; vertical-align: top; }
      th { background: #111827; color: #ffffff; font-weight: 700; }
      tr:nth-child(even) td { background: #f9fafb; }
    </style>
  </head>
  <body>
    <div class="title">Red House Rent</div>
    <div class="meta"><strong>Downloaded at:</strong> ${escapeHtml(requestedAt)}</div>
    <div class="meta"><strong>Requested by:</strong> ${escapeHtml(requestedBy)}</div>

    <table>
      <thead>
        <tr>
          <th>Room No.</th>
          <th>Status</th>
          <th>Tenant Name</th>
          <th>Rent Amount</th>
          <th>Due Date</th>
          <th>Amount Paid</th>
          <th>Balance</th>
          <th>Payment Status</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </body>
</html>`;

  return {
    buffer: Buffer.from(html, 'utf8'),
    filename: `red-house-rent-${dayjs().format('YYYY-MM-DD')}.xls`
  };
}

module.exports = { buildDashboardReport };
