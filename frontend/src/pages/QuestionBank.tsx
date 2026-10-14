import { useState, useEffect } from "react";
import { getQuestions, updateQuestion, QuestionVariant, bulkGenerateQuestions, getQuestionTypeCounts } from "../api";

const TYPE_COLORS: Record<string, { bg: string; color: string; border: string; label: string }> = {
  MCQ: { bg: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", border: "rgba(59, 130, 246, 0.3)", label: "MCQ" },
  TRUE_FALSE: { bg: "rgba(168, 85, 247, 0.1)", color: "#a855f7", border: "rgba(168, 85, 247, 0.3)", label: "True / False" },
  FILL_IN_BLANK: { bg: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", border: "rgba(245, 158, 11, 0.3)", label: "Fill Blank" },
  MULTI_SELECT: { bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "rgba(16, 185, 129, 0.3)", label: "Multi-Select" },
};

export function QuestionBank() {
  const [activeTab, setActiveTab] = useState<"pending" | "approved">("pending");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [questions, setQuestions] = useState<QuestionVariant[]>([]);
  const [typeCounts, setTypeCounts] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<QuestionVariant | null>(null);

  // Bulk Generation State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generationMode, setGenerationMode] = useState<"matrix" | "custom">("matrix");
  const [selectedGenType, setSelectedGenType] = useState<string>("all");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [questionsData, countsData] = await Promise.all([
        getQuestions(selectedType === "all" ? undefined : selectedType),
        getQuestionTypeCounts().catch(() => ({} as Record<string, Record<string, number>>)),
      ]);
      setQuestions(questionsData);
      setTypeCounts(countsData);
    } catch (err) {
      console.error("Failed to load questions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedType]);

  const handleBulkGenerate = async () => {
    setGenerating(true);
    setGenProgress(0);
    setGenMessage("Connecting to local Ollama inference engine...");

    const targetType = generationMode === "matrix" ? "all" : selectedGenType;

    try {
      await bulkGenerateQuestions((msg) => {
        if (msg.error) {
          setGenMessage(`Error: ${msg.error}`);
          setGenerating(false);
        } else if (msg.done) {
          setGenMessage(msg.message);
          setGenProgress(100);
          setTimeout(() => {
            setShowGenerateModal(false);
            setGenerating(false);
            loadData();
          }, 2000);
        } else {
          setGenMessage(msg.message);
          if (msg.progress !== undefined) {
            setGenProgress(msg.progress);
          }
        }
      }, undefined, undefined, targetType);
    } catch (err) {
      setGenMessage("Failed to connect to generation service.");
      setGenerating(false);
    }
  };

  const handleSaveQuestion = async (updatedQ: QuestionVariant) => {
    try {
      const response = await updateQuestion(updatedQ.id, {
        question_text: updatedQ.question_text,
        options: updatedQ.options,
        correct_option_index: updatedQ.correct_option_index,
        correct_option_indices: updatedQ.correct_option_indices,
        blank_answer_variants: updatedQ.blank_answer_variants,
        review_status: updatedQ.review_status,
      });
      setQuestions((prev) => prev.map((q) => (q.id === updatedQ.id ? { ...q, ...response } : q)));
      setEditingQuestion(null);
    } catch (error) {
      console.error("Failed to update question:", error);
      alert("Failed to save changes. Please try again.");
    }
  };

  const filteredQuestions = questions.filter((q) =>
    activeTab === "pending" ? q.review_status !== "approved" : q.review_status === "approved"
  );

  // Compute counts for filter chips
  const totalInCurrentTab = questions.filter((q) =>
    activeTab === "pending" ? q.review_status !== "approved" : q.review_status === "approved"
  ).length;

  const getTypeCount = (typeKey: string) => {
    if (typeCounts[typeKey]) {
      return typeCounts[typeKey][activeTab] || 0;
    }
    return questions.filter(
      (q) => q.question_type === typeKey && (activeTab === "pending" ? q.review_status !== "approved" : q.review_status === "approved")
    ).length;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Question Bank</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 0 }}>
            Manage generated variants across all 4 question types (MCQ, True/False, Fill in Blank, Multi-Select).
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() => setShowGenerateModal(true)}
            style={{ marginRight: 8, display: "flex", alignItems: "center", gap: 6 }}
          >
            ✦ Auto-Generate Questions
          </button>
          <button
            className={`btn ${activeTab === "pending" ? "btn-emerald" : "btn-ghost"}`}
            onClick={() => setActiveTab("pending")}
          >
            Pending Review
          </button>
          <button
            className={`btn ${activeTab === "approved" ? "btn-emerald" : "btn-ghost"}`}
            onClick={() => setActiveTab("approved")}
          >
            Approved
          </button>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", background: "var(--bg-panel, rgba(255,255,255,0.03))", borderRadius: 10, border: "1px solid var(--border, rgba(255,255,255,0.08))" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>
          Filter by Type:
        </span>
        <button
          onClick={() => setSelectedType("all")}
          style={{
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            border: selectedType === "all" ? "1.5px solid var(--accent, #3b82f6)" : "1px solid var(--border)",
            background: selectedType === "all" ? "var(--accent, #3b82f6)" : "transparent",
            color: selectedType === "all" ? "#fff" : "var(--text-secondary)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          All Types ({totalInCurrentTab})
        </button>
        {(["MCQ", "TRUE_FALSE", "FILL_IN_BLANK", "MULTI_SELECT"] as const).map((t) => {
          const cfg = TYPE_COLORS[t];
          const isSelected = selectedType === t;
          const count = getTypeCount(t);
          return (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: isSelected ? `1.5px solid ${cfg.color}` : `1px solid ${cfg.border}`,
                background: isSelected ? cfg.bg : "transparent",
                color: isSelected ? cfg.color : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.color }} />
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Questions Table */}
      <div className="table-container" style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading question bank...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Rule Code</th>
                <th style={{ width: 130 }}>Type</th>
                <th>Question Stem</th>
                <th style={{ width: 100 }}>Difficulty</th>
                <th style={{ width: 90 }}>Confidence</th>
                <th style={{ width: 95 }}>Status</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No {activeTab} questions found for {selectedType === "all" ? "any type" : selectedType}.
                  </td>
                </tr>
              ) : (
                filteredQuestions.map((q) => {
                  const typeCfg = TYPE_COLORS[q.question_type] || TYPE_COLORS.MCQ;
                  return (
                    <tr key={q.id}>
                      <td>
                        <span className="mono" style={{ fontSize: 12, color: "var(--cyan, #06b6d4)" }}>
                          {q.rule_code || q.rule_id.substring(0, 8)}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: typeCfg.bg,
                            color: typeCfg.color,
                            border: `1px solid ${typeCfg.border}`,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {typeCfg.label}
                        </span>
                      </td>
                      <td style={{ maxWidth: 420 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            fontSize: 13,
                            lineHeight: 1.45,
                          }}
                        >
                          <strong>Q:</strong> {q.question_text}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 11,
                            textTransform: "capitalize",
                            fontWeight: 600,
                            color:
                              q.difficulty === "hard"
                                ? "#ef4444"
                                : q.difficulty === "medium"
                                ? "#f59e0b"
                                : "#10b981",
                          }}
                        >
                          {q.difficulty || "medium"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${q.confidence >= 0.8 ? "badge-emerald" : "badge-amber"}`}>
                          {Math.round(q.confidence * 100)}%
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            q.review_status === "approved"
                              ? "badge-emerald"
                              : q.review_status === "rejected"
                              ? "badge-crimson"
                              : "badge-amber"
                          }`}
                        >
                          {q.review_status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => setEditingQuestion(q)}
                          style={{
                            padding: "5px 12px",
                            fontSize: 12,
                            borderRadius: 5,
                            border: "1px solid var(--border)",
                            background: "var(--bg-elevated)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                          }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Review & Edit Modal */}
      {editingQuestion && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            position: "fixed",
            inset: 0,
            zIndex: 1000,
          }}
        >
          <div
            className="clay-card"
            style={{
              width: 820,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 18,
              backgroundColor: "var(--surface, #ffffff)",
              borderRadius: 12,
              boxShadow: "0 10px 35px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 18, margin: 0, color: "var(--text-primary)" }}>Review Question Variant</h3>
              {(() => {
                const cfg = TYPE_COLORS[editingQuestion.question_type] || TYPE_COLORS.MCQ;
                return (
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      background: cfg.bg,
                      color: cfg.color,
                      border: `1px solid ${cfg.border}`,
                    }}
                  >
                    {cfg.label}
                  </span>
                );
              })()}
            </div>

            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
              <span>
                <strong>Rule:</strong> {editingQuestion.rule_code || editingQuestion.rule_id}
              </span>
              <span>&bull;</span>
              <span>
                <strong>Difficulty:</strong> {editingQuestion.difficulty || "medium"}
              </span>
              <span>&bull;</span>
              <span>
                <strong>Confidence:</strong> {Math.round(editingQuestion.confidence * 100)}%
              </span>
            </div>

            {/* Parent Rule Text */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Parent Safety Rule</label>
              <div
                style={{
                  width: "100%",
                  maxHeight: 90,
                  overflowY: "auto",
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-panel)",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {editingQuestion.rule_text}
              </div>
            </div>

            {/* Question Text */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Question Stem</label>
              <textarea
                value={editingQuestion.question_text}
                onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text: e.target.value })}
                style={{
                  width: "100%",
                  minHeight: 70,
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Options display based on type */}
            {editingQuestion.options && editingQuestion.options.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Options</label>
                {editingQuestion.options.map((opt, i) => {
                  const isCorrect =
                    editingQuestion.question_type === "MULTI_SELECT"
                      ? (editingQuestion.correct_option_indices || []).includes(i)
                      : editingQuestion.correct_option_index === i;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: isCorrect ? "1px solid #10b981" : "1px solid var(--border)",
                        background: isCorrect ? "rgba(16, 185, 129, 0.08)" : "var(--bg-panel)",
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          background: isCorrect ? "#10b981" : "var(--bg-elevated)",
                          color: isCorrect ? "#fff" : "var(--text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>{opt}</span>
                      {isCorrect && (
                        <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>Correct Answer</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* FILL_IN_BLANK specific details */}
            {editingQuestion.question_type === "FILL_IN_BLANK" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Accepted Blank Answer Variants</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(editingQuestion.blank_answer_variants || []).map((variant, vi) => (
                    <span
                      key={vi}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        background: "rgba(245, 158, 11, 0.12)",
                        color: "#f59e0b",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                      }}
                    >
                      {variant}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button className="btn btn-ghost" onClick={() => setEditingQuestion(null)}>
                Cancel
              </button>
              {editingQuestion.review_status !== "rejected" && (
                <button
                  className="btn btn-crimson"
                  onClick={() => handleSaveQuestion({ ...editingQuestion, review_status: "rejected" })}
                >
                  Reject
                </button>
              )}
              {editingQuestion.review_status !== "approved" && (
                <button
                  className="btn btn-emerald"
                  onClick={() => handleSaveQuestion({ ...editingQuestion, review_status: "approved" })}
                >
                  Approve Question
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Generate Modal with Type Options */}
      {showGenerateModal && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            position: "fixed",
            inset: 0,
            zIndex: 1000,
          }}
        >
          <div
            className="clay-card"
            style={{
              width: 480,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 18,
              backgroundColor: "var(--surface)",
              borderRadius: 12,
            }}
          >
            <h3 style={{ fontSize: 18, margin: 0, color: "var(--text-primary)" }}>Generate Missing Exam Questions</h3>

            {!generating ? (
              <>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  Generates questions for all approved rules without questions using local Ollama. Select your generation strategy below:
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: generationMode === "matrix" ? "1.5px solid var(--accent, #3b82f6)" : "1px solid var(--border)",
                      background: generationMode === "matrix" ? "rgba(59, 130, 246, 0.06)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="genMode"
                      checked={generationMode === "matrix"}
                      onChange={() => setGenerationMode("matrix")}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        Default Matrix (Recommended)
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        Generates MCQ x2, True/False x1, Fill in Blank x1 (if numeric), and Multi-Select x1 (if compound).
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: generationMode === "custom" ? "1.5px solid var(--accent, #3b82f6)" : "1px solid var(--border)",
                      background: generationMode === "custom" ? "rgba(59, 130, 246, 0.06)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="genMode"
                      checked={generationMode === "custom"}
                      onChange={() => setGenerationMode("custom")}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        Specific Single Question Type
                      </div>
                      {generationMode === "custom" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                          {[
                            { id: "multiple_choice", label: "Multiple Choice (MCQ)" },
                            { id: "true_false", label: "True / False (TRUE_FALSE)" },
                            { id: "fill_in_blank", label: "Fill in the Blank (FILL_IN_BLANK)" },
                            { id: "multi_select", label: "Multi-Select (MULTI_SELECT)" },
                          ].map((opt) => (
                            <label
                              key={opt.id}
                              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-secondary)" }}
                            >
                              <input
                                type="radio"
                                name="subQType"
                                checked={selectedGenType === opt.id}
                                onChange={() => setSelectedGenType(opt.id)}
                              />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setShowGenerateModal(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleBulkGenerate}>
                    Start Generation
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", padding: "16px 0" }}>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }}></div>
                <div style={{ fontSize: 13, color: "var(--text-primary)", textAlign: "center", lineHeight: 1.5 }}>
                  {genMessage}
                </div>
                <div className="progress-bar" style={{ width: "100%", height: 8, marginTop: 4 }}>
                  <div className="progress-fill" style={{ width: `${genProgress}%` }}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
