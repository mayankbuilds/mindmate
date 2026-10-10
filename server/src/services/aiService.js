const axios = require("axios");

const getFastApiUrl = () => process.env.FASTAPI_SERVICE_URL || "http://localhost:8000";

const CALMFLOW_SYSTEM_PROMPT = `You are "CalmFlow", an empathetic, grounded, and supportive wellness companion inside a Student Stress Prediction and Tracking platform.

Context Provided:
- ML Stress Assessment (7-Question GAD-7 Random Forest Survey Pattern Model):
  Predicted Class: {{PREDICTED_CLASS}}
  Class Probabilities: {{CLASS_PROBABILITIES}}
  Assessed At: {{ASSESSED_AT}}
- Daily Lifestyle Habit Index (Transparent Rule-Based Heuristic 0–100, NOT ML):
  Habit Index: {{LIFESTYLE_SCORE}}
  Logged Habits: {{HABIT_METRICS}}

Crucial Clinical & Architectural Boundaries:
1. Two Separate Systems: The "ML Stress Assessment" evaluates questionnaire patterns. The "Lifestyle Habit Index" is a separate deterministic daily habit score (sleep, study, screen). Never confuse or conflate the two.
2. Tone & Empathy: Speak warmly, calmly, and attentively. Acknowledge the user's stress level and lifestyle gently without making them feel pathologized or overly worried.
3. Brevity: Stressed users get overwhelmed easily. Keep responses concise (under 2-3 short paragraphs or 80-100 words max). Never send walls of text.
4. Grounding Interventions: When stress is high, offer one simple, actionable grounding exercise (e.g., 4-7-8 breathing, box breathing, or 5-4-3-2-1 sensory grounding). Suggest just ONE step at a time.
5. Boundaries & Safety:
   - You are NOT a doctor, psychiatrist, or licensed medical professional.
   - Never diagnose, prescribe medications, or claim clinical certainty.
   - If the user expresses thoughts of self-harm, severe crisis, or hopelessness, immediately stop conversational banter, express warm concern, and provide verified crisis hotline information (e.g., Tele-MANAS: 14416 / 1800-891-4416 or KIRAN: 1800-599-0019 in India, or 988 in the US/Global emergency lines).`;

const matchesAny = (patterns, text) => patterns.some((p) => p.test(text));

const getFallbackReply = (userMessage = "", stressLevel = "Moderate", context = {}) => {
  const t = (userMessage || "").trim();
  const effectiveStress = (context && (context.predicted_class || context.level)) || stressLevel || "Moderate";

  // 1. Safety crisis boundary check
  if (matchesAny([/kill\s+myself/i, /suicide/i, /end\s+my\s+life/i, /harm\s+myself/i, /want\s+to\s+die/i, /\bhopeless\b/i], t)) {
    return (
      "I hear how much pain you are carrying right now, but please know you do not have to carry it alone. " +
      "Please connect with caring, professional support right now:\n\n" +
      "- India: Tele-MANAS at 14416 / 1800-891-4416 or KIRAN at 1800-599-0019\n" +
      "- US / Canada: Call or text 988 Suicide & Crisis Lifeline\n" +
      "- Or tap the red SOS button in the top bar to alert your emergency contacts."
    );
  }

  // 2. Academic Pressures, Exams & Deadlines
  if (matchesAny([/\b(study\w*|exam\w*|test\w*|assignment\w*|deadline\w*|homework|procrastinat\w*|grades?|quiz\w*)\b/i], t)) {
    const examNote = context && context.exam != null ? ` (your exam is in ${context.exam} days)` : "";
    return (
      `Academic pressure can feel intense${examNote}. The secret to getting through is chunking: ` +
      "pick just ONE small, 20-minute focus block, and give yourself full permission to ignore the rest for now. " +
      "What is the single most urgent task on your plate today?"
    );
  }

  // 3. Sleep & Nighttime Rest
  if (matchesAny([/\b(sleep\w*|insomnia|can't\s+sleep|awake|nightmare\w*|bedtime|restless\w*)\b/i], t)) {
    return (
      "When sleep is disrupted, everything feels heavier the next day. Tonight, try setting your phone " +
      "across the room 30 minutes before bed and taking five slow breaths in the dark. " +
      "Are you having trouble falling asleep, or waking up in the middle of the night?"
    );
  }

  // 4. Breathing & Immediate Relaxation
  if (matchesAny([/\b(breath|breathe|breathing|relax|chill|unwind|meditat\w*)\b/i, /\bcalm\b/i], t)) {
    return (
      "Let's take a slow reset breath together right now:\n\n" +
      "1. Breathe in gently through your nose for 4 counts...\n" +
      "2. Hold softly for 4 counts...\n" +
      "3. Exhale slowly and completely through your mouth for 6 counts.\n\n" +
      "Let your shoulders drop as you release. How does your chest feel right now?"
    );
  }

  // 5. Anxiety, Panic & Overwhelm
  if (matchesAny([/\b(stress\w*|anxious\w*|anxiety|panic|overwhelm\w*|nervous\w*|worry\w*|racing|scared|fear)\b/i], t)) {
    return (
      `I hear you, and those feelings are completely understandable with your stress level being ${effectiveStress.toLowerCase()}. ` +
      "Let's ground right now using the 3-3-3 check: name 3 things you can see around you, " +
      "3 sounds you can hear, and move 3 parts of your body (like your fingers, toes, and shoulders). " +
      "What is one object you see right now?"
    );
  }

  // 6. Fatigue, Exhaustion & Burnout
  if (matchesAny([/\b(tired|exhaust\w*|burnout|burnt\s+out|drained|sleepy|fatigue)\b/i, /no\s+energy/i], t)) {
    const sleepNote = context && context.sleep != null ? ` (you logged ${context.sleep}h of sleep)` : "";
    return (
      `It sounds like your mind and body are asking for genuine rest${sleepNote}. ` +
      "When we run on empty, everyday tasks become much heavier. Can you step away from screens " +
      "and take a 10-minute quiet pause right now? What is the single most restful thing you could do today?"
    );
  }

  // 7. Sadness, Loneliness & Low Mood
  if (matchesAny([/\b(sad\w*|unhappy|cry|crying|lonely|alone|depress\w*|blue|heartbroken)\b/i], t)) {
    return (
      "I'm really sorry things feel heavy and lonely right now. It is completely okay to feel sad, " +
      "and you don't have to force yourself to feel positive right away. Would you like to talk about " +
      "what brought this on, or would you prefer a gentle breathing pause together?"
    );
  }

  // 8. Gratitude & Politeness
  if (matchesAny([/\b(thank\w*|appreciat\w*|helpful|cheers)\b/i, /good\s+to\s+know/i], t)) {
    return (
      "You are very welcome. Remember to give yourself credit for checking in on your well-being today. " +
      "I'm always right here whenever you need a quick breather or someone to talk through your day with."
    );
  }

  // 9. Greetings & Salutations
  if (matchesAny([/\b(hello|hi|hey|howdy|sup)\b/i, /good\s+morning/i, /good\s+evening/i, /good\s+afternoon/i], t)) {
    let greeting = "Hello! I'm here and glad you reached out. ";
    if (context && context.exam != null && Number(context.exam) <= 7) {
      greeting += `I see your exam is coming up in ${context.exam} days. `;
    }
    return (
      greeting +
      "How has your day been going so far? Tell me what's on your mind, and we can take it one calm step at a time."
    );
  }

  // 10. General Guidance & Advice
  if (matchesAny([/\b(advice|tips?|guide\w*)\b/i, /what\s+should\s+i\s+do/i, /what\s+to\s+do/i, /\bhelp\b/i], t)) {
    return (
      "Here is a great student wellness starting point: drink a tall glass of water, stand up to stretch " +
      "your back, and give yourself a 5-minute break from coursework. What area feels like it needs the most " +
      "attention today: your sleep, study routine, or taking time to unwind?"
    );
  }

  // 11. Contextual Fall-through
  if (context && context.sleep != null && Number(context.sleep) < 6) {
    return (
      `Thank you for sharing that with me. I noticed you logged ${context.sleep} hours of sleep today. ` +
      "Short sleep can amplify everything we feel. How are your energy levels holding up right now?"
    );
  }

  return (
    "Thank you for sharing that with me. I'm here and listening with care. Tell me a little more about " +
    "what's going on, and we will take it one calm step at a time."
  );
};

const LOCAL_MOODS = {
  great: 0,
  good: 5,
  okay: 12,
  stressed: 24,
  overwhelmed: 34,
};

const LOCAL_RECS = [
  { id: "breath", title: "2-minute breathing exercise", blurb: "Slow, even breaths settle your nervous system and clear your head.", mins: 2, secs: 120, tint: "blue" },
  { id: "walk", title: "Take a 10-minute walk", blurb: "Fresh air and movement lift your mood. Leave your phone in your pocket.", mins: 10, secs: 600, tint: "green" },
  { id: "screen", title: "Take a screen break", blurb: "Look away, stretch and rest your eyes. Try the 20-20-20 rule.", mins: 5, secs: 300, tint: "lav" },
  { id: "sleep", title: "Improve your sleep routine", blurb: "Wind down with dim lights and no scrolling for the last half hour.", mins: 30, secs: 1800, tint: "blue" },
  { id: "focus", title: "Try a focused study session", blurb: "25 minutes on one topic, then a real break. Small blocks beat marathons.", mins: 25, secs: 1500, tint: "green" },
];

/**
 * Flow A: Request ML questionnaire stress prediction from FastAPI ML service.
 * Endpoint: POST /assessment/predict
 *
 * CRITICAL ARCHITECTURAL GUARANTEE:
 * This function NEVER invokes any handcrafted fallback formula or fake ML computation.
 * If the ML service is down, times out, returns an error, or provides an invalid payload,
 * this function throws an error with the appropriate HTTP status code (503 / 502)
 * so the gateway can fail cleanly and transparently without deceiving the user.
 */
const requestAssessmentPrediction = async (payload) => {
  try {
    const response = await axios.post(`${getFastApiUrl()}/assessment/predict`, payload, {
      timeout: 6000,
      headers: { "Content-Type": "application/json" },
    });

    if (
      !response.data ||
      typeof response.data !== "object" ||
      !response.data.predicted_class ||
      response.data.class_index === undefined ||
      !response.data.probabilities
    ) {
      const err = new Error("Malformed response received from ML inference service");
      err.status = 502;
      err.isGatewayCustom = true;
      throw err;
    }

    return response.data;
  } catch (error) {
    if (error.isGatewayCustom) {
      throw error;
    }

    // Upstream response from FastAPI
    if (error.response) {
      const upstreamStatus = error.response.status;
      let upstreamDetail = null;
      if (error.response.data && typeof error.response.data === "object") {
        upstreamDetail = error.response.data.detail || error.response.data.message;
      } else if (typeof error.response.data === "string") {
        try {
          const parsed = JSON.parse(error.response.data);
          upstreamDetail = parsed.detail || parsed.message;
        } catch (_) {
          if (error.response.data.trim()) {
            upstreamDetail = error.response.data.trim();
          }
        }
      }

      const err = new Error(
        upstreamDetail || `ML inference service responded with status ${upstreamStatus}`
      );
      err.status = upstreamStatus >= 500 ? upstreamStatus : 503;
      throw err;
    }

    // Network / connection errors
    let message = "ML inference service is temporarily unavailable";
    if (error.code === "ECONNREFUSED") {
      message = "ML inference service is not reachable (connection refused)";
    } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      message = "ML inference service request timed out";
    } else if (error.code === "ENOTFOUND") {
      message = "ML inference service host could not be resolved";
    }

    const err = new Error(message);
    err.status = 503;
    throw err;
  }
};

/**
 * Flow B: Transparent rule-based lifestyle habit index calculation (sleep, study, screen, exam, mood, note).
 * NOTE: This is a deterministic heuristic lifestyle tracker and is NOT a machine learning model.
 * It is solely used for Flow B daily check-ins (/api/wellness/checkin).
 */
const computeLocalLifestyleIndex = (item = {}) => {
  let sleep = Number(item.sleep ?? 7.5);
  let study = Number(item.study ?? 6.0);
  let screen = Number(item.screen ?? 4.5);
  const exam = Number(item.exam ?? 14);
  const mood = item.mood || "okay";
  const note = item.note || "";

  const total = sleep + study + screen;
  if (total > 24) {
    const scale = 24 / total;
    sleep = Math.round(sleep * scale * 2) / 2;
    study = Math.round(study * scale * 2) / 2;
    screen = Math.round(screen * scale * 2) / 2;
  }

  const sleepP = Math.max(0, 8 - sleep) * 8 + (sleep > 10 ? 4 : 0);
  const studyP = Math.max(0, study - 4) * 3;
  const screenP = Math.max(0, screen - 3) * 4;
  const examP = exam <= 3 ? 18 : exam <= 7 ? 14 : exam <= 14 ? 9 : exam <= 30 ? 5 : 2;
  const moodP = LOCAL_MOODS[mood] != null ? LOCAL_MOODS[mood] : 10;
  const words = ["anxious", "panic", "can't", "cannot", "tired", "exhausted", "stress", "worried", "scared", "hopeless"];
  const noteP = Math.min(12, words.filter((w) => (note || "").toLowerCase().includes(w)).length * 4);
  const score = Math.round(Math.max(4, Math.min(98, 10 + sleepP + studyP + screenP + examP + moodP + noteP)));
  const level = score < 35 ? "Low" : score < 65 ? "Moderate" : "High";

  const w = {
    breath: 2,
    walk: 1,
    screen: screen > 5 ? 4 : 0,
    sleep: sleep < 7 ? 4 : 0,
    focus: study > 7 ? 0 : 1,
  };
  const recommendations = [...LOCAL_RECS].sort((a, b) => (w[b.id] || 0) - (w[a.id] || 0));

  return { score, level, recommendations };
};

// Backward-compatible alias for existing callers
const computeLocalStress = computeLocalLifestyleIndex;

/**
 * Flow B: Request lifestyle score from FastAPI /wellness/compute-stress or fall back
 * to local transparent rule-based lifestyle calculation.
 */
const computeStressWithAI = async (data) => {
  try {
    const response = await axios.post(`${getFastApiUrl()}/wellness/compute-stress`, data, { timeout: 6000 });
    if (response.data && response.data.score != null) {
      return response.data;
    }
  } catch (error) {
    // Local calculation fallback if FastAPI service is temporarily offline or not deployed
  }
  return computeLocalLifestyleIndex(data);
};

const sendChatMessageToAI = async (messages, context = {}) => {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const stressLevel = context.predicted_class || context.level || "Moderate";
  const fastApiUrl = getFastApiUrl();
  const fastApiTimeout = Number(process.env.FASTAPI_TIMEOUT_MS || 20000);

  // Tier 1: Forward chat request to FastAPI AI service (where Google Gemini is primary)
  try {
    const response = await axios.post(
      `${fastApiUrl}/chat/message`,
      { messages, context },
      { timeout: fastApiTimeout }
    );
    if (response.data && response.data.reply) {
      if (response.data.is_fallback) {
        console.warn(
          `[ChatGateway] Upstream FastAPI returned offline guide fallback (error_type: ${response.data.error_type || "unspecified"}).`
        );
      }
      return {
        reply: response.data.reply,
        source: response.data.source || "fastapi",
        is_fallback: Boolean(response.data.is_fallback),
        provider: response.data.provider || "fastapi",
        error_type: response.data.error_type || null,
      };
    }
  } catch (error) {
    let failureCategory = "unknown_error";
    let detailMsg = error.message;

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      failureCategory = "cold_start_timeout";
      detailMsg = `FastAPI service at ${fastApiUrl} timed out after ${fastApiTimeout}ms (likely Render free tier cold-start spin-up)`;
    } else if (error.code === "ECONNREFUSED") {
      failureCategory = "connection_refused";
      detailMsg = `Connection refused at ${fastApiUrl} - service is offline or not running`;
    } else if (error.code === "ENOTFOUND") {
      failureCategory = "dns_resolution_failed";
      detailMsg = `Hostname for ${fastApiUrl} could not be resolved`;
    } else if (error.response) {
      failureCategory = `upstream_http_${error.response.status}`;
      const upstreamData = error.response.data;
      detailMsg = typeof upstreamData === "object" ? JSON.stringify(upstreamData) : String(upstreamData);
    }

    console.warn(
      `[ChatGateway] Warning: Failed to reach FastAPI AI Companion (${failureCategory}): ${detailMsg}. Falling back to transparent Offline Support Guide.`
    );
  }

  // Tier 2: Seamless predefined rule-based Offline Support Guide fallback
  const rawFallback = getFallbackReply(lastUserMsg, stressLevel, context);
  return {
    reply: `[Offline Support Guide]\n\n${rawFallback}`,
    source: "fallback",
    is_fallback: true,
    provider: "offline-guide",
  };
};

module.exports = {
  requestAssessmentPrediction,
  computeStressWithAI,
  computeLocalLifestyleIndex,
  computeLocalStress,
  sendChatMessageToAI,
  getFallbackReply,
  CALMFLOW_SYSTEM_PROMPT,
};