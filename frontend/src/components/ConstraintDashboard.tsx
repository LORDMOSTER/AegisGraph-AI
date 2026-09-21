import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export const GRAPH_SECTIONS = [
  "Emergency Protocol",
  "Routine Check",
  "Maintenance",
  "High-Voltage Systems",
  "Hazardous Materials"
] as const;

export const ROLE_PRESETS: Record<string, Record<string, number>> = {
  "Custom (Manual Setup)": {},
  "Mechanical Operator": {
    "Routine Check": 2,
    "Maintenance": 3,
    "Emergency Protocol": 1,
  },
  "Electrical Operator": {
    "High-Voltage Systems": 3,
    "Routine Check": 1,
    "Emergency Protocol": 2,
  },
  "Hazardous Materials Handler": {
    "Hazardous Materials": 4,
    "Emergency Protocol": 2,
  },
  "General Safety Officer": {
    "Emergency Protocol": 2,
    "Routine Check": 2,
    "Maintenance": 1,
    "Hazardous Materials": 1,
  },
};

export interface DifficultyProfile {
  high_risk_ratio: number;
  routine_ratio: number;
}

interface Props {
  constraints: Record<string, number>;
  difficultyProfile: DifficultyProfile;
  onConstraintChange: (section: string, value: number) => void;
  onDifficultyChange: (profile: DifficultyProfile) => void;
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: -dir * 40, opacity: 0 }),
};

export function ConstraintDashboard({
  constraints,
  difficultyProfile,
  onConstraintChange,
  onDifficultyChange,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState(1);
  const [selectedRole, setSelectedRole] = useState<string>("Custom (Manual Setup)");

  const totalQuestions = Object.values(constraints).reduce((a, b) => a + b, 0);

  const goTo = (s: 1 | 2) => {
    setDirection(s > step ? 1 : -1);
    setStep(s);
  };

  const riskColor = (count: number) => {
    if (count >= 4) return "var(--red)";
    if (count >= 2) return "var(--amber)";
    return "var(--emerald)";
  };

  return (
    <div className="card" style={{ padding: 24, height: "100%" }}>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {([1, 2] as const).map((s) => (
          <React.Fragment key={s}>
            <button
              onClick={() => goTo(s)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                background: step === s ? "var(--cyan)" : "var(--void-4)",
                color: step === s ? "var(--void)" : "var(--text-tertiary)",
                transition: "all 200ms ease",
              }}
            >
              {s}
            </button>
            {s === 1 && (
              <div style={{ flex: 1, height: 1, background: step >= 2 ? "var(--cyan)" : "var(--border)" }} />
            )}
          </React.Fragment>
        ))}
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 4 }}>
          {step === 1 ? "Question Distribution" : "Difficulty Profile"}
        </span>
      </div>

      {/* Animated step content */}
      <div style={{ overflow: "hidden", position: "relative", minHeight: 260 }}>
        <AnimatePresence custom={direction} mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25 }}
            >
              <p className="eyebrow" style={{ marginBottom: 16 }}>Graph Sections → Question Count</p>
              
              {/* Role Selector */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  Role Template
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => {
                    const role = e.target.value;
                    setSelectedRole(role);
                    if (role !== "Custom (Manual Setup)") {
                      const preset = ROLE_PRESETS[role];
                      GRAPH_SECTIONS.forEach((sec) => {
                        onConstraintChange(sec, preset[sec] || 0);
                      });
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    fontSize: 14,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {Object.keys(ROLE_PRESETS).map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {GRAPH_SECTIONS.map((section) => {
                  const count = constraints[section] ?? 0;
                  return (
                    <div key={section}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{section}</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: riskColor(count), minWidth: 20, textAlign: "right" }}>
                          {count}
                        </span>
                      </div>
                      <input
                        id={`slider-${section.toLowerCase().replace(/\s+/g, "-")}`}
                        type="range"
                        min={0}
                        max={5}
                        step={1}
                        value={count}
                        onChange={(e) => {
                          setSelectedRole("Custom (Manual Setup)");
                          onConstraintChange(section, Number(e.target.value));
                        }}
                        aria-label={`Questions from ${section}`}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                        {[0,1,2,3,4,5].map((n) => (
                          <span key={n} style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{n}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 20, padding: "12px 16px", background: "var(--void-3)", borderRadius: "var(--radius)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Total questions</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: totalQuestions > 0 ? "var(--cyan)" : "var(--text-tertiary)" }}>
                  {totalQuestions}
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25 }}
            >
              <p className="eyebrow" style={{ marginBottom: 16 }}>Assessment Difficulty Composition</p>

              {[
                { key: "high_risk_ratio" as const, label: "High-Risk Weight", color: "var(--red)", desc: "Prioritises rules with risk score ≥ 7" },
                { key: "routine_ratio" as const, label: "Routine Weight", color: "var(--emerald)", desc: "Fills remaining slots with lower-risk rules" },
              ].map(({ key, label, color, desc }) => {
                const pct = Math.round(difficultyProfile[key] * 100);
                return (
                  <div key={key} style={{ marginBottom: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{desc}</p>
                      </div>
                      <span style={{ fontSize: 18, fontWeight: 700, color }}>{pct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={pct}
                      onChange={(e) =>
                        onDifficultyChange({ ...difficultyProfile, [key]: Number(e.target.value) / 100 })
                      }
                    />
                  </div>
                );
              })}

              <div className="card" style={{ background: "var(--void-3)", border: "none" }}>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                  These weights guide the DCWGT engine's node selection priority. They do not override
                  categorical constraints — they influence ordering within sections.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <button className="btn btn-ghost" onClick={() => goTo(1)} disabled={step === 1} style={{ fontSize: 12 }}>
          ← Back
        </button>
        <button className="btn btn-cyan" onClick={() => goTo(2)} disabled={step === 2} style={{ fontSize: 12 }}>
          Next →
        </button>
      </div>
    </div>
  );
}
