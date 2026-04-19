const ChatHistory = require('../models/ChatHistory');

const MAX_TRACKED_MESSAGES = 300;

async function recordChatActivity({ chatId, role = 'guest', messageId = null, at = new Date() }) {
  if (!chatId) return null;

  const update = {
    $set: {
      role,
      lastActivityAt: at
    }
  };

  if (Number.isInteger(Number(messageId))) {
    update.$push = {
      messageIds: {
        $each: [Number(messageId)],
        $slice: -MAX_TRACKED_MESSAGES
      }
    };
  }

  return ChatHistory.findOneAndUpdate(
    { chatId: String(chatId) },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function replaceChatHistory({ chatId, role = 'guest', messageIds = [], cleanedAt = new Date() }) {
  if (!chatId) return null;

  return ChatHistory.findOneAndUpdate(
    { chatId: String(chatId) },
    {
      $set: {
        role,
        messageIds: messageIds.map(Number).filter(Number.isInteger),
        lastActivityAt: cleanedAt,
        lastCleanupAt: cleanedAt
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function getChatHistory(chatId) {
  if (!chatId) return null;
  return ChatHistory.findOne({ chatId: String(chatId) });
}

async function listInactiveChats(beforeDate) {
  return ChatHistory.find({ lastActivityAt: { $lte: beforeDate } }).sort({ lastActivityAt: 1 });
}

module.exports = {
  getChatHistory,
  recordChatActivity,
  replaceChatHistory,
  listInactiveChats
};
