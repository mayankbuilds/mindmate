const rateLimit = require("express-rate-limit");

const isTestEnv = process.env.NODE_ENV === "test";

/**
 * Rate limiter for authentication endpoints (prevent brute-force logins and registration spam).
 * Allows 20 requests per 15 minutes in production; bypassed during automated tests.
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many authentication attempts from this IP. Please try again after 15 minutes.",
  },
  skip: () => isTestEnv,
});

/**
 * Rate limiter for ML assessment inferences (prevent resource exhaustion on the ML microservice).
 * Allows 30 inferences per 1 minute in production; bypassed during automated tests.
 */
const assessmentRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTestEnv ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Assessment request limit reached. Please wait a minute before submitting again.",
  },
  skip: () => isTestEnv,
});

/**
 * General rate limiter for all API endpoints.
 * Allows 300 requests per 15 minutes.
 */
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 50000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests from this IP. Please slow down.",
  },
  skip: () => isTestEnv,
});

module.exports = {
  authRateLimiter,
  assessmentRateLimiter,
  generalApiLimiter,
};
