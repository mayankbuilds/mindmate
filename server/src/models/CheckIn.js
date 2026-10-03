const mongoose = require("mongoose");

const checkInSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    sleep: { type: Number, required: true },
    study: { type: Number, required: true },
    screen: { type: Number, required: true },
    exam: { type: Number, required: true },
    mood: { type: String, default: "okay" },
    note: { type: String, default: "" },
    stressScore: { type: Number, required: true },
    stressLevel: { type: String, enum: ["Low", "Moderate", "High"], required: true },
    recommendations: [
      {
        id: String,
        title: String,
        blurb: String,
        mins: Number,
        secs: Number,
        tint: String,
      },
    ],
  },
  { timestamps: true }
);

// Har student ka per day 1 check-in unique rahega
checkInSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("CheckIn", checkInSchema);