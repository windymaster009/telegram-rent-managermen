async function clearActivePanel(ctx) {
  const chatId = ctx.session.activePanelChatId;
  const messageId = ctx.session.activePanelMessageId;
  if (!chatId || !messageId) return;
  try {
    await ctx.telegram.deleteMessage(chatId, Number(messageId));
  } catch (_) {}
  ctx.session.activePanelChatId = null;
  ctx.session.activePanelMessageId = null;
  ctx.session.activePanelKind = null;
}

async function replaceActivePanel(ctx, renderFn) {
  try {
    return await renderFn();
  } catch (error) {
    try { await clearActivePanel(ctx); } catch (_) {}
    return renderFn();
  }
}

function setActivePanel(ctx, { chatId, messageId, kind }) {
  ctx.session.activePanelChatId = chatId;
  ctx.session.activePanelMessageId = messageId;
  ctx.session.activePanelKind = kind;
}

async function renderTextPanel(ctx, text, extra = {}) {
  const chatId = ctx.chat?.id || ctx.update?.callback_query?.message?.chat?.id;
  const callbackChatId = ctx.update?.callback_query?.message?.chat?.id;
  const callbackMessageId = ctx.update?.callback_query?.message?.message_id;
  const activeChatId = ctx.session.activePanelChatId;
  const activeMessageId = ctx.session.activePanelMessageId;
  const callbackMatchesActive =
    callbackChatId && callbackMessageId && String(callbackChatId) === String(activeChatId) && String(callbackMessageId) === String(activeMessageId);

  if (callbackChatId && callbackMessageId) {
    try { await ctx.telegram.deleteMessage(callbackChatId, Number(callbackMessageId)); } catch (_) {}
  }

  if (activeChatId && activeMessageId && !callbackMatchesActive) {
    try { await ctx.telegram.deleteMessage(activeChatId, Number(activeMessageId)); } catch (_) {}
  }

  const sent = await ctx.reply(text, extra);
  setActivePanel(ctx, { chatId: chatId || sent.chat.id, messageId: sent.message_id, kind: 'text' });
  return { chatId: chatId || sent.chat.id, messageId: sent.message_id };
}

async function renderPhotoPanel(ctx, photo, caption, extra = {}) {
  const callbackChatId = ctx.update?.callback_query?.message?.chat?.id;
  const callbackMessageId = ctx.update?.callback_query?.message?.message_id;
  const activeChatId = ctx.session.activePanelChatId;
  const activeMessageId = ctx.session.activePanelMessageId;
  const callbackMatchesActive =
    callbackChatId && callbackMessageId && String(callbackChatId) === String(activeChatId) && String(callbackMessageId) === String(activeMessageId);

  if (callbackChatId && callbackMessageId) {
    try {
      await ctx.telegram.deleteMessage(callbackChatId, Number(callbackMessageId));
    } catch (_) {}
  }

  if (activeChatId && activeMessageId && !callbackMatchesActive) {
    try { await ctx.telegram.deleteMessage(activeChatId, Number(activeMessageId)); } catch (_) {}
  }

  const sent = await ctx.replyWithPhoto(photo, { caption, ...extra });
  setActivePanel(ctx, { chatId: sent.chat.id, messageId: sent.message_id, kind: 'photo' });
  return { chatId: sent.chat.id, messageId: sent.message_id };
}

module.exports = { clearActivePanel, setActivePanel, renderTextPanel, renderPhotoPanel, replaceActivePanel };
