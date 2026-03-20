// utils/summarizationWorker.js
const openai = require("../config/openai");
const Message = require("../models/Message");
const Chat = require("../models/Chat");

const MESSAGE_SUMMARY_THRESHOLD_CHARS = 400;
const CONVERSATION_SUMMARY_INTERVAL = 15;
const MAX_MESSAGES_PER_CHAT = 200;

const queue = [];

async function runQueue() {
  if (queue.running) return;
  queue.running = true;

  while (queue.length > 0) {
    const job = queue.shift();
    try {
      if (job.type === "message-summary") {
        await summarizeMessage(job.messageId);
      } else if (job.type === "conversation-summary") {
        await summarizeConversation(job.chatId);
      }
    } catch (err) {
      console.error("Summarization job failed:", err);
    }
  }

  queue.running = false;
}

function enqueue(job) {
  queue.push(job);
  setTimeout(runQueue, 0);
}

async function summarizeMessage(messageId) {
  const msg = await Message.findById(messageId);
  if (!msg || msg.summary) return;

  const { text, imageUrl } = msg.content || {};
  const hasLongText = text && text.length > MESSAGE_SUMMARY_THRESHOLD_CHARS;
  const hasImage = !!imageUrl;

  if (!hasLongText && !hasImage) return;

  const parts = [];

  if (hasImage) {
    parts.push("The user shared an image. Summarize the key visual details.");
    parts.push(`Image URL: ${imageUrl}`);
  }

  if (text) {
    parts.push(
      "Summarize the following text focusing on goals and key details:",
    );
    parts.push(text);
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-5.0-nano", // cheap + good for summarization
    messages: [
      {
        role: "system",
        content:
          "You create short, information-dense summaries for long-term memory. Keep it under 80 tokens.",
      },
      {
        role: "user",
        content: parts.join("\n\n"),
      },
    ],
    max_tokens: 120,
  });

  const summary = completion?.choices?.[0]?.message?.content?.trim();
  if (!summary) return;

  msg.summary = summary;
  await msg.save();
}

async function summarizeConversation(chatId) {
  const chat = await Chat.findById(chatId);
  if (!chat) return;

  const messages = await Message.find({ chatId })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  if (!messages.length) return;

  const lines = messages
    .reverse()
    .map((m) => {
      const base =
        m.summary ||
        (m.content?.text
          ? m.content.text.slice(0, 400)
          : m.content?.imageUrl
            ? "[Image shared]"
            : "");
      return `${m.role}: ${base}`;
    })
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.0-mini", // higher quality for conversation summary
    messages: [
      {
        role: "system",
        content:
          "Summarize the conversation so far. Focus on user goals, analyzed images, and important conclusions. Keep it under 150 tokens.",
      },
      {
        role: "user",
        content: lines,
      },
    ],
    max_tokens: 180,
  });

  const summary = completion?.choices?.[0]?.message?.content?.trim();
  if (!summary) return;

  chat.conversationSummary = summary;
  chat.lastSummaryAt = chat.messageCount || 0;
  await chat.save();

  await pruneOldMessages(chatId);
}

async function pruneOldMessages(chatId) {
  const count = await Message.countDocuments({ chatId });
  if (count <= MAX_MESSAGES_PER_CHAT) return;

  const toDelete = await Message.find({ chatId })
    .sort({ createdAt: 1 })
    .limit(count - MAX_MESSAGES_PER_CHAT)
    .lean();

  const deletableIds = toDelete.filter((m) => !!m.summary).map((m) => m._id);

  if (deletableIds.length) {
    await Message.deleteMany({ _id: { $in: deletableIds } });
  }
}

module.exports = {
  enqueueMessageSummary: (messageId) =>
    enqueue({ type: "message-summary", messageId }),

  enqueueConversationSummary: (chatId) =>
    enqueue({ type: "conversation-summary", chatId }),

  CONVERSATION_SUMMARY_INTERVAL,
};
