const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { validateEnvironment } = require("../src/config/envValidator");

describe("Phase 5: Production Environment Validation & Safety", () => {
  it("rejects production startup when MONGO_URI is missing", () => {
    const originalEnv = { ...process.env };
    try {
      process.env.NODE_ENV = "production";
      delete process.env.MONGO_URI;
      process.env.JWT_SECRET = "super_long_random_production_secret_key_123456789";

      assert.throws(
        () => validateEnvironment(),
        /MONGO_URI is required in production/
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it("rejects production startup when JWT_SECRET is missing or insecure placeholder", () => {
    const originalEnv = { ...process.env };
    try {
      process.env.NODE_ENV = "production";
      process.env.MONGO_URI = "mongodb+srv://user:pass@cluster0.mongodb.net/prod";
      delete process.env.JWT_SECRET;

      assert.throws(
        () => validateEnvironment(),
        /JWT_SECRET is required in production/
      );

      // Insecure placeholder
      process.env.JWT_SECRET = "secret";
      assert.throws(
        () => validateEnvironment(),
        /insecure placeholder/
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it("passes production startup when required variables are securely populated", () => {
    const originalEnv = { ...process.env };
    try {
      process.env.NODE_ENV = "production";
      process.env.MONGO_URI = "mongodb+srv://user:pass@cluster0.mongodb.net/prod";
      process.env.JWT_SECRET = "9a8b7c6d5e4f3a2b1c0d_secure_production_token_secret";

      assert.doesNotThrow(() => validateEnvironment());
      assert.equal(process.env.PORT, "5000");
    } finally {
      process.env = originalEnv;
    }
  });
});
