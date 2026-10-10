import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { api, getBaseUrl } from "../src/services/api.js";

describe("Phase 3: Frontend API Service & Assessment Gateway Integration", () => {
  let mockServer;
  let mockServerPort;
  let receivedRequests = [];

  const sampleAssessmentResponse = {
    _id: "test_assessment_123",
    predicted_class: "Severe",
    class_index: 3,
    probabilities: {
      No: 0.04,
      Mild: 0.08,
      Moderate: 0.16,
      Severe: 0.72,
    },
    model_version: "RandomForest_MultiTier_v1",
    disclaimer: "This is a machine learning survey pattern prediction for educational reflection.",
    responses: {
      nervousness: 3,
      unable_to_control: 3,
      worry: 3,
      trouble_relaxation: 3,
      restlessness: 3,
      irritability: 3,
      fear: 3,
    },
    createdAt: new Date().toISOString(),
  };

  let simulate503 = false;

  before(async () => {
    mockServer = http.createServer(async (req, res) => {
      let rawBody = "";
      for await (const chunk of req) rawBody += chunk;
      const parsedBody = rawBody ? JSON.parse(rawBody) : null;

      receivedRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: parsedBody,
      });

      if (req.method === "POST" && req.url.includes("/assessment/predict")) {
        if (simulate503) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "ML inference service is temporarily unavailable" }));
          return;
        }

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(sampleAssessmentResponse));
      } else if (req.method === "GET" && req.url.includes("/assessment/history")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([sampleAssessmentResponse]));
      } else if (req.method === "POST" && req.url.includes("/wellness/checkin")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ stressScore: 45, stressLevel: "Moderate", sleep: 7 }));
      } else if (req.method === "GET" && req.url.includes("/wellness/history")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ stressScore: 45, date: "2026-10-10", sleep: 7 }]));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Not found" }));
      }
    });

    await new Promise((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        mockServerPort = mockServer.address().port;
        process.env.VITE_API_BASE_URL = `http://127.0.0.1:${mockServerPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise((r) => mockServer.close(r));
    }
  });

  it("submits all seven features to POST /assessment/predict and returns genuine prediction", async () => {
    const payload = {
      nervousness: 3,
      unable_to_control: 3,
      worry: 3,
      trouble_relaxation: 3,
      restlessness: 3,
      irritability: 3,
      fear: 3,
    };

    const res = await api.predictAssessment(payload);

    // 1. Verify response structure matches API contract
    assert.equal(res.predicted_class, "Severe");
    assert.equal(res.class_index, 3);
    assert.equal(res.probabilities.Severe, 0.72);
    assert.equal(res.model_version, "RandomForest_MultiTier_v1");
    assert.ok(res.disclaimer.includes("educational reflection"));

    // 2. Verify mock server received the exact expected payload with all 7 fields
    const lastReq = receivedRequests.find((r) => r.url.includes("/assessment/predict"));
    assert.ok(lastReq);
    assert.equal(lastReq.method, "POST");
    assert.deepEqual(lastReq.body, payload);
    assert.equal(Object.keys(lastReq.body).length, 7);
  });

  it("surfaces upstream 503 error without inventing a fake prediction", async () => {
    const payload = {
      nervousness: 1,
      unable_to_control: 1,
      worry: 1,
      trouble_relaxation: 1,
      restlessness: 1,
      irritability: 1,
      fear: 1,
    };

    simulate503 = true;
    try {
      await assert.rejects(
        async () => {
          await api.predictAssessment(payload);
        },
        (err) => {
          assert.equal(err.status, 503);
          assert.match(err.message, /temporarily unavailable/i);
          return true;
        }
      );
    } finally {
      simulate503 = false;
    }
  });

  it("retrieves real assessment history from GET /assessment/history", async () => {
    const history = await api.getAssessmentHistory();
    assert.ok(Array.isArray(history));
    assert.equal(history.length, 1);
    assert.equal(history[0].predicted_class, "Severe");
    assert.equal(history[0].probabilities.Severe, 0.72);
  });

  it("preserves daily lifestyle check-in independently (Flow B)", async () => {
    const checkinRes = await api.checkin({
      sleep: 7,
      study: 6,
      screen: 4,
      exam: 10,
      mood: "okay",
      note: "Studying calmly",
    });

    assert.equal(checkinRes.stressScore, 45);
    assert.equal(checkinRes.stressLevel, "Moderate");

    const historyRes = await api.getHistory();
    assert.ok(Array.isArray(historyRes));
    assert.equal(historyRes.length, 1);
    assert.equal(historyRes[0].stressScore, 45);
  });

  describe("VITE_API_URL Configuration & Normalization", () => {
    it("normalizes VITE_API_URL without /api suffix", () => {
      process.env.VITE_API_URL = "https://mindmate-backend.onrender.com";
      assert.equal(getBaseUrl(), "https://mindmate-backend.onrender.com/api");
      delete process.env.VITE_API_URL;
    });

    it("normalizes VITE_API_URL with /api suffix and trailing slashes", () => {
      process.env.VITE_API_URL = "https://mindmate-backend.onrender.com/api///";
      assert.equal(getBaseUrl(), "https://mindmate-backend.onrender.com/api");
      delete process.env.VITE_API_URL;
    });

    it("prioritizes VITE_API_URL over legacy VITE_API_BASE_URL", () => {
      process.env.VITE_API_URL = "https://preferred-api.onrender.com";
      process.env.VITE_API_BASE_URL = "https://legacy-api.onrender.com";
      assert.equal(getBaseUrl(), "https://preferred-api.onrender.com/api");
      delete process.env.VITE_API_URL;
      delete process.env.VITE_API_BASE_URL;
    });

    it("falls back to localhost:5000/api in development when unset", () => {
      delete process.env.VITE_API_URL;
      delete process.env.VITE_API_BASE_URL;
      assert.equal(getBaseUrl(), "http://localhost:5000/api");
    });

    it("falls back to relative /api in production when unset (no localhost)", () => {
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      delete process.env.VITE_API_URL;
      delete process.env.VITE_API_BASE_URL;
      assert.equal(getBaseUrl(), "/api");
      process.env.NODE_ENV = prevNodeEnv;
    });
  });
});
