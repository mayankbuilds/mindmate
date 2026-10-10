/**
 * Validates environment variables at application startup.
 * Fails fast with clear descriptive error messages when required production settings are missing.
 */
function validateEnvironment() {
  const isProd = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";

  if (isTest) {
    // Test environment uses defaults configured in test suites
    return;
  }

  const errors = [];

  // 1. Database Connection
  if (!process.env.MONGO_URI) {
    if (isProd) {
      errors.push("MONGO_URI is required in production. Specify a valid MongoDB connection string.");
    } else {
      console.warn("[Config Warning] MONGO_URI not set. Defaulting to 'mongodb://localhost:27017/mindmate'.");
      process.env.MONGO_URI = "mongodb://localhost:27017/mindmate";
    }
  }

  // 2. Authentication Secret
  const insecureSecrets = [
    "secret",
    "jwt_secret",
    "your_jwt_secret",
    "your_secret_key",
    "test",
    "password",
  ];

  if (!process.env.JWT_SECRET) {
    if (isProd) {
      errors.push("JWT_SECRET is required in production. Set a long, secure random string.");
    } else {
      console.warn("[Config Warning] JWT_SECRET not set. Defaulting to local development secret.");
      process.env.JWT_SECRET = "mindmate_dev_jwt_secret_key_local_only";
    }
  } else if (isProd && insecureSecrets.includes(process.env.JWT_SECRET.toLowerCase())) {
    errors.push("JWT_SECRET in production cannot be an insecure placeholder.");
  }

  // 3. FastAPI Inference Service URL
  if (!process.env.FASTAPI_SERVICE_URL) {
    console.warn(
      "[Config Notice] FASTAPI_SERVICE_URL not set. Defaulting to 'http://localhost:8000'. " +
        "Ensure the FastAPI service is running for questionnaire ML predictions."
    );
    process.env.FASTAPI_SERVICE_URL = "http://localhost:8000";
  }

  // 4. Port Binding
  if (!process.env.PORT) {
    process.env.PORT = "5000";
  }

  if (errors.length > 0) {
    console.error("\n=======================================================");
    console.error("FATAL CONFIGURATION ERROR — STARTUP ABORTED:");
    errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
    console.error("=======================================================\n");
    throw new Error(`Environment validation failed: ${errors.join("; ")}`);
  }
}

module.exports = { validateEnvironment };
