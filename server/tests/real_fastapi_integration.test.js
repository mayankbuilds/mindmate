const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_mindmate_secret_key_integration";
const TEST_MONGO_URI = "mongodb://localhost:27017/mindmate_real_integration_test";
const FASTAPI_TEST_PORT = 8008;

const app = require("../src/app");
const User = require("../src/models/User");
const Assessment = require("../src/models/Assessment");

describe("Phase 2: Real FastAPI ML Integration Test", () => {
  let uvicornProcess;
  let server;
  let serverUrl;
  let testUser;
  let userToken;

  before(async () => {
    // 1. Connect MongoDB
    await mongoose.connect(TEST_MONGO_URI);
    await Assessment.deleteMany({});
    await User.deleteMany({});

    testUser = await User.create({
      name: "Integration Student",
      email: "integ@northfield.edu",
      password: "Password123!",
    });
    userToken = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    // 2. Start real FastAPI server with Phase 1 ML artifacts
    const aiServiceDir = path.resolve(__dirname, "../../ai-service");
    const pythonBin = path.join(aiServiceDir, ".venv/bin/uvicorn");

    uvicornProcess = spawn(
      pythonBin,
      ["app.main:app", "--host", "127.0.0.1", "--port", String(FASTAPI_TEST_PORT)],
      { cwd: aiServiceDir, stdio: "ignore" }
    );

    // Wait for FastAPI to become healthy
    let isReady = false;
    for (let i = 0; i < 30; i++) {
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
      throw new Error("FastAPI test service failed to start on port " + FASTAPI_TEST_PORT);
    }

    process.env.FASTAPI_SERVICE_URL = `http://127.0.0.1:${FASTAPI_TEST_PORT}`;

    // 3. Start Express server
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
      await User.deleteMany({});
      await mongoose.disconnect();
    } catch (_) {}

    if (server) await new Promise((r) => server.close(r));
    if (uvicornProcess) {
      uvicornProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
    }
  });

  it("successfully passes real questionnaire through Express gateway to real RandomForest model", async () => {
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
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const data = await res.json();

    // Verify real ML output structure
    assert.equal(data.predicted_class, "Severe");
    assert.equal(data.class_index, 3);
    assert.ok(data.probabilities.Severe > 0.5);
    assert.equal(data.model_version, "RandomForest_MultiTier_v1");
    assert.ok(data.disclaimer.includes("educational reflection"));

    // Verify persisted in MongoDB
    const saved = await Assessment.findById(data._id);
    assert.ok(saved);
    assert.equal(saved.predicted_class, "Severe");
  });

  it("handles low-stress inputs through real ML pipeline and persists history", async () => {
    const payload = {
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
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const data = await res.json();

    assert.equal(data.predicted_class, "No");
    assert.equal(data.class_index, 0);
    assert.ok(data.probabilities.No > 0.5);

    // Verify history endpoint retrieves both real assessments
    const histRes = await fetch(`${serverUrl}/api/assessment/history`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(histRes.status, 200);
    const history = await histRes.json();
    assert.equal(history.length, 2);
    assert.equal(history[0].predicted_class, "No"); // Newest
    assert.equal(history[1].predicted_class, "Severe"); // Previous
  });
});
