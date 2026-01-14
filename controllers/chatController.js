const Chat = require("../models/Chat");
const Message = require("../models/Message");

// GET /api/messages?limit=10&cursor=messageId

const getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const cursor = req.query.cursor;

    const chat = await Chat.findOne({ userId });
    if (!chat) {
      return res.status(404).json({ errorMessage: "Chat not found" });
    }

    const query = { chatId: chat._id };
    if (cursor) {
      query._id = { $lt: cursor };
    }

    const messages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    res.json({
      messages: messages.reverse(),
      nextCursor: hasMore ? messages[0]._id : null,
    });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ errorMessage: "Failed to load messages" });
  }
};

module.exports = {
  getMessages,
};
