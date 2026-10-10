const express = require("express");
const router = express.Router();
const {
  predictAssessment,
  getAssessmentHistory,
  getAssessmentById,
} = require("../controllers/assessmentController");
const { protect } = require("../middleware/authMiddleware");

// All assessment endpoints require authentication
router.post("/predict", protect, predictAssessment);
router.get("/history", protect, getAssessmentHistory);
router.get("/:id", protect, getAssessmentById);

module.exports = router;
