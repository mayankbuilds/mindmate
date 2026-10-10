const test = require("node:test");
const assert = require("node:assert/strict");
const { getFallbackReply, sendChatMessageToAI } = require("../src/services/aiService");
const { postChatMessage } = require("../src/controllers/chatController");

test("Phase C: AI Companion & Offline Fallback System", async (t) => {
  await t.test("1. Offline fallback intent resolution produces distinct responses", () => {
    const intents = {
      greeting: "Hello, good morning!",
      gratitude: "Thank you for the advice!",
      sadness: "I feel lonely and sad today",
      fatigue: "I am completely exhausted and burnt out",
      breathing: "Guide me through a breathing exercise",
      sleep: "I can't sleep, suffering from insomnia",
      academic: "I have a big exam coming up and excessive study work",
      anxiety: "I'm having a panic attack and feeling severe anxiety",
      advice: "What should I do right now for my mental health?",
    };

    const replies = {};
    for (const [intent, text] of Object.entries(intents)) {
      replies[intent] = getFallbackReply(text, "Moderate");
    }

    const uniqueReplies = new Set(Object.values(replies));
    assert.equal(
      uniqueReplies.size,
      Object.keys(intents).length,
      "Every distinct intent must produce a distinct, tailored response"
    );

    // Verify key wellness guidance markers
    assert.match(replies.breathing, /reset breath/i);
    assert.match(replies.sleep, /phone/i);
    assert.match(replies.academic, /chunking/i);
    assert.match(replies.anxiety, /3-3-3/i);
    assert.match(replies.fatigue, /rest/i);
    assert.match(replies.sadness, /lonely/i);
    assert.match(replies.gratitude, /welcome/i);
  });

  await t.test("2. Safety boundary detection returns verified crisis hotlines", () => {
    const crisisQueries = [
      "I feel like I want to kill myself",
      "I want to end my life, feeling completely hopeless",
    ];

    for (const q of crisisQueries) {
      const reply = getFallbackReply(q);
      assert.match(reply, /Tele-MANAS/i);
      assert.match(reply, /KIRAN/i);
      assert.match(reply, /988/i);
      assert.match(reply, /SOS/i);
    }
  });

  await t.test("3. Student context (sleep hours, exam countdown) is integrated", () => {
    const ctxExam = { level: "High", score: 75, exam: 4 };
    const examReply = getFallbackReply("hello", "High", ctxExam);
    assert.match(examReply, /exam is coming up in 4 days/i);

    const ctxSleep = { level: "Moderate", score: 50, sleep: 5 };
    const fatigueReply = getFallbackReply("I am so tired", "Moderate", ctxSleep);
    assert.match(fatigueReply, /logged 5h of sleep/i);

    const fallthroughReply = getFallbackReply("random text without intent", "Moderate", ctxSleep);
    assert.match(fallthroughReply, /logged 5 hours of sleep/i);
  });

  await t.test("4. sendChatMessageToAI provides safe offline fallback when upstream fails", async () => {
    // Calling with non-existent or down upstream url
    process.env.FASTAPI_SERVICE_URL = "http://127.0.0.1:59999"; // guaranteed unused port
    process.env.GEMINI_API_KEY = ""; // unset

    const messages = [{ role: "user", content: "Can you help me breathe?" }];
    const res = await sendChatMessageToAI(messages, { level: "Low" });

    assert.equal(res.is_fallback, true);
    assert.equal(res.provider, "offline-guide");
    assert.equal(res.source, "fallback");
    assert.match(res.reply, /^\[Offline Support Guide\]/);
    assert.match(res.reply, /reset breath/i);
  });

  await t.test("5. chatController handles varied request formats and never throws 500", async () => {
    const fakeReq = {
      body: {
        message: "Need help studying for my test",
        context: { exam: 2 },
      },
    };

    let responseData = null;
    const fakeRes = {
      json: (data) => {
        responseData = data;
        return data;
      },
    };

    await postChatMessage(fakeReq, fakeRes);
    assert.ok(responseData, "Controller must return a response");
    assert.ok(responseData.reply, "Response must contain reply");
    assert.match(responseData.reply, /chunking|academic/i);

    // Test legacy format: prompt instead of message
    const legacyReq = {
      body: {
        prompt: "Hello",
      },
    };
    await postChatMessage(legacyReq, fakeRes);
    assert.ok(responseData.reply);
    assert.match(responseData.reply, /Hello! I'm here/i);
  });

  await t.test("6. sendChatMessageToAI logs cold start timeout diagnostics gracefully", async () => {
    process.env.FASTAPI_SERVICE_URL = "http://10.255.255.1"; // non-routable IP to simulate timeout
    process.env.FASTAPI_TIMEOUT_MS = "100"; // fast 100ms timeout for test

    const originalWarn = console.warn;
    let loggedWarning = "";
    console.warn = (msg) => {
      loggedWarning += msg;
    };

    try {
      const messages = [{ role: "user", content: "Hello" }];
      const res = await sendChatMessageToAI(messages, { level: "Low" });
      assert.equal(res.is_fallback, true);
      assert.match(res.reply, /^\[Offline Support Guide\]/);
      assert.match(loggedWarning, /\[ChatGateway\]/);
      assert.match(loggedWarning, /cold_start_timeout|connection_refused/);
    } finally {
      console.warn = originalWarn;
      process.env.FASTAPI_TIMEOUT_MS = "20000";
    }
  });

  await t.test("7. chatController normalizes ML predicted_class and lifestyle score context", async () => {
    process.env.FASTAPI_SERVICE_URL = "http://127.0.0.1:59999";
    const fakeReq = {
      body: {
        message: "I am having bad anxiety and stress",
        context: {
          predicted_class: "Severe",
          probabilities: { No: 0.05, Mild: 0.1, Moderate: 0.15, Severe: 0.7 },
          assessed_at: "2026-10-10T10:00:00.000Z",
          lifestyle_score: 75,
          lifestyle_level: "High",
          sleep: 5.0,
        },
      },
    };

    let responseData = null;
    const fakeRes = {
      json: (data) => {
        responseData = data;
        return data;
      },
    };

    await postChatMessage(fakeReq, fakeRes);
    assert.ok(responseData);
    assert.ok(responseData.reply);
    // When offline fallback is triggered, anxiety intent incorporates effective stress level "severe"
    assert.match(responseData.reply, /stress level being severe/i);
  });

  await t.test("8. chatController retrieves and trusts database records over client-supplied spoofed context", async () => {
    process.env.FASTAPI_SERVICE_URL = "http://127.0.0.1:59999";
    const Assessment = require("../src/models/Assessment");
    const CheckIn = require("../src/models/CheckIn");

    // Mock Assessment and CheckIn findOne to return genuine DB records
    const origAssessmentFindOne = Assessment.findOne;
    const origCheckInFindOne = CheckIn.findOne;

    Assessment.findOne = (query) => ({
      sort: () =>
        Promise.resolve({
          userId: query.userId,
          predicted_class: "Mild",
          probabilities: { No: 0.2, Mild: 0.6, Moderate: 0.15, Severe: 0.05 },
          createdAt: new Date("2026-10-10T09:00:00Z"),
        }),
    });

    CheckIn.findOne = (query) => ({
      sort: () =>
        Promise.resolve({
          userId: query.userId,
          stressScore: 35,
          stressLevel: "Low",
          sleep: 8.0,
          study: 4.0,
          screen: 2.0,
          exam: 21,
          mood: "great",
          note: "feeling rested",
          date: new Date().toISOString().split("T")[0],
        }),
    });

    try {
      // Client maliciously/erroneously claims Severe stress with 2h sleep
      const fakeReq = {
        user: { _id: "60d5ec49f1b2c8b1f8e4e1a1" },
        body: {
          message: "I am feeling anxious",
          context: {
            predicted_class: "Severe", // spoofed client value
            sleep: 2.0, // spoofed client value
          },
        },
      };

      let responseData = null;
      const fakeRes = {
        json: (data) => {
          responseData = data;
          return data;
        },
      };

      await postChatMessage(fakeReq, fakeRes);
      assert.ok(responseData);
      assert.ok(responseData.reply);
      // Fallback reply uses genuine DB assessment "mild", overriding spoofed "Severe"
      assert.match(responseData.reply, /stress level being mild/i);
    } finally {
      Assessment.findOne = origAssessmentFindOne;
      CheckIn.findOne = origCheckInFindOne;
    }
  });
});

