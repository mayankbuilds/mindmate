const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_mindmate_secret_key_123456";
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://localhost:27017/mindmate_wellness_test";

const app = require("../src/app");
const User = require("../src/models/User");
const CheckIn = require("../src/models/CheckIn");
const { getAppDateString } = require("../src/controllers/wellnessController");

describe("Production Readiness: Daily Check-In & Account Isolation", () => {
  let server;
  let serverUrl;

  let testUserA;
  let tokenA;
  let testUserB;
  let tokenB;

  const makeRequest = (path, method = "GET", body = null, token = null) => {
    return new Promise((resolve, reject) => {
      const url = new URL(path, serverUrl);
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const req = http.request(
        url,
        { method, headers },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({
                status: res.statusCode,
                body: data ? JSON.parse(data) : null,
              });
            } catch (err) {
              resolve({ status: res.statusCode, body: data });
            }
          });
        }
      );

      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  };

  before(async () => {
    await mongoose.connect(TEST_MONGO_URI);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Create User A
    await User.deleteMany({ email: { $in: ["usera_wellness@test.com", "userb_wellness@test.com"] } });
    await CheckIn.deleteMany({});

    testUserA = await User.create({
      name: "User A",
      email: "usera_wellness@test.com",
      password: "hashedpassword123",
      college: "Test College",
    });
    tokenA = jwt.sign({ id: testUserA._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    testUserB = await User.create({
      name: "User B",
      email: "userb_wellness@test.com",
      password: "hashedpassword123",
      college: "Test College",
    });
    tokenB = jwt.sign({ id: testUserB._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
  });

  after(async () => {
    await User.deleteMany({ email: { $in: ["usera_wellness@test.com", "userb_wellness@test.com"] } });
    await CheckIn.deleteMany({});
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await CheckIn.deleteMany({});
  });

  it("1. Newly created account starts with zero check-ins (null today check-in)", async () => {
    const res = await makeRequest("/api/wellness/today", "GET", null, tokenA);
    assert.equal(res.status, 200);
    assert.equal(res.body, null, "New user must start with null today check-in");

    const historyRes = await makeRequest("/api/wellness/history", "GET", null, tokenA);
    assert.equal(historyRes.status, 200);
    assert.deepEqual(historyRes.body, [], "New user must start with empty history array");
  });

  it("2. User isolation: User A's check-in is never accessible to User B", async () => {
    const payloadA = { sleep: 8, study: 5, screen: 3, exam: 10, mood: "good", note: "Feeling focused" };
    const createRes = await makeRequest("/api/wellness/checkin", "POST", payloadA, tokenA);
    assert.equal(createRes.status, 200);
    assert.equal(createRes.body.sleep, 8);
    assert.equal(createRes.body.userId, testUserA._id.toString());

    // User A can see it
    const todayA = await makeRequest("/api/wellness/today", "GET", null, tokenA);
    assert.equal(todayA.status, 200);
    assert.ok(todayA.body);
    assert.equal(todayA.body.sleep, 8);

    // User B querying today gets null
    const todayB = await makeRequest("/api/wellness/today", "GET", null, tokenB);
    assert.equal(todayB.status, 200);
    assert.equal(todayB.body, null, "User B must see null today check-in despite User A having logged");

    // User B querying history gets empty list
    const historyB = await makeRequest("/api/wellness/history", "GET", null, tokenB);
    assert.equal(historyB.status, 200);
    assert.deepEqual(historyB.body, [], "User B must see 0 historical records");
  });

  it("3. Midnight rollover: Past check-ins remain in history, but today view resets", async () => {
    const todayStr = getAppDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = getAppDateString(yesterdayDate);

    // Save yesterday's check-in directly in DB
    await CheckIn.create({
      userId: testUserA._id,
      date: yesterdayStr,
      sleep: 7,
      study: 6,
      screen: 4,
      exam: 12,
      mood: "okay",
      stressScore: 45,
      stressLevel: "Moderate",
    });

    // Today view must be null (midnight rollover resets today view)
    const todayRes = await makeRequest("/api/wellness/today", "GET", null, tokenA);
    assert.equal(todayRes.status, 200);
    assert.equal(todayRes.body, null, "Today check-in must be null after date rollover");

    // History must retain yesterday's check-in
    const historyRes = await makeRequest("/api/wellness/history", "GET", null, tokenA);
    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.body.length, 1);
    assert.equal(historyRes.body[0].date, yesterdayStr);
    assert.equal(historyRes.body[0].sleep, 7);
  });

  it("4. Rejects unauthenticated requests with HTTP 401", async () => {
    const unauthToday = await makeRequest("/api/wellness/today", "GET", null, null);
    assert.equal(unauthToday.status, 401);

    const unauthCheckin = await makeRequest("/api/wellness/checkin", "POST", { sleep: 8 }, null);
    assert.equal(unauthCheckin.status, 401);

    const unauthHistory = await makeRequest("/api/wellness/history", "GET", null, null);
    assert.equal(unauthHistory.status, 401);
  });

  it("5. Updates existing check-in on the same day rather than duplicating", async () => {
    await makeRequest("/api/wellness/checkin", "POST", { sleep: 6, study: 4, screen: 5, exam: 5, mood: "okay" }, tokenA);
    await makeRequest("/api/wellness/checkin", "POST", { sleep: 7.5, study: 6, screen: 3, exam: 5, mood: "great" }, tokenA);

    const historyRes = await makeRequest("/api/wellness/history", "GET", null, tokenA);
    assert.equal(historyRes.body.length, 1, "Must update existing check-in without duplicating date");
    assert.equal(historyRes.body[0].sleep, 7.5);
    assert.equal(historyRes.body[0].mood, "great");
  });
});
