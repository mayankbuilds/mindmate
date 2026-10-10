const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Set environment variables before requiring server modules
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_mindmate_secret_key_123456";
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://localhost:27017/mindmate_phase2_test";

const app = require("../src/app");
const User = require("../src/models/User");
const Assessment = require("../src/models/Assessment");
const CheckIn = require("../src/models/CheckIn");
const { validateAssessmentInput } = require("../src/controllers/assessmentController");

describe("Phase 2: Assessment Gateway & Error Handling", () => {
  let server;
  let serverUrl;
  let mockFastApiServer;
  let mockFastApiPort;
  let mockFastApiHandler;

  let testUserA;
  let tokenA;
  let testUserB;
  let tokenB;

  const validPayload = {
    nervousness: 1,
    unable_to_control: 2,
    worry: 0,
    trouble_relaxation: 3,
    restlessness: 1,
    irritability: 2,
    fear: 0,
  };

  const sampleFastApiResponse = {
    predicted_class: "Moderate",
    class_index: 2,
    probabilities: {
      No: 0.05,
      Mild: 0.15,
      Moderate: 0.65,
      Severe: 0.15,
    },
    model_version: "RandomForest_MultiTier_v1",
    disclaimer: "This is a machine learning survey pattern prediction for educational reflection.",
  };

  before(async () => {
    // 1. Connect to isolated MongoDB test database
    await mongoose.connect(TEST_MONGO_URI);

    // 2. Start mock FastAPI HTTP server
    mockFastApiServer = http.createServer((req, res) => {
      if (mockFastApiHandler) {
        mockFastApiHandler(req, res);
      } else {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "No handler configured" }));
      }
    });

    await new Promise((resolve) => {
      mockFastApiServer.listen(0, "127.0.0.1", () => {
        mockFastApiPort = mockFastApiServer.address().port;
        process.env.FASTAPI_SERVICE_URL = `http://127.0.0.1:${mockFastApiPort}`;
        resolve();
      });
    });

    // 3. Start Express server on ephemeral port
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 4. Create test users
    await User.deleteMany({});
    testUserA = await User.create({
      name: "Student Alpha",
      email: "alpha@northfield.edu",
      password: "Password123!",
    });
    tokenA = jwt.sign({ id: testUserA._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    testUserB = await User.create({
      name: "Student Beta",
      email: "beta@northfield.edu",
      password: "Password123!",
    });
    tokenB = jwt.sign({ id: testUserB._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
  });

  after(async () => {
    // Cleanup database and stop servers
    try {
      await Assessment.deleteMany({});
      await CheckIn.deleteMany({});
      await User.deleteMany({});
      await mongoose.disconnect();
    } catch (_) {}

    if (server) await new Promise((r) => server.close(r));
    if (mockFastApiServer) await new Promise((r) => mockFastApiServer.close(r));
  });

  beforeEach(async () => {
    await Assessment.deleteMany({});
    await CheckIn.deleteMany({});
    // Default mock handler: responds with valid prediction
    mockFastApiHandler = async (req, res) => {
      if (req.method === "POST" && req.url === "/assessment/predict") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const parsed = JSON.parse(body);

        // Verify that the forwarded payload has exactly the expected 7 features
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(sampleFastApiResponse));
      } else if (req.method === "POST" && req.url === "/wellness/compute-stress") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ score: 42, level: "Moderate", recommendations: [] }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Not Found" }));
      }
    };
  });

  // -------------------------------------------------------------
  // Unit Validation Tests
  // -------------------------------------------------------------
  describe("Input Validation (validateAssessmentInput)", () => {
    it("accepts valid questionnaire inputs with integers 0-3", () => {
      const res = validateAssessmentInput(validPayload);
      assert.equal(res.valid, true);
      assert.deepEqual(res.payload, validPayload);
    });

    it("rejects non-object or null request bodies", () => {
      assert.equal(validateAssessmentInput(null).valid, false);
      assert.equal(validateAssessmentInput("string").valid, false);
      assert.equal(validateAssessmentInput([1, 2, 3]).valid, false);
    });

    it("rejects missing features", () => {
      const missingFear = { ...validPayload };
      delete missingFear.fear;
      const res = validateAssessmentInput(missingFear);
      assert.equal(res.valid, false);
      assert.match(res.message, /fear.*required/i);
    });

    it("rejects out-of-range values (< 0 or > 3)", () => {
      const negative = { ...validPayload, nervousness: -1 };
      const resNeg = validateAssessmentInput(negative);
      assert.equal(resNeg.valid, false);
      assert.match(resNeg.message, /nervousness.*between 0 and 3/i);

      const tooHigh = { ...validPayload, irritability: 4 };
      const resHigh = validateAssessmentInput(tooHigh);
      assert.equal(resHigh.valid, false);
      assert.match(resHigh.message, /irritability.*between 0 and 3/i);
    });

    it("rejects non-integer types (floats, strings, booleans, null)", () => {
      const floatVal = { ...validPayload, worry: 1.5 };
      assert.equal(validateAssessmentInput(floatVal).valid, false);

      const strVal = { ...validPayload, restlessness: "2" };
      assert.equal(validateAssessmentInput(strVal).valid, false);

      const boolVal = { ...validPayload, trouble_relaxation: true };
      assert.equal(validateAssessmentInput(boolVal).valid, false);
    });

    it("strips extraneous fields to prevent parameter pollution", () => {
      const polluted = {
        ...validPayload,
        userId: "attacker_id",
        role: "admin",
        maliciousKey: true,
      };
      const res = validateAssessmentInput(polluted);
      assert.equal(res.valid, true);
      assert.equal(res.payload.userId, undefined);
      assert.equal(res.payload.role, undefined);
      assert.equal(Object.keys(res.payload).length, 7);
    });
  });

  // -------------------------------------------------------------
  // Authentication & Authorization Tests
  // -------------------------------------------------------------
  describe("Authentication Requirements", () => {
    it("rejects POST /api/assessment/predict without token with 401", async () => {
      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPayload),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.message, /not authorized|no token/i);
    });

    it("rejects POST /api/assessment/predict with invalid token with 401", async () => {
      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid_token_xyz",
        },
        body: JSON.stringify(validPayload),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.message, /not authorized|token failed/i);
    });

    it("rejects GET /api/assessment/history without token with 401", async () => {
      const res = await fetch(`${serverUrl}/api/assessment/history`);
      assert.equal(res.status, 401);
    });
  });

  // -------------------------------------------------------------
  // Validation Error Handling (via HTTP)
  // -------------------------------------------------------------
  describe("HTTP Validation Handling", () => {
    it("returns 400 when required fields are missing", async () => {
      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ nervousness: 1, worry: 2 }), // Missing 5 fields
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /validation failed/i);
      assert.ok(Array.isArray(data.errors));
      assert.ok(data.errors.length >= 5);
    });

    it("returns 400 when field values are out of bounds or non-integer", async () => {
      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ ...validPayload, restlessness: 99 }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /between 0 and 3/i);
    });
  });

  // -------------------------------------------------------------
  // Upstream Forwarding & Prediction Persistence
  // -------------------------------------------------------------
  describe("Upstream Inference Forwarding & Persistence", () => {
    it("forwards validated payload to FastAPI and persists genuine prediction", async () => {
      let forwardedBody = null;
      mockFastApiHandler = async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        forwardedBody = JSON.parse(raw);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(sampleFastApiResponse));
      };

      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify(validPayload),
      });

      assert.equal(res.status, 201);
      const data = await res.json();

      // Verify response structure preserves FastAPI contract
      assert.equal(data.predicted_class, "Moderate");
      assert.equal(data.class_index, 2);
      assert.equal(data.probabilities.Moderate, 0.65);
      assert.equal(data.model_version, "RandomForest_MultiTier_v1");
      assert.ok(data.disclaimer);
      assert.ok(data._id);
      assert.equal(data.userId, testUserA._id.toString());
      assert.deepEqual(data.responses, validPayload);

      // Verify payload forwarded to FastAPI contained clean 7 items
      assert.deepEqual(forwardedBody, validPayload);

      // Verify database record in MongoDB
      const saved = await Assessment.findById(data._id);
      assert.ok(saved);
      assert.equal(saved.userId.toString(), testUserA._id.toString());
      assert.equal(saved.predicted_class, "Moderate");
      assert.equal(saved.class_index, 2);
      assert.equal(saved.probabilities.get("Moderate") || saved.probabilities.Moderate, 0.65);
      assert.equal(saved.model_version, "RandomForest_MultiTier_v1");
    });

    it("enforces user ownership and ignores spoofed userId in request body", async () => {
      const spoofedPayload = {
        ...validPayload,
        userId: testUserB._id.toString(), // Attacker tries to impersonate User B
      };

      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`, // Authenticated as User A
        },
        body: JSON.stringify(spoofedPayload),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.userId, testUserA._id.toString());

      const saved = await Assessment.findById(data._id);
      assert.equal(saved.userId.toString(), testUserA._id.toString());
    });
  });

  // -------------------------------------------------------------
  // Upstream Error Handling & No Fake ML Fallback
  // -------------------------------------------------------------
  describe("Upstream Error Handling & Fake Fallback Elimination", () => {
    it("returns HTTP 503 and DOES NOT persist record when upstream is offline", async () => {
      // Temporarily point FASTAPI_SERVICE_URL to an unallocated port
      process.env.FASTAPI_SERVICE_URL = "http://127.0.0.1:59999";

      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify(validPayload),
      });

      assert.equal(res.status, 503);
      const data = await res.json();
      assert.match(data.message, /unavailable|not reachable|refused/i);

      // Verify no record was saved to MongoDB
      const count = await Assessment.countDocuments({});
      assert.equal(count, 0);

      // Restore mock port
      process.env.FASTAPI_SERVICE_URL = `http://127.0.0.1:${mockFastApiPort}`;
    });

    it("propagates upstream HTTP 503 without disguising failure or inventing fallback", async () => {
      mockFastApiHandler = async (req, res) => {
        for await (const chunk of req) {} // drain body stream
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            detail: "Model pipeline is currently unavailable. Please ensure model artifacts are generated.",
          })
        );
      };

      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify(validPayload),
      });

      assert.equal(res.status, 503);
      const data = await res.json();
      assert.match(data.message, /model pipeline is currently unavailable/i);

      // Verify no fake record was written
      const count = await Assessment.countDocuments({});
      assert.equal(count, 0);
    });

    it("returns HTTP 502 when upstream returns malformed response", async () => {
      mockFastApiHandler = async (req, res) => {
        for await (const chunk of req) {} // drain body stream
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ something_unexpected: true })); // Missing predicted_class, class_index, probabilities
      };

      const res = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify(validPayload),
      });

      assert.equal(res.status, 502);
      const data = await res.json();
      assert.match(data.message, /malformed response/i);

      const count = await Assessment.countDocuments({});
      assert.equal(count, 0);
    });
  });

  // -------------------------------------------------------------
  // History & Ownership Isolation
  // -------------------------------------------------------------
  describe("Assessment History & Ownership Isolation", () => {
    it("returns assessment history sorted newest first and isolates user data", async () => {
      // 1. User A creates assessment 1
      await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ ...validPayload, nervousness: 0 }),
      });

      // Small delay to ensure timestamp separation
      await new Promise((r) => setTimeout(r, 20));

      // 2. User A creates assessment 2
      await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ ...validPayload, nervousness: 3 }),
      });

      // 3. User B creates assessment 1
      await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ ...validPayload, irritability: 1 }),
      });

      // Fetch history for User A
      const resA = await fetch(`${serverUrl}/api/assessment/history`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(resA.status, 200);
      const historyA = await resA.json();

      assert.equal(historyA.length, 2);
      assert.equal(historyA[0].responses.nervousness, 3); // Newest first
      assert.equal(historyA[1].responses.nervousness, 0);
      assert.ok(new Date(historyA[0].createdAt) >= new Date(historyA[1].createdAt));

      // Fetch history for User B
      const resB = await fetch(`${serverUrl}/api/assessment/history`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(resB.status, 200);
      const historyB = await resB.json();

      assert.equal(historyB.length, 1);
      assert.equal(historyB[0].responses.irritability, 1);
    });

    it("prevents User A from accessing User B's assessment by ID (returns 404)", async () => {
      // User B creates an assessment
      const resPostB = await fetch(`${serverUrl}/api/assessment/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify(validPayload),
      });
      const dataB = await resPostB.json();
      const assessmentIdB = dataB._id;

      // User A attempts to view User B's assessment
      const resGetA = await fetch(`${serverUrl}/api/assessment/${assessmentIdB}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(resGetA.status, 404);
      const dataGetA = await resGetA.json();
      assert.match(dataGetA.message, /not found/i);

      // User B CAN view their own assessment
      const resGetB = await fetch(`${serverUrl}/api/assessment/${assessmentIdB}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(resGetB.status, 200);
      const dataGetB = await resGetB.json();
      assert.equal(dataGetB._id, assessmentIdB);
    });
  });

  // -------------------------------------------------------------
  // Flow B Independence (Lifestyle Check-in Regression)
  // -------------------------------------------------------------
  describe("Flow B Lifestyle Check-in Independence", () => {
    it("preserves daily lifestyle check-in independently without touching Assessment", async () => {
      const lifestylePayload = {
        sleep: 7,
        study: 5,
        screen: 4,
        exam: 10,
        mood: "good",
        note: "Studying calmly today",
      };

      const res = await fetch(`${serverUrl}/api/wellness/checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify(lifestylePayload),
      });

      assert.equal(res.status, 200);
      const checkin = await res.json();
      assert.equal(checkin.stressScore, 42);
      assert.equal(checkin.stressLevel, "Moderate");
      assert.equal(checkin.sleep, 7);

      // Verify that CheckIn was saved in MongoDB
      const savedCheckIn = await CheckIn.findOne({ userId: testUserA._id });
      assert.ok(savedCheckIn);
      assert.equal(savedCheckIn.stressScore, 42);

      // Verify that Assessment collection was NOT touched by the lifestyle check-in
      const assessmentCount = await Assessment.countDocuments({});
      assert.equal(assessmentCount, 0);
    });
  });
});
