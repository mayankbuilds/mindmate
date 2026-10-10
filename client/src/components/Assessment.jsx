import React, { useState } from "react";
import { api } from "../services/api";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Info,
  RotateCcw,
} from "lucide-react";

const QUESTIONNAIRE_ITEMS = [
  {
    key: "nervousness",
    label: "Feeling nervous, anxious, or on edge",
    category: "Nervousness",
  },
  {
    key: "unable_to_control",
    label: "Not being able to stop or control worrying",
    category: "Loss of Control",
  },
  {
    key: "worry",
    label: "Worrying too much about different things",
    category: "Excessive Worry",
  },
  {
    key: "trouble_relaxation",
    label: "Trouble relaxing or unwinding",
    category: "Trouble in Relaxation",
  },
  {
    key: "restlessness",
    label: "Being so restless that it is hard to sit still",
    category: "Restlessness",
  },
  {
    key: "irritability",
    label: "Becoming easily annoyed or irritable",
    category: "Irritability",
  },
  {
    key: "fear",
    label: "Feeling afraid, as if something awful might happen",
    category: "Anticipatory Fear",
  },
];

const RATING_OPTIONS = [
  { val: 0, label: "No (0)", desc: "Not at all" },
  { val: 1, label: "Mild (1)", desc: "Several days" },
  { val: 2, label: "Moderate (2)", desc: "More than half the days" },
  { val: 3, label: "Severe (3)", desc: "Nearly every day" },
];

const CLASS_PALETTE = {
  No: { color: "#3F9E84", bg: "#E2F5EE", label: "No / Minimal Stress" },
  Mild: { color: "#5B8DEF", bg: "#E8EDFF", label: "Mild Stress" },
  Moderate: { color: "#7C6CE6", bg: "#EFEBFF", label: "Moderate Stress" },
  Severe: { color: "#D9737D", bg: "#FDEBEC", label: "Severe Stress" },
};

export default function Assessment({ onComplete, onViewHistory, onTalkToAi }) {
  const [answers, setAnswers] = useState({
    nervousness: null,
    unable_to_control: null,
    worry: null,
    trouble_relaxation: null,
    restlessness: null,
    irritability: null,
    fear: null,
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isServiceUnavailable, setIsServiceUnavailable] = useState(false);
  const [result, setResult] = useState(null);
  const [validationAttempted, setValidationAttempted] = useState(false);

  const answeredCount = Object.values(answers).filter((v) => v !== null).length;
  const totalCount = QUESTIONNAIRE_ITEMS.length;

  const handleSelect = (key, val) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
    if (errorMsg) setErrorMsg(null);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setValidationAttempted(true);

    const missing = QUESTIONNAIRE_ITEMS.filter((item) => answers[item.key] === null);
    if (missing.length > 0) {
      setErrorMsg(`Please answer all questions before submitting (${missing.length} unanswered).`);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setIsServiceUnavailable(false);

    try {
      const payload = {
        nervousness: Number(answers.nervousness),
        unable_to_control: Number(answers.unable_to_control),
        worry: Number(answers.worry),
        trouble_relaxation: Number(answers.trouble_relaxation),
        restlessness: Number(answers.restlessness),
        irritability: Number(answers.irritability),
        fear: Number(answers.fear),
      };

      const res = await api.predictAssessment(payload);
      setResult(res);
      if (onComplete) onComplete(res);
    } catch (err) {
      if (err.status === 503 || (err.message && err.message.toLowerCase().includes("unavailable"))) {
        setIsServiceUnavailable(true);
        setErrorMsg("The ML inference service is currently offline or unavailable. Please try again in a moment.");
      } else {
        setErrorMsg(err.message || "Failed to process assessment. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAnswers({
      nervousness: null,
      unable_to_control: null,
      worry: null,
      trouble_relaxation: null,
      restlessness: null,
      irritability: null,
      fear: null,
    });
    setResult(null);
    setErrorMsg(null);
    setIsServiceUnavailable(false);
    setValidationAttempted(false);
  };

  // -----------------------------------------------------------------
  // Result Display View
  // -----------------------------------------------------------------
  if (result) {
    const predictedClass = result.predicted_class || "Moderate";
    const palette = CLASS_PALETTE[predictedClass] || CLASS_PALETTE.Moderate;
    const probs = result.probabilities || {};

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 className="h1">Assessment Result</h1>
          <p className="sub">Real machine learning pattern evaluation from your questionnaire responses.</p>
        </div>

        {/* Prediction Hero Card */}
        <div className="card" style={{ borderLeft: `6px solid ${palette.color}` }}>
          <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
            <span className="chip" style={{ background: palette.bg, color: palette.color, fontWeight: 700 }}>
              <Cpu size={14} /> Model Prediction: {predictedClass}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              Model: {result.model_version || "RandomForest_MultiTier_v1"}
            </span>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: palette.color, letterSpacing: "-.02em" }}>
              {palette.label}
            </div>
            <p className="muted" style={{ fontSize: 15, marginTop: 6 }}>
              The multi-tier Random Forest pipeline classified your response pattern into the{" "}
              <strong>{predictedClass}</strong> stress tier.
            </p>
          </div>

          {/* Genuine Model Confidence Probabilities */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Model Class Probabilities</span>
              <span className="muted" style={{ fontSize: 12 }}>Total: 100%</span>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {["No", "Mild", "Moderate", "Severe"].map((cls) => {
                const p = probs[cls] != null ? probs[cls] : 0;
                const pct = Math.round(p * 100);
                const clsPal = CLASS_PALETTE[cls] || CLASS_PALETTE.Moderate;
                const isWinner = cls === predictedClass;

                return (
                  <div key={cls}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                      <span style={{ fontWeight: isWinner ? 700 : 500, color: isWinner ? "var(--ink)" : "var(--mute)" }}>
                        {clsPal.label} {isWinner && "✓"}
                      </span>
                      <span style={{ fontWeight: 700, color: clsPal.color }}>{pct}%</span>
                    </div>
                    <div style={{ width: "100%", height: 8, background: "#EEF1FA", borderRadius: 999, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: clsPal.color,
                          borderRadius: 999,
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Educational Disclaimer */}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: 14,
              borderRadius: 14,
              background: "#F8FAFF",
              border: "1px solid var(--line)",
              marginTop: 22,
            }}
          >
            <Info size={18} color="var(--blue)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, color: "var(--mute)", lineHeight: 1.5 }}>
              <strong>Notice:</strong> {result.disclaimer || "This assessment is for educational reflection and wellness tracking only. It is not a clinical or medical diagnosis."}
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <button className="btn btn-p" onClick={handleReset}>
              <RotateCcw size={16} /> Take Another Assessment
            </button>
            {onViewHistory && (
              <button className="btn btn-s" onClick={onViewHistory}>
                View in History <ArrowRight size={16} />
              </button>
            )}
            {onTalkToAi && (
              <button className="btn btn-g" onClick={onTalkToAi}>
                Discuss with AI Companion
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------
  // Assessment Questionnaire Form View
  // -----------------------------------------------------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="h1">ML Stress Assessment</h1>
          <span className="chip" style={{ background: "var(--lav2)", color: "var(--lav)" }}>
            <Cpu size={14} /> Random Forest Model
          </span>
        </div>
        <p className="sub">
          Complete the seven survey indicators below. Your responses are evaluated directly by the trained machine learning pipeline.
        </p>
      </div>

      {/* Progress & Disclaimer Header */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
            <Activity size={18} color="var(--blue)" />
            <span>Progress: {answeredCount} of {totalCount} answered</span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Scale: 0 (No) to 3 (Severe)
          </span>
        </div>
        <div style={{ width: "100%", height: 6, background: "#EEF1FA", borderRadius: 999, marginTop: 12, overflow: "hidden" }}>
          <div
            style={{
              width: `${(answeredCount / totalCount) * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg, #3F6FD8, #7C6CE6)",
              borderRadius: 999,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Error / Service Unavailable Notice */}
      {errorMsg && (
        <div
          className="card"
          style={{
            background: isServiceUnavailable ? "#FFF3F4" : "#FFF9F9",
            borderColor: isServiceUnavailable ? "#F3C4C8" : "#E39AA0",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <AlertCircle size={20} color="#B24853" />
            <div style={{ flex: 1, fontSize: 14, color: "#B24853", fontWeight: 600 }}>
              {errorMsg}
            </div>
            {isServiceUnavailable && (
              <button className="btn btn-s btn-sm" onClick={handleSubmit} disabled={loading}>
                <RefreshCw size={14} /> Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* 7 Questions Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {QUESTIONNAIRE_ITEMS.map((item, idx) => {
          const val = answers[item.key];
          const isMissing = validationAttempted && val === null;

          return (
            <div
              key={item.key}
              className="card"
              style={{
                borderColor: isMissing ? "#E39AA0" : undefined,
                background: isMissing ? "#FFFDFD" : undefined,
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Question {idx + 1} • {item.category}
                  </span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                    {item.label}
                  </div>
                </div>
                {val !== null && <CheckCircle2 size={18} color="var(--grn)" style={{ flexShrink: 0 }} />}
              </div>

              {/* Accessible Radio Options */}
              <div
                role="radiogroup"
                aria-label={item.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 10,
                  marginTop: 16,
                }}
              >
                {RATING_OPTIONS.map((opt) => {
                  const isChecked = val === opt.val;
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      role="radio"
                      aria-checked={isChecked}
                      onClick={() => handleSelect(item.key, opt.val)}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: isChecked ? "2px solid #5B6FE8" : "1.5px solid var(--line)",
                        background: isChecked ? "#F0F3FF" : "#fff",
                        color: isChecked ? "var(--blue)" : "var(--ink)",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{opt.label}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>

              {isMissing && (
                <div style={{ fontSize: 12, color: "#B24853", fontWeight: 600, marginTop: 8 }}>
                  * This field is required
                </div>
              )}
            </div>
          );
        })}

        {/* Submit & Reset Bar */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <button
            type="submit"
            className="btn btn-p btn-lg"
            disabled={loading}
            style={{ minWidth: 220 }}
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="float" /> Processing ML Model...
              </>
            ) : (
              <>
                <Cpu size={16} /> Submit & Predict Stress Class
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn-s"
            onClick={handleReset}
            disabled={loading}
          >
            Clear Responses
          </button>
        </div>
      </form>
    </div>
  );
}
