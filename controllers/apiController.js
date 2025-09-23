const openai = require("../config/openai.js");

// const message = async (req, res) => {
//   const { text, screenshot } = req.body;
//   try {
//     console.log("Received text:", text);
//     await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate processing delay
//     // console.log("Received screenshots:", screenshot);
//     res.json({
//       reply: `Hello from the API controller! ${
//         screenshot ? "Screenshot received." : "No screenshot."
//       }`,
//     });
//   } catch (error) {
//     console.log("Error in message controller:", error);
//   }
// };

// 400/500 status test
// const message = async (req, res) => {
//   const { text, screenshot } = req.body;
//   try {
//     console.log("Received text:", text);
//     if (text) {
//       console.log("error here: ", text);
//       return res.status(400).json({ errorMessage: `400 1  error textissent` });
//     } else if (screenshot) {
//       return res
//         .status(500)
//         .json({ errorMessage: `500 2 error screenshot sent` });
//     }
//     await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate processing delay
//     // console.log("Received screenshots:", screenshot);
//     res.json({
//       reply: `Hello from the API controller! ${
//         screenshot ? "Screenshot received." : "No screenshot."
//       }`,
//     });
//   } catch (error) {
//     console.log("Error in message controller:", error);
//   }
// };

const message = async (req, res) => {
  try {
    const { text, screenshot } = req.body; // accept both text and image URL

    // Build content array depending on what is provided
    const content = [];

    if (text) {
      content.push({ type: "text", text });
    }

    if (screenshot) {
      //Push image to cloud and get URL
      content.push({
        type: "image_url",
        // image_url: { url: screenshot }, // must be publicly accessible URL
        image_url: {
          url: `data:image/jpeg;base64,${screenshot}`,
          detail: "low",
        }, // must be publicly accessible URL
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ensure this model supports vision
      messages: [
        {
          role: "user",
          content, // structured multimodal content
        },
      ],
    });

    if (
      (!completion?.choices[0]?.message?.content ||
        completion?.choices[0]?.message?.content === "") &&
      completion?.error
    ) {
      return res.status(500).json({
        errorMessage: "AI error! Try again later!",
        details: completion.error.message,
      });
    }
    // console.log;

    res.status(200).json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("AI error:", err);
    res.status(500).json({ error: "Something went wrong. Truy again later!" });
  }
};

module.exports = { message };
