const Chat = require("../models/Chat");
const Message = require("../models/Message");
const mongoose = require("mongoose");

// GET /api/v2/chat/ — list all active chats for the authenticated user
const listChats = async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id, isDeleted: false })
      .sort({ updatedAt: -1 })
      .select("_id title source type messageCount model createdAt updatedAt");

    res.json({ chats });
  } catch (err) {
    console.error("List chats error:", err);
    res.status(500).json({ errorMessage: "Failed to load chats" });
  }
};

// POST /api/v2/chat/ — create a new chat
const createChat = async (req, res) => {
  try {
    const { title = "New chat", source = "website" } = req.body;

    const chat = await Chat.create({
      userId: req.user.id,
      title,
      source,
      type: "mixed",
    });

    res.status(201).json({ chat });
  } catch (err) {
    console.error("Create chat error:", err);
    res.status(500).json({ errorMessage: "Failed to create chat" });
  }
};

// GET /api/v2/chat/:id/messages  OR  GET /api/v2/chat/getMessages?chatId=...
// Cursor-paginated. Accepts ?limit=&cursor=&chatId= (chatId on the legacy endpoint)
const getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const cursor = req.query.cursor;

    // Determine which chat to fetch from
    let chatId = req.params.id || req.query.chatId;

    if (chatId && !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ errorMessage: "Invalid chatId" });
    }

    let chat;
    if (chatId) {
      chat = await Chat.findOne({ _id: chatId, userId, isDeleted: false });
    } else {
      // Legacy fallback: return messages from the user's first chat
      chat = await Chat.findOne({ userId, isDeleted: false }).sort({ createdAt: 1 });
    }

    if (!chat) {
      return res.status(404).json({ errorMessage: "Chat not found" });
    }

    const query = { chatId: chat._id };
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      query._id = { $lt: cursor };
    }

    const messages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    messages.reverse();

    res.json({
      messages,
      chatId: chat._id,
      nextCursor: hasMore ? messages[0]._id : null,
    });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ errorMessage: "Failed to load messages" });
  }
};

// PATCH /api/v2/chat/:id — update chat title
const updateChat = async (req, res) => {
  try {
    const { title } = req.body;

    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, isDeleted: false },
      { title },
      { new: true },
    );

    if (!chat) {
      return res.status(404).json({ errorMessage: "Chat not found" });
    }

    res.json({ chat });
  } catch (err) {
    console.error("Update chat error:", err);
    res.status(500).json({ errorMessage: "Failed to update chat" });
  }
};

// DELETE /api/v2/chat/:id — soft delete
const deleteChat = async (req, res) => {
  try {
    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, isDeleted: false },
      { isDeleted: true },
      { new: true },
    );

    if (!chat) {
      return res.status(404).json({ errorMessage: "Chat not found" });
    }

    res.json({ message: "Chat deleted" });
  } catch (err) {
    console.error("Delete chat error:", err);
    res.status(500).json({ errorMessage: "Failed to delete chat" });
  }
};

module.exports = {
  listChats,
  createChat,
  getMessages,
  updateChat,
  deleteChat,
};
