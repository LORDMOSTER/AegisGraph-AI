/**
 * AIGenerateSlotModal.tsx
 * Dialog to generate a single new AI question slot specifying type, difficulty, rule, and optional focus hint.
 */

import React, { useState, useEffect } from "react";
import { getHierarchyTree, HierarchyTreeResponse, RuleResponse } from "../../api";

interface AIGenerateSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateSlot: (params: {
    question_type: "MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK" | "MULTI_SELECT";
    difficulty: "easy" | "medium" | "hard";
    rule_id?: string;
    focus_hint?: string;
  }) => Promise<void>;
}

export const AIGenerateSlotModal: React.FC<AIGenerateSlotModalProps> = ({
  isOpen,
  onClose,
  onGenerateSlot,
}) => {
  const [qType, setQType] = useState<"MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK" | "MULTI_SELECT">("MCQ");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [ruleId, setRuleId] = useState<string>("");
  const [focusHint, setFocusHint] = useState<string>("");
  const [hierarchy, setHierarchy] = useState<HierarchyTreeResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getHierarchyTree()
        .then((tree) => setHierarchy(tree))
        .catch((err) => console.error("Could not fetch hierarchy rules", err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Flatten rules
  const allRules: RuleResponse[] =
    hierarchy?.manuals?.flatMap((m) =>
      m.sections?.flatMap((s) => s.subcategories?.flatMap((sub) => sub.rules || []) || []) || []
    ) || [];

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerateSlot({
        question_type: qType,
        difficulty,
        rule_id: ruleId || undefined,
        focus_hint: focusHint.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      console.error("AI generation slot failed", err);
      alert(err.message || "Failed to generate question");
    } finally {
      setIsGenerating(false);
    }
  };

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
          maxWidth: 520,
          width: "100%",
          padding: 24,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--accent-dim)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <iconify-icon icon="lucide:sparkles" style={{ fontSize: 18 }} />
            </span>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Generate Slot with AI</h3>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost" style={{ padding: 6 }}>
            <iconify-icon icon="lucide:x" style={{ fontSize: 20 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Question Type */}
          <div className="field-group">
            <label className="field-label">Target Question Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(["MCQ", "TRUE_FALSE", "FILL_IN_BLANK", "MULTI_SELECT"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setQType(t)}
                  className={`btn ${qType === t ? "btn-primary" : "btn-ghost"}`}
                  style={{
                    fontSize: 12,
                    padding: "8px 10px",
                    border: qType === t ? "none" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {t === "MCQ"
                    ? "Multiple Choice"
                    : t === "TRUE_FALSE"
                    ? "True / False"
                    : t === "FILL_IN_BLANK"
                    ? "Fill in Blank"
                    : "Multi-Select"}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="field-group">
            <label className="field-label">Difficulty</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`btn ${difficulty === d ? "btn-primary" : "btn-ghost"}`}
                  style={{
                    flex: 1,
                    fontSize: 12,
                    textTransform: "capitalize",
                    border: difficulty === d ? "none" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Source Safety Rule */}
          <div className="field-group">
            <label className="field-label">Source Safety Rule (Optional)</label>
            <select
              className="field-select"
              value={ruleId}
              onChange={(e) => setRuleId(e.target.value)}
            >
              <option value="">-- Auto-select from Section Rules --</option>
              {allRules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rule_code} • {r.text.slice(0, 65)}...
                </option>
              ))}
            </select>
          </div>

          {/* Focus Hint */}
          <div className="field-group">
            <label className="field-label">Focus Hint (Optional)</label>
            <input
              type="text"
              className="field-input"
              placeholder="e.g. Ask specifically about the 12 cal/cm2 arc shield rating"
              value={focusHint}
              onChange={(e) => setFocusHint(e.target.value)}
            />
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost" disabled={isGenerating}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="btn btn-primary"
              style={{ padding: "8px 20px" }}
            >
              <iconify-icon
                icon={isGenerating ? "lucide:loader-2" : "lucide:sparkles"}
                className={isGenerating ? "spin" : ""}
                style={{ marginRight: 6 }}
              />
              {isGenerating ? "Synthesizing with Ollama..." : "Generate with AI"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
