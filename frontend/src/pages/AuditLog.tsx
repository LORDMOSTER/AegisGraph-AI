import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- STYLING CONSTANTS (Void-Industrial) ---
const COLORS = {
  void: "#07070e",
  devilViolet: "#8a2be2",
  neonAccent: "#00ffcc",
  amber: "#ffb000",
  glassBg: "rgba(255, 255, 255, 0.03)",
  glassBorder: "rgba(255, 255, 255, 0.1)",
  clayShadow: "inset 2px 2px 5px rgba(0, 0, 0, 0.8), inset -2px -2px 5px rgba(255, 255, 255, 0.04)",
  clayBg: "#0c0c14",
  textPrimary: "#f3f3f3",
  textSecondary: "#888899",
  danger: "#ff3366",
};

// Flat 0px border radii for general containers
const RADIUS_FLAT = "0px";
const FONT_MONO = "'JetBrains Mono', monospace";
const FONT_SANS = "'IBM Plex Sans', sans-serif";

// --- MOCK DATA ---
const MOCK_ATTEMPTS = [
  {
    id: "att-101",
    employeeName: "John Doe",
    jobTitle: "CNC Machine Operator",
    assessmentName: "Safety Protocol Beta",
    sciScore: 92.5,
    integrityScore: 98.2, // head-pose proctoring
    completedAt: "2026-09-25T14:30:00Z",
    questions: [
      { id: "q1", text: "What is the primary LOTO procedure?", correct: true },
      { id: "q2", text: "Identify the hazardous material label.", correct: true },
      { id: "q3", text: "Emergency shutoff protocol order.", correct: false },
    ],
  },
  {
    id: "att-102",
    employeeName: "Jane Smith",
    jobTitle: "Forklift Operator",
    assessmentName: "Vehicle Operations Q3",
    sciScore: 88.0,
    integrityScore: 75.4, // flagged
    completedAt: "2026-09-24T09:15:00Z",
    questions: [
      { id: "q4", text: "Safe load limit calculation.", correct: true },
      { id: "q5", text: "Blind spot awareness.", correct: true },
    ],
  },
];

export const AuditLog: React.FC = () => {
  const [attempts, setAttempts] = useState(MOCK_ATTEMPTS);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleIssueCertificate = async (id: string) => {
    setProcessingId(id);
    try {
      // Mock API call
      await new Promise((res) => setTimeout(res, 1200));
      setAttempts((prev) => prev.filter((att) => att.id !== id));
      setExpandedRowId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div
      style={{
        padding: "40px",
        backgroundColor: COLORS.void,
        minHeight: "100vh",
        color: COLORS.textPrimary,
        fontFamily: FONT_SANS,
      }}
    >
      <header style={{ marginBottom: "40px", borderBottom: `1px solid ${COLORS.glassBorder}`, paddingBottom: "20px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, fontWeight: 300, letterSpacing: "-0.02em" }}>
          AUDIT <span style={{ color: COLORS.devilViolet, fontWeight: 600 }}>REVIEW</span>
        </h1>
        <p style={{ color: COLORS.textSecondary, marginTop: "8px", fontSize: "0.9rem" }}>
          Review pending examinations and issue cryptographically signed certificates.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {attempts.map((attempt) => {
          const isExpanded = expandedRowId === attempt.id;
          const integrityWarning = attempt.integrityScore < 80;

          return (
            <div
              key={attempt.id}
              style={{
                backgroundColor: COLORS.glassBg,
                border: `1px solid ${COLORS.glassBorder}`,
                borderRadius: RADIUS_FLAT,
                overflow: "hidden",
                transition: "all 0.3s ease",
              }}
            >
              {/* ROW HEADER */}
              <div
                onClick={() => setExpandedRowId(isExpanded ? null : attempt.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 1fr 1fr 1fr auto",
                  padding: "20px",
                  cursor: "pointer",
                  backgroundColor: isExpanded ? "rgba(138, 43, 226, 0.05)" : "transparent",
                  borderBottom: isExpanded ? `1px solid ${COLORS.glassBorder}` : "none",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{attempt.employeeName}</div>
                  <div style={{ fontSize: "0.8rem", color: COLORS.textSecondary }}>{attempt.jobTitle}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.8rem", color: COLORS.textSecondary, textTransform: "uppercase" }}>Assessment</div>
                  <div style={{ fontSize: "0.9rem" }}>{attempt.assessmentName}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.8rem", color: COLORS.textSecondary, textTransform: "uppercase" }}>SCI Score</div>
                  <div style={{ fontFamily: FONT_MONO, color: COLORS.neonAccent }}>{attempt.sciScore.toFixed(1)}%</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.8rem", color: COLORS.textSecondary, textTransform: "uppercase" }}>Integrity</div>
                  <div style={{ fontFamily: FONT_MONO, color: integrityWarning ? COLORS.danger : COLORS.textPrimary }}>
                    {attempt.integrityScore.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={COLORS.textSecondary}
                    strokeWidth="2"
                    style={{
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.3s",
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* EXPANDED GLASS-PANEL */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{ padding: "24px", backgroundColor: COLORS.clayBg, boxShadow: COLORS.clayShadow }}>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "40px" }}>
                        
                        {/* Questions Breakdown */}
                        <div>
                          <h4 style={{ margin: "0 0 16px 0", color: COLORS.textSecondary, textTransform: "uppercase", fontSize: "0.85rem", letterSpacing: "0.05em" }}>
                            Question Breakdown
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {attempt.questions.map((q, i) => (
                              <div key={q.id} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                <div
                                  style={{
                                    width: "20px",
                                    height: "20px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: q.correct ? "rgba(0, 255, 204, 0.1)" : "rgba(255, 51, 102, 0.1)",
                                    border: `1px solid ${q.correct ? COLORS.neonAccent : COLORS.danger}`,
                                    color: q.correct ? COLORS.neonAccent : COLORS.danger,
                                    fontSize: "0.7rem",
                                  }}
                                >
                                  {q.correct ? "✓" : "✗"}
                                </div>
                                <div style={{ fontSize: "0.9rem", lineHeight: 1.4, color: COLORS.textPrimary }}>
                                  <span style={{ color: COLORS.textSecondary, marginRight: "8px" }}>Q{i+1}.</span>
                                  {q.text}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Proctoring & Action */}
                        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                          <div>
                            <h4 style={{ margin: "0 0 16px 0", color: COLORS.textSecondary, textTransform: "uppercase", fontSize: "0.85rem", letterSpacing: "0.05em" }}>
                              Proctoring Log
                            </h4>
                            <div style={{ padding: "16px", backgroundColor: "rgba(0,0,0,0.3)", border: `1px solid ${COLORS.glassBorder}`, fontFamily: FONT_MONO, fontSize: "0.8rem", color: COLORS.textSecondary }}>
                              <p style={{ margin: "0 0 8px 0" }}>[SYS] Head-pose tracking initialized.</p>
                              {integrityWarning ? (
                                <p style={{ margin: "0 0 8px 0", color: COLORS.danger }}>[WARN] Multiple off-screen gazes detected.</p>
                              ) : (
                                <p style={{ margin: "0 0 8px 0", color: COLORS.neonAccent }}>[OK] Consistent focus maintained.</p>
                              )}
                              <p style={{ margin: 0 }}>[SYS] Session finalized.</p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleIssueCertificate(attempt.id)}
                            disabled={processingId === attempt.id}
                            style={{
                              marginTop: "24px",
                              padding: "16px",
                              backgroundColor: COLORS.devilViolet,
                              border: "none",
                              color: "#fff",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              cursor: processingId === attempt.id ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                              boxShadow: `0 4px 15px rgba(138, 43, 226, 0.3)`,
                              transition: "background-color 0.2s",
                            }}
                          >
                            {processingId === attempt.id ? "Processing..." : "Issue Certificate & Reveal Score"}
                          </button>
                        </div>
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {attempts.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: COLORS.textSecondary, border: `1px dashed ${COLORS.glassBorder}` }}>
            No pending attempts to review.
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
