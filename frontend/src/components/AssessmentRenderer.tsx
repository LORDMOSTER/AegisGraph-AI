import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { RuleRecord } from "../api";

interface Props {
  rules: RuleRecord[];
  assessment: string;
  queryMs: number;
  inferenceMs: number;
}

function riskColor(score: number): string {
  if (score >= 8) return "var(--red)";
  if (score >= 5) return "var(--amber)";
  return "var(--emerald)";
}

function cogBadgeClass(level: string): string {
  const map: Record<string, string> = {
    Remember: "badge-cyan",
    Understand: "badge-cyan",
    Apply: "badge-emerald",
    Analyze: "badge-amber",
    Evaluate: "badge-amber",
    Create: "badge-violet",
  };
  return map[level] ?? "badge-cyan";
}

const ruleContainer = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
};
const ruleItem = {
  hidden: { opacity: 0, x: -20 },
  show:   { opacity: 1, x: 0,  transition: { duration: 0.25 } },
};

export function AssessmentRenderer({ rules, assessment, queryMs, inferenceMs }: Props) {
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false);

  // Split assessment into main body and answer key section
  const answerKeyMatch = assessment.match(/answer\s*key/i);
  const splitIndex = answerKeyMatch ? assessment.search(/answer\s*key/i) : -1;
  const mainBody = splitIndex > 0 ? assessment.slice(0, splitIndex) : assessment;
  const answerKey = splitIndex > 0 ? assessment.slice(splitIndex) : null;

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <p className="eyebrow">DCWGT Output</p>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
            Secure Assessment Matrix
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge badge-emerald">
            <span className="pulse-dot pulse-dot-emerald" />
            VERIFIED · {rules.length} RULES
          </span>
          <span className="badge badge-cyan">
            Graph: {queryMs.toFixed(0)} ms
          </span>
          <span className="badge badge-violet">
            LLM: {(inferenceMs / 1000).toFixed(1)} s
          </span>
        </div>
      </div>

      {/* Split panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 1, background: "var(--border)" }}>

        {/* ── Left: Graph Rules ── */}
        <div style={{ background: "var(--void-2)", padding: 20, overflowY: "auto", maxHeight: 680 }}>
          <p className="eyebrow" style={{ marginBottom: 14 }}>Verified Graph Rules</p>

          <motion.div
            variants={ruleContainer}
            initial="hidden"
            animate="show"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            {rules.map((rule) => (
              <motion.div key={rule.id} variants={ruleItem}>
                <div
                  className="card"
                  style={{
                    padding: 14,
                    borderLeft: `3px solid ${riskColor(rule.risk_score)}`,
                    background: "var(--void-3)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span
                      className="mono"
                      style={{ fontSize: 11, fontWeight: 600, color: riskColor(rule.risk_score) }}
                    >
                      {rule.id}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <span className={`badge ${cogBadgeClass(rule.cognitive_level)}`} style={{ fontSize: 9 }}>
                        {rule.cognitive_level}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: riskColor(rule.risk_score),
                          background: `${riskColor(rule.risk_score)}18`,
                          padding: "2px 6px",
                          borderRadius: 2,
                        }}
                      >
                        ⚠ {rule.risk_score}/10
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {rule.text}
                  </p>

                  <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {rule.sub_category}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      ⏱ ~{rule.estimated_response_time}s
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      rev {rule.revision_version}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* ── Right: AI Assessment ── */}
        <div style={{ background: "var(--void-1)", padding: 24, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p className="eyebrow">AI-Generated Exam</p>
            <span
              className="badge badge-amber"
              style={{ fontSize: 9 }}
            >
              OFFLINE · LLAMA-3 · LOCAL CPU
            </span>
          </div>

          <div className="divider" style={{ marginTop: 0, marginBottom: 16 }} />

          {/* Main assessment body */}
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 460 }}>
            <div className="assessment-markdown">
              <ReactMarkdown>{mainBody}</ReactMarkdown>
            </div>
          </div>

          {/* Answer Key drawer */}
          {answerKey && (
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-ghost"
                style={{ width: "100%", justifyContent: "space-between" }}
                onClick={() => setAnswerKeyOpen((v) => !v)}
              >
                <span>🔑 Answer Key</span>
                <motion.span
                  animate={{ rotate: answerKeyOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  ▾
                </motion.span>
              </button>

              <AnimatePresence>
                {answerKeyOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        marginTop: 8,
                        background: "var(--emerald-dim)",
                        border: "1px solid var(--emerald)",
                        borderRadius: "var(--radius)",
                        padding: 16,
                      }}
                    >
                      <div className="assessment-markdown">
                        <ReactMarkdown>{answerKey}</ReactMarkdown>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
