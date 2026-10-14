/**
 * StructureStep.tsx
 * Step 2: Section Planning, Type Mix, Difficulty Mix, Topic Filters, Preflight Feasibility, and Templates
 */

import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ExamSectionModel,
  DraftFeasibilityResponse,
  getHierarchyTree,
  HierarchyTreeResponse,
} from "../../api";
import { saveCustomTemplate } from "./templates";

interface StructureStepProps {
  draftId?: string;
  sections: ExamSectionModel[];
  onAddSection: () => void;
  onUpdateSection: (sectionId: string, updates: Partial<ExamSectionModel>) => void;
  onDeleteSection: (sectionId: string) => void;
  onReorderSections: (newSections: ExamSectionModel[]) => void;
  feasibilityReport: DraftFeasibilityResponse | null;
  onRefreshFeasibility?: (report: DraftFeasibilityResponse) => void;
}

// Sortable Section Card Component
const SortableSectionCard: React.FC<{
  section: ExamSectionModel;
  index: number;
  totalSections: number;
  hierarchy: HierarchyTreeResponse | null;
  onUpdate: (updates: Partial<ExamSectionModel>) => void;
  onDelete: () => void;
  feasibilityReport: DraftFeasibilityResponse | null;
}> = ({
  section,
  index,
  totalSections,
  hierarchy,
  onUpdate,
  onDelete,
  feasibilityReport,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const [showTopicFilter, setShowTopicFilter] = useState(false);

  // Type mix values
  const typeMix = section.type_mix || {};
  const mcq = typeMix.MCQ || 0;
  const tf = typeMix.TRUE_FALSE || 0;
  const fib = typeMix.FILL_IN_BLANK || 0;
  const ms = typeMix.MULTI_SELECT || 0;
  const typeTotal = mcq + tf + fib + ms;

  // Difficulty mix values
  const diffMix = section.difficulty_mix || {};
  const easy = diffMix.easy || 0;
  const med = diffMix.medium || 0;
  const hard = diffMix.hard || 0;
  const diffTotal = easy + med + hard;

  // Target count
  const targetCount = section.questions?.length > 0 ? Math.max(typeTotal, section.questions.length) : (typeTotal || 5);

  // Validation diffs
  const typeDiff = typeTotal - targetCount;
  const diffDiff = diffTotal - targetCount;

  // Feasibility status for this section
  const sectionReport = feasibilityReport?.sections?.find((s) => s.section_id === section.id);

  // Helper to adjust type mix
  const setTypeVal = (typeKey: "MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK" | "MULTI_SELECT", val: number) => {
    const next = { ...typeMix, [typeKey]: Math.max(0, val) };
    onUpdate({ type_mix: next });
  };

  // Helper to adjust diff mix
  const setDiffVal = (diffKey: "easy" | "medium" | "hard", val: number) => {
    const next = { ...diffMix, [diffKey]: Math.max(0, val) };
    onUpdate({ difficulty_mix: next });
  };

  // Preset chips
  const applyDiffPreset = (preset: "balanced" | "company4060" | "allMedium") => {
    const count = targetCount;
    if (preset === "allMedium") {
      onUpdate({ difficulty_mix: { easy: 0, medium: count, hard: 0 } });
    } else if (preset === "company4060") {
      const m = Math.round(count * 0.4);
      const h = count - m;
      onUpdate({ difficulty_mix: { easy: 0, medium: m, hard: h } });
    } else if (preset === "balanced") {
      const e = Math.floor(count / 3);
      const m = Math.floor(count / 3);
      const h = count - (e + m);
      onUpdate({ difficulty_mix: { easy: e, medium: m, hard: h } });
    }
  };

  // Type shortcuts
  const applyTypeShortcut = (shortcut: "allMcq" | "allTf" | "balanced") => {
    const count = targetCount;
    if (shortcut === "allMcq") {
      onUpdate({ type_mix: { MCQ: count, TRUE_FALSE: 0, FILL_IN_BLANK: 0, MULTI_SELECT: 0 } });
    } else if (shortcut === "allTf") {
      onUpdate({ type_mix: { MCQ: 0, TRUE_FALSE: count, FILL_IN_BLANK: 0, MULTI_SELECT: 0 } });
    } else if (shortcut === "balanced") {
      const each = Math.floor(count / 4);
      const rem = count - each * 4;
      onUpdate({
        type_mix: {
          MCQ: each + rem,
          TRUE_FALSE: each,
          FILL_IN_BLANK: each,
          MULTI_SELECT: each,
        },
      });
    }
  };

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={{
        ...style,
        padding: 24,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        position: "relative",
      }}
    >
      {/* Header Row: Drag Handle, Number, Title, Delete */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag section to reorder"
          style={{
            cursor: "grab",
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            padding: 4,
            display: "flex",
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <iconify-icon icon="lucide:grip-vertical" style={{ fontSize: 20 }} />
        </button>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--accent)",
                fontFamily: "monospace",
              }}
            >
              SECTION {index + 1} OF {totalSections}
            </span>
          </div>
          <input
            type="text"
            className="field-input"
            value={section.title}
            placeholder={`Section ${index + 1} Title (e.g. Electrical Safety Protocols)`}
            onChange={(e) => onUpdate({ title: e.target.value })}
            style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}
          />
          <textarea
            className="field-input"
            rows={2}
            value={section.instructions || ""}
            placeholder="Instructions for worker taking this section..."
            onChange={(e) => onUpdate({ instructions: e.target.value })}
            style={{ fontSize: 13, resize: "vertical" }}
          />
        </div>

        {totalSections > 1 && (
          <button
            type="button"
            onClick={onDelete}
            className="btn btn-ghost"
            style={{ color: "var(--rose, #f43f5e)", padding: 6 }}
            title="Remove Section"
          >
            <iconify-icon icon="lucide:trash-2" style={{ fontSize: 18 }} />
          </button>
        )}
      </div>

      {/* Grid: Question Count, Marks, Topic Filter, Min Pass % */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          padding: "16px 0",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          marginBottom: 16,
        }}
      >
        <div className="field-group">
          <label className="field-label">Target Question Count</label>
          <input
            type="number"
            min={1}
            max={50}
            className="field-input"
            value={targetCount}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value) || 1);
              // Scale type mix proportionately or set on MCQ
              onUpdate({
                type_mix: { ...typeMix, MCQ: Math.max(1, val - (tf + fib + ms)) },
              });
            }}
          />
        </div>

        <div className="field-group">
          <label className="field-label">Marks Per Question</label>
          <input
            type="number"
            min={1}
            max={10}
            className="field-input"
            value={section.marks_per_question}
            onChange={(e) => onUpdate({ marks_per_question: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </div>

        <div className="field-group">
          <label className="field-label">Section Min Pass % (Optional)</label>
          <input
            type="number"
            min={0}
            max={100}
            className="field-input"
            placeholder="e.g. 75"
            value={section.min_pass_percent ?? ""}
            onChange={(e) =>
              onUpdate({ min_pass_percent: e.target.value ? parseInt(e.target.value) : null })
            }
          />
        </div>

        {/* Topic Filter Trigger */}
        <div className="field-group">
          <label className="field-label">Topic Filter</label>
          <button
            type="button"
            onClick={() => setShowTopicFilter(!showTopicFilter)}
            className="btn btn-secondary"
            style={{ width: "100%", justifyContent: "space-between", fontSize: 13 }}
          >
            <span>
              {section.topic_filter?.length
                ? `${section.topic_filter.length} Topics Selected`
                : "All Topics (No Filter)"}
            </span>
            <iconify-icon icon="lucide:chevron-down" />
          </button>
        </div>
      </div>

      {/* Topic Filter Selector Dropdown */}
      {showTopicFilter && hierarchy && (
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-dropdown)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
              Filter by Manual Sections / Subcategories
            </span>
            <button
              type="button"
              onClick={() => onUpdate({ topic_filter: [] })}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              Clear Filter
            </button>
          </div>

          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {hierarchy.manuals?.flatMap((m) =>
              m.sections?.flatMap((sec) => [
                <label
                  key={sec.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={section.topic_filter?.includes(sec.name)}
                    onChange={(e) => {
                      const cur = section.topic_filter || [];
                      const next = e.target.checked ? [...cur, sec.name] : cur.filter((t) => t !== sec.name);
                      onUpdate({ topic_filter: next });
                    }}
                  />
                  <span>📁 {sec.name}</span>
                </label>,
                ...(sec.subcategories || []).map((sub) => (
                  <label
                    key={sub.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color: "var(--muted)",
                      paddingLeft: 20,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={section.topic_filter?.includes(sub.name)}
                      onChange={(e) => {
                        const cur = section.topic_filter || [];
                        const next = e.target.checked ? [...cur, sub.name] : cur.filter((t) => t !== sub.name);
                        onUpdate({ topic_filter: next });
                      }}
                    />
                    <span>• {sub.name} ({sub.active_rules_count} rules)</span>
                  </label>
                )),
              ])
            )}
          </div>
        </div>
      )}

      {/* TYPE MIX SECTION */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Type Mix</span>
            {/* Live Validation Chip */}
            <span
              className={`badge badge-${typeDiff === 0 ? "emerald" : "rose"}`}
              style={{ fontSize: 11 }}
            >
              Total: {typeTotal} / {targetCount} {typeDiff === 0 ? "✓" : `(${typeDiff > 0 ? `+${typeDiff}` : typeDiff})`}
            </span>
          </div>

          {/* Type Shortcuts */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => applyTypeShortcut("allMcq")}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              All MCQ
            </button>
            <button
              type="button"
              onClick={() => applyTypeShortcut("allTf")}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              All True/False
            </button>
            <button
              type="button"
              onClick={() => applyTypeShortcut("balanced")}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              Balanced
            </button>
          </div>
        </div>

        {/* 4 Type Steppers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          <div className="card" style={{ padding: 12, background: "var(--raised)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--cyan)", fontWeight: 600, marginBottom: 4 }}>
              Multiple Choice
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setTypeVal("MCQ", mcq - 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                -
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: "center", color: "var(--ink)" }}>{mcq}</span>
              <button
                type="button"
                onClick={() => setTypeVal("MCQ", mcq + 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                +
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 12, background: "var(--raised)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--emerald)", fontWeight: 600, marginBottom: 4 }}>
              True / False
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setTypeVal("TRUE_FALSE", tf - 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                -
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: "center", color: "var(--ink)" }}>{tf}</span>
              <button
                type="button"
                onClick={() => setTypeVal("TRUE_FALSE", tf + 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                +
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 12, background: "var(--raised)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600, marginBottom: 4 }}>
              Fill in Blank
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setTypeVal("FILL_IN_BLANK", fib - 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                -
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: "center", color: "var(--ink)" }}>{fib}</span>
              <button
                type="button"
                onClick={() => setTypeVal("FILL_IN_BLANK", fib + 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                +
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 12, background: "var(--raised)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--purple, #a855f7)", fontWeight: 600, marginBottom: 4 }}>
              Multi-Select
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setTypeVal("MULTI_SELECT", ms - 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                -
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: "center", color: "var(--ink)" }}>{ms}</span>
              <button
                type="button"
                onClick={() => setTypeVal("MULTI_SELECT", ms + 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DIFFICULTY MIX SECTION */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Difficulty Mix</span>
            {/* Live Validation Chip */}
            <span
              className={`badge badge-${diffDiff === 0 ? "emerald" : "rose"}`}
              style={{ fontSize: 11 }}
            >
              Total: {diffTotal} / {targetCount} {diffDiff === 0 ? "✓" : `(${diffDiff > 0 ? `+${diffDiff}` : diffDiff})`}
            </span>
          </div>

          {/* Preset Chips */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => applyDiffPreset("balanced")}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              Balanced
            </button>
            <button
              type="button"
              onClick={() => applyDiffPreset("company4060")}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              Standard 40/60
            </button>
            <button
              type="button"
              onClick={() => applyDiffPreset("allMedium")}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              All Medium
            </button>
          </div>
        </div>

        {/* 3 Difficulty Steppers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <div className="card" style={{ padding: 12, background: "var(--raised)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--emerald)", fontWeight: 600, marginBottom: 4 }}>
              Easy
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setDiffVal("easy", easy - 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                -
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: "center", color: "var(--ink)" }}>{easy}</span>
              <button
                type="button"
                onClick={() => setDiffVal("easy", easy + 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                +
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 12, background: "var(--raised)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600, marginBottom: 4 }}>
              Medium
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setDiffVal("medium", med - 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                -
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: "center", color: "var(--ink)" }}>{med}</span>
              <button
                type="button"
                onClick={() => setDiffVal("medium", med + 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                +
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 12, background: "var(--raised)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--rose)", fontWeight: 600, marginBottom: 4 }}>
              Hard
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setDiffVal("hard", hard - 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                -
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: "center", color: "var(--ink)" }}>{hard}</span>
              <button
                type="button"
                onClick={() => setDiffVal("hard", hard + 1)}
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Shuffle Toggles */}
      <div style={{ display: "flex", gap: 24, fontSize: 12, color: "var(--text-secondary, #94a3b8)", marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={section.shuffle_questions}
            onChange={(e) => onUpdate({ shuffle_questions: e.target.checked })}
            style={{ accentColor: "var(--cyan, #06b6d4)" }}
          />
          <span>Shuffle Questions Order</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={section.shuffle_options}
            onChange={(e) => onUpdate({ shuffle_options: e.target.checked })}
            style={{ accentColor: "var(--cyan, #06b6d4)" }}
          />
          <span>Shuffle Options (A-D)</span>
        </label>
      </div>

      {/* Per-Section Feasibility Banner (if planned) */}
      {sectionReport && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background:
              sectionReport.overall_status === "in_bank"
                ? "rgba(16, 185, 129, 0.1)"
                : sectionReport.overall_status === "needs_generation"
                ? "rgba(245, 158, 11, 0.1)"
                : "rgba(244, 63, 94, 0.1)",
            border: `1px solid ${
              sectionReport.overall_status === "in_bank"
                ? "rgba(16, 185, 129, 0.3)"
                : sectionReport.overall_status === "needs_generation"
                ? "rgba(245, 158, 11, 0.3)"
                : "rgba(244, 63, 94, 0.3)"
            }`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              className={`badge badge-${
                sectionReport.overall_status === "in_bank"
                  ? "emerald"
                  : sectionReport.overall_status === "needs_generation"
                  ? "amber"
                  : "rose"
              }`}
            >
              {sectionReport.overall_status === "in_bank"
                ? "FEASIBLE (IN BANK)"
                : sectionReport.overall_status === "needs_generation"
                ? "NEEDS GENERATION"
                : "IMPOSSIBLE"}
            </span>
            <div style={{ fontSize: 12 }}>
              <span style={{ color: "var(--emerald, #10b981)", marginRight: 8 }}>
                ✓ In Bank: {sectionReport.in_bank_count}
              </span>
              <span style={{ color: "var(--amber, #f59e0b)", marginRight: 8 }}>
                ⚡ Needs Gen: {sectionReport.needs_gen_count}
              </span>
              {sectionReport.impossible_count > 0 && (
                <span style={{ color: "var(--rose, #f43f5e)" }}>
                  ✕ Impossible: {sectionReport.impossible_count}
                </span>
              )}
            </div>
          </div>

          {/* One-Click Remediation if Impossible */}
          {sectionReport.impossible_count > 0 && (
            <button
              type="button"
              onClick={() => {
                // Reduce MCQ by impossible count
                const newMcq = Math.max(0, mcq - sectionReport.impossible_count);
                onUpdate({ type_mix: { ...typeMix, MCQ: newMcq } });
              }}
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              Fix: Reduce Count by {sectionReport.impossible_count}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const StructureStep: React.FC<StructureStepProps> = ({
  sections,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onReorderSections,
  feasibilityReport,
}) => {
  const [hierarchy, setHierarchy] = useState<HierarchyTreeResponse | null>(null);
  const [showSaveTplModal, setShowSaveTplModal] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplSavedMessage, setTplSavedMessage] = useState(false);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    getHierarchyTree()
      .then((tree) => setHierarchy(tree))
      .catch((err) => console.error("Could not load hierarchy tree", err));
  }, []);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({
          ...s,
          order_index: idx,
        }));
        onReorderSections(reordered);
      }
    }
  };


  const handleSaveAsTemplate = () => {
    if (!tplName.trim()) return;
    saveCustomTemplate({
      name: tplName.trim(),
      description: tplDesc.trim() || `Custom ${sections.length}-section template`,
      category: "custom",
      setup: {
        duration_minutes: 45,
        scoring_mode: "standard",
        pass_percent: 80,
        reveal_score: true,
      },
      sections: sections.map((s) => ({
        title: s.title,
        instructions: s.instructions || "",
        topic_filter: s.topic_filter || [],
        question_count: s.questions?.length || Object.values(s.type_mix || {}).reduce((a, b) => a + b, 0) || 5,
        type_mix: s.type_mix || {},
        difficulty_mix: s.difficulty_mix || {},
        marks_per_question: s.marks_per_question || 1,
        min_pass_percent: s.min_pass_percent || undefined,
        shuffle_questions: s.shuffle_questions,
        shuffle_options: s.shuffle_options,
      })),
    });
    setTplSavedMessage(true);
    setTimeout(() => {
      setTplSavedMessage(false);
      setShowSaveTplModal(false);
      setTplName("");
      setTplDesc("");
    }, 1500);
  };

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Action Bar: Save as Template only */}
      <div
        className="card"
        style={{
          padding: "12px 20px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          <iconify-icon icon="lucide:info" style={{ marginRight: 6, opacity: 0.7 }} />
          Define sections, question types, difficulty mix, and topic filters. Questions will be AI-generated in the next step.
        </div>

        <button
          type="button"
          onClick={() => setShowSaveTplModal(true)}
          className="btn btn-secondary"
          style={{ fontSize: 13, padding: "8px 16px" }}
        >
          <iconify-icon icon="lucide:save" style={{ marginRight: 6 }} />
          Save as Template
        </button>
      </div>

      {/* Sortable Section Cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {sections.map((sec, idx) => (
              <SortableSectionCard
                key={sec.id}
                section={sec}
                index={idx}
                totalSections={sections.length}
                hierarchy={hierarchy}
                onUpdate={(updates) => onUpdateSection(sec.id, updates)}
                onDelete={() => onDeleteSection(sec.id)}
                feasibilityReport={feasibilityReport}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add Section Button */}
      <button
        type="button"
        onClick={onAddSection}
        className="btn btn-secondary"
        style={{
          padding: 16,
          border: "2px dashed var(--border-color, rgba(255,255,255,0.15))",
          background: "rgba(255,255,255,0.02)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <iconify-icon icon="lucide:plus" style={{ fontSize: 18 }} />
        <span>Add Another Exam Section</span>
      </button>

      {/* Save Template Modal */}
      {showSaveTplModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
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
              maxWidth: 460,
              width: "100%",
              padding: 24,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-dropdown)",
            }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
              Save Structure as Template
            </h3>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
              Save current section breakdown and type mix as a reusable template.
            </p>

            <div className="field-group" style={{ marginBottom: 16 }}>
              <label className="field-label">Template Name</label>
              <input
                type="text"
                className="field-input"
                placeholder="e.g. Standard 3-Section Certification"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
              />
            </div>

            <div className="field-group" style={{ marginBottom: 20 }}>
              <label className="field-label">Description (Optional)</label>
              <textarea
                className="field-input"
                rows={2}
                placeholder="Notes about which roles or audits this structure fits..."
                value={tplDesc}
                onChange={(e) => setTplDesc(e.target.value)}
              />
            </div>

            {tplSavedMessage ? (
              <div style={{ color: "var(--emerald, #10b981)", fontWeight: 600, fontSize: 13, textAlign: "center" }}>
                ✓ Template Saved Successfully!
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowSaveTplModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsTemplate}
                  disabled={!tplName.trim()}
                  className="btn btn-primary"
                >
                  Save Template
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
