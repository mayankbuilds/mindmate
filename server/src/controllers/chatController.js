const { sendChatMessageToAI, getFallbackReply } = require("../services/aiService");

const postChatMessage = async (req, res) => {
  try {
    let { messages, context, message, prompt, stressLevel, stressScore } = req.body;

    // Normalizing messages array
    if (!messages || !Array.isArray(messages)) {
      const userText = message || prompt || "";
      if (userText) {
        messages = [{ role: "user", content: String(userText) }];
      } else {
        messages = [{ role: "user", content: "Hello" }];
      }
    }

    // Normalizing context
    if (!context || typeof context !== "object") {
      context = {};
    }
    if (stressLevel && !context.level) context.level = stressLevel;
    if (stressScore != null && context.score == null) context.score = stressScore;

    const result = await sendChatMessageToAI(messages, context);
    return res.json(result);
  } catch (error) {
    // Unconditional safeguard: never throw unhandled 500 error to user
    const lastUserMsg = req.body?.message || "hello";
    const level = req.body?.context?.level || "Moderate";
    return res.json({
      reply: getFallbackReply(lastUserMsg, level),
      source: "error-fallback",
    });
  }
};

module.exports = { postChatMessage };