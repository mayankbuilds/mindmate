const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const authRoutes = require("./routes/authRoutes");
const wellnessRoutes = require("./routes/wellnessRoutes");
const assessmentRoutes = require("./routes/assessmentRoutes");
const contactRoutes = require("./routes/contactRoutes");
const chatRoutes = require("./routes/chatRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const {
  authRateLimiter,
  assessmentRateLimiter,
  generalApiLimiter,
} = require("./middleware/rateLimitMiddleware");

const app = express();

// Production-configurable CORS policy
const configuredOrigins = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      configuredOrigins.length === 0 ||
      configuredOrigins.includes("*") ||
      configuredOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    if (
      process.env.NODE_ENV !== "production" &&
      (origin.includes("localhost") || origin.includes("127.0.0.1"))
    ) {
      return callback(null, true);
    }
    return callback(new Error(`Origin '${origin}' not allowed by CORS policy`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "5mb" })); // Support profile photo uploads
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Rate limiting middlewares
app.use("/api", generalApiLimiter);
app.use(["/api/auth/login", "/api/auth/signup"], authRateLimiter);
app.use("/api/assessment/predict", assessmentRateLimiter);

// API endpoints
app.use("/api/auth", authRoutes);
app.use("/api/wellness", wellnessRoutes);
app.use("/api/assessment", assessmentRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/chat", chatRoutes);

// Health check endpoint (distinguishes API status and database readiness)
app.get(["/health", "/api/health"], (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const isHealthy = isDbConnected || process.env.NODE_ENV === "test";

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "degraded",
    gateway: "active",
    database: isDbConnected ? "connected" : "disconnected",
    fastapi_service_url: process.env.FASTAPI_SERVICE_URL || "not_configured",
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

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