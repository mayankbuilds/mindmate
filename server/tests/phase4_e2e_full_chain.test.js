const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase4_e2e_secret_key_integration_verification";
const TEST_MONGO_URI = "mongodb://localhost:27017/mindmate_phase4_e2e_test";
const FASTAPI_TEST_PORT = 8011;

const app = require("../src/app");
const User = require("../src/models/User");
const Assessment = require("../src/models/Assessment");
const CheckIn = require("../src/models/CheckIn");

describe("Phase 4: Complete End-to-End Live Integration Verification", () => {
  let uvicornProcess;
  let server;
  let serverUrl;
  let userAToken;
  let userBToken;
  let userAId;
  let userBId;
  let createdAssessmentAId;

  // Helper to start FastAPI on a designated port
  const startFastApi = async () => {
    const aiServiceDir = path.resolve(__dirname, "../../ai-service");
    const pythonBin = path.join(aiServiceDir, ".venv/bin/uvicorn");

    const proc = spawn(
      pythonBin,
      ["app.main:app", "--host", "127.0.0.1", "--port", String(FASTAPI_TEST_PORT)],
      { cwd: aiServiceDir, stdio: "ignore" }
    );

    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${FASTAPI_TEST_PORT}/health`);
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!isReady) {
      proc.kill("SIGTERM");
      throw new Error("FastAPI failed to start on port " + FASTAPI_TEST_PORT);
    }

    return proc;
  };

  before(async () => {
    // 1. Connect MongoDB and clean collections
    await mongoose.connect(TEST_MONGO_URI);
    await Assessment.deleteMany({});
    await CheckIn.deleteMany({});
    await User.deleteMany({});

    // 2. Start real FastAPI server
    uvicornProcess = await startFastApi();
    process.env.FASTAPI_SERVICE_URL = `http://127.0.0.1:${FASTAPI_TEST_PORT}`;

    // 3. Start Express server on dynamic port
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    try {
      await Assessment.deleteMany({});
      await CheckIn.deleteMany({});
      await User.deleteMany({});
      await mongoose.disconnect();
    } catch (_) {}

    if (server) await new Promise((r) => server.close(r));
    if (uvicornProcess && !uvicornProcess.killed) {
      uvicornProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
    }
  });

  it("Step 1: Authenticates User A and User B via real auth endpoints", async () => {
    // Register User A
    const resA = await fetch(`${serverUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice Johnson",
        email: "alice_e2e@mindmate.test",
        password: "SecurePassword123!",
      }),
    });
    assert.equal(resA.status, 201);
    const dataA = await resA.json();
    assert.ok(dataA.token);
    userAToken = dataA.token;
    userAId = dataA._id || dataA.id;

    // Register User B
    const resB = await fetch(`${serverUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bob Smith",
        email: "bob_e2e@mindmate.test",
        password: "SecurePassword456!",
      }),
    });
    assert.equal(resB.status, 201);
    const dataB = await resB.json();
    assert.ok(dataB.token);
    userBToken = dataB.token;
    userBId = dataB._id || dataB.id;
  });

  it("Step 2: Submits real severe questionnaire (Flow A) to Express -> FastAPI -> Scikit-Learn -> MongoDB", async () => {
    const payload = {
      nervousness: 3,
      unable_to_control: 3,
      worry: 3,
      trouble_relaxation: 3,
      restlessness: 3,
      irritability: 3,
      fear: 3,
    };

    const res = await fetch(`${serverUrl}/api/assessment/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    createdAssessmentAId = data._id;

    // Verify ML response
    assert.equal(data.predicted_class, "Severe");
    assert.equal(data.class_index, 3);
    assert.ok(typeof data.probabilities === "object");
    assert.ok(data.probabilities.Severe > 0.5);

    // Verify probabilities sum to ~1.0
    const probSum = Object.values(data.probabilities).reduce((sum, p) => sum + p, 0);
    assert.ok(Math.abs(probSum - 1.0) < 1e-4, `Probabilities must sum to 1.0, got ${probSum}`);

    assert.equal(data.model_version, "RandomForest_MultiTier_v1");
    assert.ok(data.disclaimer.includes("educational reflection"));

    // Verify MongoDB persistence
    const saved = await Assessment.findById(createdAssessmentAId);
    assert.ok(saved);
    assert.equal(saved.userId.toString(), userAId.toString());
    assert.equal(saved.predicted_class, "Severe");
  });

  it("Step 3: Submits low-stress questionnaire and verifies ordered history retrieval", async () => {
    const lowPayload = {
      nervousness: 0,
      unable_to_control: 0,
      worry: 0,
      trouble_relaxation: 0,
      restlessness: 0,
      irritability: 0,
      fear: 0,
    };

    const res = await fetch(`${serverUrl}/api/assessment/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify(lowPayload),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.predicted_class, "No");
    assert.equal(data.class_index, 0);
    assert.ok(data.probabilities.No > 0.5);

    // Retrieve history
    const histRes = await fetch(`${serverUrl}/api/assessment/history`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    assert.equal(histRes.status, 200);
    const history = await histRes.json();

    assert.equal(history.length, 2);
    // Newest first
    assert.equal(history[0].predicted_class, "No");
    assert.equal(history[1].predicted_class, "Severe");
  });

  it("Step 4: Flow B Lifestyle Check-In does NOT touch or contaminate Flow A Assessment collection", async () => {
    // Check Assessment count before
    const assessmentCountBefore = await Assessment.countDocuments();
    assert.equal(assessmentCountBefore, 2);

    // Submit Flow B Lifestyle Check-in
    const lifestylePayload = {
      sleep: 8,
      study: 6,
      screen: 4,
      exam: false,
      mood: "good",
      note: "E2E separation test note",
    };

    const res = await fetch(`${serverUrl}/api/wellness/checkin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify(lifestylePayload),
    });

    assert.equal(res.status, 200);
    const checkInData = await res.json();

    assert.equal(checkInData.userId.toString(), userAId.toString());
    assert.ok(typeof checkInData.stressScore === "number");
    assert.ok(typeof checkInData.stressLevel === "string");

    // Verify CheckIn collection has 1 entry
    const checkInCount = await CheckIn.countDocuments();
    assert.equal(checkInCount, 1);

    // Verify Assessment collection is completely untouched
    const assessmentCountAfter = await Assessment.countDocuments();
    assert.equal(assessmentCountAfter, 2);

    // Verify Assessment history endpoint still has only 2 items
    const histRes = await fetch(`${serverUrl}/api/assessment/history`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    const history = await histRes.json();
    assert.equal(history.length, 2);
    assert.ok(!history.some((h) => h.sleep !== undefined || h.stressScore !== undefined));
  });

  it("Step 5: Enforces strict cross-user data isolation", async () => {
    // User B tries to get User A's assessment by ID -> 404
    const resAFromB = await fetch(`${serverUrl}/api/assessment/${createdAssessmentAId}`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    assert.equal(resAFromB.status, 404);

    // User B queries own history -> empty array
    const histBRes = await fetch(`${serverUrl}/api/assessment/history`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    assert.equal(histBRes.status, 200);
    const histB = await histBRes.json();
    assert.equal(histB.length, 0);
  });

  it("Step 6: Enforces authentication on all assessment endpoints", async () => {
    // Unauthenticated POST /predict
    const unauthPredict = await fetch(`${serverUrl}/api/assessment/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nervousness: 0, unable_to_control: 0, worry: 0, trouble_relaxation: 0, restlessness: 0, irritability: 0, fear: 0 }),
    });
    assert.equal(unauthPredict.status, 401);

    // Unauthenticated GET /history
    const unauthHist = await fetch(`${serverUrl}/api/assessment/history`);
    assert.equal(unauthHist.status, 401);
  });

  it("Step 7: Rejects invalid inputs with HTTP 400 without saving anything", async () => {
    const countBefore = await Assessment.countDocuments();

    // Missing field
    const missingRes = await fetch(`${serverUrl}/api/assessment/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        nervousness: 1,
        unable_to_control: 1,
        worry: 1,
        trouble_relaxation: 1,
        restlessness: 1,
        irritability: 1,
        // fear is missing
      }),
    });
    assert.equal(missingRes.status, 400);

    // Out of range field (> 3)
    const outOfRangeRes = await fetch(`${serverUrl}/api/assessment/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        nervousness: 1,
        unable_to_control: 1,
        worry: 1,
        trouble_relaxation: 1,
        restlessness: 1,
        irritability: 1,
        fear: 4,
      }),
    });
    assert.equal(outOfRangeRes.status, 400);

    // Non-integer float
    const floatRes = await fetch(`${serverUrl}/api/assessment/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        nervousness: 1.5,
        unable_to_control: 1,
        worry: 1,
        trouble_relaxation: 1,
        restlessness: 1,
        irritability: 1,
        fear: 1,
      }),
    });
    assert.equal(floatRes.status, 400);

    const countAfter = await Assessment.countDocuments();
    assert.equal(countAfter, countBefore, "Invalid requests must not persist records");
  });

  it("Step 8: Fault tolerance - When FastAPI is offline, returns HTTP 503 without fake score or DB pollution", async () => {
    const countBefore = await Assessment.countDocuments();

    // Kill FastAPI process
    uvicornProcess.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 400));

    // Submit valid assessment while FastAPI is dead
    const resOffline = await fetch(`${serverUrl}/api/assessment/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        nervousness: 2,
        unable_to_control: 2,
        worry: 2,
        trouble_relaxation: 2,
        restlessness: 2,
        irritability: 2,
        fear: 2,
      }),
    });

    assert.equal(resOffline.status, 503);
    const errBody = await resOffline.json();
    assert.ok(
      errBody.message.includes("unavailable") ||
      errBody.message.includes("reachable") ||
      errBody.message.includes("refused") ||
      errBody.message.includes("offline")
    );
    // Ensure no fake prediction was invented
    assert.equal(errBody.predicted_class, undefined);
    assert.equal(errBody.score, undefined);

    // Ensure database was NOT modified
    const countAfter = await Assessment.countDocuments();
    assert.equal(countAfter, countBefore, "Offline inference failure must not write to database");
  });
});
