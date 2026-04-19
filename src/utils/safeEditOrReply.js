async function safeEditOrReply(ctx, text, extra = {}) {
  try {
    if (ctx.updateType === 'callback_query') {
      return await ctx.editMessageText(text, extra);
    }
  } catch (_) {
    // fallback to reply
  }
  return ctx.reply(text, extra);
}

module.exports = { safeEditOrReply };
