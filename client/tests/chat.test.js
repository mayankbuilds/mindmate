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
});
