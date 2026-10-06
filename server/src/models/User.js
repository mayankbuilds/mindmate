const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8 },
    college: { type: String, default: "Northfield University" },
    avatar: { type: String, default: "" },
    preferences: {
      daily: { type: Boolean, default: true },
      tips: { type: Boolean, default: true },
      alerts: { type: Boolean, default: true },
    },
    autoNotify: { type: Boolean, default: true },
    consecutiveHighStressDays: { type: Number, default: 0 },
    lastAlertSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password helper
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);