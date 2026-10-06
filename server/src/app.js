const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const authRoutes = require("./routes/authRoutes");
const wellnessRoutes = require("./routes/wellnessRoutes");
const contactRoutes = require("./routes/contactRoutes");
const chatRoutes = require("./routes/chatRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" })); // Support profile photo uploads
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// API endpoints
app.use("/api/auth", authRoutes);
app.use("/api/wellness", wellnessRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/chat", chatRoutes);

app.get(["/health", "/api/health"], (req, res) => res.json({ status: "API Gateway active" }));

// Static frontend serving support for unified deployments (Render / VPS)
const distCandidates = [
  path.join(__dirname, "../../../client/dist"),
  path.join(__dirname, "../../client/dist"),
  path.join(process.cwd(), "client/dist"),
];
const distPath = distCandidates.find((p) => fs.existsSync(p));

if (distPath && (process.env.SERVE_STATIC === "true" || process.env.NODE_ENV === "production")) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Fallback error middlewares
app.use(notFound);
app.use(errorHandler);

module.exports = app;