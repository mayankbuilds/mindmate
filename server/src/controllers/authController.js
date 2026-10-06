const jwt = require("jsonwebtoken");
const User = require("../models/User");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Please provide all required fields" });
  }

  const cleanName = name.trim();
  const cleanEmail = email.replace(/\s+/g, "").toLowerCase();

  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ message: "Invalid email address format" });
  }

  const userExists = await User.findOne({ email: cleanEmail });
  if (userExists) {
    return res.status(400).json({ message: "User already exists with this email" });
  }

  const user = await User.create({ name: cleanName, email: cleanEmail, password });
  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    college: user.college,
    avatar: user.avatar || "",
    preferences: user.preferences,
    autoNotify: user.autoNotify,
    token: generateToken(user._id),
  });
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || "").replace(/\s+/g, "").toLowerCase();
  const user = await User.findOne({ email: cleanEmail });

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      college: user.college,
      avatar: user.avatar || "",
      preferences: user.preferences,
      autoNotify: user.autoNotify,
      token: generateToken(user._id),
    });
  } else {
    res.status(401).json({ message: "Invalid email or password" });
  }
};

const getProfile = async (req, res) => {
  res.json(req.user);
};

const updateProfile = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (req.body.name) user.name = req.body.name.trim();
  if (req.body.email) {
    const cleanEmail = req.body.email.replace(/\s+/g, "").toLowerCase();
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ message: "Invalid email address format" });
    }
    if (cleanEmail !== user.email) {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(400).json({ message: "Email is already in use by another account" });
      }
    }
    user.email = cleanEmail;
  }
  if (req.body.college) user.college = req.body.college.trim();
  if (req.body.avatar !== undefined) user.avatar = req.body.avatar;
  if (req.body.preferences) user.preferences = { ...user.preferences, ...req.body.preferences };
  if (typeof req.body.autoNotify === "boolean") user.autoNotify = req.body.autoNotify;

  const updatedUser = await user.save();
  res.json({
    _id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    college: updatedUser.college,
    avatar: updatedUser.avatar || "",
    preferences: updatedUser.preferences,
    autoNotify: updatedUser.autoNotify,
  });
};

module.exports = { registerUser, loginUser, getProfile, updateProfile };