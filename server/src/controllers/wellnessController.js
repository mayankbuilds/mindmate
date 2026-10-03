const CheckIn = require("../models/CheckIn");
const { computeStressWithAI } = require("../services/aiService");
const { checkAndTriggerStressAlert } = require("../services/alertService");

const createOrUpdateCheckIn = async (req, res) => {
  const { sleep, study, screen, exam, mood, note } = req.body;
  const todayDate = new Date().toISOString().split("T")[0];

  // Call FastAPI to compute score & suggestions
  const aiResult = await computeStressWithAI({ sleep, study, screen, exam, mood, note });

  const checkInData = {
    userId: req.user._id,
    date: todayDate,
    sleep,
    study,
    screen,
    exam,
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
  const todayDate = new Date().toISOString().split("T")[0];
  const checkIn = await CheckIn.findOne({ userId: req.user._id, date: todayDate });
  res.json(checkIn || null);
};

const getWeeklyHistory = async (req, res) => {
  const checkIns = await CheckIn.find({ userId: req.user._id })
    .sort({ date: -1 })
    .limit(7);

  res.json(checkIns.reverse());
};

module.exports = { createOrUpdateCheckIn, getTodayCheckIn, getWeeklyHistory };