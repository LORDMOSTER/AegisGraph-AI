/**
 * QuestionEditorCard.tsx
 * Google-Forms-style editable Question Card supporting all 4 types (MCQ, TRUE_FALSE, MULTI_SELECT, FILL_IN_BLANK),
 * drag reordering, inline type-changing, pin locks, AI regeneration ladder, instant bank swapping, and rule linking.
 */

import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ExamQuestionModel,
  RuleResponse,
  regenerateDraftQuestion,
  getQuestionAlternatives,
  swapDraftQuestion,
  togglePinQuestion,
  saveQuestionToBank,
  AlternativeVariant,
  RegenerateQuestionOptions,
} from "../../api";

interface QuestionEditorCardProps {
  question: ExamQuestionModel;
  index: number;
  draftId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<ExamQuestionModel>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  rulesList: RuleResponse[];
  onTriggerUndoToast: (questionId: string, stem: string) => void;
}

export const QuestionEditorCard: React.FC<QuestionEditorCardProps> = ({
  question,
  index,
  draftId,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onDuplicate,
  rulesList,
  onTriggerUndoToast,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const payload = question.payload || {};

  // Local state for popovers & actions
  const [showRulePicker, setShowRulePicker] = useState(false);
  const [ruleSearch, setRuleSearch] = useState("");
  const [showRegenPopover, setShowRegenPopover] = useState(false);
  const [regenOptions, setRegenOptions] = useState<RegenerateQuestionOptions>({
    mode: "same_rule",
    difficulty: question.difficulty,
    change_type: question.question_type,
    focus_hint: "",
  });
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const [showSwapModal, setShowSwapModal] = useState(false);
  const [alternatives, setAlternatives] = useState<AlternativeVariant[]>([]);
  const [loadingAlts, setLoadingAlts] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  const [savingToBank, setSavingToBank] = useState(false);
  const [savedToBankSuccess, setSavedToBankSuccess] = useState(false);

  const [showTypeConfirm, setShowTypeConfirm] = useState<string | null>(null);

  // Linked rule object
  const linkedRule = rulesList.find((r) => r.id === question.rule_id);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  const handleTogglePin = async () => {
    try {
      const res = await togglePinQuestion(question.id);
      onUpdate({ is_locked: res.is_locked });
    } catch (err) {
      console.error("Toggle pin failed", err);
    }
  };

  const handleExecuteRegenerate = async () => {
    if (question.is_locked) {
      setRegenError("Question is pinned. Unpin before regenerating.");
      return;
    }
    setIsRegenerating(true);
    setRegenError(null);
    try {
      const updated = await regenerateDraftQuestion(question.id, regenOptions, draftId);
      onUpdate({
        stem: updated.stem,
        payload: updated.payload,
        difficulty: updated.difficulty,
        question_type: updated.question_type,
        origin: "ai",
      });
      setShowRegenPopover(false);
      onTriggerUndoToast(question.id, question.stem);
    } catch (err: any) {
      console.error("Regenerate failed", err);
      setRegenError(err.message || "Variation ladder exhausted (HTTP 409).");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleOpenSwap = async () => {
    setShowSwapModal(true);
    setLoadingAlts(true);
    try {
      const alts = await getQuestionAlternatives(question.id, draftId);
      setAlternatives(alts || []);
    } catch (err) {
      console.error("Failed to load alternatives", err);
    } finally {
      setLoadingAlts(false);
    }
  };

  const handleExecuteSwap = async (variantId: string) => {
    setIsSwapping(true);
    try {
      const swapped = await swapDraftQuestion(question.id, variantId, draftId);
      onUpdate({
        stem: swapped.stem,
        payload: swapped.payload,
        origin: "bank",
        source_variant_id: swapped.source_variant_id,
      });
      setShowSwapModal(false);
      onTriggerUndoToast(question.id, question.stem);
    } catch (err) {
      console.error("Swap failed", err);
    } finally {
      setIsSwapping(false);
    }
  };

  const handleSaveToBank = async () => {
    if (!question.rule_id) {
      alert("Please link a safety rule before saving to the Question Bank.");
      return;
    }
    setSavingToBank(true);
    try {
      await saveQuestionToBank(question.id);
      setSavedToBankSuccess(true);
      setTimeout(() => setSavedToBankSuccess(false), 2000);
    } catch (err: any) {
      alert(err.message || "Failed to save to question bank");
    } finally {
      setSavingToBank(false);
    }
  };

  const handleChangeQuestionType = (newType: "MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK" | "MULTI_SELECT") => {
    if (newType === question.question_type) return;
    // Show confirmation warning if payload has options/text
    setShowTypeConfirm(newType);
  };

  const confirmTypeChange = (newType: string) => {
    let newPayload: any = {};
    if (newType === "MCQ") {
      newPayload = {
        options: ["Option 1", "Option 2", "Option 3", "Option 4"],
        correct_option_index: 0,
      };
    } else if (newType === "TRUE_FALSE") {
      newPayload = {
        options: ["True", "False"],
        correct_option_index: 0,
        statement_true: question.stem,
        statement_false: `It is optional that ${question.stem.toLowerCase()}`,
      };
    } else if (newType === "MULTI_SELECT") {
      newPayload = {
        options: ["Item 1", "Item 2", "Item 3", "Item 4"],
        correct_option_indices: [0, 1],
      };
    } else if (newType === "FILL_IN_BLANK") {
      newPayload = {
        options: null,
        correct_answer: "required value",
        blank_answer_variants: ["required value"],
      };
    }

    onUpdate({
      question_type: newType as any,
      payload: newPayload,
    });
    setShowTypeConfirm(null);
  };

  // ---------------------------------------------------------------------------
  // Option mutators for MCQ & MULTI_SELECT
  // ---------------------------------------------------------------------------

  const updateOptionText = (optIdx: number, text: string) => {
    const opts = [...(payload.options || [])];
    opts[optIdx] = text;
    onUpdate({ payload: { ...payload, options: opts } });
  };

  const addOption = () => {
    const opts = [...(payload.options || [])];
    if (opts.length >= 6) return;
    opts.push(`Option ${opts.length + 1}`);
    onUpdate({ payload: { ...payload, options: opts } });
  };

  const removeOption = (optIdx: number) => {
    const opts = [...(payload.options || [])];
    if (opts.length <= 2) return;
    opts.splice(optIdx, 1);
    let nextCorrect = payload.correct_option_index;
    if (nextCorrect >= opts.length) nextCorrect = 0;
    onUpdate({
      payload: {
        ...payload,
        options: opts,
        correct_option_index: nextCorrect,
      },
    });
  };

  const toggleMultiSelectOption = (optIdx: number) => {
    const indices: number[] = Array.isArray(payload.correct_option_indices)
      ? [...payload.correct_option_indices]
      : [];
    const exists = indices.includes(optIdx);
    const next = exists ? indices.filter((i) => i !== optIdx) : [...indices, optIdx];
    onUpdate({ payload: { ...payload, correct_option_indices: next } });
  };

  // FIB helpers
  const insertBlankInStem = () => {
    if (question.stem.includes("_____")) {
      alert("A fill-in-the-blank stem can only contain exactly one blank (_____).");
      return;
    }
    onUpdate({ stem: `${question.stem.trim()} _____` });
  };

  const addVariantChip = (chip: string) => {
    if (!chip.trim()) return;
    const variants = [...(payload.blank_answer_variants || [])];
    if (!variants.includes(chip.trim())) {
      variants.push(chip.trim());
      onUpdate({ payload: { ...payload, blank_answer_variants: variants } });
    }
  };

  const removeVariantChip = (chip: string) => {
    const variants = (payload.blank_answer_variants || []).filter((v: string) => v !== chip);
    onUpdate({ payload: { ...payload, blank_answer_variants: variants } });
  };

  return (
    <div
      ref={setNodeRef}
      className={`card question-card ${isExpanded ? "expanded" : "collapsed"}`}
      style={{
        ...style,
        padding: isExpanded ? 20 : "12px 16px",
        background: "var(--surface)",
        border: isExpanded
          ? "1px solid var(--accent)"
          : "1px solid var(--border)",
        boxShadow: isExpanded ? "var(--shadow-card)" : "none",
        transition: "all 0.2s ease",
      }}
    >
      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CARD TOP / COLLAPSED HEADER */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
        }}
        onClick={onToggleExpand}
      >
        {/* Drag Handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag question to reorder"
          style={{
            cursor: "grab",
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary, #64748b)",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <iconify-icon icon="lucide:grip-vertical" style={{ fontSize: 18 }} />
        </button>

        {/* Number Badge */}
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "rgba(6, 182, 212, 0.15)",
            color: "var(--cyan, #06b6d4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>

        {/* Stem Preview (Collapsed) or Header Title */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {!isExpanded ? (
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {question.stem || "Empty question stem..."}
            </span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary, #94a3b8)", textTransform: "uppercase" }}>
              Editing Question #{index + 1}
            </span>
          )}
        </div>

        {/* Status Chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <span className="badge badge-cyan" style={{ fontSize: 10 }}>
            {question.question_type}
          </span>
          <span
            className={`badge badge-${
              question.difficulty === "hard" ? "rose" : question.difficulty === "medium" ? "amber" : "emerald"
            }`}
            style={{ fontSize: 10 }}
          >
            {question.difficulty}
          </span>
          <span className="badge badge-secondary" style={{ fontSize: 10 }}>
            {question.marks} pt
          </span>
          <span
            className="badge badge-purple"
            style={{ fontSize: 10, textTransform: "capitalize" }}
            title={`Origin: ${question.origin}`}
          >
            {question.origin || "AI"}
          </span>

          {/* Pin Lock Button */}
          <button
            type="button"
            onClick={handleTogglePin}
            style={{
              background: "transparent",
              border: "none",
              color: question.is_locked ? "var(--amber, #f59e0b)" : "var(--text-tertiary, #64748b)",
              padding: 4,
              cursor: "pointer",
            }}
            title={question.is_locked ? "Pinned (Protected from bulk regeneration)" : "Click to Pin"}
          >
            <iconify-icon
              icon={question.is_locked ? "lucide:pin-off" : "lucide:pin"}
              style={{ fontSize: 16 }}
            />
          </button>

          {/* Expand/Collapse Chevron */}
          <button
            type="button"
            onClick={onToggleExpand}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #94a3b8)",
              padding: 4,
              cursor: "pointer",
            }}
          >
            <iconify-icon
              icon={isExpanded ? "lucide:chevron-up" : "lucide:chevron-down"}
              style={{ fontSize: 18 }}
            />
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* EXPANDED EDITOR BODY */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {isExpanded && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Stem Input with FIB blank inserter */}
          <div className="field-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="field-label" style={{ margin: 0 }}>
                Question Stem
              </label>
              {question.question_type === "FILL_IN_BLANK" && (
                <button
                  type="button"
                  onClick={insertBlankInStem}
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: "3px 8px" }}
                >
                  <iconify-icon icon="lucide:underline" style={{ marginRight: 4 }} />
                  Insert Blank (_____)
                </button>
              )}
            </div>
            <textarea
              className="field-input"
              rows={3}
              value={question.stem}
              placeholder="Enter clear, industrial-grounded safety question stem..."
              onChange={(e) => onUpdate({ stem: e.target.value })}
              style={{ fontSize: 14, lineHeight: 1.5, resize: "vertical" }}
            />
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* TYPE-SPECIFIC EDITORS */}
          {/* ───────────────────────────────────────────────────────────────── */}

          {/* 1. MCQ Editor */}
          {question.question_type === "MCQ" && (
            <div className="field-group">
              <label className="field-label">Answer Options (Radio denotes correct answer)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(payload.options || ["Option A", "Option B", "Option C", "Option D"]).map(
                  (opt: string, optIdx: number) => {
                    const isCorrect = payload.correct_option_index === optIdx;
                    return (
                      <div
                        key={optIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: isCorrect ? "rgba(16, 185, 129, 0.08)" : "transparent",
                          border: isCorrect ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid transparent",
                        }}
                      >
                        <input
                          type="radio"
                          name={`correct-${question.id}`}
                          checked={isCorrect}
                          onChange={() => onUpdate({ payload: { ...payload, correct_option_index: optIdx } })}
                          style={{ width: 16, height: 16, accentColor: "var(--emerald, #10b981)", cursor: "pointer" }}
                          title="Mark as correct answer"
                        />
                        <input
                          type="text"
                          className="field-input"
                          value={opt}
                          onChange={(e) => updateOptionText(optIdx, e.target.value)}
                          style={{ flex: 1, fontSize: 13 }}
                        />
                        {(payload.options?.length || 4) > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(optIdx)}
                            className="btn btn-ghost"
                            style={{ color: "var(--rose, #f43f5e)", padding: 4 }}
                            title="Remove option"
                          >
                            <iconify-icon icon="lucide:x" style={{ fontSize: 16 }} />
                          </button>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary, #64748b)" }}>
                  Hint: 4 options recommended (min 2, max 6).
                </span>
                {(payload.options?.length || 4) < 6 && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "4px 10px", color: "var(--cyan, #06b6d4)" }}
                  >
                    + Add Option
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. TRUE_FALSE Editor */}
          {question.question_type === "TRUE_FALSE" && (
            <div className="field-group">
              <label className="field-label">Correct True/False Answer</label>
              <div style={{ display: "flex", gap: 12, maxWidth: 320 }}>
                {["True", "False"].map((val, idx) => {
                  const isSelected = payload.correct_option_index === idx;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => onUpdate({ payload: { ...payload, correct_option_index: idx } })}
                      className={`btn ${isSelected ? "btn-primary" : "btn-ghost"}`}
                      style={{
                        flex: 1,
                        padding: "10px",
                        fontWeight: 700,
                        border: isSelected ? "none" : "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. MULTI_SELECT Editor */}
          {question.question_type === "MULTI_SELECT" && (
            <div className="field-group">
              <label className="field-label">Options (Checkboxes denote all correct answers)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(payload.options || ["Option 1", "Option 2", "Option 3", "Option 4"]).map(
                  (opt: string, optIdx: number) => {
                    const currentIndices: number[] = Array.isArray(payload.correct_option_indices)
                      ? payload.correct_option_indices
                      : [];
                    const isChecked = currentIndices.includes(optIdx);

                    return (
                      <div
                        key={optIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: isChecked ? "rgba(168, 85, 247, 0.08)" : "transparent",
                          border: isChecked ? "1px solid rgba(168, 85, 247, 0.25)" : "1px solid transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMultiSelectOption(optIdx)}
                          style={{ width: 16, height: 16, accentColor: "var(--purple, #a855f7)", cursor: "pointer" }}
                          title="Toggle correct"
                        />
                        <input
                          type="text"
                          className="field-input"
                          value={opt}
                          onChange={(e) => updateOptionText(optIdx, e.target.value)}
                          style={{ flex: 1, fontSize: 13 }}
                        />
                        {(payload.options?.length || 4) > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(optIdx)}
                            className="btn btn-ghost"
                            style={{ color: "var(--rose, #f43f5e)", padding: 4 }}
                          >
                            <iconify-icon icon="lucide:x" style={{ fontSize: 16 }} />
                          </button>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "var(--purple, #a855f7)" }}>
                  * Multi-select scoring note: All-or-nothing grading rule applies.
                </span>
                {(payload.options?.length || 4) < 6 && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "4px 10px", color: "var(--purple, #a855f7)" }}
                  >
                    + Add Option
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 4. FILL_IN_BLANK Editor */}
          {question.question_type === "FILL_IN_BLANK" && (
            <div className="field-group">
              <label className="field-label">Accepted Answers (Primary + Variant Chips)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {(payload.blank_answer_variants || [payload.correct_answer || "12 cal/cm2"]).map((v: string) => (
                  <span
                    key={v}
                    className="badge badge-emerald"
                    style={{ fontSize: 12, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span>{v}</span>
                    <button
                      type="button"
                      onClick={() => removeVariantChip(v)}
                      style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 0 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  id={`variant-input-${question.id}`}
                  className="field-input"
                  placeholder="Type acceptable spelling/unit variant and press Add..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addVariantChip((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                  style={{ flex: 1, fontSize: 13 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`variant-input-${question.id}`) as HTMLInputElement;
                    if (el && el.value) {
                      addVariantChip(el.value);
                      el.value = "";
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                >
                  Add Variant
                </button>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* COMMON ROW: Difficulty, Marks, Linked Rule, Change Type */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              paddingTop: 12,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Difficulty */}
            <div className="field-group">
              <label className="field-label">Difficulty</label>
              <select
                className="field-select"
                value={question.difficulty}
                onChange={(e) => onUpdate({ difficulty: e.target.value as any })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* Marks */}
            <div className="field-group">
              <label className="field-label">Marks</label>
              <input
                type="number"
                min={1}
                max={20}
                className="field-input"
                value={question.marks}
                onChange={(e) => onUpdate({ marks: Math.max(1, parseInt(e.target.value) || 1) })}
              />
            </div>

            {/* Change Type Dropdown */}
            <div className="field-group">
              <label className="field-label">Change Question Type</label>
              <select
                className="field-select"
                value={question.question_type}
                onChange={(e) => handleChangeQuestionType(e.target.value as any)}
              >
                <option value="MCQ">Multiple Choice</option>
                <option value="TRUE_FALSE">True / False</option>
                <option value="FILL_IN_BLANK">Fill in Blank</option>
                <option value="MULTI_SELECT">Multi-Select</option>
              </select>
            </div>

            {/* Linked Rule Button */}
            <div className="field-group">
              <label className="field-label">Linked Rule</label>
              <button
                type="button"
                onClick={() => setShowRulePicker(true)}
                className="btn btn-secondary"
                style={{ width: "100%", justifyContent: "space-between", fontSize: 12 }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {linkedRule ? `${linkedRule.rule_code}` : "Link Safety Rule..."}
                </span>
                <iconify-icon icon="lucide:link" />
              </button>
            </div>
          </div>

          {/* Explanation Textarea */}
          <div className="field-group">
            <label className="field-label">Explanation & Feedback (Optional)</label>
            <textarea
              className="field-input"
              rows={2}
              value={question.explanation || ""}
              placeholder="Why this is correct; quotes the safety rule clause for trainee feedback..."
              onChange={(e) => onUpdate({ explanation: e.target.value })}
              style={{ fontSize: 12, resize: "vertical" }}
            />
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* ACTION BUTTONS TOOLBAR */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              paddingTop: 12,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Left Actions: Duplicate, Delete, Save to Bank */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={onDuplicate}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "6px 12px" }}
                title="Duplicate Question"
              >
                <iconify-icon icon="lucide:copy" style={{ marginRight: 6 }} />
                Duplicate
              </button>

              <button
                type="button"
                onClick={onDelete}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "6px 12px", color: "var(--rose, #f43f5e)" }}
                title="Delete Question (Undo available)"
              >
                <iconify-icon icon="lucide:trash-2" style={{ marginRight: 6 }} />
                Delete
              </button>

              <button
                type="button"
                onClick={handleSaveToBank}
                disabled={savingToBank}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "6px 12px" }}
                title="Export this question into the central Question Bank"
              >
                <iconify-icon icon="lucide:bookmark" style={{ marginRight: 6 }} />
                {savedToBankSuccess ? "✓ Saved to Bank" : "Save to Bank"}
              </button>
            </div>

            {/* Right Actions: Instant Swap & AI Regenerate */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Swap Button */}
              <button
                type="button"
                onClick={handleOpenSwap}
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "6px 12px" }}
                title="Swap with pre-approved bank variant (Instant)"
              >
                <iconify-icon icon="lucide:zap" style={{ marginRight: 6, color: "var(--amber, #f59e0b)" }} />
                Swap (Instant)
              </button>

              {/* Regenerate AI Button */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowRegenPopover(!showRegenPopover)}
                  disabled={isRegenerating || question.is_locked}
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  title={question.is_locked ? "Question is pinned" : "Regenerate variation ladder"}
                >
                  <iconify-icon
                    icon={isRegenerating ? "lucide:loader-2" : "lucide:sparkles"}
                    className={isRegenerating ? "spin" : ""}
                    style={{ marginRight: 6 }}
                  />
                  {isRegenerating ? "Synthesizing..." : "Regenerate (AI)"}
                </button>

                {/* Regenerate Popover */}
                {showRegenPopover && (
                  <div
                    className="card"
                    style={{
                      position: "absolute",
                      right: 0,
                      bottom: "100%",
                      marginBottom: 8,
                      width: 320,
                      padding: 16,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      boxShadow: "var(--shadow-dropdown)",
                      zIndex: 30,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
                      ✨ AI Regenerate Ladder
                    </div>

                    <div className="field-group" style={{ marginBottom: 10 }}>
                      <label className="field-label">Variation Mode</label>
                      <select
                        className="field-select"
                        value={regenOptions.mode}
                        onChange={(e) => setRegenOptions({ ...regenOptions, mode: e.target.value as any })}
                      >
                        <option value="same_rule">Same Rule (Alternate Clause/Style)</option>
                        <option value="other_rule">Other Approved Rule in Section</option>
                      </select>
                    </div>

                    <div className="field-group" style={{ marginBottom: 10 }}>
                      <label className="field-label">Focus Hint (Optional)</label>
                      <input
                        type="text"
                        className="field-input"
                        placeholder="e.g. Ask about 12 cal/cm2 rating"
                        value={regenOptions.focus_hint}
                        onChange={(e) => setRegenOptions({ ...regenOptions, focus_hint: e.target.value })}
                        style={{ fontSize: 12 }}
                      />
                    </div>

                    {regenError && (
                      <div style={{ color: "var(--rose, #f43f5e)", fontSize: 11, marginBottom: 10, lineHeight: 1.4 }}>
                        {regenError}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => setShowRegenPopover(false)}
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: "4px 8px" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteRegenerate}
                        disabled={isRegenerating}
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: "4px 12px" }}
                      >
                        Run Ladder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* MODALS: RULE PICKER, INSTANT SWAP, TYPE CHANGE CONFIRM */}
      {/* ───────────────────────────────────────────────────────────────────── */}

      {/* Rule Picker Popover / Modal */}
      {showRulePicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            background: "rgba(3,7,18,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 640,
              width: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              padding: 24,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-dropdown)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Link Safety Rule</h3>
              <button type="button" onClick={() => setShowRulePicker(false)} className="btn btn-ghost" style={{ padding: 4 }}>
                <iconify-icon icon="lucide:x" style={{ fontSize: 20 }} />
              </button>
            </div>

            <input
              type="text"
              className="field-input"
              placeholder="Search rule code or text..."
              value={ruleSearch}
              onChange={(e) => setRuleSearch(e.target.value)}
              style={{ marginBottom: 16 }}
            />

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {rulesList
                .filter((r) =>
                  ruleSearch ? r.rule_code.toLowerCase().includes(ruleSearch.toLowerCase()) || r.text.toLowerCase().includes(ruleSearch.toLowerCase()) : true
                )
                .map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      onUpdate({ rule_id: r.id });
                      setShowRulePicker(false);
                    }}
                    className="card"
                    style={{
                      padding: 12,
                      background: question.rule_id === r.id ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.02)",
                      border: question.rule_id === r.id ? "1px solid var(--cyan, #06b6d4)" : "1px solid rgba(255,255,255,0.08)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--cyan, #06b6d4)" }}>{r.rule_code}</span>
                      <span className="badge badge-secondary" style={{ fontSize: 10 }}>Risk Score: {r.risk_score}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-secondary, #94a3b8)", lineHeight: 1.4 }}>{r.text}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Instant Swap Modal */}
      {showSwapModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            background: "rgba(3,7,18,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 680,
              width: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              padding: 24,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-dropdown)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Instant Swap (Question Bank)</h3>
                <p style={{ fontSize: 12, color: "var(--muted)" }}>
                  Up to 5 approved bank alternatives matching {question.question_type} ({question.difficulty}). Same rule prioritized.
                </p>
              </div>
              <button type="button" onClick={() => setShowSwapModal(false)} className="btn btn-ghost" style={{ padding: 4 }}>
                <iconify-icon icon="lucide:x" style={{ fontSize: 20 }} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {loadingAlts ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
                  Fetching approved alternatives...
                </div>
              ) : alternatives.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
                  No alternative approved bank variants available for this rule and difficulty. Use AI Regenerate instead.
                </div>
              ) : (
                alternatives.map((alt) => (
                  <div
                    key={alt.id}
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
                        {alt.is_same_rule && (
                          <span className="badge badge-emerald" style={{ fontSize: 10 }}>
                            ★ Same Rule
                          </span>
                        )}
                        <span className="badge badge-cyan" style={{ fontSize: 10 }}>{alt.question_type}</span>
                        <span className="badge badge-secondary" style={{ fontSize: 10 }}>{alt.difficulty}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", lineHeight: 1.4 }}>
                        {alt.stem}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleExecuteSwap(alt.id)}
                      disabled={isSwapping}
                      className="btn btn-primary"
                      style={{ fontSize: 12, padding: "6px 14px", whiteSpace: "nowrap" }}
                    >
                      {isSwapping ? "Swapping..." : "Swap In"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change Type Confirmation Modal */}
      {showTypeConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            backdropFilter: "blur(4px)",
          }}
        >
          <div className="card" style={{ maxWidth: 420, padding: 24, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-dropdown)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
              Change Question Type to {showTypeConfirm}?
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
              Changing question types will reset existing answer options and match format to default {showTypeConfirm} structure. The stem will be preserved.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowTypeConfirm(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmTypeChange(showTypeConfirm)}
                className="btn btn-primary"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
