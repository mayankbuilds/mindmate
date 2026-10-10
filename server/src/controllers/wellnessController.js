const CheckIn = require("../models/CheckIn");
const { computeStressWithAI } = require("../services/aiService");
const { checkAndTriggerStressAlert } = require("../services/alertService");

/**
 * Returns current date string (YYYY-MM-DD) in explicitly configured application timezone (default UTC).
 * Midnight in this timezone rolls over the daily check-in cleanly.
 */
const getAppDateString = (date = new Date()) => {
  const tz = process.env.APP_TIMEZONE || "UTC";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
  } catch (_) {
    return date.toISOString().split("T")[0];
  }
};

const createOrUpdateCheckIn = async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ message: "Not authorized" });
  }

  const { sleep, study, screen, exam, mood, note } = req.body;
  const todayDate = getAppDateString();

  // Call FastAPI to compute score & suggestions (with reliable fallback)
  const aiResult = (await computeStressWithAI({ sleep, study, screen, exam, mood, note })) || {
    score: 50,
    level: "Moderate",
    recommendations: [],
  };

  const checkInData = {
    userId: req.user._id,
    date: todayDate,
    sleep: Number(sleep) || 0,
    study: Number(study) || 0,
    screen: Number(screen) || 0,
    exam: Number(exam) || 0,
    mood: mood || "okay",
    note: note || "",
    stressScore: aiResult.score,
    stressLevel: aiResult.level,
    recommendations: aiResult.recommendations,
  };

  const checkIn = await CheckIn.findOneAndUpdate(
    { userId: req.user._id, date: todayDate },
    checkInData,
    { new: true, upsert: true }
  );

  // High stress streak evaluation
  await checkAndTriggerStressAlert(req.user, aiResult.level);

  res.status(200).json(checkIn);
};

const getTodayCheckIn = async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ message: "Not authorized" });
  }

  const todayDate = getAppDateString();
  const checkIn = await CheckIn.findOne({ userId: req.user._id, date: todayDate });
  res.json(checkIn || null);
};

const getWeeklyHistory = async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ message: "Not authorized" });
  }

  const checkIns = await CheckIn.find({ userId: req.user._id })
    .sort({ date: -1 })
    .limit(30);

  res.json(checkIns.reverse());
};

module.exports = { createOrUpdateCheckIn, getTodayCheckIn, getWeeklyHistory, getAppDateString };