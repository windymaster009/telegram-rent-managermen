const { Markup } = require('telegraf');

function paginate(items, page = 1, limit = 10) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * limit;
  const data = items.slice(start, start + limit);
  return { data, total, totalPages, currentPage, limit };
}

function pagerButtons(prefix, page, totalPages, extraBack = null) {
  const row = [];
  if (page > 1) row.push(Markup.button.callback('⬅️ Prev', `${prefix}:${page - 1}`));
  if (page < totalPages) row.push(Markup.button.callback('Next ➡️', `${prefix}:${page + 1}`));
  const rows = row.length ? [row] : [];
  if (extraBack) rows.push([Markup.button.callback('🔙 Back', extraBack)]);
  return rows.length ? Markup.inlineKeyboard(rows) : null;
}

module.exports = { paginate, pagerButtons };
