import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- STYLING CONSTANTS (Void-Glass-Clay) ---
const COLORS = {
  void: "#07070e",
  devilViolet: "#8a2be2",
  neonAccent: "#00ffcc",
  glassBg: "rgba(255, 255, 255, 0.03)",
  glassBorder: "rgba(255, 255, 255, 0.08)",
  clayShadow: "inset 4px 4px 10px rgba(0, 0, 0, 0.6), inset -4px -4px 10px rgba(255, 255, 255, 0.05)",
  clayBg: "#11111a",
  textPrimary: "#f3f3f3",
  textSecondary: "#888899",
};

const BORDER_RADIUS = "16px";

// --- ICONS (Mathematically Generated SVGs) ---
const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SwapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <path d="M4 12v8h16v-8" />
    <polyline points="8 8 12 4 16 8" />
    <line x1="12" y1="4" x2="12" y2="16" />
  </svg>
);

// --- INTERFACES ---
interface AssignExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeJobTitle: string;
}

interface QuestionVariant {
  id: string;
  question_text: string;
  options: string[];
}

export const AssignExamModal: React.FC<AssignExamModalProps> = ({
  isOpen,
  onClose,
  employeeId,
  employeeJobTitle,
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1 State
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [targetCount, setTargetCount] = useState<number>(10);
  const [roleTemplate, setRoleTemplate] = useState(employeeJobTitle);

  // Step 2 State
  const [questions, setQuestions] = useState<QuestionVariant[]>([]);

  // Step 3 State
  const [revealScore, setRevealScore] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setRoleTemplate(employeeJobTitle);
      setQuestions([]);
      setRevealScore(false);
    }
  }, [isOpen, employeeJobTitle]);

  const handleAssemble = async () => {
    setLoading(true);
    try {
      // Mocking the backend call to assemble_exam_for_role
      // In a real app, you would call your API client here.
      await new Promise((res) => setTimeout(res, 1500));
      const mockQuestions = Array.from({ length: targetCount }).map((_, i) => ({
        id: `q-${i}`,
        question_text: `Generated question ${i + 1} for ${roleTemplate}?`,
        options: ["Option A", "Option B", "Option C", "Option D"],
      }));
      setQuestions(mockQuestions);
      setStep(2);
    } catch (err) {
      console.error("Assembly failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = async (id: string) => {
    // Mocking the backend call to swap_question
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, question_text: `[Swapped] ${q.question_text}` }
          : q
      )
    );
  };

  const handleFinalize = async () => {
    setLoading(true);
    try {
      // Mocking the backend call to commit the AssessmentSession
      console.log(`Assigning exam to employee: ${employeeId}`);
      await new Promise((res) => setTimeout(res, 1500));
      onClose();
    } catch (err) {
      console.error("Finalization failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          style={{
            width: "600px",
            maxWidth: "90%",
            backgroundColor: COLORS.void,
            border: `1px solid ${COLORS.glassBorder}`,
            borderRadius: BORDER_RADIUS,
            boxShadow: `0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 ${COLORS.glassBorder}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            fontFamily: "'IBM Plex Sans', sans-serif",
            color: COLORS.textPrimary,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "24px",
              borderBottom: `1px solid ${COLORS.glassBorder}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Assign Exam
              <span style={{ color: COLORS.devilViolet, marginLeft: "8px" }}>[{step}/3]</span>
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.textSecondary,
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Content Area */}
          <div style={{ padding: "24px", flex: 1, overflowY: "auto", maxHeight: "60vh" }}>
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ display: "flex", gap: "16px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "0.85rem", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Valid From</label>
                    <input
                      type="date"
                      value={validFrom}
                      onChange={(e) => setValidFrom(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        backgroundColor: COLORS.clayBg,
                        border: `1px solid ${COLORS.glassBorder}`,
                        borderRadius: "8px",
                        color: COLORS.textPrimary,
                        boxShadow: COLORS.clayShadow,
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "0.85rem", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Valid To</label>
                    <input
                      type="date"
                      value={validTo}
                      onChange={(e) => setValidTo(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        backgroundColor: COLORS.clayBg,
                        border: `1px solid ${COLORS.glassBorder}`,
                        borderRadius: "8px",
                        color: COLORS.textPrimary,
                        boxShadow: COLORS.clayShadow,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "0.85rem", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Target Question Count</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={targetCount}
                    onChange={(e) => setTargetCount(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "12px",
                      backgroundColor: COLORS.clayBg,
                      border: `1px solid ${COLORS.glassBorder}`,
                      borderRadius: "8px",
                      color: COLORS.textPrimary,
                      boxShadow: COLORS.clayShadow,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "0.85rem", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Role Template</label>
                  <select
                    value={roleTemplate}
                    onChange={(e) => setRoleTemplate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      backgroundColor: COLORS.clayBg,
                      border: `1px solid ${COLORS.glassBorder}`,
                      borderRadius: "8px",
                      color: COLORS.textPrimary,
                      boxShadow: COLORS.clayShadow,
                      appearance: "none",
                    }}
                  >
                    <option value="CNC Machine Operator">CNC Machine Operator</option>
                    <option value="Forklift Operator">Forklift Operator</option>
                    <option value="Maintenance Technician (Electrical)">Maintenance Technician (Electrical)</option>
                    <option value="Quality Inspector">Quality Inspector</option>
                  </select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    style={{
                      backgroundColor: COLORS.clayBg,
                      border: `1px solid ${COLORS.glassBorder}`,
                      borderRadius: "12px",
                      padding: "16px",
                      boxShadow: COLORS.clayShadow,
                      position: "relative",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <p style={{ margin: "0 0 12px 0", fontSize: "0.95rem", lineHeight: 1.5, color: COLORS.neonAccent }}>
                        <span style={{ color: COLORS.textSecondary, marginRight: "8px" }}>{idx + 1}.</span>
                        {q.question_text}
                      </p>
                      <button
                        onClick={() => handleSwap(q.id)}
                        title="Swap/Regenerate Question"
                        style={{
                          background: "transparent",
                          border: `1px solid ${COLORS.glassBorder}`,
                          borderRadius: "4px",
                          color: COLORS.devilViolet,
                          cursor: "pointer",
                          padding: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.2s",
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.borderColor = COLORS.devilViolet)}
                        onMouseOut={(e) => (e.currentTarget.style.borderColor = COLORS.glassBorder)}
                      >
                        <SwapIcon />
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      {q.options.map((opt, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "8px 12px",
                            fontSize: "0.85rem",
                            backgroundColor: "rgba(255,255,255,0.02)",
                            border: `1px solid ${COLORS.glassBorder}`,
                            borderRadius: "6px",
                            color: COLORS.textSecondary,
                          }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
                <h3 style={{ fontSize: "1.5rem", fontWeight: 400, color: COLORS.neonAccent, margin: 0, textAlign: "center" }}>
                  Ready to Assign
                </h3>
                <p style={{ color: COLORS.textSecondary, textAlign: "center", maxWidth: "80%", margin: 0 }}>
                  This will lock the current question set and schedule the assessment for employee {employeeId}.
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "16px" }}>
                  <span style={{ fontSize: "0.9rem", color: COLORS.textPrimary }}>Reveal Score to Worker Upon Completion</span>
                  <label
                    style={{
                      position: "relative",
                      display: "inline-block",
                      width: "48px",
                      height: "24px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={revealScore}
                      onChange={(e) => setRevealScore(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        cursor: "pointer",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: revealScore ? COLORS.devilViolet : COLORS.clayBg,
                        border: `1px solid ${COLORS.glassBorder}`,
                        transition: ".4s",
                        borderRadius: "24px",
                        boxShadow: COLORS.clayShadow,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          content: '""',
                          height: "16px",
                          width: "16px",
                          left: revealScore ? "26px" : "4px",
                          bottom: "3px",
                          backgroundColor: revealScore ? COLORS.textPrimary : COLORS.textSecondary,
                          transition: ".4s",
                          borderRadius: "50%",
                        }}
                      />
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: "24px",
              borderTop: `1px solid ${COLORS.glassBorder}`,
              display: "flex",
              justifyContent: "space-between",
              backgroundColor: "rgba(0,0,0,0.2)",
            }}
          >
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                style={{
                  padding: "10px 24px",
                  backgroundColor: "transparent",
                  border: `1px solid ${COLORS.glassBorder}`,
                  borderRadius: "6px",
                  color: COLORS.textPrimary,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.9rem",
                  letterSpacing: "0.02em",
                }}
              >
                Back
              </button>
            ) : (
              <div /> // Placeholder to align next button right
            )}

            {step < 3 ? (
              <button
                onClick={() => {
                  if (step === 1) handleAssemble();
                  else setStep(step + 1);
                }}
                disabled={loading}
                style={{
                  padding: "10px 24px",
                  backgroundColor: COLORS.devilViolet,
                  border: "none",
                  borderRadius: "6px",
                  color: "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  boxShadow: `0 0 15px ${COLORS.devilViolet}40`,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {loading ? "Processing..." : "Next Step"}
              </button>
            ) : (
              <button
                onClick={handleFinalize}
                disabled={loading}
                style={{
                  padding: "10px 32px",
                  backgroundColor: COLORS.neonAccent,
                  border: "none",
                  borderRadius: "6px",
                  color: COLORS.void,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  boxShadow: `0 0 20px ${COLORS.neonAccent}60`,
                }}
              >
                {loading ? "Locking..." : "Lock & Assign"}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
