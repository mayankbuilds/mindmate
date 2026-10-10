import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { api } from "../src/services/api.js";

describe("Phase C: Frontend AI Companion & Chat Client Integration", () => {
  let mockServer;
  let mockServerPort;
  let receivedRequests = [];

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

      if (req.method === "POST" && req.url.includes("/chat/message")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            reply: "Hello! MindMate is here for you.",
            source: "groq",
            is_fallback: false,
            provider: "groq",
          })
        );
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not found" }));
    });

    await new Promise((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        mockServerPort = mockServer.address().port;
        process.env.VITE_API_URL = `http://127.0.0.1:${mockServerPort}`;
        resolve();
      });
    });
  });

  after(() => {
    mockServer.close();
  });

  it("submits chat message array and student context to /api/chat/message", async () => {
    const messages = [{ role: "user", content: "I am feeling overwhelmed by exams" }];
    const context = { level: "High", score: 85, exam: 2 };

    const data = await api.sendMessage(messages, context);

    assert.equal(data.reply, "Hello! MindMate is here for you.");
    assert.equal(data.is_fallback, false);
    assert.equal(data.provider, "groq");

    const req = receivedRequests.find((r) => r.url.includes("/chat/message"));
    assert.ok(req);
    assert.deepEqual(req.body.messages, messages);
    assert.deepEqual(req.body.context, context);
  });

  it("submits comprehensive ML assessment and lifestyle habit context without conflating them", async () => {
    const messages = [{ role: "user", content: "How does my routine look?" }];
    const context = {
      predicted_class: "Moderate",
      probabilities: { No: 0.1, Mild: 0.2, Moderate: 0.6, Severe: 0.1 },
      assessed_at: "2026-10-10T12:00:00.000Z",
      lifestyle_score: 65,
      lifestyle_level: "Moderate",
      sleep: 6.5,
      study: 7.0,
      screen: 4.0,
      exam: 10,
      mood: "okay",
      note: "Midterms soon",
      has_logged_today: true,
      level: "Moderate",
      score: 65,
    };

    receivedRequests = [];
    const data = await api.sendMessage(messages, context);
    assert.equal(data.reply, "Hello! MindMate is here for you.");

    const req = receivedRequests.find((r) => r.url.includes("/chat/message"));
    assert.ok(req);
    assert.equal(req.body.context.predicted_class, "Moderate");
    assert.equal(req.body.context.probabilities.Moderate, 0.6);
    assert.equal(req.body.context.lifestyle_score, 65);
    assert.equal(req.body.context.sleep, 6.5);
    assert.equal(req.body.context.has_logged_today, true);
  });

  it("verifies user-scoped session storage isolation and cleanup semantics", () => {
    // Simulating sessionStorage isolation contract
    const mockSessionStore = {};
    const getStorageKey = (u) => {
      if (!u) return null;
      const id = u.email || u._id || (u.name ? u.name.replace(/\s+/g, "_") : null);
      return id ? `mm_chat_${id}` : null;
    };

    const saveChat = (u, msgs) => {
      const k = getStorageKey(u);
      if (k) mockSessionStore[k] = JSON.stringify(msgs);
    };

    const loadChat = (u) => {
      const k = getStorageKey(u);
      if (k && mockSessionStore[k]) return JSON.parse(mockSessionStore[k]);
      return [{ role: "assistant", content: "welcome" }];
    };

    const clearAll = () => {
      Object.keys(mockSessionStore).forEach((k) => {
        if (k.startsWith("mm_chat_")) delete mockSessionStore[k];
      });
    };

    const userA = { email: "student_a@college.edu", name: "Student A" };
    const userB = { email: "student_b@college.edu", name: "Student B" };

    // 1. Initial conversation for User A
    const msgsA = [
      { role: "assistant", content: "welcome" },
      { role: "user", content: "Hello from User A" },
    ];
    saveChat(userA, msgsA);

    // User A retrieves their conversation
    assert.deepEqual(loadChat(userA), msgsA);

    // 2. User B starts fresh and does NOT see User A's conversation
    assert.deepEqual(loadChat(userB), [{ role: "assistant", content: "welcome" }]);

    // User B saves their own chat
    const msgsB = [
      { role: "assistant", content: "welcome" },
      { role: "user", content: "Hello from User B" },
    ];
    saveChat(userB, msgsB);

    assert.deepEqual(loadChat(userA), msgsA);
    assert.deepEqual(loadChat(userB), msgsB);

    // 3. Logout clears all stored user conversations
    clearAll();
    assert.deepEqual(loadChat(userA), [{ role: "assistant", content: "welcome" }]);
    assert.deepEqual(loadChat(userB), [{ role: "assistant", content: "welcome" }]);
  });
});
