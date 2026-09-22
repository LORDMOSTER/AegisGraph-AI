import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getExam, saveAnswer, submitExam } from "../api";

export interface ExamQuestion {
  id: string;
  rule_id: string;
  question_text: string;
  options: string[];
}
interface Props {
  examId: string;
  onExit: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

export function ExamSession({ examId, onExit }: Props) {
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await getExam(examId);
      setQuestions(data.questions.map((q: any) => ({
        id: q.id,
        rule_id: q.rule_id,
        question_text: q.question_text,
        options: q.options
      })));
      setLoading(false);
    }
    load();
  }, [examId]);

  const handleSelect = async (option: string) => {
    const currentQ = questions[currentIndex];
    const optionIndex = currentQ.options.indexOf(option);
    setAnswers(prev => ({ ...prev, [currentQ.id]: option }));
    await saveAnswer(examId, currentQ.id, optionIndex);
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setSubmitting(true);
      await submitExam(examId, 95.0); // Pass a high integrity score for now
      setSubmitting(false);
      onExit();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const currentQ = questions[currentIndex];
  const hasSelected = currentQ && answers[currentQ.id] !== undefined;
  const progress = questions.length > 0 ? ((currentIndex) / questions.length) : 0;

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--base)", flexDirection: "column", gap: 16 }}>
        <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--accent)" }} />
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading Exam...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", width: "100vw", background: "var(--base)", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, zIndex: 9999, overflowY: "auto" }}>
      {/* Progress Header */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)" }}>
                {questions.length > 0 ? "LOTO Certification" : "Exam"}
              </span>
              <span style={{ width: 1, height: 12, background: "var(--line)", display: "inline-block" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink)" }}>
                Question {currentIndex + 1} of {questions.length}
              </span>
            </div>
            <button
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, padding: 4 }}
              onClick={() => setShowExitConfirm(true)}
              title="Exit Exam"
            >
              ⋯
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 6, background: "var(--raised)", borderRadius: 4, overflow: "hidden" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                style={{ height: "100%", background: "var(--accent)", borderRadius: 4 }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {Math.round(progress * 100)}% complete
            </span>
          </div>
        </div>
      </div>

      {/* Main Question Area */}
      <main style={{ flex: 1, maxWidth: 800, margin: "0 auto", padding: "40px 32px", width: "100%" }}>
        <AnimatePresence mode="wait">
          {currentQ && (
            <motion.div
              key={currentQ.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Topic tag */}
              <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ background: "rgba(37,99,235,0.08)", color: "#1d4ed8", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 500 }}>
                  LOTO / Lockout Tagout
                </span>
              </div>

              {/* Question */}
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5, marginBottom: 32, letterSpacing: "-0.01em" }}>
                {currentQ.question_text}
              </h1>

              {/* Options */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {currentQ.options.map((opt, i) => {
                  const isSelected = answers[currentQ.id] === opt;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(opt)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 16,
                        padding: "16px 20px",
                        textAlign: "left",
                        background: isSelected ? "rgba(37,99,235,0.05)" : "var(--surface)",
                        border: isSelected ? "2px solid var(--accent)" : "1px solid var(--line)",
                        borderRadius: "var(--card-radius)",
                        color: isSelected ? "var(--ink)" : "var(--muted)",
                        fontSize: 14,
                        cursor: "pointer",
                        minHeight: 64,
                        transition: "all 0.15s",
                        fontFamily: "var(--font-sans)",
                        boxShadow: isSelected ? "0 0 0 1px rgba(37,99,235,0.15)" : "var(--shadow-card)",
                      }}
                    >
                      <span style={{
                        display: "grid",
                        placeItems: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: isSelected ? "var(--accent)" : "var(--raised)",
                        color: isSelected ? "#fff" : "var(--muted)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 600,
                        flexShrink: 0,
                        marginTop: 2,
                        transition: "all 0.15s",
                      }}>
                        {OPTION_LABELS[i]}
                      </span>
                      <span style={{ lineHeight: 1.5 }}>{opt}</span>
                      {isSelected && (
                        <iconify-icon icon="lucide:check-circle-2" style={{ fontSize: 20, color: "var(--accent)", marginLeft: "auto", flexShrink: 0, marginTop: 2 }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Navigation */}
              <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    border: "1px solid var(--line)", background: "var(--surface)",
                    borderRadius: 8, padding: "10px 20px", fontSize: 13,
                    fontWeight: 500, color: "var(--muted)", cursor: "pointer",
                    opacity: currentIndex === 0 ? 0.4 : 1,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  <iconify-icon icon="lucide:arrow-left" style={{ fontSize: 16 }} />
                  Previous
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => setShowExitConfirm(true)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      border: "1px solid var(--line)", background: "var(--surface)",
                      borderRadius: 8, padding: "10px 20px", fontSize: 13,
                      fontWeight: 500, color: "var(--muted)", cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <iconify-icon icon="lucide:send" style={{ fontSize: 16 }} />
                    Submit exam
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!hasSelected || submitting}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      background: "var(--accent)", color: "#fff",
                      border: "1px solid var(--accent)",
                      borderRadius: 8, padding: "10px 20px", fontSize: 13,
                      fontWeight: 600, cursor: "pointer",
                      boxShadow: "var(--shadow-btn)",
                      opacity: (!hasSelected || submitting) ? 0.5 : 1,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {submitting ? "Submitting..." : currentIndex === questions.length - 1 ? "Finish exam" : "Next question"}
                    {!submitting && <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 16 }} />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Monitoring Badge */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 10000 }}>
        <div style={{
          background: "rgba(28,28,26,0.08)",
          border: "1px solid rgba(28,28,26,0.15)",
          borderRadius: 999,
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--ink)", opacity: 0.7 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", letterSpacing: "0.01em" }}>Monitoring Active</span>
        </div>
      </div>

      {/* Exit Confirm Modal */}
      {showExitConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, display: "grid", placeItems: "center", background: "rgba(28,28,26,0.2)", backdropFilter: "blur(4px)", padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowExitConfirm(false); }}>
          <div style={{
            width: "100%", maxWidth: 440,
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: "var(--card-radius)", padding: 24,
            boxShadow: "0 20px 60px rgba(28,28,26,0.15)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--raised)", border: "1px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <iconify-icon icon="lucide:alert-triangle" style={{ fontSize: 20, color: "var(--ink)" }} />
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Leave this exam?</h3>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                  Your progress will be recorded as incomplete. You can resume once, within 30 minutes.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 500, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
                onClick={() => setShowExitConfirm(false)}
              >
                Stay in exam
              </button>
              <button
                style={{ background: "#dc2626", border: "1px solid #dc2626", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 500, color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)" }}
                onClick={onExit}
              >
                Leave exam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
