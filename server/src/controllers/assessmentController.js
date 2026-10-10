const mongoose = require("mongoose");
const Assessment = require("../models/Assessment");
const { requestAssessmentPrediction } = require("../services/aiService");

const REQUIRED_QUESTIONNAIRE_FIELDS = [
  "nervousness",
  "unable_to_control",
  "worry",
  "trouble_relaxation",
  "restlessness",
  "irritability",
  "fear",
];

/**
 * Validates the 7 questionnaire features.
 * All features must be integers in the range [0, 3].
 */
const validateAssessmentInput = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, message: "Request body must be a JSON object" };
  }

  const errors = [];
  const cleanedPayload = {};

  for (const field of REQUIRED_QUESTIONNAIRE_FIELDS) {
    const val = body[field];
    if (val === undefined || val === null) {
      errors.push(`Field '${field}' is required.`);
      continue;
    }
    if (typeof val !== "number" || !Number.isInteger(val)) {
      errors.push(`Field '${field}' must be an integer (0-3), received: ${typeof val === "number" ? val : typeof val}.`);
      continue;
    }
    if (val < 0 || val > 3) {
      errors.push(`Field '${field}' must be between 0 and 3, received: ${val}.`);
      continue;
    }
    cleanedPayload[field] = val;
  }

  if (errors.length > 0) {
    return {
      valid: false,
      message: `Validation failed: ${errors.join("; ")}`,
      errors,
    };
  }

  return { valid: true, payload: cleanedPayload };
};

/**
 * POST /api/assessment/predict
 * Flow A: Authenticated ML Questionnaire Stress Prediction Gateway
 */
const predictAssessment = async (req, res) => {
  // 1. Validate questionnaire input
  const validation = validateAssessmentInput(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      message: validation.message,
      errors: validation.errors || [],
    });
  }

  // 2. Forward to FastAPI inference service (no handcrafted fallback on failure)
  let aiResult;
  try {
    aiResult = await requestAssessmentPrediction(validation.payload);
  } catch (error) {
    const status = error.status || 503;
    return res.status(status).json({
      message: error.message || "ML inference service is temporarily unavailable",
    });
  }

  // 3. Persist genuine prediction with strict authenticated user ownership
  try {
    const assessment = await Assessment.create({
      userId: req.user._id, // Enforce authenticated user, ignore any req.body.userId
      responses: validation.payload,
      predicted_class: aiResult.predicted_class,
      class_index: aiResult.class_index,
      probabilities: aiResult.probabilities,
      model_version: aiResult.model_version,
      disclaimer: aiResult.disclaimer,
    });

    return res.status(201).json({
      _id: assessment._id,
      userId: assessment.userId,
      responses: assessment.responses,
      predicted_class: assessment.predicted_class,
      class_index: assessment.class_index,
      probabilities: assessment.probabilities,
      model_version: assessment.model_version,
      disclaimer: assessment.disclaimer,
      createdAt: assessment.createdAt,
      updatedAt: assessment.updatedAt,
    });
  } catch (dbError) {
    console.error("[Assessment Persistence Error]", dbError.message);
    return res.status(500).json({
      message: "Prediction completed but failed to persist assessment history",
    });
  }
};

/**
 * GET /api/assessment/history
 * Retrieve assessment history for the authenticated user (newest first)
 */
const getAssessmentHistory = async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100);
    const assessments = await Assessment.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.status(200).json(assessments);
  } catch (err) {
    console.error("[Assessment History Error]", err.message);
    return res.status(500).json({ message: "Failed to retrieve assessment history" });
  }
};

/**
 * GET /api/assessment/:id
 * Retrieve a specific assessment, strictly isolating ownership to req.user._id
 */
const getAssessmentById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Assessment not found" });
    }

    const assessment = await Assessment.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!assessment) {
      return res.status(404).json({ message: "Assessment not found" });
    }

    return res.status(200).json(assessment);
  } catch (err) {
    console.error("[Get Assessment Error]", err.message);
    return res.status(500).json({ message: "Failed to retrieve assessment" });
  }
};

module.exports = {
  predictAssessment,
  getAssessmentHistory,
  getAssessmentById,
  validateAssessmentInput,
  REQUIRED_QUESTIONNAIRE_FIELDS,
};
