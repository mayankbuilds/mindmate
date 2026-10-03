import { api } from "./services/api";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Home, Leaf, MessageCircle, BarChart3, User, LifeBuoy, Bell, Moon, BookOpen,
  Smartphone, CalendarDays, Wind, Footprints, Send, Plus, Phone, Mail, Check,
  X, LogOut, ShieldCheck, Activity, Eye, EyeOff, ArrowRight, Trash2, Timer,
  Sparkles, ChevronDown, HeartHandshake,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ */
/* Logic                                                               */
/* ------------------------------------------------------------------ */

const MOODS = [
  { id: "great", emoji: "😊", label: "Great", pts: 0 },
  { id: "good", emoji: "🙂", label: "Good", pts: 5 },
  { id: "okay", emoji: "😐", label: "Okay", pts: 12 },
  { id: "stressed", emoji: "😟", label: "Stressed", pts: 24 },
  { id: "overwhelmed", emoji: "😔", label: "Overwhelmed", pts: 34 },
];

const levelOf = (s) => (s < 35 ? "Low" : s < 65 ? "Moderate" : "High");
const LEVEL_COLOR = { Low: "#3F9E84", Moderate: "#5B6FE8", High: "#D9737D" };
const LEVEL_SOFT = { Low: "#E2F5EE", Moderate: "#E8EDFF", High: "#FDEBEC" };

function computeStress(item = {}) {
  const sleep = Number(item.sleep ?? 7);
  const study = Number(item.study ?? 5);
  const screen = Number(item.screen ?? 5);
  const exam = Number(item.exam ?? 14);
  const mood = item.mood || 'okay';
  const note = item.note || '';

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
  { id: "sleep", icon: Moon, title: "Improve your sleep routine", blurb: "Wind down with dim lights and no scrolling for the last half hour.", mins: 15, secs: 900, tint: "blue" },
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

function fallbackReply(text) {
  const t = text.toLowerCase();
  if (t.includes("breath"))
    return "Let's try this together. Breathe in through your nose for 4 counts, hold for 4, then breathe out slowly for 6. Repeat that four times, and let your shoulders drop as you exhale. How do you feel afterwards?";
  if (t.includes("sleep"))
    return "Poor sleep makes everything feel heavier. Tonight, try dimming the lights and putting your phone away 30 minutes before bed. Do you usually get stuck falling asleep, or waking up in the night?";
  if (t.includes("study") || t.includes("overwhelm"))
    return "That's a lot to carry. Pick just one small thing to start with, set a timer for 25 minutes, and leave the rest for later. What's the one topic that feels most urgent?";
  if (t.includes("stress"))
    return "I'm glad you told me. Stress builds up quietly, and naming it is a good first step. Want to unpack what's weighing on you most, or would a quick breathing exercise help first?";
  return "Thanks for sharing that with me. I'm here and listening. Tell me a little more about what's on your mind, and we'll take it one step at a time.";
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
.top{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:14px 32px;background:rgba(244,246,255,.88);backdrop-filter:blur(12px)}
.top .ttl{font-weight:700;font-size:15px;color:var(--mute)}
.top .mlogo{display:none}
.page{width:100%;max-width:1120px;margin:0 auto;padding:8px 32px 56px}
.bottom{display:none}
.sos{display:inline-flex;align-items:center;gap:8px;border:1.5px solid #F3C4C8;background:#FFF3F4;color:#B24853;font-weight:700;font-size:14px;padding:8px 14px;border-radius:999px;transition:background .15s}
.sos:hover{background:#FFE8EA}
.avatar{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#5B8DEF,#9B8CF0);color:#fff;font-weight:700;display:grid;place-items:center;border:0;font-size:15px}
.menu{position:absolute;right:0;top:calc(100% + 8px);background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh);padding:6px;min-width:180px}
.menu button{display:flex;gap:10px;align-items:center;width:100%;border:0;background:none;padding:10px 12px;border-radius:10px;font-size:14px;font-weight:600;color:var(--ink)}
.menu button:hover{background:#F3F6FF}

/* page bits */
.h1{font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.15}
.sub{color:var(--mute);margin-top:6px}
.grid-d{display:grid;grid-template-columns:1.7fr 1fr;gap:20px;margin-top:24px}
.stack{display:flex;flex-direction:column;gap:20px}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
.metric{border-radius:16px;padding:16px;background:#F6F8FF}
.metric b{display:block;font-size:24px;font-weight:800;letter-spacing:-.02em;margin-top:10px}
.metric span{font-size:13px;color:var(--mute);font-weight:500}
.moodrow{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:var(--lav2);margin-bottom:20px}
.moodrow .em{font-size:28px}
.ring-wrap{display:grid;place-items:center;position:relative;margin:8px auto 0}
.ring-c{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.states{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0 14px}
.state{text-align:center;padding:8px 4px;border-radius:12px;font-size:13px;font-weight:600;background:#F4F6FF;color:var(--mute);transition:all .3s}
.recgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin-top:20px}
.rec{display:flex;flex-direction:column;gap:14px}
.rec p{color:var(--mute);font-size:14px;flex:1}
.seg{display:inline-flex;background:#E8ECFA;border-radius:14px;padding:4px;margin-top:20px}
.seg button{border:0;background:none;padding:9px 18px;border-radius:11px;font-weight:600;font-size:14px;color:var(--mute);transition:all .15s}
.seg button.on{background:#fff;color:var(--ink);box-shadow:0 2px 8px rgba(60,80,160,.12)}
.sect{margin-top:18px}
.sect h3{margin-bottom:4px}
.slider{margin-top:20px}
.slider .row b{font-size:20px;letter-spacing:-.01em}
.slider input{width:100%;accent-color:#5B6FE8;margin-top:10px;height:6px}
.moods{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}
.mood{border:1.5px solid var(--line);background:#fff;border-radius:16px;padding:12px 4px;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--mute);transition:all .15s}
.mood span{font-size:28px}
.mood:hover{border-color:#BBCBF6}
.mood.on{border-color:#6F86EA;background:#F0F3FF;color:var(--blue);transform:translateY(-2px)}
textarea.inp{resize:vertical;min-height:130px;line-height:1.5}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.contact{display:flex;gap:14px;align-items:flex-start}
.contact .info{flex:1;min-width:0;font-size:14px}
.contact .info div{display:flex;align-items:center;gap:8px;color:var(--mute);margin-top:4px;overflow-wrap:anywhere}
.iconb{border:0;background:none;color:#8D98B8;padding:6px;border-radius:8px}
.iconb:hover{background:#FDEBEC;color:#B24853}
.switch{position:relative;width:46px;height:26px;flex:none;border:0;border-radius:999px;background:#D5DBEE;transition:background .2s;padding:0}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s}
.switch.on{background:#5B6FE8}
.switch.on::after{transform:translateX(20px)}
.setrow{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--line)}
.setrow:last-child{border-bottom:0}
.calm{background:linear-gradient(160deg,#F1EDFF,#E6F0FF);border:0}

/* chat */
.chat{display:flex;flex-direction:column;height:calc(100dvh - 128px);min-height:480px;margin-top:20px;padding:0;overflow:hidden}
.chat-h{display:flex;align-items:center;gap:14px;padding:18px 24px;border-bottom:1px solid var(--line)}
.chat-b{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:14px;background:#FBFCFF}
.msg{max-width:min(78%,560px);padding:12px 16px;border-radius:20px;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}
.msg.ai{align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:6px}
.msg.me{align-self:flex-end;color:#fff;background:linear-gradient(135deg,#3F6FD8,#6C5CE0);border-bottom-right-radius:6px}
.dots{display:inline-flex;gap:5px;padding:4px 2px}
.dots i{width:7px;height:7px;border-radius:50%;background:#9AA7D0;animation:blink 1.2s infinite}
.dots i:nth-child(2){animation-delay:.2s}
.dots i:nth-child(3){animation-delay:.4s}
.chat-f{padding:14px 20px 12px;border-top:1px solid var(--line);background:#fff}
.prompts{display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;scrollbar-width:none}
.prompts button{flex:none;border:1px solid var(--line);background:#F7F9FF;color:var(--ink);border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;white-space:nowrap;transition:background .15s}
.prompts button:hover{background:var(--blue2)}
.send-row{display:flex;gap:10px}
.disc{font-size:12px;color:#7480A5;text-align:center;margin-top:10px}

/* modal / toast */
.ov{position:fixed;inset:0;z-index:100;background:rgba(30,42,71,.42);backdrop-filter:blur(3px);display:grid;place-items:center;padding:20px;animation:fade .2s}
.modal{width:100%;max-width:440px;background:#fff;border-radius:24px;padding:28px;box-shadow:0 30px 80px rgba(30,42,71,.3);animation:pop .25s;max-height:90vh;overflow:auto}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:120;background:var(--ink);color:#fff;padding:12px 20px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 12px 30px rgba(30,42,71,.3);display:flex;gap:8px;align-items:center;animation:pop .25s;max-width:90vw}
.breath{width:150px;height:150px;border-radius:50%;margin:24px auto;background:radial-gradient(circle at 35% 30%,#C9D9FF,#9B8CF0);animation:breathe 8s ease-in-out infinite;box-shadow:0 0 60px rgba(124,108,230,.35)}
.timer{font-size:44px;font-weight:800;letter-spacing:-.03em;text-align:center}

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
  .card{padding:20px}
  .moods{gap:6px}
  .mood{font-size:11px}
  .mood span{font-size:24px}
  .recgrid{grid-template-columns:1fr}
  .msg{max-width:88%}
}
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
          className={`inp ${error ? "err" : ok ? "ok" : ""}`} type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-invalid={!!error}
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
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const blur = (k) => () => setTouched((p) => ({ ...p, [k]: true }));

  const errs = {};
  if (signup && f.name.trim().length < 2) errs.name = "Please tell us your name so we can greet you.";
  if (!emailOk(f.email)) errs.email = "That email doesn't look right. Try something like name@college.edu.";
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
      <h1 className="h1">{greet}, {user.name} 👋</h1>
      <p className="sub">How are you feeling today?</p>
      <div className="grid-d">
        <div className="stack">
          <div className="card">
            <div className="row"><h3>Today's Wellness Check-In</h3>{today.done && <span className="chip" style={{ background: "var(--grn2)", color: "var(--grn)" }}><Check size={14} /> Done</span>}</div>
            <div className="metrics">
              {m.map((x) => (
                <div className="metric" key={x.l}>
                  <div className={`tile ${x.c}`} style={{ width: 36, height: 36, borderRadius: 11 }}><x.i size={18} /></div>
                  <b>{x.v}</b><span>{x.l}</span>
                </div>
              ))}
            </div>
            <div className="moodrow">
              <span className="em">{mood ? mood.emoji : "🙂"}</span>
              <div><div style={{ fontWeight: 700 }}>Feeling {mood ? mood.label.toLowerCase() : "okay"}</div><div className="muted" style={{ fontSize: 13 }}>Today's mood</div></div>
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
  const [d, setD] = useState({ sleep: today?.sleep ?? 7.0, study: today?.study ?? 5.0, screen: today?.screen ?? 5.0, exam: today?.exam ?? 14, mood: today?.mood || "okay", note: today?.note || "" });
  const set = (k) => (v) => setD((p) => ({ ...p, [k]: v }));
  const score = computeStress(d);
  const analyze = async () => {
  try {
    const saved = await api.checkin(d);
    setToday({ ...saved, done: true });
    setResultShown(true);
  } catch (err) {
    alert("Failed to submit check-in: " + err.message);
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
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}><div className="tile t-lav"><Moon size={20} /></div><div><h3>Your day</h3><div className="muted" style={{ fontSize: 14 }}>Rest, study and screens</div></div></div>
          <Slider label="How many hours did you sleep?" unit="hrs" value={d.sleep} min={0} max={12} step={0.5} onChange={set("sleep")} />
          <Slider label="How many hours did you study?" unit="hrs" value={d.study} min={0} max={14} step={0.5} onChange={set("study")} />
          <Slider label="How much screen time did you have?" unit="hrs" value={d.screen} min={0} max={16} step={0.5} onChange={set("screen")} />
        </div>
        <div className="card">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}><div className="tile t-blue"><CalendarDays size={20} /></div><div><h3>Your exam</h3><div className="muted" style={{ fontSize: 14 }}>Deadlines shape how we feel</div></div></div>
          <Slider label="How many days are left until your exam?" unit="days" value={d.exam} min={0} max={90} step={1} onChange={set("exam")} />
        </div>
      </div>
      <div className="card sect">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}><div className="tile t-green"><HeartHandshake size={20} /></div><div><h3>How are you feeling today?</h3><div className="muted" style={{ fontSize: 14 }}>Pick a mood (optional) and share as much as you like</div></div></div>
        <div className="moods" role="radiogroup" aria-label="Mood">
          {MOODS.map((m) => (
            <button key={m.id} className={`mood ${d.mood === m.id ? "on" : ""}`} role="radio" aria-checked={d.mood === m.id} onClick={() => set("mood")(d.mood === m.id ? null : m.id)}>
              <span>{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>
        <textarea className="inp" style={{ marginTop: 16 }} placeholder="Tell us what's on your mind..." value={d.note} onChange={(e) => set("note")(e.target.value)} aria-label="How are you feeling today?" />
      </div>
      <div style={{ marginTop: 20 }}>
        <button className="btn btn-p btn-lg" onClick={analyze}>Analyze My Wellness</button>
        <span className="muted" style={{ fontSize: 13, marginLeft: 14 }}>Preview: {levelOf(score)}</span>
      </div>
    </>
  );
}

const PROMPTS = ["🌿 I'm feeling stressed", "📚 I'm overwhelmed with studying", "😴 I haven't been sleeping well", "🧘 Give me a breathing exercise"];

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
    setMsgs((p) => [...p, { role: "assistant", content: fallbackReply(t) }]);
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
  return (
    <div className="card contact">
      <div className="avatar" style={{ width: 44, height: 44 }}>{c.name.charAt(0).toUpperCase()}</div>
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
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const errs = {};
  if (f.name.trim().length < 2) errs.name = "Add a name.";
  if (!emailOk(f.email)) errs.email = "Enter a valid email.";
  if (f.phone.replace(/\D/g, "").length < 7) errs.phone = "Enter a phone number.";
  const add = () => {
    setTouched(true);
    if (Object.keys(errs).length) return;
    setContacts((p) => [...p, { id: Date.now(), ...f, name: f.name.trim() }]);
    setF({ name: "", rel: RELS[0], email: "", phone: "" });
    setTouched(false);
    toast("Contact saved");
  };
  const chosen = contacts.filter((c) => picked[c.id] !== false);
  const send = () => {
    setConfirm(false);
    toast(`Alert sent to ${chosen.map((c) => c.name).join(", ")}`);
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
            <button className={`switch ${autoNotify ? "on" : ""}`} role="switch" aria-checked={autoNotify} aria-label="Notify contact if stress stays high" onClick={() => setAutoNotify(!autoNotify)} />
          </div>
        </div>
      </div>

      <h3 style={{ margin: "32px 0 14px", fontSize: 20 }}>Saved contacts</h3>
      {contacts.length === 0 ? (
        <div className="card muted">No contacts yet. Add someone below so you can reach them quickly.</div>
      ) : (
        <div className="recgrid" style={{ marginTop: 0 }}>
          {contacts.map((c) => <ContactCard key={c.id} c={c} onDelete={() => setContacts((p) => p.filter((x) => x.id !== c.id))} />)}
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
        <button className="btn btn-p" style={{ marginTop: 20 }} onClick={add}><Plus size={18} /> Save contact</button>
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
                {contacts.map((c) => (
                  <label key={c.id} className="chk" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 14, color: "var(--ink)" }}>
                    <input type="checkbox" checked={picked[c.id] !== false} onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked }))} />
                    <span><b>{c.name}</b> <span className="muted">· {c.rel}</span></span>
                  </label>
                ))}
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

function Profile({ user, setUser, contacts, setTab, onLogout, prefs, setPrefs }) {
  const items = [
    { k: "daily", t: "Daily check-in reminder", d: "A gentle nudge each evening" },
    { k: "tips", t: "Wellness tips", d: "Occasional suggestions based on your week" },
    { k: "alerts", t: "Stress alerts", d: "Heads-up when your stress trends high" },
  ];
  return (
    <>
      <h1 className="h1">Profile</h1>
      <div className="card sect" style={{ marginTop: 24, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div className="avatar" style={{ width: 72, height: 72, fontSize: 28 }}>{user.name.charAt(0)}</div>
        <div><h3 style={{ fontSize: 22 }}>{user.name}</h3><p className="muted">{user.email}</p></div>
      </div>
      <div className="two sect" style={{ alignItems: "start" }}>
        <div className="card">
          <h3>Your details</h3>
          <Field label="Name" value={user.name} onChange={(v) => setUser({ ...user, name: v })} />
          <Field label="Email" type="email" value={user.email} onChange={(v) => setUser({ ...user, email: v })} />
          <Field label="College" value={user.college} onChange={(v) => setUser({ ...user, college: v })} />
        </div>
        <div className="card">
          <h3>Notification preferences</h3>
          <div style={{ marginTop: 8 }}>
            {items.map((i) => (
              <div className="setrow" key={i.k}>
                <div><div style={{ fontWeight: 600 }}>{i.t}</div><div className="muted" style={{ fontSize: 13 }}>{i.d}</div></div>
                <button className={`switch ${prefs[i.k] ? "on" : ""}`} role="switch" aria-checked={prefs[i.k]} aria-label={i.t} onClick={() => setPrefs({ ...prefs, [i.k]: !prefs[i.k] })} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card sect">
        <div className="row"><h3>Emergency contacts</h3><button className="btn btn-g btn-sm" onClick={() => setTab("sos")}>Manage</button></div>
        <div className="recgrid" style={{ marginTop: 16 }}>
          {contacts.length ? contacts.map((c) => <ContactCard key={c.id} c={c} />) : <p className="muted">No contacts saved yet.</p>}
        </div>
      </div>
      <button className="btn btn-s" style={{ marginTop: 24 }} onClick={onLogout}><LogOut size={18} /> Logout</button>
    </>
  );
}

function Session({ rec, onClose, onDone }) {
  const [left, setLeft] = useState(rec.secs);
  const [phase, setPhase] = useState("Breathe in");
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (rec.id !== "breath") return;
    const t = setInterval(() => setPhase((p) => (p === "Breathe in" ? "Breathe out" : "Breathe in")), 4000);
    return () => clearInterval(t);
  }, [rec.id]);
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
      <div className="row"><h3 style={{ fontSize: 20 }}>{rec.title}</h3><button className="iconb" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      {rec.id === "breath" ? (
        <>
          <div className="breath" aria-hidden="true" />
          <p style={{ textAlign: "center", fontWeight: 700, fontSize: 18 }}>{phase}</p>
        </>
      ) : (
        <p className="muted" style={{ margin: "16px 0 20px" }}>{tips[rec.id]}</p>
      )}
      <div className="timer" style={{ margin: "12px 0 22px" }}>{mm}:{ss}</div>
      <button className="btn btn-p" style={{ width: "100%" }} onClick={onDone}>{left === 0 ? "Finish" : "End session"}</button>
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
  const [user, setUser] = useState({ name: "Aadi", email: "aadi@northfield.edu", college: "Northfield University" });
  const [today, setToday] = useState({ sleep: 7.2, study: 6, screen: 5.5, exam: 18, mood: "okay", note: "", done: false });
  const [contacts, setContacts] = useState([
    { id: 1, name: "Meera Sharma", rel: "Parent/Guardian", email: "meera@example.com", phone: "+1 555 010 2211" },
    { id: 2, name: "Dr. Kiran Rao", rel: "College Counselor", email: "counseling@northfield.edu", phone: "+1 555 010 7788" },
  ]);
  const [autoNotify, setAutoNotify] = useState(true);
  const [prefs, setPrefs] = useState({ daily: true, tips: true, alerts: true });

  const score = useMemo(() => computeStress(today), [today]);
  const toast = (m) => setToastMsg(m);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab, screen, wtab]);

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
        if (contactList && Array.isArray(contactList) && contactList.length > 0) {
          setContacts(contactList);
        }
        setScreen("app");
      })
      .catch((err) => {
        console.warn("Session verification:", err);
      });
  }, []);

  const go = (s) => setScreen(s);
  const enter = (u) => { setUser((p) => ({ ...p, ...u })); setScreen("app"); setTab("dashboard"); };
  const logout = () => { setMenu(false); setScreen("landing"); };
  const to = (t) => { setTab(t); setMenu(false); if (t === "wellness") setWtab("checkin"); };

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
      <div className="shell">
        <aside className="side">
          <Logo onClick={() => to("dashboard")} />
          {NAV.map((n) => (
            <button key={n.id} className={`nav ${tab === n.id ? "on" : ""}`} onClick={() => to(n.id)} aria-current={tab === n.id ? "page" : undefined}>
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
            <Logo className="mlogo" onClick={() => to("dashboard")} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="sos" onClick={() => to("sos")}><LifeBuoy size={17} /> SOS</button>
              <div style={{ position: "relative" }}>
                <button className="avatar" onClick={() => setMenu(!menu)} aria-label="User menu" aria-expanded={menu}>{user.name.charAt(0)}</button>
                {menu && (
                  <div className="menu">
                    <button onClick={() => to("profile")}><User size={17} /> Profile</button>
                    <button onClick={logout}><LogOut size={17} /> Logout</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="page">
            {tab === "dashboard" && <Dashboard user={user} today={today} score={score} setTab={setTab} setWtab={setWtab} openSession={setSession} />}
            {tab === "wellness" && <Wellness key={String(today.done)} today={today} setToday={setToday} wtab={wtab} setWtab={setWtab} openSession={setSession} setTab={setTab} resultShown={resultShown} setResultShown={setResultShown} />}
            {tab === "ai" && (
              <>
                <h1 className="h1">AI Companion</h1>
                <p className="sub">A calm place to talk things through.</p>
                <Chat ctx={{ level: levelOf(score), sleep: today.sleep, study: today.study, screen: today.screen, exam: today.exam }} />
              </>
            )}
            {tab === "history" && <History today={today} score={score} />}
            {tab === "sos" && <Sos contacts={contacts} setContacts={setContacts} autoNotify={autoNotify} setAutoNotify={setAutoNotify} toast={toast} />}
            {tab === "profile" && <Profile user={user} setUser={setUser} contacts={contacts} setTab={to} onLogout={logout} prefs={prefs} setPrefs={setPrefs} />}
          </main>
        </div>
        <nav className="bottom" aria-label="Main">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? "on" : ""} onClick={() => to(n.id)}>
              <n.icon size={21} />{n.short}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
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
  );
}
