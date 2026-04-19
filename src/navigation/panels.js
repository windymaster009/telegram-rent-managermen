const { Markup } = require('telegraf');

function chunkTwoColumns(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

function getPaginationRow(prefix, page, totalPages) {
  return [
    Markup.button.callback('⬅️ Prev', `${prefix}:${Math.max(1, page - 1)}`),
    Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'),
    Markup.button.callback('Next ➡️', `${prefix}:${Math.min(totalPages, page + 1)}`)
  ];
}

module.exports = { chunkTwoColumns, getPaginationRow };
