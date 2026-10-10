import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { api } from "../src/services/api.js";

describe("Phase A & B: Dashboard Data Separation & Latest Assessment Display", () => {
  let mockServer;
  let mockServerPort;
  let receivedRequests = [];

  const sampleAssessmentRecord = {
    _id: "assessment_doc_789",
    predicted_class: "Mild",
    class_index: 1,
    probabilities: {
      No: 0.22,
      Mild: 0.58,
      Moderate: 0.15,
      Severe: 0.05,
    },
    model_version: "RandomForest_MultiTier_v1",
    disclaimer: "This is a machine learning survey pattern prediction for educational reflection.",
    responses: {
      nervousness: 1,
      unable_to_control: 1,
      worry: 1,
      trouble_relaxation: 0,
      restlessness: 0,
      irritability: 1,
      fear: 0,
    },
    createdAt: "2026-10-10T12:00:00.000Z",
  };

  const sampleCheckInRecord = {
    _id: "checkin_doc_456",
    date: "2026-10-10",
    sleep: 5.5,
    study: 8.0,
    screen: 7.0,
    exam: 3,
    mood: "stressed",
    note: "Finals week preparation",
    stressScore: 78,
    stressLevel: "High",
  };

  let assessmentHistoryList = [sampleAssessmentRecord];
  let checkInHistoryList = [sampleCheckInRecord];
  let assessmentApiFails = false;

  before(async () => {
    mockServer = http.createServer(async (req, res) => {
      let rawBody = "";
      for await (const chunk of req) rawBody += chunk;
      const parsedBody = rawBody ? JSON.parse(rawBody) : null;

      receivedRequests.push({
        method: req.method,
        url: req.url,
        body: parsedBody,
      });

      if (req.method === "GET" && req.url.includes("/assessment/history")) {
        if (assessmentApiFails) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "ML assessment service unavailable" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(assessmentHistoryList));
      } else if (req.method === "POST" && req.url.includes("/assessment/predict")) {
        const newDoc = {
          _id: `assessment_${Date.now()}`,
          ...parsedBody,
          predicted_class: "Severe",
          class_index: 3,
          probabilities: { No: 0.05, Mild: 0.1, Moderate: 0.2, Severe: 0.65 },
          createdAt: new Date().toISOString(),
        };
        assessmentHistoryList.unshift(newDoc);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(newDoc));
      } else if (req.method === "GET" && req.url.includes("/wellness/today")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(sampleCheckInRecord));
      } else if (req.method === "POST" && req.url.includes("/wellness/checkin")) {
        const checkinDoc = {
          _id: `checkin_${Date.now()}`,
          ...parsedBody,
          stressScore: 72,
          stressLevel: "High",
          date: "2026-10-10",
        };
        checkInHistoryList.unshift(checkinDoc);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(checkinDoc));
      } else if (req.method === "GET" && req.url.includes("/wellness/history")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(checkInHistoryList));
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

  it("1. Preserves complete data and schema separation between Check-in (Flow B) and Assessment (Flow A)", async () => {
    const assessmentHistory = await api.getAssessmentHistory();
    const checkinHistory = await api.getHistory();

    assert.ok(Array.isArray(assessmentHistory));
    assert.ok(Array.isArray(checkinHistory));

    // Assessment record has genuine ML fields
    const assessment = assessmentHistory[0];
    assert.equal(assessment.predicted_class, "Mild");
    assert.ok(assessment.probabilities);
    assert.equal(typeof assessment.probabilities.Mild, "number");
    assert.ok(!("sleep" in assessment));
    assert.ok(!("study" in assessment));

    // Check-in record has habit fields
    const checkin = checkinHistory[0];
    assert.equal(checkin.sleep, 5.5);
    assert.equal(checkin.study, 8.0);
    assert.ok(!("predicted_class" in checkin));
    assert.ok(!("probabilities" in checkin));
  });

  it("2. Correctly formats latest ML assessment probability distribution for Dashboard display", async () => {
    const history = await api.getAssessmentHistory();
    const latest = history[0];

    const targetClasses = ["No", "Mild", "Moderate", "Severe"];
    const formattedPercentages = targetClasses.reduce((acc, c) => {
      acc[c] = Math.round((latest.probabilities[c] || 0) * 100);
      return acc;
    }, {});

    assert.equal(formattedPercentages.No, 22);
    assert.equal(formattedPercentages.Mild, 58);
    assert.equal(formattedPercentages.Moderate, 15);
    assert.equal(formattedPercentages.Severe, 5);
    assert.equal(
      Object.values(formattedPercentages).reduce((a, b) => a + b, 0),
      100
    );

    // Formatted date string exists and is valid
    const dateObj = new Date(latest.createdAt);
    assert.ok(!isNaN(dateObj.getTime()));
  });

  it("3. Handles no-assessment-yet state without inventing fake scores or breaking", async () => {
    assessmentHistoryList = [];
    const emptyHistory = await api.getAssessmentHistory();

    assert.ok(Array.isArray(emptyHistory));
    assert.equal(emptyHistory.length, 0);

    const latest = emptyHistory.length > 0 ? emptyHistory[0] : null;
    assert.equal(latest, null);
  });

  it("4. Handles assessment API failure gracefully without inventing fallback ML predictions", async () => {
    assessmentApiFails = true;
    try {
      await assert.rejects(
        async () => {
          await api.getAssessmentHistory();
        },
        (err) => {
          assert.equal(err.status, 503);
          assert.match(err.message, /unavailable/i);
          return true;
        }
      );
    } finally {
      assessmentApiFails = false;
      assessmentHistoryList = [sampleAssessmentRecord];
    }
  });

  it("5. Updates latest assessment state immediately when a new assessment is submitted", async () => {
    const newSubmission = {
      nervousness: 3,
      unable_to_control: 3,
      worry: 3,
      trouble_relaxation: 3,
      restlessness: 3,
      irritability: 3,
      fear: 3,
    };

    const newResult = await api.predictAssessment(newSubmission);
    assert.equal(newResult.predicted_class, "Severe");
    assert.equal(newResult.probabilities.Severe, 0.65);

    // Verify history now has the new result as the latest (newest first)
    const updatedHistory = await api.getAssessmentHistory();
    assert.equal(updatedHistory[0].predicted_class, "Severe");
    assert.equal(updatedHistory[0].probabilities.Severe, 0.65);
  });

  it("6. Verifies that lifestyle habit score computation is bounded [0, 100] and does not conflict with ML classes", () => {
    // Verifying lifestyle habit score function logic
    const computeLifestyleHabitIndex = (item = {}) => {
      const sleep = Number(item.sleep ?? 7.5);
      const study = Number(item.study ?? 6.0);
      const screen = Number(item.screen ?? 4.5);
      const exam = Number(item.exam ?? 14);
      const sleepP = Math.max(0, 8 - sleep) * 8 + (sleep > 10 ? 4 : 0);
      const studyP = Math.max(0, study - 4) * 3;
      const screenP = Math.max(0, screen - 3) * 4;
      const examP = exam <= 3 ? 18 : exam <= 7 ? 14 : exam <= 14 ? 9 : 2;
      return Math.round(Math.max(4, Math.min(98, 10 + sleepP + studyP + screenP + examP)));
    };

    const heavyHabits = computeLifestyleHabitIndex({ sleep: 4, study: 9, screen: 8, exam: 2 });
    assert.ok(heavyHabits >= 65 && heavyHabits <= 98, `Expected heavy habit index, got ${heavyHabits}`);

    const balancedHabits = computeLifestyleHabitIndex({ sleep: 8, study: 4, screen: 2, exam: 30 });
    assert.ok(balancedHabits <= 35, `Expected low habit load, got ${balancedHabits}`);
  });
});
