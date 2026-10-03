import React from 'react';
import { Cpu } from 'lucide-react';

const LEVEL_COLOR = { Low: '#3F9E84', Moderate: '#5B6FE8', High: '#D9737D' };
const LEVEL_SOFT = { Low: '#E2F5EE', Moderate: '#E8EDFF', High: '#FDEBEC' };
const LEVEL_COPY = {
  Low: "Your recent activity looks balanced. Keep doing what's working, and protect your sleep.",
  Moderate: "Your recent activity suggests moderate stress. A short break and breathing exercise may help.",
  High: "Things look heavy right now. Slow down, take a proper break, and consider talking to someone you trust.",
};

export function StressRing({ score, size = 180 }) {
  const r = (size - 24) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score)) / 100;
  const off = c * (1 - pct);
  const level = score < 35 ? 'Low' : score < 65 ? 'Moderate' : 'High';
  const color = LEVEL_COLOR[level];
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#EEF2FA" strokeWidth="14" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="14" fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .8s ease, stroke .4s ease' }}
        />
      </svg>
      <div className="ring-c">
        <div style={{ fontSize: 13, color: 'var(--mute)', fontWeight: 600 }}>Stress level</div>
        <div style={{ fontSize: size > 160 ? 30 : 24, fontWeight: 800, letterSpacing: '-.02em', color }}>{level}</div>
        <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 2 }}>{score}/100</div>
      </div>
    </div>
  );
}

export default function StressCard({ score, mlPrediction, riskBreakdown, compact }) {
  const level = score < 35 ? 'Low' : score < 65 ? 'Moderate' : 'High';
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ textAlign: 'left' }}>Stress Assessment</h3>
        <span className="ml-badge"><Cpu size={13} /> ML Powered</span>
      </div>
      <StressRing score={score} size={compact ? 170 : 190} />
      <div className="states">
        {['Low', 'Moderate', 'High'].map((s) => (
          <div key={s} className="state" style={level === s ? { background: LEVEL_SOFT[s], color: LEVEL_COLOR[s] } : null}>{s}</div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 14, textAlign: 'left', marginBottom: 12 }}>{LEVEL_COPY[level]}</p>
      {mlPrediction && (
        <div className="ml-card" style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2B478B' }}>ML Predicted State</span>
            <span className="chip" style={{ fontSize: 12, padding: '2px 8px' }}>
              {Math.round((mlPrediction.confidence_score || 0.85) * 100)}% Confidence
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: 'var(--ink)' }}>
            {mlPrediction.predicted_class}
          </div>
          {mlPrediction.top_contributor && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Primary Driver: <b>{mlPrediction.top_contributor}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
