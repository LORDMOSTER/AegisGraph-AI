/**
 * WorkerPreviewDrawer.tsx
 * Realistic exam worker kiosk simulator rendering the draft questions exactly as an employee will experience them.
 */

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExamDraftModel } from "../../api";

interface WorkerPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  draft: ExamDraftModel;
}

export const WorkerPreviewDrawer: React.FC<WorkerPreviewDrawerProps> = ({
  isOpen,
  onClose,
  draft,
}) => {
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [shuffleActive, setShuffleActive] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const sections = draft.sections || [];
  const currentSection = sections[activeSectionIdx] || sections[0];

  // Optional shuffle simulation
  const displayedQuestions = useMemo(() => {
    if (!currentSection) return [];
    let list = [...(currentSection.questions || [])];
    if (shuffleActive) {
      // Deterministic fake shuffle for preview previewing
      list = [...list].reverse();
    }
    return list;
  }, [currentSection, shuffleActive]);

  if (!isOpen) return null;

  const totalQuestions = sections.reduce((acc, s) => acc + (s.questions?.length || 0), 0);
  const answeredCount = Object.keys(answers).length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(3, 7, 18, 0.8)",
        backdropFilter: "blur(12px)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        style={{
          width: "100%",
          maxWidth: "860px",
          height: "100%",
          background: "var(--base)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.3)",
        }}
      >
        {/* Top Header simulating Exam Kiosk */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "linear-gradient(135deg, #06b6d4, #16a34a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <iconify-icon icon="lucide:monitor-play" style={{ fontSize: 20 }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
                  {draft.title || "Exam Preview"}
                </h2>
                <span className="badge badge-cyan" style={{ fontSize: 11 }}>
                  WORKER PREVIEW
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {draft.duration_minutes} Mins • Pass Mark: {draft.pass_percent}% • Mode:{" "}
                {draft.scoring_mode === "risk_weighted" ? "Risk-Weighted" : "Standard"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setShuffleActive(!shuffleActive)}
              className="btn btn-ghost"
              style={{
                fontSize: 12,
                padding: "6px 12px",
                border: "1px solid var(--border-color, rgba(255,255,255,0.1))",
                background: shuffleActive ? "rgba(6, 182, 212, 0.15)" : "transparent",
                color: shuffleActive ? "var(--cyan, #06b6d4)" : "var(--text-secondary, #94a3b8)",
              }}
              title="Test question order shuffle"
            >
              <iconify-icon icon="lucide:shuffle" style={{ marginRight: 6 }} />
              Shuffle: {shuffleActive ? "ON" : "OFF"}
            </button>
            <button
              onClick={onClose}
              className="btn btn-ghost"
              style={{ color: "var(--text-secondary, #94a3b8)", padding: 8 }}
            >
              <iconify-icon icon="lucide:x" style={{ fontSize: 20 }} />
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        {sections.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "12px 24px",
              borderBottom: "1px solid var(--border)",
              background: "var(--raised)",
              overflowX: "auto",
            }}
          >
            {sections.map((sec, idx) => {
              const isActive = idx === activeSectionIdx;
              return (
                <button
                  key={sec.id || idx}
                  onClick={() => setActiveSectionIdx(idx)}
                  className={`btn ${isActive ? "btn-primary" : "btn-ghost"}`}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>
                    {sec.title || `Section ${idx + 1}`} ({sec.questions?.length || 0})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Simulator Scroll Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {currentSection ? (
            <div style={{ maxWidth: 740, margin: "0 auto" }}>
              {/* Section Header Card */}
              <div
                className="card"
                style={{
                  padding: 20,
                  marginBottom: 24,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
                    {currentSection.title || `Section ${activeSectionIdx + 1}`}
                  </h3>
                  <span style={{ fontSize: 12, color: "var(--accent)", fontFamily: "monospace" }}>
                    {currentSection.questions?.length || 0} Questions • {currentSection.marks_per_question} Marks/Q
                  </span>
                </div>
                {currentSection.instructions && (
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                    {currentSection.instructions}
                  </p>
                )}
              </div>

              {/* Questions List */}
              {displayedQuestions.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "var(--muted)",
                  }}
                >
                  <iconify-icon icon="lucide:clipboard-list" style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }} />
                  <p>No questions generated in this section yet.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {displayedQuestions.map((q, qIndex) => {
                    const qId = q.id || `q-${qIndex}`;
                    const payload = q.payload || {};
                    const selectedVal = answers[qId];

                    return (
                      <div
                        key={qId}
                        className="card"
                        style={{
                          padding: 20,
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {/* Question Metadata Row */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: "var(--accent-dim)",
                                color: "var(--accent)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {qIndex + 1}
                            </span>
                            <span className="badge badge-secondary" style={{ fontSize: 11 }}>
                              {q.question_type}
                            </span>
                            <span
                              className={`badge badge-${
                                q.difficulty === "hard" ? "rose" : q.difficulty === "medium" ? "amber" : "emerald"
                              }`}
                              style={{ fontSize: 11 }}
                            >
                              {q.difficulty}
                            </span>
                          </div>
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            {q.marks || currentSection.marks_per_question} Marks
                          </span>
                        </div>

                        {/* Stem */}
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 500,
                            color: "var(--ink)",
                            marginBottom: 16,
                            lineHeight: 1.5,
                          }}
                        >
                          {q.stem}
                        </div>

                        {/* Type-Specific Interactive Answer Option Simulator */}
                        {q.question_type === "MCQ" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {(payload.options || ["Option A", "Option B", "Option C", "Option D"]).map(
                              (opt: string, optIdx: number) => {
                                const isSelected = selectedVal === optIdx;
                                return (
                                  <label
                                    key={optIdx}
                                    onClick={() => setAnswers({ ...answers, [qId]: optIdx })}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 12,
                                      padding: "10px 14px",
                                      borderRadius: 8,
                                      border: isSelected
                                        ? "1px solid var(--accent)"
                                        : "1px solid var(--border)",
                                      background: isSelected
                                        ? "var(--green-dim)"
                                        : "var(--raised)",
                                      cursor: "pointer",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    <input
                                      type="radio"
                                      name={`preview-${qId}`}
                                      checked={isSelected}
                                      onChange={() => {}}
                                      style={{ accentColor: "var(--accent)" }}
                                    />
                                    <span style={{ fontSize: 14, color: isSelected ? "var(--accent)" : "var(--ink)", fontWeight: isSelected ? 600 : 400 }}>
                                      {opt}
                                    </span>
                                  </label>
                                );
                              }
                            )}
                          </div>
                        )}

                        {q.question_type === "TRUE_FALSE" && (
                          <div style={{ display: "flex", gap: 12 }}>
                            {["True", "False"].map((opt) => {
                              const isSelected = selectedVal === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setAnswers({ ...answers, [qId]: opt })}
                                  className={`btn ${isSelected ? "btn-primary" : "btn-ghost"}`}
                                  style={{
                                    flex: 1,
                                    padding: "10px 16px",
                                    border: isSelected
                                      ? "1px solid var(--accent)"
                                      : "1px solid var(--border)",
                                    fontSize: 14,
                                    fontWeight: 600,
                                  }}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {q.question_type === "MULTI_SELECT" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 12, color: "var(--amber)", marginBottom: 4 }}>
                              * Select all that apply (multiple correct answers)
                            </div>
                            {(payload.options || ["Item 1", "Item 2", "Item 3", "Item 4"]).map(
                              (opt: string, optIdx: number) => {
                                const currentArr: number[] = Array.isArray(selectedVal) ? selectedVal : [];
                                const isChecked = currentArr.includes(optIdx);
                                return (
                                  <label
                                    key={optIdx}
                                    onClick={() => {
                                      const next = isChecked
                                        ? currentArr.filter((i) => i !== optIdx)
                                        : [...currentArr, optIdx];
                                      setAnswers({ ...answers, [qId]: next });
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 12,
                                      padding: "10px 14px",
                                      borderRadius: 8,
                                      border: isChecked
                                        ? "1px solid var(--accent)"
                                        : "1px solid var(--border)",
                                      background: isChecked
                                        ? "var(--green-dim)"
                                        : "var(--raised)",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}}
                                      style={{ accentColor: "var(--accent)" }}
                                    />
                                    <span style={{ fontSize: 14, color: isChecked ? "var(--accent)" : "var(--ink)", fontWeight: isChecked ? 600 : 400 }}>
                                      {opt}
                                    </span>
                                  </label>
                                );
                              }
                            )}
                          </div>
                        )}

                        {q.question_type === "FILL_IN_BLANK" && (
                          <div style={{ marginTop: 8 }}>
                            <label style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, display: "block" }}>
                              Enter your answer:
                            </label>
                            <input
                              type="text"
                              className="field-input"
                              placeholder="Type required value..."
                              value={selectedVal || ""}
                              onChange={(e) => setAnswers({ ...answers, [qId]: e.target.value })}
                              style={{ width: "100%", maxWidth: 320 }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Bottom Status Bar */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface)",
          }}
        >
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Completed in preview:{" "}
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>
              {answeredCount} / {totalQuestions}
            </span>{" "}
            questions
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setAnswers({})}
              className="btn btn-ghost"
              style={{ fontSize: 13 }}
            >
              Reset Answers
            </button>
            <button
              onClick={() => setShowSubmitModal(true)}
              className="btn btn-primary"
              style={{ fontSize: 13 }}
            >
              Simulate Submit
            </button>
          </div>
        </div>

        {/* Simulate Submit Modal */}
        <AnimatePresence>
          {showSubmitModal && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                zIndex: 10,
                backdropFilter: "blur(4px)",
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="card"
                style={{
                  maxWidth: 420,
                  width: "100%",
                  padding: 24,
                  textAlign: "center",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-dropdown)",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--green-dim)",
                    color: "var(--green)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  <iconify-icon icon="lucide:check-circle-2" style={{ fontSize: 28 }} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
                  Worker Test Drive Complete
                </h3>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>
                  Simulated submission with {answeredCount} answered of {totalQuestions} questions. In live worker kiosk, answers are graded against the locked manifest.
                </p>
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                >
                  Return to Preview
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
