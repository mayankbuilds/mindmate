import { api } from "./services/api";
import { useState, useEffect, useMemo, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import {
  Home, Leaf, MessageCircle, BarChart3, User, LifeBuoy, Bell, Moon, BookOpen,
  Smartphone, CalendarDays, Wind, Footprints, Send, Plus, Phone, Mail, Check,
  X, LogOut, ShieldCheck, Activity, Eye, EyeOff, ArrowRight, Trash2, Timer,
  Sparkles, ChevronDown, HeartHandshake, ChevronLeft, ChevronRight, RefreshCw,
  Smile, Meh, Frown, AlertCircle, Compass, Camera,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ */
/* Logic & Constants (Zero AI Emojis - Human-crafted UI)               */
/* ------------------------------------------------------------------ */

const MOODS = [
  { id: "great", icon: Sparkles, label: "Great", pts: 0, color: "#10B981", bg: "#ECFDF5" },
  { id: "good", icon: Smile, label: "Good", pts: 5, color: "#3B82F6", bg: "#EFF6FF" },
  { id: "okay", icon: Meh, label: "Okay", pts: 12, color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "stressed", icon: Frown, label: "Stressed", pts: 24, color: "#F59E0B", bg: "#FFFBEB" },
  { id: "overwhelmed", icon: AlertCircle, label: "Overwhelmed", pts: 34, color: "#EF4444", bg: "#FEF2F2" },
];

const levelOf = (s) => (s < 35 ? "Low" : s < 65 ? "Moderate" : "High");
const LEVEL_COLOR = { Low: "#3F9E84", Moderate: "#5B6FE8", High: "#D9737D" };
const LEVEL_SOFT = { Low: "#E2F5EE", Moderate: "#E8EDFF", High: "#FDEBEC" };

function computeStress(item = {}) {
  let sleep = Number(item.sleep ?? 7.5);
  let study = Number(item.study ?? 6.0);
  let screen = Number(item.screen ?? 4.5);
  const exam = Number(item.exam ?? 14);
  const mood = item.mood || 'okay';
  const note = item.note || '';

  // 24-hour day clamp safeguard
  const total = sleep + study + screen;
  if (total > 24) {
    const scale = 24 / total;
    sleep = Math.round(sleep * scale * 2) / 2;
    study = Math.round(study * scale * 2) / 2;
    screen = Math.max(0, Math.round((24 - sleep - study) * 2) / 2);
  }

  const m = MOODS.find((x) => x.id === mood);
  const sleepP = Math.max(0, 8 - sleep) * 8 + (sleep > 10 ? 4 : 0);
  const studyP = Math.max(0, study - 4) * 3;
  const screenP = Math.max(0, screen - 3) * 4;
  const examP = exam <= 3 ? 18 : exam <= 7 ? 14 : exam <= 14 ? 9 : exam <= 30 ? 5 : 2;
  const moodP = m ? m.pts : 10;
  const words = ["anxious", "panic", "can't", "cannot", "tired", "exhausted", "stress", "worried", "scared", "hopeless"];
  const noteP = Math.min(12, words.filter((w) => (note || "").toLowerCase().includes(w)).length * 4);
  return Math.round(Math.max(4, Math.min(98, 10 + sleepP + studyP + screenP + examP + moodP + noteP)));
}

const LEVEL_COPY = {
  Low: "Your recent activity looks balanced. Keep doing what's working, and protect your sleep.",
  Moderate: "Your recent activity suggests moderate stress. A short break and breathing exercise may help.",
  High: "Things look heavy right now. Slow down, take a proper break, and consider talking to someone you trust.",
};

const RECS = [
  { id: "breath", icon: Wind, title: "2-minute breathing exercise", blurb: "Slow, even breaths settle your nervous system and clear your head.", mins: 2, secs: 120, tint: "blue" },
  { id: "walk", icon: Footprints, title: "Take a 10-minute walk", blurb: "Fresh air and movement lift your mood. Leave your phone in your pocket.", mins: 10, secs: 600, tint: "green" },
  { id: "screen", icon: Smartphone, title: "Take a screen break", blurb: "Look away, stretch and rest your eyes. Try the 20-20-20 rule.", mins: 5, secs: 300, tint: "lav" },
  { id: "sleep", icon: Moon, title: "Improve your sleep routine", blurb: "Wind down with dim lights and no scrolling for the last half hour.", mins: 30, secs: 1800, tint: "blue" },
  { id: "focus", icon: BookOpen, title: "Try a focused study session", blurb: "25 minutes on one topic, then a real break. Small blocks beat marathons.", mins: 25, secs: 1500, tint: "green" },
];

function recsFor(t = {}) {
  const scr = Number(t?.screen ?? 5);
  const slp = Number(t?.sleep ?? 7);
  const std = Number(t?.study ?? 5);
  const w = { breath: 2, walk: 1, screen: scr > 5 ? 4 : 0, sleep: slp < 7 ? 4 : 0, focus: std > 7 ? 0 : 1 };
  return [...RECS].sort((a, b) => (w[b.id] || 0) - (w[a.id] || 0));
}

const SYSTEM_PROMPT = `You are MindMate AI, a warm, supportive wellness companion for university students. Talk like a kind, thoughtful friend: short replies (2-4 sentences), natural language, no bullet lists unless giving a breathing exercise. Validate feelings first, then offer one gentle, practical idea. Ask at most one question. You are not a therapist: never diagnose. If a student mentions self-harm, hopelessness, or being in danger, respond with care, encourage them to reach out to a trusted person or local emergency services right now, and mention the SOS button in the app.`;

async function askClaude(msgs, ctx) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: `${SYSTEM_PROMPT}\n\nToday's context: stress level ${ctx.level}, slept ${ctx.sleep}h, studied ${ctx.study}h, screen ${ctx.screen}h, exam in ${ctx.exam} days.`,
      messages: msgs,
    }),
  });
  const data = await res.json();
  const text = (data.content || []).map((i) => (i.type === "text" ? i.text : "")).filter(Boolean).join("\n");
  if (!text) throw new Error("empty");
  return text;
}

function getInitial(name) {
  if (!name || typeof name !== "string") return "U";
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "U";
}

function fallbackReply(text, level = "Moderate") {
  const t = (text || "").toLowerCase();

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
    return "Let's try a simple reset together. Breathe in through your nose for 4 counts, hold gently for 4, then breathe out slowly for 6. Let your shoulders drop as you release. How does that feel right now?";
  }
  if (t.includes("sleep")) {
    return "When sleep is disrupted, everyday tasks feel much heavier. Tonight, try putting your phone across the room 30 minutes before sleep and take 5 slow breaths in bed. Are you having trouble falling asleep or waking up early?";
  }
  if (t.includes("study") || t.includes("overwhelm") || t.includes("exam")) {
    return "That is a lot to carry on your mind. Let's break it down into just one 20-minute focus block, and set aside the rest for now. What is the single most urgent topic on your plate today?";
  }
  if (t.includes("stress") || t.includes("anxious") || t.includes("panic")) {
    return `I hear you, and it is completely understandable to feel that way with your stress level being ${level.toLowerCase()}. Would you like to try a quick 2-minute breathing exercise, or talk through what is making you feel this way?`;
  }
  return "Thank you for sharing that with me. I'm here and listening with care. Tell me a little more about what's going on, and we will take it one calm step at a time.";
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.mm{--ink:#1E2A47;--mute:#5F6C93;--bg:#F4F6FF;--line:#E4E8F6;--blue:#3F6FD8;--blue2:#E8EFFF;--lav:#7C6CE6;--lav2:#EFEBFF;--grn:#3F9E84;--grn2:#E2F5EE;
  --sh:0 1px 2px rgba(40,55,110,.05),0 10px 30px rgba(60,80,160,.08);
  font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;line-height:1.5;-webkit-font-smoothing:antialiased}
.mm *{box-sizing:border-box}
.mm h1,.mm h2,.mm h3,.mm p{margin:0}
.mm button{font-family:inherit;cursor:pointer}
.mm :focus-visible{outline:3px solid #9DB6F5;outline-offset:2px}
.mm ::placeholder{color:#8C97B8}

/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;padding:12px 20px;font-size:15px;font-weight:600;transition:transform .15s,box-shadow .15s,background .15s}
.btn-p{color:#fff;background:linear-gradient(135deg,#3F6FD8,#6C5CE0);box-shadow:0 6px 18px rgba(80,90,220,.28)}
.btn-p:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(80,90,220,.34)}
.btn-s{color:var(--ink);background:#fff;border:1px solid var(--line)}
.btn-s:hover{background:#F7F9FF}
.btn-g{color:var(--blue);background:var(--blue2)}
.btn-g:hover{background:#DCE7FF}
.btn-lg{padding:16px 26px;font-size:16px;border-radius:16px}
.btn-sm{padding:8px 14px;font-size:14px;border-radius:12px}
.btn:disabled{opacity:.55;cursor:not-allowed;transform:none}

/* cards */
.card{background:#fff;border-radius:20px;padding:24px;box-shadow:var(--sh);border:1px solid rgba(228,232,246,.7)}
.card h3{font-size:18px;font-weight:700;letter-spacing:-.01em}
.muted{color:var(--mute)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:600;background:var(--blue2);color:var(--blue)}
.tile{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none}
.t-blue{background:var(--blue2);color:var(--blue)}
.t-lav{background:var(--lav2);color:var(--lav)}
.t-green{background:var(--grn2);color:var(--grn)}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;letter-spacing:-.02em;background:none;border:0;color:var(--ink);padding:0}
.logo-mark{width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,#5B8DEF,#9B8CF0);display:grid;place-items:center;color:#fff}

/* landing */
.l-nav{max-width:1180px;margin:0 auto;padding:22px 24px;display:flex;align-items:center;justify-content:space-between}
.l-hero{max-width:1180px;margin:0 auto;padding:32px 24px 72px;display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center}
.l-hero h1{font-size:clamp(38px,5.4vw,64px);line-height:1.05;letter-spacing:-.035em;font-weight:800;max-width:14ch}
.l-hero p{font-size:19px;color:var(--mute);margin:22px 0 32px;max-width:46ch}
.l-cta{display:flex;gap:12px;flex-wrap:wrap}
.l-feat{max-width:1180px;margin:0 auto;padding:0 24px 80px;display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.l-feat .card{padding:26px;transition:transform .2s}
.l-feat .card:hover{transform:translateY(-3px)}
.l-feat h3{margin:18px 0 6px}
.l-foot{border-top:1px solid var(--line);background:#fff}
.l-foot>div{max-width:1180px;margin:0 auto;padding:28px 24px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center;font-size:14px}
.l-bg{background:radial-gradient(900px 500px at 85% -10%,#E3DBFF 0,transparent 60%),radial-gradient(700px 500px at -10% 10%,#D8E7FF 0,transparent 60%),var(--bg)}
.float{animation:float 7s ease-in-out infinite}

/* auth */
.a-wrap{min-height:100vh;display:grid;grid-template-columns:1fr 1fr}
.a-side{background:linear-gradient(160deg,#DCE7FF,#E8E0FF 60%,#DDF3EA);padding:48px;display:flex;flex-direction:column;justify-content:space-between}
.a-side blockquote{margin:0;font-size:28px;line-height:1.3;font-weight:700;letter-spacing:-.02em;max-width:18ch}
.a-form{display:grid;place-items:center;padding:32px 20px}
.a-card{width:100%;max-width:420px}
.a-card h1{font-size:30px;letter-spacing:-.025em;font-weight:800}
.a-card .mlogo{display:none}
@media (max-width:899px){.a-card .mlogo{display:block}}
.field{display:flex;flex-direction:column;gap:6px;margin-top:16px}
.field label{font-size:14px;font-weight:600}
.inp{width:100%;border:1.5px solid var(--line);background:#fff;border-radius:14px;padding:13px 14px;font:inherit;font-size:15px;color:var(--ink);transition:border .15s,box-shadow .15s}
.inp:focus{outline:none;border-color:#8FA9F0;box-shadow:0 0 0 4px rgba(91,141,239,.16)}
.inp.err{border-color:#E39AA0;background:#FFF9F9}
.inp.ok{border-color:#8FD0BB}
.err-t{font-size:13px;color:#B94A55;font-weight:500}
.pw{position:relative}
.pw button{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:none;color:var(--mute);padding:6px;border-radius:8px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.linkb{background:none;border:0;color:var(--blue);font-weight:600;font-size:14px;padding:0}
.linkb:hover{text-decoration:underline}
.chk{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--mute)}
.chk input{width:18px;height:18px;accent-color:#5B6FE8}

/* shell */
.shell{display:flex;min-height:100vh}
.side{width:248px;flex:none;position:sticky;top:0;height:100vh;background:#fff;border-right:1px solid var(--line);padding:24px 16px;display:flex;flex-direction:column;gap:4px}
.side .logo{padding:0 10px 22px}
.nav{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:14px;border:0;background:none;color:var(--mute);font-size:15px;font-weight:600;text-align:left;transition:background .15s,color .15s}
.nav:hover{background:#F3F6FF;color:var(--ink)}
.nav.on{background:var(--blue2);color:var(--blue)}
.side-note{margin-top:auto;padding:16px;border-radius:16px;background:linear-gradient(160deg,var(--lav2),var(--blue2));font-size:13px}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:14px 32px;background:rgba(255,255,255,.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.top-left{display:flex;align-items:center;gap:12px}
.nav-history{display:inline-flex;align-items:center;gap:6px}
.nav-arrow{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:#fff;color:var(--ink);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
.nav-arrow:hover:not(:disabled){background:#F0F3FF;border-color:#BBCBF6;color:var(--blue)}
.nav-arrow:disabled{opacity:.32;cursor:not-allowed}
.top .ttl{font-weight:700;font-size:16px;color:var(--ink)}
.top .mlogo{display:none}
.page{width:100%;max-width:1160px;margin:0 auto;padding:12px 32px 56px}
.bottom{display:none}
.sos{display:inline-flex;align-items:center;gap:8px;border:1.5px solid #F3C4C8;background:#FFF3F4;color:#B24853;font-weight:700;font-size:14px;padding:8px 14px;border-radius:999px;transition:background .15s}
.sos:hover{background:#FFE8EA}
.avatar{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#5B8DEF,#9B8CF0);color:#fff;font-weight:700;display:grid;place-items:center;border:0;font-size:15px;cursor:pointer}
.menu{position:absolute;right:0;top:calc(100% + 8px);background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh);padding:6px;min-width:180px;z-index:50}
.menu button{display:flex;gap:10px;align-items:center;width:100%;border:0;background:none;padding:10px 12px;border-radius:10px;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer}
.menu button:hover{background:#F3F6FF}

/* page bits */
.h1{font-size:28px;font-weight:800;letter-spacing:-.025em;line-height:1.2}
.sub{color:var(--mute);margin-top:6px;font-size:15px}
.grid-d{display:grid;grid-template-columns:1.6fr 1fr;gap:20px;margin-top:24px}
.stack{display:flex;flex-direction:column;gap:20px}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
.metric{border-radius:16px;padding:16px;background:#F6F8FF}
.metric b{display:block;font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:8px}
.metric span{font-size:13px;color:var(--mute);font-weight:500}
.moodrow{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;background:var(--lav2);margin-bottom:20px}
.ring-wrap{display:grid;place-items:center;position:relative;margin:8px auto 0}
.ring-c{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.states{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0 14px}
.state{text-align:center;padding:8px 4px;border-radius:12px;font-size:13px;font-weight:600;background:#F4F6FF;color:var(--mute);transition:all .3s}
.recgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;margin-top:20px}
.rec{display:flex;flex-direction:column;gap:14px}
.rec p{color:var(--mute);font-size:14px;flex:1}
.seg{display:inline-flex;background:#E8ECFA;border-radius:14px;padding:4px;margin-top:20px}
.seg button{border:0;background:none;padding:9px 18px;border-radius:11px;font-weight:600;font-size:14px;color:var(--mute);transition:all .15s;cursor:pointer}
.seg button.on{background:#fff;color:var(--ink);box-shadow:0 2px 8px rgba(60,80,160,.12)}
.sect{margin-top:18px}
.sect h3{margin-bottom:4px}
.slider{margin-top:20px}
.slider .row b{font-size:18px;letter-spacing:-.01em}
.slider input{width:100%;accent-color:#5B6FE8;margin-top:10px;height:6px;cursor:pointer}
.moods{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px;width:100%;box-sizing:border-box}
.mood{border:1.5px solid var(--line);background:#fff;border-radius:16px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mute);transition:all .15s;cursor:pointer;min-width:0;text-align:center}
.mood span{font-size:12px;font-weight:600;display:block;max-width:100%;text-align:center}
.mood-icon-wrap{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;transition:all .15s}
.mood:hover{border-color:#BBCBF6;background:#FAFBFF}
.mood.on{border-color:#6F86EA;background:#F0F3FF;color:var(--blue);transform:translateY(-2px);box-shadow:0 4px 12px rgba(91,111,232,.12)}
textarea.inp{resize:vertical;min-height:120px;line-height:1.5}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.contact{display:flex;gap:14px;align-items:flex-start}
.contact .info{flex:1;min-width:0;font-size:14px}
.contact .info div{display:flex;align-items:center;gap:8px;color:var(--mute);margin-top:4px;overflow-wrap:anywhere}
.iconb{border:0;background:none;color:#8D98B8;padding:6px;border-radius:8px;cursor:pointer}
.iconb:hover{background:#FDEBEC;color:#B24853}
.switch{position:relative;width:46px;height:26px;flex:none;border:0;border-radius:999px;background:#D5DBEE;transition:background .2s;padding:0;cursor:pointer}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s}
.switch.on{background:#5B6FE8}
.switch.on::after{transform:translateX(20px)}
.setrow{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--line)}
.setrow:last-child{border-bottom:0}
.calm{background:linear-gradient(160deg,#F1EDFF,#E6F0FF);border:0}

/* chat responsive */
.chat{display:flex;flex-direction:column;height:calc(100dvh - 148px);min-height:480px;margin-top:18px;padding:0;overflow:hidden;border-radius:20px}
.chat-h{display:flex;align-items:center;gap:14px;padding:16px 22px;border-bottom:1px solid var(--line);background:#fff;flex-shrink:0}
.chat-b{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;background:#FBFCFF;-webkit-overflow-scrolling:touch}
.msg{max-width:min(78%,560px);padding:12px 16px;border-radius:18px;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
.msg.ai{align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:6px}
.msg.me{align-self:flex-end;color:#fff;background:linear-gradient(135deg,#3F6FD8,#6C5CE0);border-bottom-right-radius:6px}
.dots{display:inline-flex;gap:5px;padding:4px 2px}
.dots i{width:7px;height:7px;border-radius:50%;background:#9AA7D0;animation:blink 1.2s infinite}
.dots i:nth-child(2){animation-delay:.2s}
.dots i:nth-child(3){animation-delay:.4s}
.chat-f{padding:12px 18px 14px;border-top:1px solid var(--line);background:#fff;flex-shrink:0}
.prompts{display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;scrollbar-width:none}
.prompts button{flex:none;border:1px solid var(--line);background:#F7F9FF;color:var(--ink);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;white-space:nowrap;transition:background .15s;cursor:pointer}
.prompts button:hover{background:var(--blue2)}
.send-row{display:flex;gap:10px}
.disc{font-size:12px;color:#7480A5;text-align:center;margin-top:8px}

/* modal / toast */
.ov{position:fixed;inset:0;z-index:100;background:rgba(30,42,71,.42);backdrop-filter:blur(3px);display:grid;place-items:center;padding:16px;animation:fade .2s}
.modal{width:100%;max-width:440px;background:#fff;border-radius:24px;padding:26px;box-shadow:0 30px 80px rgba(30,42,71,.3);animation:pop .25s;max-height:90vh;overflow-y:auto}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:120;background:var(--ink);color:#fff;padding:12px 20px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 12px 30px rgba(30,42,71,.3);display:flex;gap:8px;align-items:center;animation:pop .25s;max-width:90vw}

/* Multi-layered Purple Breathing Visualizer */
.breathing-box{position:relative;width:240px;height:240px;margin:18px auto;display:flex;align-items:center;justify-content:center}
.breath-layer-outer{position:absolute;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(168,85,247,.35) 0%,rgba(147,51,234,.05) 70%,transparent 100%);filter:blur(18px);transition:transform 4s cubic-bezier(.4,0,.2,1),opacity 4s cubic-bezier(.4,0,.2,1);pointer-events:none}
.breath-layer-ripple{position:absolute;width:190px;height:190px;border-radius:50%;border:2px solid rgba(192,132,252,.5);box-shadow:0 0 24px rgba(168,85,247,.3);transition:transform 4s cubic-bezier(.4,0,.2,1),opacity 4s cubic-bezier(.4,0,.2,1);pointer-events:none}
.breath-layer-mid{position:absolute;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle at 40% 35%,rgba(192,132,252,.55) 0%,rgba(147,51,234,.22) 100%);transition:transform 4s cubic-bezier(.4,0,.2,1),opacity 4s cubic-bezier(.4,0,.2,1);pointer-events:none}
.breath-layer-core{position:absolute;width:116px;height:116px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FAF5FF 0%,#C084FC 35%,#9333EA 75%,#6B21A8 100%);box-shadow:0 10px 40px rgba(126,34,206,.45),inset 0 2px 8px rgba(255,255,255,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:24px;letter-spacing:-.02em;transition:transform 4s cubic-bezier(.4,0,.2,1),box-shadow 4s cubic-bezier(.4,0,.2,1);user-select:none}
.breath-count-label{font-size:11px;font-weight:600;opacity:.85;letter-spacing:.03em;text-transform:uppercase}

.breath-inhale .breath-layer-outer{transform:scale(1.35);opacity:.85}
.breath-inhale .breath-layer-ripple{transform:scale(1.45);opacity:.7}
.breath-inhale .breath-layer-mid{transform:scale(1.3);opacity:.75}
.breath-inhale .breath-layer-core{transform:scale(1.32);box-shadow:0 15px 50px rgba(147,51,234,.65)}

.breath-hold .breath-layer-outer{transform:scale(1.35);opacity:.9}
.breath-hold .breath-layer-ripple{transform:scale(1.48);opacity:.85;animation:subtlePulse 2s ease-in-out infinite}
.breath-hold .breath-layer-mid{transform:scale(1.32);opacity:.8}
.breath-hold .breath-layer-core{transform:scale(1.32);box-shadow:0 15px 60px rgba(168,85,247,.7)}

.breath-exhale .breath-layer-outer{transform:scale(.85);opacity:.3}
.breath-exhale .breath-layer-ripple{transform:scale(.9);opacity:.25}
.breath-exhale .breath-layer-mid{transform:scale(.85);opacity:.35}
.breath-exhale .breath-layer-core{transform:scale(.85);box-shadow:0 6px 20px rgba(126,34,206,.3)}

.breath-rest .breath-layer-outer{transform:scale(.85);opacity:.25}
.breath-rest .breath-layer-ripple{transform:scale(.85);opacity:.2}
.breath-rest .breath-layer-mid{transform:scale(.85);opacity:.3}
.breath-rest .breath-layer-core{transform:scale(.85);box-shadow:0 4px 15px rgba(126,34,206,.25)}

@keyframes subtlePulse{0%,100%{transform:scale(1.48);opacity:.8}50%{transform:scale(1.52);opacity:.95}}
.timer{font-size:36px;font-weight:800;letter-spacing:-.03em;text-align:center}

@keyframes blink{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes breathe{0%,100%{transform:scale(.7)}50%{transform:scale(1.1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.mm *{animation:none!important;transition:none!important}}

/* responsive */
@media (max-width:1000px){
  .l-feat{grid-template-columns:repeat(2,1fr)}
  .grid-d{grid-template-columns:1fr}
}
@media (max-width:899px){
  .side{display:none}
  .top{padding:12px 16px}
  .top .ttl{display:none}
  .top .mlogo{display:flex}
  .page{padding:4px 16px 100px}
  .bottom{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:6px 8px calc(6px + env(safe-area-inset-bottom));justify-content:space-around}
  .bottom button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;border:0;background:none;padding:8px 0;font-size:11px;font-weight:600;color:var(--mute);border-radius:12px}
  .bottom button.on{color:var(--blue);background:var(--blue2)}
  .chat{height:calc(100dvh - 210px)}
  .a-wrap{grid-template-columns:1fr}
  .a-side{display:none}
  .two{grid-template-columns:1fr}
}
@media (max-width:720px){
  .l-hero{grid-template-columns:1fr;padding-bottom:48px}
  .l-hero .ill{order:-1;max-width:340px;margin:0 auto}
  .metrics{grid-template-columns:repeat(2,1fr)}
  .l-feat{grid-template-columns:1fr}
  .h1{font-size:26px}
  .moods{grid-template-columns:repeat(auto-fit,minmax(54px,1fr));gap:6px}
  .mood{padding:8px 3px;border-radius:12px}
  .mood-icon-wrap{width:32px;height:32px}
  .mood span{font-size:11px;font-weight:600}
  .recgrid{grid-template-columns:1fr}
  .msg{max-width:88%}
}
@media (max-width:440px){
  .moods{grid-template-columns:repeat(auto-fit,minmax(50px,1fr));gap:4px}
  .mood{padding:6px 2px}
  .mood-icon-wrap{width:28px;height:28px}
  .mood span{font-size:10px}
}
.btn-sm{padding:6px 14px;font-size:13px;border-radius:10px}
`;

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

const Logo = ({ onClick, className = "" }) => (
  <button className={`logo ${className}`} onClick={onClick} aria-label="MindMate home">
    <span className="logo-mark"><Leaf size={19} /></span>
    MindMate
  </button>
);

function Illustration() {
  return (
    <svg viewBox="0 0 480 400" width="100%" role="img" aria-label="A relaxed student sitting cross-legged with headphones and a warm drink" className="float">
      <defs>
        <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D5E4FF" />
          <stop offset="1" stopColor="#E6DDFF" />
        </linearGradient>
      </defs>
      <path d="M240 26c86 0 186 46 192 148 6 100-76 188-186 190C136 366 44 300 48 196 52 92 150 26 240 26z" fill="url(#bg1)" />
      <circle cx="96" cy="88" r="9" fill="#fff" opacity=".8" />
      <circle cx="404" cy="120" r="6" fill="#fff" opacity=".9" />
      <path d="M378 62c10-16 30-14 34 2-12 10-28 10-34-2z" fill="#8ED0B8" />
      <path d="M78 150c-2-12 8-20 18-14-2 12-10 18-18 14z" fill="#B7A9F5" />
      {/* cushion */}
      <ellipse cx="240" cy="338" rx="130" ry="24" fill="#C6D5FA" />
      <ellipse cx="240" cy="332" rx="118" ry="20" fill="#DCE6FF" />
      {/* legs */}
      <rect x="160" y="296" width="160" height="38" rx="19" fill="#5F73D6" />
      <rect x="185" y="308" width="110" height="26" rx="13" fill="#7286E6" />
      {/* torso */}
      <rect x="196" y="190" width="88" height="118" rx="38" fill="#A99BF0" />
      {/* arms and mug */}
      <path d="M208 220q-16 32 22 50" stroke="#A99BF0" strokeWidth="20" strokeLinecap="round" fill="none" />
      <path d="M272 220q16 32-22 50" stroke="#9587E8" strokeWidth="20" strokeLinecap="round" fill="none" />
      <rect x="226" y="254" width="28" height="24" rx="6" fill="#fff" />
      <path d="M254 260q10 0 10 8t-10 8" stroke="#fff" strokeWidth="4" fill="none" />
      <path d="M234 244q-4-8 0-14M246 244q-4-8 0-14" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".8" />
      {/* head */}
      <circle cx="240" cy="160" r="34" fill="#F2CBB0" />
      <path d="M205 158c0-26 20-40 38-38 20 2 32 18 30 38-12-16-40-20-68 0z" fill="#3A3F68" />
      <path d="M203 160a37 37 0 0 1 74 0" stroke="#5B8DEF" strokeWidth="7" fill="none" strokeLinecap="round" />
      <rect x="196" y="156" width="14" height="24" rx="7" fill="#5B8DEF" />
      <rect x="270" y="156" width="14" height="24" rx="7" fill="#5B8DEF" />
      <path d="M223 168q5 5 10 0M247 168q5 5 10 0" stroke="#3A3F68" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M233 181q7 6 14 0" stroke="#B5675A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* plant */}
      <path d="M392 306c-30-30-22-70 0-92 22 24 30 62 0 92z" fill="#5FB59A" />
      <path d="M392 306c-12-40-40-52-62-46 8 30 34 50 62 46z" fill="#7CCAB0" />
      <path d="M392 306c14-34 40-44 60-36-6 26-32 44-60 36z" fill="#4FA98D" />
      <path d="M368 304h48l-6 44h-36z" fill="#E4DAFF" />
      {/* books */}
      <rect x="66" y="316" width="70" height="14" rx="4" fill="#8FA9F0" />
      <rect x="72" y="302" width="60" height="14" rx="4" fill="#B7A9F5" />
    </svg>
  );
}

function StressRing({ score, size = 190 }) {
  const level = levelOf(score);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const color = LEVEL_COLOR[level];
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EAEEFB" strokeWidth="14" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset .9s ease, stroke .4s" }}
        />
      </svg>
      <div className="ring-c">
        <div style={{ fontSize: 13, color: "var(--mute)", fontWeight: 600 }}>Stress level</div>
        <div style={{ fontSize: size > 160 ? 30 : 24, fontWeight: 800, letterSpacing: "-.02em", color }}>{level}</div>
      </div>
    </div>
  );
}

function StressCard({ score, compact }) {
  const level = levelOf(score);
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <h3 style={{ textAlign: "left" }}>Current stress level</h3>
      <StressRing score={score} size={compact ? 170 : 200} />
      <div className="states">
        {["Low", "Moderate", "High"].map((s) => (
          <div key={s} className="state" style={level === s ? { background: LEVEL_SOFT[s], color: LEVEL_COLOR[s] } : null}>{s}</div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 14, textAlign: "left" }}>{LEVEL_COPY[level]}</p>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, onBlur, error, ok, placeholder, right }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="pw">
        <input
          className={`inp ${error ? "err" : ok ? "ok" : ""}`}
          type={type}
          value={value ?? ""}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (type === "email" && (e.key === " " || e.code === "Space")) {
              e.preventDefault();
            }
          }}
          onChange={(e) => {
            const clean = type === "email" ? e.target.value.replace(/\s+/g, "") : e.target.value;
            if (type === "email" && e.target.value !== clean) {
              e.target.value = clean;
            }
            onChange(clean);
          }}
          onBlur={onBlur}
          aria-invalid={!!error}
          style={right ? { paddingRight: 44 } : null}
        />
        {right}
      </div>
      {error && <span className="err-t" role="alert">{error}</span>}
    </div>
  );
}

function Modal({ children, onClose, label }) {
  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing + Auth                                                      */
/* ------------------------------------------------------------------ */

function Landing({ go }) {
  const feats = [
    { icon: Sparkles, t: "Daily Wellness Check-In", d: "A two-minute check-in on sleep, study and how you feel.", c: "t-blue" },
    { icon: MessageCircle, t: "AI Companion", d: "A warm, judgement-free chat whenever you need to talk.", c: "t-lav" },
    { icon: Activity, t: "Stress Tracking", d: "See how your stress moves across the week, in plain charts.", c: "t-green" },
    { icon: LifeBuoy, t: "Emergency Support", d: "Reach a parent, friend or counselor with one tap.", c: "t-blue" },
  ];
  return (
    <div className="l-bg">
      <nav className="l-nav">
        <Logo onClick={() => go("landing")} />
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-s btn-sm" onClick={() => go("login")}>Login</button>
          <button className="btn btn-p btn-sm" onClick={() => go("signup")}>Get Started</button>
        </div>
      </nav>
      <header className="l-hero">
        <div>
          <h1>Take care of your mind, one day at a time.</h1>
          <p>MindMate helps students track stress, talk to an AI companion, and get personalized wellness guidance that fits around classes and exams.</p>
          <div className="l-cta">
            <button className="btn btn-p btn-lg" onClick={() => go("signup")}>Get Started <ArrowRight size={18} /></button>
            <button className="btn btn-s btn-lg" onClick={() => go("login")}>Login</button>
          </div>
        </div>
        <div className="ill"><Illustration /></div>
      </header>
      <section className="l-feat" aria-label="Features">
        {feats.map((f) => (
          <div className="card" key={f.t}>
            <div className={`tile ${f.c}`}><f.icon size={22} /></div>
            <h3>{f.t}</h3>
            <p className="muted" style={{ fontSize: 15 }}>{f.d}</p>
          </div>
        ))}
      </section>
      <footer className="l-foot">
        <div>
          <Logo onClick={() => go("landing")} />
          <span className="muted">MindMate offers general wellness support and is not a replacement for professional care.</span>
          <span className="muted">© 2026 MindMate</span>
        </div>
      </footer>
    </div>
  );
}

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function Auth({ mode, go, onDone }) {
  const signup = mode === "signup";
  const [f, setF] = useState({ name: "", email: "", pw: "", pw2: "" });
  const [touched, setTouched] = useState({});
  const [show, setShow] = useState(false);
  const set = (k) => (v) => {
    let clean = v;
    if (k === "email") clean = clean.replace(/\s+/g, "");
    if (k === "name") clean = clean.replace(/^\s+/, "");
    setF((p) => ({ ...p, [k]: clean }));
  };
  const blur = (k) => () => setTouched((p) => ({ ...p, [k]: true }));

  const errs = {};
  if (signup && f.name.trim().length < 2) errs.name = "Please tell us your name so we can greet you.";
  if (!emailOk(f.email.replace(/\s+/g, ""))) errs.email = "That email doesn't look right. Try something like name@college.edu.";
  if (f.pw.length < 8) errs.pw = "Use at least 8 characters for your password.";
  if (signup && f.pw2 !== f.pw) errs.pw2 = "Passwords don't match yet. Check both boxes.";
  const e = (k) => (touched[k] ? errs[k] : undefined);
  const good = (k) => touched[k] && !errs[k];

  const submit = async () => {
  setTouched({ name: true, email: true, pw: true, pw2: true });
  if (Object.keys(errs).length) return;
  try {
    let res;
    if (signup) {
      res = await api.signup({ name: f.name.trim(), email: f.email, password: f.pw });
    } else {
      res = await api.login({ email: f.email, password: f.pw });
    }
    localStorage.setItem("mm_token", res.token);
    onDone(res);
  } catch (err) {
    alert(err.message);
  }
};

  const eye = (
    <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <div className="a-wrap">
      <div className="a-side">
        <Logo onClick={() => go("landing")} />
        <blockquote>A calmer week starts with a small check-in.</blockquote>
        <div style={{ maxWidth: 380 }}><Illustration /></div>
      </div>
      <div className="a-form">
        <div className="a-card">
          <div className="mlogo" style={{ marginBottom: 28 }}><Logo onClick={() => go("landing")} /></div>
          <h1>{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="sub">{signup ? "It takes less than a minute." : "Log in to continue your check-ins."}</p>

          {signup && <Field label="Full name" value={f.name} onChange={set("name")} onBlur={blur("name")} error={e("name")} ok={good("name")} placeholder="Aadi Sharma" />}
          <Field label="Email" type="email" value={f.email} onChange={set("email")} onBlur={blur("email")} error={e("email")} ok={good("email")} placeholder="you@college.edu" />
          <Field label="Password" type={show ? "text" : "password"} value={f.pw} onChange={set("pw")} onBlur={blur("pw")} error={e("pw")} ok={good("pw")} placeholder="At least 8 characters" right={eye} />
          {signup && <Field label="Confirm password" type={show ? "text" : "password"} value={f.pw2} onChange={set("pw2")} onBlur={blur("pw2")} error={e("pw2")} ok={good("pw2")} placeholder="Type it again" />}

          {!signup && (
            <div className="row" style={{ marginTop: 16 }}>
              <label className="chk"><input type="checkbox" defaultChecked /> Remember me</label>
              <button className="linkb" onClick={() => alert("Password reset is not connected in this demo.")}>Forgot password?</button>
            </div>
          )}

          <button className="btn btn-p btn-lg" style={{ width: "100%", marginTop: 24 }} onClick={submit}>
            {signup ? "Create Account" : "Login"}
          </button>
          <p className="muted" style={{ textAlign: "center", marginTop: 20, fontSize: 14 }}>
            {signup ? "Already have an account? " : "New to MindMate? "}
            <button className="linkb" onClick={() => go(signup ? "login" : "signup")}>{signup ? "Login" : "Sign up"}</button>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App pages                                                           */
/* ------------------------------------------------------------------ */

function Dashboard({ user, today, score, setTab, setWtab, openSession }) {
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const mood = MOODS.find((m) => m.id === today.mood);
  const recs = recsFor(today).slice(0, 3);
  const m = [
    { i: Moon, l: "Sleep", v: `${today.sleep} hrs`, c: "t-lav" },
    { i: BookOpen, l: "Study", v: `${today.study} hrs`, c: "t-blue" },
    { i: Smartphone, l: "Screen time", v: `${today.screen} hrs`, c: "t-green" },
    { i: CalendarDays, l: "Days until exam", v: today.exam, c: "t-blue" },
  ];
  return (
    <>
      <h1 className="h1">{greet}, {(user.name || "").trim() || "friend"}</h1>
      <p className="sub">Welcome to your daily mental wellness space.</p>
      <div className="grid-d">
        <div className="stack">
          <div className="card">
            <div className="row">
              <h3>Today's Wellness Check-In</h3>
              {today.done && <span className="chip" style={{ background: "var(--grn2)", color: "var(--grn)" }}><Check size={14} /> Done</span>}
            </div>
            <div className="metrics">
              {m.map((x) => (
                <div className="metric" key={x.l}>
                  <div className={`tile ${x.c}`} style={{ width: 36, height: 36, borderRadius: 11 }}><x.i size={18} /></div>
                  <b>{x.v}</b><span>{x.l}</span>
                </div>
              ))}
            </div>
            <div className="moodrow">
              <div className="tile t-lav" style={{ width: 40, height: 40, borderRadius: 12 }}>
                {mood ? <mood.icon size={22} /> : <Smile size={22} />}
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Feeling {mood ? mood.label.toLowerCase() : "okay"}</div>
                <div className="muted" style={{ fontSize: 13 }}>Today's logged mood</div>
              </div>
            </div>
            <button className="btn btn-p btn-lg" style={{ width: "100%" }} onClick={() => { setWtab("checkin"); setTab("wellness"); }}>Complete Today's Check-In</button>
          </div>
          <div className="card">
            <div className="row" style={{ marginBottom: 16 }}>
              <h3>Suggested for you</h3>
              <button className="linkb" onClick={() => { setWtab("tips"); setTab("wellness"); }}>See all</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {recs.map((r) => (
                <div key={r.id} className="row" style={{ padding: 12, borderRadius: 16, background: "#F6F8FF" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                    <div className={`tile t-${r.tint}`}><r.icon size={20} /></div>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div><div className="muted" style={{ fontSize: 13 }}>{r.mins} min</div></div>
                  </div>
                  <button className="btn btn-g btn-sm" onClick={() => openSession(r)}>Start</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="stack">
          <StressCard score={score} />
          <div className="card calm">
            <div className="tile t-lav" style={{ background: "#fff" }}><MessageCircle size={22} /></div>
            <h3 style={{ margin: "14px 0 6px" }}>Need to talk?</h3>
            <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>MindMate AI is here to listen, any time of day.</p>
            <button className="btn btn-s btn-sm" onClick={() => setTab("ai")}>Open AI Companion</button>
          </div>
        </div>
      </div>
    </>
  );
}

function Slider({ label, unit, value, min, max, step, onChange }) {
  return (
    <div className="slider">
      <div className="row"><label style={{ fontWeight: 600, fontSize: 15 }}>{label}</label><b>{value} {unit}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={label} />
    </div>
  );
}

function Wellness({ today, setToday, wtab, setWtab, openSession, setTab, resultShown, setResultShown }) {
  const [d, setD] = useState({
    sleep: Number(today?.sleep ?? 7.5),
    study: Number(today?.study ?? 6.0),
    screen: Number(today?.screen ?? 4.5),
    exam: Number(today?.exam ?? 14),
    mood: today?.mood || "okay",
    note: today?.note || "",
  });

  const setMeta = (k) => (v) => setD((p) => ({ ...p, [k]: v }));

  // Synchronized Hours Handler (Total cannot exceed 24.0 hours)
  const syncHours = (key, rawVal) => {
    setD((prev) => {
      const TOTAL_LIMIT = 24.0;
      const newVal = Math.max(0, Math.min(TOTAL_LIMIT, Math.round(Number(rawVal) * 2) / 2));

      let sleep = Number(prev.sleep ?? 7.5);
      let study = Number(prev.study ?? 6.0);
      let screen = Number(prev.screen ?? 4.5);

      if (key === "sleep") sleep = newVal;
      else if (key === "study") study = newVal;
      else if (key === "screen") screen = newVal;

      const sum = sleep + study + screen;
      if (sum > TOTAL_LIMIT) {
        const excess = sum - TOTAL_LIMIT;
        const otherKeys = ["sleep", "study", "screen"].filter((k) => k !== key);
        const o0 = otherKeys[0];
        const o1 = otherKeys[1];
        const v0 = Number(prev[o0] ?? 0);
        const v1 = Number(prev[o1] ?? 0);
        const otherSum = v0 + v1;

        if (otherSum <= 0) {
          if (key === "sleep") sleep = TOTAL_LIMIT;
          if (key === "study") study = TOTAL_LIMIT;
          if (key === "screen") screen = TOTAL_LIMIT;
        } else {
          let red0 = Math.round((excess * (v0 / otherSum)) * 2) / 2;
          let red1 = Math.round((excess - red0) * 2) / 2;

          let new0 = Math.max(0, v0 - red0);
          let new1 = Math.max(0, v1 - red1);

          let rem = (newVal + new0 + new1) - TOTAL_LIMIT;
          while (rem > 0.001) {
            if (new0 >= 0.5 && (new0 >= new1 || new1 < 0.5)) {
              new0 -= 0.5;
            } else if (new1 >= 0.5) {
              new1 -= 0.5;
            } else {
              break;
            }
            rem = (newVal + new0 + new1) - TOTAL_LIMIT;
          }

          if (o0 === "sleep") sleep = new0;
          else if (o0 === "study") study = new0;
          else if (o0 === "screen") screen = new0;

          if (o1 === "sleep") sleep = new1;
          else if (o1 === "study") study = new1;
          else if (o1 === "screen") screen = new1;
        }
      }

      return {
        ...prev,
        sleep: Math.round(sleep * 2) / 2,
        study: Math.round(study * 2) / 2,
        screen: Math.round(screen * 2) / 2,
      };
    });
  };

  const totalAllocated = Math.round(((d.sleep || 0) + (d.study || 0) + (d.screen || 0)) * 2) / 2;
  const freeTime = Math.max(0, Math.round((24.0 - totalAllocated) * 2) / 2);
  const score = computeStress(d);

  const analyze = async () => {
    try {
      const saved = await api.checkin(d);
      setToday({ ...saved, done: true });
      setResultShown(true);
    } catch (err) {
      alert("Failed to submit check-in: " + (err.message || "Network issue"));
    }
  };

  const tabs = (
    <div className="seg" role="tablist">
      <button className={wtab === "checkin" ? "on" : ""} onClick={() => setWtab("checkin")}>Check-in</button>
      <button className={wtab === "tips" ? "on" : ""} onClick={() => setWtab("tips")}>Suggestions</button>
    </div>
  );

  if (wtab === "tips") {
    return (
      <>
        <h1 className="h1">Today's suggestions</h1>
        <p className="sub">Small things that can help, picked from your latest check-in.</p>
        {tabs}
        <div className="recgrid">
          {recsFor(today).map((r) => (
            <div className="card rec" key={r.id}>
              <div className="row">
                <div className={`tile t-${r.tint}`}><r.icon size={22} /></div>
                <span className="chip"><Timer size={14} /> {r.mins} min</span>
              </div>
              <h3>{r.title}</h3>
              <p>{r.blurb}</p>
              <button className="btn btn-p btn-sm" onClick={() => openSession(r)}>Start</button>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (resultShown) {
    const s = computeStress(today);
    return (
      <>
        <h1 className="h1">Here's how today looks</h1>
        <p className="sub">Thanks for checking in. Here's what we noticed.</p>
        {tabs}
        <div className="grid-d">
          <StressCard score={s} />
          <div className="card">
            <h3>What might help</h3>
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              {recsFor(today).slice(0, 3).map((r) => (
                <div key={r.id} className="row" style={{ padding: 12, borderRadius: 16, background: "#F6F8FF" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div className={`tile t-${r.tint}`}><r.icon size={20} /></div>
                    <div><div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div><div className="muted" style={{ fontSize: 13 }}>{r.mins} min</div></div>
                  </div>
                  <button className="btn btn-g btn-sm" onClick={() => openSession(r)}>Start</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button className="btn btn-p btn-sm" onClick={() => setTab("ai")}>Talk to MindMate AI</button>
              <button className="btn btn-s btn-sm" onClick={() => setResultShown(false)}>Edit check-in</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="h1">Daily check-in</h1>
      <p className="sub">Answer honestly. There are no wrong answers.</p>
      {tabs}
      <div className="two sect" style={{ alignItems: "start" }}>
        <div className="card">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="tile t-lav"><Moon size={20} /></div>
            <div>
              <h3>Your day</h3>
              <div className="muted" style={{ fontSize: 14 }}>Rest, study and screens (max 24 hrs total)</div>
            </div>
          </div>

          {/* 24-Hour Day Budget Bar */}
          <div style={{ marginTop: 14, marginBottom: 16, padding: "12px 14px", borderRadius: 14, background: "#F6F8FF", border: "1px solid #E2E8F0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: "#1E2A47" }}>24-Hour Day Budget</span>
              <span style={{ fontWeight: 700, color: totalAllocated >= 24 ? "#D9737D" : "#5B6FE8" }}>
                {totalAllocated.toFixed(1)} / 24.0 hrs {freeTime > 0 ? `(${freeTime.toFixed(1)}h free time)` : "(24h fully budgeted)"}
              </span>
            </div>
            <div style={{ width: "100%", height: 10, borderRadius: 6, display: "flex", overflow: "hidden", background: "#E2E8F0" }}>
              <div style={{ width: `${(d.sleep / 24) * 100}%`, background: "#8B5CF6", transition: "width 0.15s ease" }} title={`Sleep: ${d.sleep}h`} />
              <div style={{ width: `${(d.study / 24) * 100}%`, background: "#3B82F6", transition: "width 0.15s ease" }} title={`Study: ${d.study}h`} />
              <div style={{ width: `${(d.screen / 24) * 100}%`, background: "#10B981", transition: "width 0.15s ease" }} title={`Screen: ${d.screen}h`} />
              {freeTime > 0 && <div style={{ width: `${(freeTime / 24) * 100}%`, background: "#E2E8F0" }} title={`Free Time: ${freeTime.toFixed(1)}h`} />}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: "#5F6C93", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8B5CF6" }} /> Sleep: {d.sleep}h</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3B82F6" }} /> Study: {d.study}h</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} /> Screen: {d.screen}h</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#CBD5E1" }} /> Other/Free: {freeTime.toFixed(1)}h</span>
            </div>
          </div>

          <Slider label="How many hours did you sleep?" unit="hrs" value={d.sleep} min={0} max={24} step={0.5} onChange={(v) => syncHours("sleep", v)} />
          <Slider label="How many hours did you study?" unit="hrs" value={d.study} min={0} max={24} step={0.5} onChange={(v) => syncHours("study", v)} />
          <Slider label="How much screen time did you have?" unit="hrs" value={d.screen} min={0} max={24} step={0.5} onChange={(v) => syncHours("screen", v)} />
        </div>
        <div className="card">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}><div className="tile t-blue"><CalendarDays size={20} /></div><div><h3>Your exam</h3><div className="muted" style={{ fontSize: 14 }}>Deadlines shape how we feel</div></div></div>
          <Slider label="How many days are left until your exam?" unit="days" value={d.exam} min={0} max={90} step={1} onChange={setMeta("exam")} />
        </div>
      </div>
      <div className="card sect">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}><div className="tile t-green"><HeartHandshake size={20} /></div><div><h3>How are you feeling today?</h3><div className="muted" style={{ fontSize: 14 }}>Pick a mood and share as much as you like</div></div></div>
        <div className="moods" role="radiogroup" aria-label="Mood">
          {MOODS.map((m) => {
            const Icon = m.icon;
            const isSelected = d.mood === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`mood ${isSelected ? "on" : ""}`}
                role="radio"
                aria-checked={isSelected}
                onClick={() => setMeta("mood")(isSelected ? null : m.id)}
              >
                <div
                  className="mood-icon-wrap"
                  style={{
                    color: isSelected ? m.color : "#6B7A99",
                    background: isSelected ? m.bg : "#F6F8FF",
                  }}
                >
                  <Icon size={22} />
                </div>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <textarea className="inp" style={{ marginTop: 16 }} placeholder="Tell us what's on your mind..." value={d.note} onChange={(e) => setMeta("note")(e.target.value)} aria-label="How are you feeling today?" />
      </div>
      <div style={{ marginTop: 20 }}>
        <button className="btn btn-p btn-lg" onClick={analyze}>Analyze My Wellness</button>
        <span className="muted" style={{ fontSize: 13, marginLeft: 14 }}>Preview: {levelOf(score)}</span>
      </div>
    </>
  );
}

const PROMPTS = [
  "I am feeling stressed",
  "Overwhelmed with studying",
  "Trouble sleeping lately",
  "Guide me through breathing",
];

function Chat({ ctx }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: "Hi, I'm MindMate. I'm glad you're here. How has your day been so far?" }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  
  useEffect(() => {
    if (box.current) {
      box.current.scrollTop = box.current.scrollHeight;
    }
  }, [msgs, busy]);

  const send = async (raw) => {
  const t = (raw ?? text).trim();
  if (!t || busy) return;
  const next = [...msgs, { role: "user", content: t }];
  setMsgs(next);
  setText("");
  setBusy(true);
  try {
    const formatted = next.map((m) => ({ role: m.role, content: m.content }));
    const data = await api.sendMessage(formatted, ctx);
    setMsgs((p) => [...p, { role: "assistant", content: data.reply }]);
  } catch (err) {
    setMsgs((p) => [...p, { role: "assistant", content: fallbackReply(t, ctx?.level) }]);
  }
  setBusy(false);
};

  return (
    <div className="card chat">
      <div className="chat-h">
        <div className="tile t-lav" style={{ borderRadius: 16 }}><Leaf size={22} /></div>
        <div><h3>MindMate AI</h3><div className="muted" style={{ fontSize: 14 }}>Your supportive wellness companion</div></div>
      </div>
      <div className="chat-b" ref={box} aria-live="polite">
        {msgs.map((m, i) => <div key={i} className={`msg ${m.role === "user" ? "me" : "ai"}`}>{m.content}</div>)}
        {busy && <div className="msg ai" aria-label="MindMate is typing"><span className="dots"><i /><i /><i /></span></div>}
      </div>
      <div className="chat-f">
        <div className="prompts">{PROMPTS.map((p) => <button key={p} onClick={() => send(p.replace(/^\S+\s/, ""))}>{p}</button>)}</div>
        <div className="send-row">
          <input className="inp" placeholder="Type a message..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} aria-label="Message" />
          <button className="btn btn-p" onClick={() => send()} disabled={!text.trim() || busy} aria-label="Send message"><Send size={18} /></button>
        </div>
        <p className="disc">MindMate provides general wellness support and is not a replacement for professional mental health care.</p>
      </div>
    </div>
  );
}

const tipStyle = { borderRadius: 12, border: "1px solid #E4E8F6", boxShadow: "0 8px 24px rgba(60,80,160,.12)", fontFamily: "inherit", fontSize: 13 };
const axis = { tick: { fill: "#6B789E", fontSize: 12 }, axisLine: false, tickLine: false };

function History({ today, score }) {
  const labels = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString("en-US", { weekday: "short" });
    });
  }, []);
  const rows = labels.map((day, i) => ({
    day,
    stress: [58, 62, 55, 60, 48, 44, score][i],
    sleep: [6.4, 6.8, 6.1, 7.0, 8.1, 7.6, today.sleep][i],
    study: [5, 6.5, 7, 5.5, 3, 4, today.study][i],
    screen: [6.5, 5.8, 7.2, 6, 4.8, 5.2, today.screen][i],
  }));
  const avg = Math.round(rows.reduce((a, r) => a + r.stress, 0) / 7);
  const lvl = levelOf(avg);
  const charts = [
    { t: "Sleep", u: "hrs", k: "sleep", color: "#7C6CE6", kind: "bar" },
    { t: "Study", u: "hrs", k: "study", color: "#5B8DEF", kind: "bar" },
    { t: "Screen time", u: "hrs", k: "screen", color: "#3F9E84", kind: "line" },
  ];
  return (
    <>
      <h1 className="h1">Your week</h1>
      <p className="sub">A simple look at how the last 7 days have gone.</p>
      <div className="card sect" style={{ background: LEVEL_SOFT[lvl], border: 0, marginTop: 24 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div className="tile" style={{ background: "#fff", color: LEVEL_COLOR[lvl] }}><Activity size={22} /></div>
          <div><h3>Weekly summary</h3><p style={{ marginTop: 2 }}>Your stress level has been {lvl.toLowerCase()} this week.</p></div>
        </div>
      </div>
      <div className="card sect">
        <h3>Stress level, last 7 days</h3>
        <div style={{ height: 240, marginTop: 16 }}>
          <ResponsiveContainer>
            <AreaChart data={rows} margin={{ left: -20, right: 8, top: 8 }}>
              <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7C6CE6" stopOpacity=".3" /><stop offset="1" stopColor="#7C6CE6" stopOpacity="0" /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#EEF1FA" />
              <XAxis dataKey="day" {...axis} /><YAxis domain={[0, 100]} ticks={[0, 35, 65, 100]} {...axis} />
              <Tooltip contentStyle={tipStyle} formatter={(v) => [`${v} (${levelOf(v)})`, "Stress"]} />
              <Area type="monotone" dataKey="stress" stroke="#6C5CE0" strokeWidth={3} fill="url(#sg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="recgrid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        {charts.map((c) => (
          <div className="card" key={c.k}>
            <h3>{c.t}</h3>
            <div style={{ height: 170, marginTop: 12 }}>
              <ResponsiveContainer>
                {c.kind === "bar" ? (
                  <BarChart data={rows} margin={{ left: -26, right: 4 }}>
                    <CartesianGrid vertical={false} stroke="#EEF1FA" />
                    <XAxis dataKey="day" {...axis} /><YAxis {...axis} />
                    <Tooltip contentStyle={tipStyle} cursor={{ fill: "#F3F6FF" }} formatter={(v) => [`${v} ${c.u}`, c.t]} />
                    <Bar dataKey={c.k} fill={c.color} radius={[8, 8, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={rows} margin={{ left: -26, right: 8, top: 6 }}>
                    <CartesianGrid vertical={false} stroke="#EEF1FA" />
                    <XAxis dataKey="day" {...axis} /><YAxis {...axis} />
                    <Tooltip contentStyle={tipStyle} formatter={(v) => [`${v} ${c.u}`, c.t]} />
                    <Line type="monotone" dataKey={c.k} stroke={c.color} strokeWidth={3} dot={{ r: 4, fill: c.color, strokeWidth: 0 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const RELS = ["Parent/Guardian", "Close Friend", "College Counselor"];

function ContactCard({ c, onDelete }) {
  const cid = c._id || c.id;
  return (
    <div className="card contact">
      <div className="avatar" style={{ width: 44, height: 44 }}>{getInitial(c.name)}</div>
      <div className="info">
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)", marginTop: 0 }}>{c.name}</div>
        <span className="chip" style={{ marginTop: 6 }}>{c.rel}</span>
        <div><Mail size={15} /> {c.email}</div>
        <div><Phone size={15} /> {c.phone}</div>
      </div>
      {onDelete && <button className="iconb" onClick={onDelete} aria-label={`Remove ${c.name}`}><Trash2 size={18} /></button>}
    </div>
  );
}

function Sos({ contacts, setContacts, autoNotify, setAutoNotify, toast }) {
  const [f, setF] = useState({ name: "", rel: RELS[0], email: "", phone: "" });
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [picked, setPicked] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => {
    let val = v;
    if (k === "email") val = val.replace(/\s+/g, "");
    if (k === "name") val = val.replace(/^\s+/, "");
    setF((p) => ({ ...p, [k]: val }));
  };

  const errs = {};
  if (f.name.trim().length < 2) errs.name = "Add a name.";
  if (!emailOk(f.email.replace(/\s+/g, ""))) errs.email = "Enter a valid email without spaces.";
  if (f.phone.replace(/\D/g, "").length < 7) errs.phone = "Enter a phone number.";

  const add = async () => {
    setTouched(true);
    if (Object.keys(errs).length || saving) return;
    setSaving(true);
    const cleanName = f.name.trim();
    const cleanEmail = f.email.replace(/\s+/g, "").toLowerCase();
    const cleanPhone = f.phone.trim();
    const payload = { name: cleanName, rel: f.rel, email: cleanEmail, phone: cleanPhone };

    try {
      const saved = await api.addContact(payload);
      setContacts((p) => [...p, saved]);
      toast("Contact saved to database");
    } catch (_) {
      // Offline fallback: save in session with local ID
      const localContact = { _id: String(Date.now()), ...payload };
      setContacts((p) => [...p, localContact]);
      toast("Contact saved locally");
    }

    setF({ name: "", rel: RELS[0], email: "", phone: "" });
    setTouched(false);
    setSaving(false);
  };

  const removeContact = async (c) => {
    const cid = c._id || c.id;
    try {
      await api.deleteContact(cid);
      toast("Contact removed from database");
    } catch (_) {
      toast("Contact removed");
    }
    setContacts((p) => p.filter((x) => (x._id || x.id) !== cid));
  };

  const toggleAutoNotify = async () => {
    const next = !autoNotify;
    setAutoNotify(next);
    try {
      await api.updateProfile({ autoNotify: next });
      toast(next ? "High stress contact alerts enabled" : "High stress contact alerts disabled");
    } catch (_) {}
  };

  const chosen = contacts.filter((c) => picked[c._id || c.id] !== false);
  const send = async () => {
    setConfirm(false);
    const contactIds = chosen.map((c) => c._id || c.id);
    try {
      await api.triggerSos(contactIds);
      toast(`Emergency alert sent to ${chosen.map((c) => c.name).join(", ")}`);
    } catch (_) {
      toast(`Alert sent to ${chosen.map((c) => c.name).join(", ")}`);
    }
  };

  return (
    <>
      <h1 className="h1">Emergency Support</h1>
      <p className="sub">The people you trust, one tap away.</p>
      <div className="two sect" style={{ marginTop: 24, alignItems: "stretch" }}>
        <div className="card calm">
          <div className="tile t-lav" style={{ background: "#fff" }}><LifeBuoy size={22} /></div>
          <h3 style={{ margin: "14px 0 6px" }}>SOS / Emergency Alert</h3>
          <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>Sends a message to your saved contacts asking them to check in on you. You'll confirm before anything is sent.</p>
          <button className="btn btn-p" onClick={() => setConfirm(true)}>SOS / Emergency Alert</button>
          <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>In immediate danger? Call your local emergency number right away.</p>
        </div>
        <div className="card">
          <div className="setrow" style={{ paddingTop: 0 }}>
            <div>
              <h3>Notify my contact if stress stays high</h3>
              <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>If your stress remains high for multiple days, MindMate can notify your selected emergency contact.</p>
            </div>
            <button className={`switch ${autoNotify ? "on" : ""}`} role="switch" aria-checked={autoNotify} aria-label="Notify contact if stress stays high" onClick={toggleAutoNotify} />
          </div>
        </div>
      </div>

      <h3 style={{ margin: "32px 0 14px", fontSize: 20 }}>Saved contacts</h3>
      {contacts.length === 0 ? (
        <div className="card muted">No contacts yet. Add someone below so you can reach them quickly.</div>
      ) : (
        <div className="recgrid" style={{ marginTop: 0 }}>
          {contacts.map((c) => (
            <ContactCard
              key={c._id || c.id}
              c={c}
              onDelete={() => removeContact(c)}
            />
          ))}
        </div>
      )}

      <div className="card sect" style={{ marginTop: 24 }}>
        <h3>Add a contact</h3>
        <div className="two">
          <Field label="Name" value={f.name} onChange={set("name")} error={touched && errs.name} placeholder="Full name" />
          <div className="field">
            <label>Relationship</label>
            <select className="inp" value={f.rel} onChange={(e) => set("rel")(e.target.value)}>{RELS.map((r) => <option key={r}>{r}</option>)}</select>
          </div>
          <Field label="Email" type="email" value={f.email} onChange={set("email")} error={touched && errs.email} placeholder="name@example.com" />
          <Field label="Phone number" type="tel" value={f.phone} onChange={set("phone")} error={touched && errs.phone} placeholder="+1 555 123 4567" />
        </div>
        <button className="btn btn-p" style={{ marginTop: 20 }} disabled={saving} onClick={add}><Plus size={18} /> Save contact</button>
      </div>

      {confirm && (
        <Modal label="Confirm alert" onClose={() => setConfirm(false)}>
          <div className="tile t-lav"><LifeBuoy size={22} /></div>
          <h3 style={{ fontSize: 22, margin: "14px 0 6px" }}>Send an alert?</h3>
          {contacts.length === 0 ? (
            <>
              <p className="muted">You haven't saved any contacts yet. Add one first so your alert has somewhere to go.</p>
              <button className="btn btn-p" style={{ marginTop: 20 }} onClick={() => setConfirm(false)}>Add a contact</button>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: 14 }}>These people will get a message asking them to reach out to you.</p>
              <div style={{ display: "grid", gap: 8 }}>
                {contacts.map((c) => {
                  const cid = c._id || c.id;
                  return (
                    <label key={cid} className="chk" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 14, color: "var(--ink)" }}>
                      <input type="checkbox" checked={picked[cid] !== false} onChange={(e) => setPicked((p) => ({ ...p, [cid]: e.target.checked }))} />
                      <span><b>{c.name}</b> <span className="muted">· {c.rel}</span></span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                <button className="btn btn-s" style={{ flex: 1 }} onClick={() => setConfirm(false)}>Cancel</button>
                <button className="btn btn-p" style={{ flex: 1 }} disabled={!chosen.length} onClick={send}>Send alert</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function Profile({ user, setUser, contacts, setTab, onLogout, prefs, setPrefs, toast }) {
  const fileInputRef = useRef(null);
  const [emailErr, setEmailErr] = useState("");
  const [nameErr, setNameErr] = useState("");

  const items = [
    { k: "daily", t: "Daily check-in reminder", d: "A gentle nudge each evening" },
    { k: "tips", t: "Wellness tips", d: "Occasional suggestions based on your week" },
    { k: "alerts", t: "Stress alerts", d: "Heads-up when your stress trends high" },
  ];

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast?.("Please select an image file (PNG/JPG)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const updated = { ...user, avatar: dataUrl };
        setUser(updated);
        api.updateProfile(updated).catch(() => {});
        toast?.("Profile photo updated");
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    const updated = { ...user, avatar: "" };
    setUser(updated);
    api.updateProfile(updated).catch(() => {});
    toast?.("Profile photo removed");
  };

  const handleEmailChange = (val) => {
    // Automatically strip any spaces immediately as user types
    const clean = (val || "").replace(/\s+/g, "");
    setUser((p) => ({ ...p, email: clean }));
    if (emailErr && emailOk(clean)) setEmailErr("");
  };

  const handleEmailBlur = () => {
    const clean = (user.email || "").replace(/\s+/g, "").toLowerCase();
    setUser((p) => ({ ...p, email: clean }));
    if (!clean) {
      setEmailErr("Email address is required.");
    } else if (!emailOk(clean)) {
      setEmailErr("Please enter a valid email without spaces (e.g. name@college.edu).");
    } else {
      setEmailErr("");
    }
  };

  const handleNameChange = (val) => {
    const clean = (val || "").replace(/^\s+/, "");
    setUser((p) => ({ ...p, name: clean }));
    if (nameErr && clean.trim().length >= 2) setNameErr("");
  };

  const handleNameBlur = () => {
    const clean = (user.name || "").trim();
    setUser((p) => ({ ...p, name: clean }));
    if (clean.length < 2) {
      setNameErr("Please enter a name with at least 2 characters.");
    } else {
      setNameErr("");
    }
  };

  const saveDetails = async () => {
    const cleanName = (user.name || "").trim();
    const cleanEmail = (user.email || "").replace(/\s+/g, "").toLowerCase();
    const cleanCollege = (user.college || "").trim();

    if (cleanName.length < 2) {
      setNameErr("Please enter a name with at least 2 characters.");
      toast?.("Please enter a valid name.");
      return;
    }
    if (!cleanEmail || !emailOk(cleanEmail)) {
      setEmailErr("Please enter a valid email address without spaces.");
      toast?.("Please enter a valid email address without spaces.");
      return;
    }

    setEmailErr("");
    setNameErr("");
    const updated = { ...user, name: cleanName, email: cleanEmail, college: cleanCollege };
    setUser(updated);
    try {
      const savedUser = await api.updateProfile(updated);
      if (savedUser && savedUser.name) setUser((p) => ({ ...p, ...savedUser }));
      toast?.("Profile details saved to database");
    } catch (err) {
      toast?.(err.message || "Profile saved locally");
    }
  };

  const initial = getInitial(user.name);

  return (
    <>
      <h1 className="h1">Profile</h1>
      <div className="card sect" style={{ marginTop: 24, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              style={{ width: 78, height: 78, borderRadius: "50%", objectFit: "cover", boxShadow: "0 4px 14px rgba(60,80,160,.16)" }}
            />
          ) : (
            <div className="avatar" style={{ width: 78, height: 78, fontSize: 30 }}>{initial}</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ fontSize: 22 }}>{(user.name || "").trim() || "User"}</h3>
          <p className="muted" style={{ marginTop: 2 }}>{user.email || "student@university.edu"}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: "none" }}
              onChange={handlePhotoUpload}
            />
            <button className="btn btn-s btn-sm" onClick={() => fileInputRef.current?.click()}>
              <Camera size={15} /> Change photo
            </button>
            {user.avatar && (
              <button className="btn btn-s btn-sm" onClick={handleRemovePhoto}>
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="two sect" style={{ alignItems: "start" }}>
        <div className="card">
          <h3>Your details</h3>
          <Field
            label="Name"
            value={user.name}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            error={nameErr}
            placeholder="Your full name"
          />
          <Field
            label="Email"
            type="email"
            value={user.email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            error={emailErr}
            placeholder="name@college.edu"
          />
          <Field label="College" value={user.college} onChange={(v) => setUser({ ...user, college: v })} />
          <button className="btn btn-p" style={{ marginTop: 18 }} onClick={saveDetails}>
            <Check size={16} /> Save details
          </button>
        </div>

        <div className="card">
          <h3>Notification preferences</h3>
          <div style={{ marginTop: 8 }}>
            {items.map((i) => (
              <div className="setrow" key={i.k}>
                <div><div style={{ fontWeight: 600 }}>{i.t}</div><div className="muted" style={{ fontSize: 13 }}>{i.d}</div></div>
                <button
                  className={`switch ${prefs[i.k] ? "on" : ""}`}
                  role="switch"
                  aria-checked={prefs[i.k]}
                  aria-label={i.t}
                  onClick={() => {
                    const next = { ...prefs, [i.k]: !prefs[i.k] };
                    setPrefs(next);
                    api.updateProfile({ preferences: next }).catch(() => {});
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card sect">
        <div className="row">
          <h3>Emergency contacts</h3>
          <button className="btn btn-g btn-sm" onClick={() => setTab("sos")}>Manage</button>
        </div>
        <div className="recgrid" style={{ marginTop: 16 }}>
          {contacts.length ? (
            contacts.map((c) => <ContactCard key={c._id || c.id} c={c} />)
          ) : (
            <p className="muted">No contacts saved yet.</p>
          )}
        </div>
      </div>

      <button className="btn btn-s" style={{ marginTop: 24 }} onClick={onLogout}>
        <LogOut size={18} /> Logout
      </button>
    </>
  );
}

const BREATH_PHASES = [
  { name: "Inhale", guidance: "Breathe in slowly through your nose", duration: 4, cls: "breath-inhale" },
  { name: "Hold", guidance: "Gently hold your breath", duration: 4, cls: "breath-hold" },
  { name: "Exhale", guidance: "Slowly release through your mouth", duration: 4, cls: "breath-exhale" },
  { name: "Rest", guidance: "Pause and relax before your next breath", duration: 4, cls: "breath-rest" },
];

function Session({ rec, onClose, onDone }) {
  const [left, setLeft] = useState(rec.secs || 120);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseSeconds, setPhaseSeconds] = useState(4);
  const [cycles, setCycles] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (rec.id !== "breath") return;
    const t = setInterval(() => {
      setPhaseSeconds((prev) => {
        if (prev <= 1) {
          setPhaseIdx((p) => {
            const next = (p + 1) % BREATH_PHASES.length;
            if (next === 0) setCycles((c) => c + 1);
            return next;
          });
          return 4;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [rec.id]);

  const currentPhase = BREATH_PHASES[phaseIdx];
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const tips = {
    walk: "Leave your phone in your pocket and notice three things you can see, hear and feel.",
    screen: "Look at something 20 feet away for 20 seconds, then roll your shoulders and stretch.",
    sleep: "Dim the lights, put your phone across the room and let your mind slow down.",
    focus: "Choose one task. Silence notifications. When the timer ends, take a proper break.",
  };

  return (
    <Modal label={rec.title} onClose={onClose}>
      <div className="row" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 20 }}>{rec.title}</h3>
        <button className="iconb" onClick={onClose} aria-label="Close"><X size={20} /></button>
      </div>

      {rec.id === "breath" ? (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          {/* Satisfying multi-layered purple breathing circle */}
          <div className={`breathing-box ${currentPhase.cls}`} aria-hidden="true">
            <div className="breath-layer-outer" />
            <div className="breath-layer-ripple" />
            <div className="breath-layer-mid" />
            <div className="breath-layer-core">
              <span>{phaseSeconds}</span>
              <span className="breath-count-label">{currentPhase.name}</span>
            </div>
          </div>

          <h4 style={{ fontSize: 20, color: "#6B21A8", margin: "14px 0 4px", fontWeight: 700 }}>
            {currentPhase.name}
          </h4>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {currentPhase.guidance}
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: 18, fontSize: 13, color: "var(--mute)", marginBottom: 18 }}>
            <span>Completed rounds: <b style={{ color: "var(--ink)" }}>{cycles}</b></span>
            <span>Total remaining: <b style={{ color: "var(--ink)" }}>{mm}:{ss}</b></span>
          </div>
        </div>
      ) : (
        <>
          <p className="muted" style={{ margin: "16px 0 20px" }}>{tips[rec.id] || "Take this moment for yourself."}</p>
          <div className="timer" style={{ margin: "12px 0 22px" }}>{mm}:{ss}</div>
        </>
      )}

      <button className="btn btn-p" style={{ width: "100%" }} onClick={onDone}>
        {left === 0 ? "Finish session" : "End session"}
      </button>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export default function MindMate() {
  const [screen, setScreen] = useState("landing");
  const [tab, setTab] = useState("dashboard");
  const [wtab, setWtab] = useState("checkin");
  const [menu, setMenu] = useState(false);
  const [session, setSession] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [resultShown, setResultShown] = useState(false);
  const [user, setUser] = useState({ name: "Aadi", email: "aadi@northfield.edu", college: "Northfield University", avatar: "" });
  const [today, setToday] = useState({ sleep: 7.2, study: 6, screen: 5.5, exam: 18, mood: "okay", note: "", done: false });
  const [contacts, setContacts] = useState([]);
  const [autoNotify, setAutoNotify] = useState(true);
  const [prefs, setPrefs] = useState({ daily: true, tips: true, alerts: true });

  // YouTube / browser style navigation stack
  const [historyStack, setHistoryStack] = useState(["dashboard"]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const score = useMemo(() => computeStress(today), [today]);
  const toast = (m) => setToastMsg(m);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => { window.scrollTo(0, 0); }, [tab, screen, wtab]);

  // Push new tab to navigation history stack
  const navigateTo = (nextTab) => {
    if (!nextTab || nextTab === tab) return;
    setHistoryStack((prevStack) => {
      const sliced = prevStack.slice(0, historyIndex + 1);
      return [...sliced, nextTab];
    });
    setHistoryIndex((prevIdx) => prevIdx + 1);
    setTab(nextTab);
    setMenu(false);
    if (nextTab === "wellness") setWtab("checkin");
    try {
      window.history.pushState({ tab: nextTab }, "", `#${nextTab}`);
    } catch (_) {}
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const prev = historyStack[historyIndex - 1];
      setHistoryIndex((idx) => idx - 1);
      setTab(prev);
      setMenu(false);
      if (prev === "wellness") setWtab("checkin");
    }
  };

  const goForward = () => {
    if (historyIndex < historyStack.length - 1) {
      const nxt = historyStack[historyIndex + 1];
      setHistoryIndex((idx) => idx + 1);
      setTab(nxt);
      setMenu(false);
      if (nxt === "wellness") setWtab("checkin");
    }
  };

  // Browser popstate listener (native Back/Forward and mouse side buttons)
  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state && e.state.tab) {
        setTab(e.state.tab);
      } else {
        goBack();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [historyIndex, historyStack]);

  // Dedicated mouse side-button listener (Button 3 = Back, Button 4 = Forward)
  useEffect(() => {
    const handleMouseSideButtons = (e) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("mouseup", handleMouseSideButtons);
    return () => window.removeEventListener("mouseup", handleMouseSideButtons);
  }, [historyIndex, historyStack]);

  // Mouse horizontal slide / drag & touch swipe gestures (with text selection safeguard)
  const gestureRef = useRef({ startX: 0, startY: 0, tracking: false });
  const onGestureStart = (clientX, clientY, target) => {
    if (
      target &&
      target.closest &&
      target.closest("input, textarea, select, button, .recharts-surface, .recgrid, .card, .prompts, .chat-b")
    ) {
      return;
    }
    const isEdge = clientX <= 48 || clientX >= (window.innerWidth - 48);
    gestureRef.current = { startX: clientX, startY: clientY, isEdge, tracking: true };
  };
  const onGestureEnd = (clientX, clientY) => {
    if (!gestureRef.current.tracking) return;
    gestureRef.current.tracking = false;

    // Fix: If user was selecting text, NEVER trigger back/forward navigation
    const sel = typeof window !== "undefined" && window.getSelection ? window.getSelection().toString() : "";
    if (sel && sel.trim().length > 0) {
      return;
    }

    const dx = clientX - gestureRef.current.startX;
    const dy = clientY - gestureRef.current.startY;
    if (Math.abs(dx) > 85 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      if (dx > 0) goBack();
      else goForward();
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("mm_token");
    if (!token) return;

    Promise.all([api.getProfile(), api.getToday(), api.getContacts()])
      .then(([userData, todayData, contactList]) => {
        if (userData && userData.name) {
          setUser(userData);
          if (typeof userData.autoNotify === "boolean") setAutoNotify(userData.autoNotify);
        }
        if (todayData && todayData.date) {
          setToday({ ...todayData, done: true });
        }
        if (Array.isArray(contactList)) {
          setContacts(contactList);
        }
        setScreen("app");
      })
      .catch((err) => {
        console.warn("Session verification:", err);
      });
  }, []);

  const go = (s) => setScreen(s);
  const enter = (u) => {
    setUser((p) => ({ ...p, ...u }));
    setScreen("app");
    setTab("dashboard");
    api.getContacts().then((list) => {
      if (Array.isArray(list)) setContacts(list);
    }).catch(() => {});
  };
  const logout = () => {
    localStorage.removeItem("mm_token");
    setContacts([]);
    setUser({ name: "", email: "", college: "", avatar: "" });
    setMenu(false);
    setScreen("landing");
  };

  const NAV = [
    { id: "dashboard", label: "Dashboard", short: "Home", icon: Home },
    { id: "wellness", label: "Wellness", short: "Wellness", icon: Leaf },
    { id: "ai", label: "AI Companion", short: "AI", icon: MessageCircle },
    { id: "history", label: "History", short: "History", icon: BarChart3 },
    { id: "profile", label: "Profile", short: "Profile", icon: User },
  ];
  const titles = { dashboard: "Dashboard", wellness: "Wellness", ai: "AI Companion", history: "History", profile: "Profile", sos: "Emergency Support" };

  let body;
  if (screen === "landing") body = <Landing go={go} />;
  else if (screen === "login" || screen === "signup") body = <Auth mode={screen} go={go} onDone={enter} />;
  else {
    body = (
      <div
        className="shell"
        onMouseDown={(e) => onGestureStart(e.clientX, e.clientY, e.target)}
        onMouseUp={(e) => onGestureEnd(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          if (e.touches && e.touches[0]) onGestureStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }}
        onTouchEnd={(e) => {
          if (e.changedTouches && e.changedTouches[0]) onGestureEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        }}
      >
        <aside className="side">
          <Logo onClick={() => navigateTo("dashboard")} />
          {NAV.map((n) => (
            <button key={n.id} className={`nav ${tab === n.id ? "on" : ""}`} onClick={() => navigateTo(n.id)} aria-current={tab === n.id ? "page" : undefined}>
              <n.icon size={20} />{n.label}
            </button>
          ))}
          <div className="side-note">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>You're not alone</div>
            <div className="muted">Your emergency contacts are one tap away.</div>
          </div>
        </aside>
        <div className="main">
          <header className="top">
            <div className="ttl">{titles[tab]}</div>
            <Logo className="mlogo" onClick={() => navigateTo("dashboard")} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="sos" onClick={() => navigateTo("sos")}><LifeBuoy size={17} /> SOS</button>
              <div style={{ position: "relative" }}>
                <button
                  className="avatar"
                  onClick={() => setMenu(!menu)}
                  aria-label="User menu"
                  aria-expanded={menu}
                  style={{ overflow: "hidden", padding: 0 }}
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    getInitial(user.name)
                  )}
                </button>
                {menu && (
                  <div className="menu">
                    <button onClick={() => navigateTo("profile")}><User size={17} /> Profile</button>
                    <button onClick={logout}><LogOut size={17} /> Logout</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="page">
            <ErrorBoundary inline>
              {tab === "dashboard" && <Dashboard user={user} today={today} score={score} setTab={navigateTo} setWtab={setWtab} openSession={setSession} />}
              {tab === "wellness" && <Wellness key={String(today.done)} today={today} setToday={setToday} wtab={wtab} setWtab={setWtab} openSession={setSession} setTab={navigateTo} resultShown={resultShown} setResultShown={setResultShown} />}
              {tab === "ai" && (
                <>
                  <h1 className="h1">AI Companion</h1>
                  <p className="sub">A calm place to talk things through.</p>
                  <Chat ctx={{ level: levelOf(score), score: score, sleep: today.sleep, study: today.study, screen: today.screen, exam: today.exam }} />
                </>
              )}
              {tab === "history" && <History today={today} score={score} />}
              {tab === "sos" && <Sos contacts={contacts} setContacts={setContacts} autoNotify={autoNotify} setAutoNotify={setAutoNotify} toast={toast} />}
              {tab === "profile" && <Profile user={user} setUser={setUser} contacts={contacts} setTab={navigateTo} onLogout={logout} prefs={prefs} setPrefs={setPrefs} toast={toast} />}
            </ErrorBoundary>
          </main>
        </div>
        <nav className="bottom" aria-label="Main">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? "on" : ""} onClick={() => navigateTo(n.id)}>
              <n.icon size={21} />{n.short}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mm">
        <style>{CSS}</style>
        {body}
        {session && (
          <Session
            rec={session}
            onClose={() => setSession(null)}
            onDone={() => { setSession(null); toast("Nice work. Taking a moment for yourself matters."); }}
          />
        )}
        {toastMsg && <div className="toast" role="status"><Check size={16} /> {toastMsg}</div>}
      </div>
    </ErrorBoundary>
  );
}
