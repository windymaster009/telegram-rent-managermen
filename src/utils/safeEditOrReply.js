async function safeEditOrReply(ctx, text, extra = {}) {
  if (ctx.updateType === 'callback_query') {
    const callbackChatId = ctx.update?.callback_query?.message?.chat?.id;
    const callbackMessageId = ctx.update?.callback_query?.message?.message_id;

    if (callbackChatId && callbackMessageId) {
      try {
        await ctx.telegram.deleteMessage(callbackChatId, Number(callbackMessageId));
      } catch (_) {}

      if (
        ctx.session?.activePanelChatId &&
        ctx.session?.activePanelMessageId &&
        String(ctx.session.activePanelChatId) === String(callbackChatId) &&
        String(ctx.session.activePanelMessageId) === String(callbackMessageId)
      ) {
        ctx.session.activePanelChatId = null;
        ctx.session.activePanelMessageId = null;
        ctx.session.activePanelKind = null;
      }
    }
  }

  return ctx.reply(text, extra);
}

module.exports = { safeEditOrReply };
