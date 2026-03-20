// utils/buildContext.js
const Chat = require("../models/Chat");
const Message = require("../models/Message");

const HARD_TOKEN_LIMIT = 3500;

function estimateTokens(str) {
  if (!str) return 0;
  return Math.ceil(str.length / 4);
}

async function buildContext({ chatId, currentUserMessage }) {
  const chat = await Chat.findById(chatId).lean();
  if (!chat) throw new Error("Chat not found");

  const messages = await Message.find({ chatId })
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  const cacheableSegments = [];
  const dynamicSegments = [];

  const systemPrompt =
    "You are a helpful assistant inside a Chrome extension. Be concise, practical, and focus on user goals.";
  cacheableSegments.push({
    role: "system",
    content: systemPrompt,
  });

  if (chat.conversationSummary) {
    cacheableSegments.push({
      role: "system",
      content: `Conversation summary: ${chat.conversationSummary}`,
    });
  }

  messages.reverse().forEach((m) => {
    const base =
      m.summary ||
      m.content?.text ||
      (m.content?.imageUrl ? "User shared an image (summarized)." : "");

    if (!base) return;

    dynamicSegments.push({
      role: m.role === "user" ? "user" : "assistant",
      content: base,
    });
  });

  const currentParts = [];
  if (currentUserMessage.text) currentParts.push(currentUserMessage.text);
  if (currentUserMessage.imageUrl)
    currentParts.push(`User shared an image: ${currentUserMessage.imageUrl}`);

  dynamicSegments.push({
    role: "user",
    content: currentParts.join("\n\n"),
  });

  let allMessages = [...cacheableSegments, ...dynamicSegments];

  let totalTokens = allMessages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );

  while (totalTokens > HARD_TOKEN_LIMIT && dynamicSegments.length > 1) {
    dynamicSegments.splice(0, 1);
    allMessages = [...cacheableSegments, ...dynamicSegments];
    totalTokens = allMessages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );
  }

  return {
    chat,
    cacheableSegments,
    dynamicSegments,
    messages: allMessages,
  };
}

module.exports = { buildContext };
