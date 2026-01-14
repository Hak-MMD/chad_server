const openai = require("../config/openai.js");
const Usage = require("../models/Usage.js");
const Message = require("../models/Message.js");
const { PLANS } = require("../config/plans.js");
const UsageStats = require("../models/UsageStats.js");
const { calculateUsage } = require("../utils/openaiUsage.js");
const { uploadImageBase64 } = require("../utils/uploadImage.js");

const message = async (req, res) => {
  console.log("Entered message controller");
  try {
    const { text, screenshot, chatId } = req.body;
    console.log("Received text:", text);
    console.log("Received screenshot:", screenshot);

    let imageData = null;

    // 1️⃣ Upload image if exists
    if (screenshot) {
      imageData = await uploadImageBase64(`${screenshot}`, {
        folder: "chat-images",
      });
    }
    console.log("Uploaded image data: ", imageData);

    // 2️⃣ Save USER message
    await Message.create({
      chatId,
      userId: req.user.id,
      role: "user",
      content: {
        text: text || null,
        imageUrl: imageData?.url,
        imageMeta: imageData
          ? {
              width: imageData.width,
              height: imageData.height,
              mimeType: imageData.mimeType,
            }
          : undefined,
      },
    });
    console.log("User message saved");
    const content = [];

    if (text) {
      content.push({ type: "text", text });
    }

    if (screenshot) {
      content.push({
        type: "image_url",
        image_url: {
          url: imageData.url, //url from uploaded image
          // url: `data:image/jpeg;base64,${screenshot}`, // insert base64 image data into the ai api
          detail: "low",
        },
      });
    }
    console.log("content to send: ", content);
    console.log("1 api");

    // ---- OpenAI call ----
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content,
        },
      ],
    });
    console.log("2 api");

    const aiMessage = completion?.choices?.[0]?.message?.content;
    if (!aiMessage) {
      return res.status(500).json({
        errorMessage: "AI returned an empty response",
      });
    }
    console.log("check api message: ", aiMessage);

    // ---- Token & cost calculation ----
    const usage = calculateUsage({
      model: completion.model,
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0,
    });
    console.log("usage: ", usage);

    // Save AI message
    await Message.create({
      chatId,
      userId: req.user.id,
      role: "assistant",
      content: {
        text: aiMessage,
      },
      model: completion.model,
      ...usage,
    });

    // ---- 1️⃣ Save audit log ----
    await Usage.create({
      userId: req.user.id,
      chatId: chatId || null,
      type: "chat",
      model: completion.model,
      ...usage,
      source: "extension",
    });
    console.log("after usage created");

    // ---- 2️⃣ Increment usage counters ----
    await UsageStats.updateOne(
      { userId: req.user.id },
      {
        $inc: {
          dailyCount: 1,
          monthlyCount: 1,
        },
      }
    );
    console.log("after usageStats created");

    const limits = PLANS[req.user.plan || "free"];

    // ---- 3️⃣ Respond to client ----
    res.status(200).json({
      reply: aiMessage,
      remaining: {
        daily: Math.max(
          limits.dailyRequests - (req.usageStats.dailyCount + 1),
          0
        ),
        monthly: Math.max(
          limits.monthlyRequests - (req.usageStats.monthlyCount + 1),
          0
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
