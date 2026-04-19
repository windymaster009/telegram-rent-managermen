const dayjs = require('dayjs');

function formatDate(date) {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

function daysBetween(start, end = new Date()) {
  return dayjs(end).startOf('day').diff(dayjs(start).startOf('day'), 'day');
}

function startOfCurrentMonth() {
  return dayjs().startOf('month').toDate();
}

function endOfCurrentMonth() {
  return dayjs().endOf('month').toDate();
}

function addMonth(date, count = 1) {
  return dayjs(date).add(count, 'month').toDate();
}

module.exports = {
  formatDate,
  daysBetween,
  startOfCurrentMonth,
  endOfCurrentMonth,
  addMonth
};
