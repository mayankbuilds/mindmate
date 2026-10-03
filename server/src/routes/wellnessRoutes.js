const express = require("express");
const router = express.Router();
const { createOrUpdateCheckIn, getTodayCheckIn, getWeeklyHistory } = require("../controllers/wellnessController");
const { protect } = require("../middleware/authMiddleware");

router.post("/checkin", protect, createOrUpdateCheckIn);
router.get("/today", protect, getTodayCheckIn);
router.get("/history", protect, getWeeklyHistory);

module.exports = router;