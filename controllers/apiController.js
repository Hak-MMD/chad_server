// controllers/apiController.js
const openai = require("../config/openai.js");
const Usage = require("../models/Usage.js");
const Message = require("../models/Message.js");
const Chat = require("../models/Chat.js");
const UsageStats = require("../models/UsageStats.js");
const { calculateUsage } = require("../utils/openaiUsage.js");
const { uploadImageBase64 } = require("../utils/uploadImage.js");
const { buildContext } = require("../utils/buildContext.js");
const {
  enqueueMessageSummary,
  enqueueConversationSummary,
  CONVERSATION_SUMMARY_INTERVAL,
} = require("../utils/summarizationWorker.js");
const { selectModelForRequest } = require("../utils/modelSelector.js");

const message = async (req, res) => {
  try {
    const { text, screenshot, chatId, model: requestedModel, idempotencyKey } = req.body;
    const userId = req.user.id;
    const plan = req.plan;
    const usageStats = req.usageStats;

    // Idempotency: if client retried an already-processed request, return cached response
    if (idempotencyKey) {
      const existingUserMsg = await Message.findOne({ idempotencyKey, userId });
      if (existingUserMsg) {
        const existingAiMsg = await Message.findOne({
          chatId: existingUserMsg.chatId,
          role: "assistant",
          createdAt: { $gt: existingUserMsg.createdAt },
        }).sort({ createdAt: 1 });

        // Release the usage slot reserved by middleware
        await UsageStats.updateOne(
          { userId },
          { $inc: { dailyCount: -1, monthlyCount: -1 } },
        );

        if (existingAiMsg) {
          return res.status(200).json({
            reply: existingAiMsg.content.text,
            modelUsed: existingAiMsg.model,
            modelDowngraded: false,
            cached: true,
          });
        }
        // First request is still in-flight
        return res.status(409).json({
          errorMessage: "Request already in progress. Please retry shortly.",
        });
      }
    }

    // 1) Validate chat ownership before writing anything
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ errorMessage: "Chat not found" });
    }
    if (chat.userId.toString() !== userId) {
      return res.status(403).json({ errorMessage: "Access denied" });
    }

    // 2) Upload image (if provided)
    let imageData = null;
    if (screenshot) {
      imageData = await uploadImageBase64(screenshot, {
        folder: "chat-images",
      });
    }

    // 3) Save USER message
    const userMessage = await Message.create({
      chatId,
      userId,
      role: "user",
      content: {
        text: text || null,
        imageUrl: imageData?.url || null,
        imageMeta: imageData
          ? {
              width: imageData.width,
              height: imageData.height,
              mimeType: imageData.mimeType,
            }
          : undefined,
      },
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    // 4) Update chat counters atomically
    const updatedChat = await Chat.findOneAndUpdate(
      { _id: chatId },
      { $inc: { messageCount: 1 } },
      { new: true },
    );

    // 5) Build context
    const { messages: contextMessages } = await buildContext({ chatId });

    // 6) Select model
    const {
      model: modelToUse,
      downgraded,
      blocked,
    } = selectModelForRequest({
      user: req.user,
      requestedModel,
      usageStats,
    });

    if (blocked) {
      return res.status(429).json({
        errorMessage: "Model usage limit reached for this plan.",
        upgradeRequired: true,
      });
    }

    // 7) Build OpenAI messages (hybrid vision: only current user message gets image)
    const openAIMessages = contextMessages.map((m, idx) => {
      const isLast = idx === contextMessages.length - 1;
      const isLastUser = isLast && m.role === "user";

      // History + assistant: text-only
      if (!isLastUser || !imageData?.url) {
        return {
          role: m.role,
          content: [{ type: "text", text: m.content }],
        };
      }

      // Current user message: text + image
      const parts = [];
      if (m.content) {
        parts.push({ type: "text", text: m.content });
      }
      parts.push({
        type: "image_url",
        image_url: {
          url: imageData.url,
        },
      });

      return {
        role: "user",
        content: parts,
      };
    });

    // 7) Call OpenAI
    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages: openAIMessages,
    });

    const aiMessageText = completion?.choices?.[0]?.message?.content;
    if (!aiMessageText) {
      return res.status(500).json({
        errorMessage: "AI returned an empty response",
      });
    }

    // 8) Token & cost calculation
    const usage = calculateUsage({
      model: completion.model,
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0,
    });

    // 9) Save AI message
    const assistantMessage = await Message.create({
      chatId,
      userId,
      role: "assistant",
      content: {
        text: aiMessageText,
      },
      model: completion.model,
      ...usage,
    });

    // 10) Save audit log
    await Usage.create({
      userId,
      chatId: chatId || null,
      type: "chat",
      model: completion.model,
      ...usage,
      source: "extension",
    });

    // 11) Track model token usage (dailyCount/monthlyCount already reserved in middleware)
    await UsageStats.updateOne(
      { userId },
      {
        $inc: {
          [`modelTokenMonthly.${completion.model}`]: usage.totalTokens,
        },
      },
    );

    // 12) Async summarization (message + conversation)
    enqueueMessageSummary(userMessage._id);
    enqueueMessageSummary(assistantMessage._id);

    if (
      updatedChat.messageCount % CONVERSATION_SUMMARY_INTERVAL === 0 &&
      updatedChat.messageCount > 0
    ) {
      enqueueConversationSummary(chatId);
    }

    // 13) Respond to client
    res.status(200).json({
      reply: aiMessageText,
      modelUsed: completion.model,
      modelDowngraded: downgraded || false,
      remaining: {
        daily: Math.max(plan.dailyRequests - req.usageStats.dailyCount, 0),
        monthly: Math.max(plan.monthlyRequests - req.usageStats.monthlyCount, 0),
      },
    });
  } catch (err) {
    console.error("AI error:", err);
    if (err?.status === 429) {
      return res.status(503).json({ errorMessage: "AI service is busy. Please try again." });
    }
    if (err?.status === 400) {
      return res.status(400).json({ errorMessage: "Invalid request to AI service." });
    }
    return res.status(500).json({
      errorMessage: "Something went wrong. Try again later.",
    });
  }
};

module.exports = { message };
