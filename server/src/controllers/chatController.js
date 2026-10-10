const Assessment = require("../models/Assessment");
const CheckIn = require("../models/CheckIn");
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
    if (req.body.predicted_class && !context.predicted_class) context.predicted_class = req.body.predicted_class;
    if (req.body.probabilities && !context.probabilities) context.probabilities = req.body.probabilities;
    if (req.body.assessed_at && !context.assessed_at) context.assessed_at = req.body.assessed_at;
    if (req.body.lifestyle_score != null && context.lifestyle_score == null) context.lifestyle_score = req.body.lifestyle_score;
    if (req.body.lifestyle_level && !context.lifestyle_level) context.lifestyle_level = req.body.lifestyle_level;

    // If user is authenticated, retrieve genuine database records rather than blindly trusting client payload
    if (req.user && req.user._id) {
      try {
        const [latestAssessment, latestCheckIn] = await Promise.all([
          Assessment.findOne({ userId: req.user._id }).sort({ createdAt: -1 }),
          CheckIn.findOne({ userId: req.user._id }).sort({ date: -1, createdAt: -1 }),
        ]);

        if (latestAssessment) {
          context.predicted_class = latestAssessment.predicted_class;
          context.probabilities = latestAssessment.probabilities;
          context.assessed_at = latestAssessment.createdAt ? latestAssessment.createdAt.toISOString() : null;
          context.level = latestAssessment.predicted_class;
        }

        if (latestCheckIn) {
          context.lifestyle_score = latestCheckIn.stressScore;
          context.lifestyle_level = latestCheckIn.stressLevel;
          context.sleep = latestCheckIn.sleep;
          context.study = latestCheckIn.study;
          context.screen = latestCheckIn.screen;
          context.exam = latestCheckIn.exam;
          context.mood = latestCheckIn.mood;
          context.note = latestCheckIn.note;
          const todayStr = new Date().toISOString().split("T")[0];
          context.has_logged_today = latestCheckIn.date === todayStr;
          if (context.score == null) context.score = latestCheckIn.stressScore;
        }
      } catch (dbErr) {
        // Fall back gracefully to sanitized client context if database query fails
      }
    }

    const result = await sendChatMessageToAI(messages, context);
    return res.json(result);
  } catch (error) {
    // Unconditional safeguard: never throw unhandled 500 error to user
    const lastUserMsg = req.body?.message || "hello";
    const level = req.body?.context?.predicted_class || req.body?.context?.level || req.body?.predicted_class || req.body?.stressLevel || "Moderate";
    const rawFallback = getFallbackReply(lastUserMsg, level, req.body?.context || {});
    return res.json({
      reply: `[Offline Support Guide]\n\n${rawFallback}`,
      source: "error-fallback",
      is_fallback: true,
      provider: "offline-guide",
    });
  }
};

module.exports = { postChatMessage };