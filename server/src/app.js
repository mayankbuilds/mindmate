const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const wellnessRoutes = require("./routes/wellnessRoutes");
const contactRoutes = require("./routes/contactRoutes");
const chatRoutes = require("./routes/chatRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json());

// API endpoints
app.use("/api/auth", authRoutes);
app.use("/api/wellness", wellnessRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/chat", chatRoutes);

app.get("/health", (req, res) => res.json({ status: "API Gateway active" }));

// Fallback error middlewares
app.use(notFound);
app.use(errorHandler);

module.exports = app;