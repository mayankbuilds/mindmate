const axios = require("axios");

const FASTAPI_URL = process.env.FASTAPI_SERVICE_URL || "http://localhost:8000";

const CALMFLOW_SYSTEM_PROMPT = `You are "CalmFlow", an empathetic, grounded, and supportive wellness companion inside a Stress Prediction and Tracking platform.

Context Provided:
- User's Predicted Stress Level: {{STRESS_LEVEL}}
- User's Assessment Score: {{STRESS_SCORE}}

Your Core Responsibilities:
1. Tone & Empathy: Speak warmly, calmly, and attentively. Acknowledge the user's stress level gently without making them feel pathologized or overly worried.
2. Brevity: Stressed users get overwhelmed easily. Keep responses concise (under 2-3 short paragraphs or 80-100 words max). Never send walls of text.
3. Grounding Interventions: When stress is high, offer one simple, actionable grounding exercise (e.g., 4-7-8 breathing, box breathing, or 5-4-3-2-1 sensory grounding). Suggest just ONE step at a time.
4. Boundaries & Safety:
   - You are NOT a doctor, psychiatrist, or licensed medical professional.
   - Never diagnose, prescribe medications, or claim clinical certainty.
   - If the user expresses thoughts of self-harm, severe crisis, or hopelessness, immediately stop conversational banter, express warm concern, and provide verified crisis hotline information (e.g., Tele-MANAS: 14416 / 1800-891-4416 or KIRAN: 1800-599-0019 in India, or 988 in the US/Global emergency lines).`;

const getFallbackReply = (userMessage = "", stressLevel = "Moderate") => {
  const t = (userMessage || "").toLowerCase();

  // Safety crisis boundary check
  if (
    t.includes("kill myself") ||
    t.includes("suicide") ||
    t.includes("end my life") ||
    t.includes("harm myself") ||
    t.includes("want to die") ||
    t.includes("hopeless")
  ) {
    return (
      "I hear how much pain you are carrying right now, but please know you do not have to carry it alone. " +
      "Please connect with caring, professional support right now:\n\n" +
      "- India: Tele-MANAS at 14416 / 1800-891-4416 or KIRAN at 1800-599-0019\n" +
      "- US / Canada: Call or text 988 Suicide & Crisis Lifeline\n" +
      "- Or tap the red SOS button in the top bar to alert your emergency contacts."
    );
  }

  if (t.includes("breath")) {
    return (
      "Let's take a slow breath together. Breathe in through your nose for 4 counts, hold gently for 4, " +
      "then exhale smoothly for 6. Let your shoulders drop as you release. How does your chest feel right now?"
    );
  }

  if (t.includes("sleep")) {
    return (
      "When sleep is disrupted, everything feels heavier. Tonight, try putting your phone across the room 30 minutes " +
      "before bed and take 5 slow breaths in the dark. Are you having trouble falling asleep or waking up early?"
    );
  }

  if (t.includes("study") || t.includes("overwhelm") || t.includes("exam")) {
    return (
      "That is a lot to carry at once. Let's break it down: choose just one small 20-minute task to focus on, " +
      "and give yourself permission to ignore the rest for now. What is the single most urgent topic on your plate today?"
    );
  }

  if (t.includes("stress") || t.includes("anxious") || t.includes("panic")) {
    return (
      `I hear you, and it is completely understandable to feel that way with your stress level being ${stressLevel.toLowerCase()}. ` +
      "Would you like to try a gentle 2-minute breathing exercise, or talk through what is making you feel this way?"
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

const computeLocalStress = (item = {}) => {
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

const computeStressWithAI = async (data) => {
  try {
    const response = await axios.post(`${FASTAPI_URL}/wellness/compute-stress`, data, { timeout: 6000 });
    if (response.data && response.data.score != null) {
      return response.data;
    }
  } catch (error) {
    // Local calculation fallback if FastAPI service is temporarily offline or not deployed
  }
  return computeLocalStress(data);
};

const callGeminiDirectly = async (messages, context = {}) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey.trim().length < 8 || geminiKey.startsWith("your_")) {
    return null;
  }

  const stressLevel = context.level || "Moderate";
  const stressScore = context.score != null ? `${context.score}/100` : "Not assessed yet";
  const systemContent = CALMFLOW_SYSTEM_PROMPT.replace("{{STRESS_LEVEL}}", stressLevel).replace(
    "{{STRESS_SCORE}}",
    stressScore
  );

  const formattedMessages = [{ role: "system", content: systemContent }, ...messages];

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      model: "gemini-1.5-flash",
      messages: formattedMessages,
      max_tokens: 250,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${geminiKey.trim()}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  const reply = response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Empty response from Gemini API");
  return reply.trim();
};

const sendChatMessageToAI = async (messages, context = {}) => {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const stressLevel = context.level || "Moderate";

  // Tier 1: Try FastAPI AI service (which may have Groq/Qwen or Gemini configured)
  try {
    const response = await axios.post(
      `${FASTAPI_URL}/chat/message`,
      { messages, context },
      { timeout: 7000 }
    );
    if (response.data && response.data.reply) {
      return { reply: response.data.reply, source: "fastapi" };
    }
  } catch (_) {
    // FastAPI offline or failed -> Proceed to Tier 2
  }

  // Tier 2: Try Gemini directly from Node backend using GEMINI_API_KEY
  try {
    const geminiReply = await callGeminiDirectly(messages, context);
    if (geminiReply) {
      return { reply: geminiReply, source: "gemini" };
    }
  } catch (_) {
    // Gemini direct call failed or quota exceeded -> Proceed to Tier 3
  }

  // Tier 3: Seamless predefined rule-based CalmFlow fallback
  return {
    reply: getFallbackReply(lastUserMsg, stressLevel),
    source: "fallback",
  };
};

module.exports = {
  computeStressWithAI,
  sendChatMessageToAI,
  getFallbackReply,
  CALMFLOW_SYSTEM_PROMPT,
};