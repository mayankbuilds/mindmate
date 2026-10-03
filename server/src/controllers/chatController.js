const { sendChatMessageToAI } = require("../services/aiService");

const postChatMessage = async (req, res) => {
  const { messages, context } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ message: "Messages array required" });
  }
  const result = await sendChatMessageToAI(messages, context);
  res.json(result);
};

module.exports = { postChatMessage };