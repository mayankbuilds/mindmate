const mongoose = require("mongoose");

const assessmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    responses: {
      nervousness: { type: Number, required: true, min: 0, max: 3 },
      unable_to_control: { type: Number, required: true, min: 0, max: 3 },
      worry: { type: Number, required: true, min: 0, max: 3 },
      trouble_relaxation: { type: Number, required: true, min: 0, max: 3 },
      restlessness: { type: Number, required: true, min: 0, max: 3 },
      irritability: { type: Number, required: true, min: 0, max: 3 },
      fear: { type: Number, required: true, min: 0, max: 3 },
    },
    predicted_class: {
      type: String,
      required: true,
      enum: ["No", "Mild", "Moderate", "Severe"],
    },
    class_index: {
      type: Number,
      required: true,
      min: 0,
      max: 3,
    },
    probabilities: {
      No: { type: Number, required: true },
      Mild: { type: Number, required: true },
      Moderate: { type: Number, required: true },
      Severe: { type: Number, required: true },
    },
    model_version: {
      type: String,
      required: true,
    },
    disclaimer: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual aliases for camelCase compatibility
assessmentSchema.virtual("predictedClass").get(function () {
  return this.predicted_class;
});
assessmentSchema.virtual("classIndex").get(function () {
  return this.class_index;
});
assessmentSchema.virtual("modelVersion").get(function () {
  return this.model_version;
});

// Composite index for fast chronological lookups by user
assessmentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Assessment", assessmentSchema);
