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
  console.log("Entered message controller");
  try {
    const { text, screenshot, chatId, model: requestedModel } = req.body;
    const userId = req.user.id;
    const plan = req.plan;
    const usageStats = req.usageStats;

    // 1) Upload image (if provided)
    let imageData = null;
    if (screenshot) {
      imageData = await uploadImageBase64(screenshot, {
        folder: "chat-images",
      });
    }

    // 2) Save USER message
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
    });

    // 3) Update chat counters
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ errorMessage: "Chat not found" });
    }
    chat.messageCount = (chat.messageCount || 0) + 1;
    await chat.save();

    // 4) Build context (history text-only, current text-only)
    const { messages: contextMessages } = await buildContext({
      chatId,
      // currentUserMessage: {
      //   text,
      //   imageUrl: imageData?.url,
      // },
    });

    // console.log("context messages: ", contextMessages);

    // 5) Select model
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

    // 6) Build OpenAI messages (hybrid vision: only current user message gets image)
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

    console.log("final messages obj: ", openAIMessages);

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

    // 11) Increment usage counters
    await UsageStats.updateOne(
      { userId },
      {
        $inc: {
          dailyCount: 1,
          monthlyCount: 1,
          [`modelTokenMonthly.${completion.model}`]: usage.totalTokens,
        },
      },
    );

    // 12) Async summarization (message + conversation)
    enqueueMessageSummary(userMessage._id);
    enqueueMessageSummary(assistantMessage._id);

    if (
      chat.messageCount % CONVERSATION_SUMMARY_INTERVAL === 0 &&
      chat.messageCount > 0
    ) {
      enqueueConversationSummary(chatId);
    }

    // 13) Respond to client
    res.status(200).json({
      reply: aiMessageText,
      modelUsed: completion.model,
      modelDowngraded: downgraded || false,
      remaining: {
        daily: Math.max(
          plan.dailyRequests - (req.usageStats.dailyCount + 1),
          0,
        ),
        monthly: Math.max(
          plan.monthlyRequests - (req.usageStats.monthlyCount + 1),
          0,
        ),
      },
    });
  } catch (err) {
    console.error("AI error:", err);
    return res.status(500).json({
      errorMessage: "Something went wrong. Try again later.",
    });
  }
};

module.exports = { message };

// For testing test edpoints:

//success
const messageNorm = async (req, res) => {
  const { text, screenshot } = req.body;
  try {
    console.log("Received text:", text);
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate processing delay
    // console.log("Received screenshots:", screenshot);
    //  // ---- Token & cost calculation ----
    // const usage = calculateUsage({
    //   model: completion.model,
    //   promptTokens: completion.usage?.prompt_tokens || 0,
    //   completionTokens: completion.usage?.completion_tokens || 0,
    // });

    // // ---- 1️⃣ Save audit log ----
    // await Usage.create({
    //   user: req.user._id,
    //   chat: chatId || null,
    //   type: "chat",
    //   model: completion.model,
    //   ...usage,
    //   source: "extension",
    // });

    // // ---- 2️⃣ Increment usage counters ----
    // await UsageStats.updateOne(
    //   { user: req.user._id },
    //   {
    //     $inc: {
    //       dailyCount: 1,
    //       monthlyCount: 1,
    //     },
    //   }
    // );

    // const limits = PLANS[req.user.plan || "free"];

    // // ---- 3️⃣ Respond to client ----
    // res.status(200).json({
    //   reply: aiMessage,
    //   remaining: {
    //     daily: Math.max(
    //       limits.dailyRequests - (req.usageStats.dailyCount + 1),
    //       0
    //     ),
    //     monthly: Math.max(
    //       limits.monthlyRequests - (req.usageStats.monthlyCount + 1),
    //       0
    //     ),
    //   },
    // });
    res.json({
      reply: `Hello from the API controller! ${
        screenshot ? "Screenshot received." : "No screenshot."
      }`,
    });
  } catch (error) {
    console.log("Error in message controller:", error);
  }
};

// 400/500 status test
const messageErr = async (req, res) => {
  const { text, screenshot } = req.body;
  try {
    console.log("Received text:", text);
    if (text) {
      console.log("error here: ", text);
      return res.status(400).json({ errorMessage: `400 1  error textissent` });
    } else if (screenshot) {
      return res
        .status(500)
        .json({ errorMessage: `500 2 error screenshot sent` });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate processing delay
    // console.log("Received screenshots:", screenshot);
    // Save event-level usage
    await Usage.create({
      user: req.user._id,
      chat: chatId,
      type: "chat",
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUSD,
      source: "extension",
    });

    // Update counters
    req.usageStats.dailyCount += 1;
    req.usageStats.monthlyCount += 1;

    await req.usageStats.save();
    res.json({
      reply: `Hello from the API controller! ${
        screenshot ? "Screenshot received." : "No screenshot."
      }`,
    });
  } catch (error) {
    console.log("Error in message controller:", error);
  }
};

module.exports = { messageNorm, messageErr, message };
