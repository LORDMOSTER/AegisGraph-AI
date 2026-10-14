/**
 * QuestionBankModal.tsx
 * Modal to pick approved variants from the Question Bank filtered by type, difficulty, and rule.
 */

import React, { useState, useEffect } from "react";
import { getApprovedQuestions, QuestionVariant } from "../../api";

interface QuestionBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVariant: (variant: QuestionVariant) => void;
  excludedStems: string[];
  initialType?: string;
  initialDifficulty?: string;
}

export const QuestionBankModal: React.FC<QuestionBankModalProps> = ({
  isOpen,
  onClose,
  onSelectVariant,
  excludedStems,
  initialType,
  initialDifficulty,
}) => {
  const [variants, setVariants] = useState<QuestionVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(initialType || "all");
  const [diffFilter, setDiffFilter] = useState<string>(initialDifficulty || "all");

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getApprovedQuestions()
        .then((list: QuestionVariant[]) => setVariants(list || []))
        .catch((err: any) => console.error("Could not fetch approved bank questions", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = variants.filter((v) => {
    // Exclude questions already in exam
    if (excludedStems.includes(v.question_text)) return false;
    // Type filter
    if (typeFilter !== "all" && v.question_type !== typeFilter) return false;
    // Difficulty filter
    if (diffFilter !== "all" && v.difficulty !== diffFilter) return false;
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = v.question_text.toLowerCase().includes(q);
      const matchRule = v.rule_text ? v.rule_text.toLowerCase().includes(q) : false;
      return matchText || matchRule;
    }
    return true;
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(3, 7, 18, 0.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 780,
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          padding: 24,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>Insert from Question Bank</h3>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              Pick pre-approved questions verified against safety manual ground truth.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost" style={{ padding: 6 }}>
            <iconify-icon icon="lucide:x" style={{ fontSize: 20 }} />
          </button>
        </div>

        {/* Filters Row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            type="text"
            className="field-input"
            placeholder="Search stems or rule text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />

          <select
            className="field-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: 140 }}
          >
            <option value="all">All Types</option>
            <option value="MCQ">MCQ</option>
            <option value="TRUE_FALSE">True/False</option>
            <option value="FILL_IN_BLANK">Fill Blank</option>
            <option value="MULTI_SELECT">Multi-Select</option>
          </select>

          <select
            className="field-select"
            value={diffFilter}
            onChange={(e) => setDiffFilter(e.target.value)}
            style={{ width: 140 }}
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        {/* List of Bank Questions */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
              Loading Question Bank variants...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
              No matching approved variants found. Try loosening filters.
            </div>
          ) : (
            filtered.map((v) => (
              <div
                key={v.id}
                className="card"
                style={{
                  padding: 16,
                  background: "var(--raised)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span className="badge badge-cyan" style={{ fontSize: 10 }}>
                      {v.question_type}
                    </span>
                    <span
                      className={`badge badge-${
                        v.difficulty === "hard" ? "rose" : v.difficulty === "medium" ? "amber" : "emerald"
                      }`}
                      style={{ fontSize: 10 }}
                    >
                      {v.difficulty}
                    </span>
                    {v.grounding_verified && (
                      <span className="badge badge-emerald" style={{ fontSize: 10 }}>
                        ✓ Grounded
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 6, lineHeight: 1.4 }}>
                    {v.question_text}
                  </div>
                  {v.options && v.options.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Options: {v.options.slice(0, 4).join(" • ")}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSelectVariant(v);
                    onClose();
                  }}
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: "6px 14px", whiteSpace: "nowrap" }}
                >
                  Insert Question
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
