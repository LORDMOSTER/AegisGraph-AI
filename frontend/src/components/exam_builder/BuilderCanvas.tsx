/**
 * BuilderCanvas.tsx
 * Step 4: Google-Forms-style Exam Builder Canvas
 * 3-Column Layout: Left Rail (Sections), Center Canvas (Sticky Header, Delta Diff, Question Cards, Add Menu),
 * Right Panel (Live Totals, Difficulty Distribution, Live Validation Jump, Worker Preview).
 * Autosave 600ms debounce, Undo/Redo (Ctrl+Z/Ctrl+Shift+Z), Keyboard-accessible Drag & Drop.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
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
  ExamDraftModel,
  ExamSectionModel,
  ExamQuestionModel,
  RuleResponse,
  ValidationResponse,
  ValidationIssue,
  updateExamDraft,
  updateDraftSection,
  createDraftSection,
  deleteDraftSection,
  reorderDraftSections,
  createDraftQuestion,
  updateDraftQuestion,
  deleteDraftQuestion,
  duplicateDraftQuestion,
  reorderDraftQuestions,
  validateDraft,
} from "../../api";
import { QuestionEditorCard } from "./QuestionEditorCard";
import { QuestionBankModal } from "./QuestionBankModal";
import { AIGenerateSlotModal } from "./AIGenerateSlotModal";
import { WorkerPreviewDrawer } from "./WorkerPreviewDrawer";

interface BuilderCanvasProps {
  draft: ExamDraftModel;
  onDraftChange: (newDraft: ExamDraftModel) => void;
  rulesList: RuleResponse[];
  onOpenPreview: () => void;
  onProceedToLock: () => void;
}

// -----------------------------------------------------------------------------
// Left Rail Sortable Section Tab Component
// -----------------------------------------------------------------------------
const SortableSectionTab: React.FC<{
  section: ExamSectionModel;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  hasErrors: boolean;
}> = ({ section, index, isActive, onSelect, hasErrors }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 20 : 1,
  };

  const qCount = section.questions?.length || 0;
  const marks = (section.questions || []).reduce((acc, q) => acc + (q.marks || 1), 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group relative flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
        isActive
          ? "bg-brand-500/10 border-brand-500/50 text-brand-300 shadow-sm shadow-brand-500/10"
          : "bg-surface-elevated/40 hover:bg-surface-elevated/80 border-surface-border/40 hover:border-surface-border text-text-secondary hover:text-text-primary"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-1">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag section"
          onClick={(e) => e.stopPropagation()}
          className="text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <svg className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold text-text-muted">
              S{index + 1}
            </span>
            <span className="text-sm font-medium truncate">
              {section.title || `Section ${index + 1}`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mt-0.5 font-mono">
            <span>{qCount} {qCount === 1 ? "question" : "questions"}</span>
            <span>•</span>
            <span>{marks} pts</span>
          </div>
        </div>
      </div>

      {/* Error indicator */}
      {hasErrors && (
        <span
          title="Contains validation warnings or incomplete items"
          className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0 animate-pulse ring-2 ring-amber-400/20"
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Main BuilderCanvas Component
// -----------------------------------------------------------------------------
export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({
  draft,
  onDraftChange,
  rulesList,
  onOpenPreview,
  onProceedToLock,
}) => {
  // Current active section
  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    return draft.sections[0]?.id || "";
  });

  // Expand / collapse states for questions
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    // Default: expand first question of active section
    if (draft.sections[0]?.questions?.[0]) {
      s.add(draft.sections[0].questions[0].id);
    }
    return s;
  });

  // Settings drawer state for sticky section header
  const [showSectionSettings, setShowSectionSettings] = useState(false);

  // Modals
  const [showBankModal, setShowBankModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Validation state
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Autosave status
  const [autosaveStatus, setAutosaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const saveTimeoutRef = useRef<any>(null);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<ExamDraftModel[]>([draft]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Soft-deleted question undo toast
  const [deletedUndoItem, setDeletedUndoItem] = useState<{
    question: ExamQuestionModel;
    sectionId: string;
    index: number;
  } | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Get active section
  const activeSection = draft.sections.find((s) => s.id === activeSectionId) || draft.sections[0];
  const activeSectionIndex = draft.sections.findIndex((s) => s.id === activeSectionId);

  // Sync active section if deleted or not set
  useEffect(() => {
    if (!draft.sections.some((s) => s.id === activeSectionId) && draft.sections.length > 0) {
      setActiveSectionId(draft.sections[0].id);
    }
  }, [draft.sections, activeSectionId]);

  // ---------------------------------------------------------------------------
  // Validation Trigger
  // ---------------------------------------------------------------------------
  const runValidation = useCallback(async () => {
    try {
      setIsValidating(true);
      const res = await validateDraft(draft.id);
      setValidation(res);
    } catch (err) {
      console.error("Live validation failed:", err);
    } finally {
      setIsValidating(false);
    }
  }, [draft.id]);

  useEffect(() => {
    runValidation();
  }, [draft.sections, runValidation]);

  // ---------------------------------------------------------------------------
  // Autosave with 600ms debounce
  // ---------------------------------------------------------------------------
  const triggerAutosave = useCallback(
    (newDraft: ExamDraftModel) => {
      setAutosaveStatus("saving");
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await updateExamDraft(newDraft.id, {
            title: newDraft.title,
            duration_minutes: newDraft.duration_minutes,
            scoring_mode: newDraft.scoring_mode,
            pass_percent: newDraft.pass_percent,
            reveal_score: newDraft.reveal_score,
            available_from: newDraft.available_from,
            available_until: newDraft.available_until,
          });
          setAutosaveStatus("saved");
        } catch (err) {
          console.error("Autosave draft failed", err);
          setAutosaveStatus("error");
        }
      }, 600);
    },
    []
  );

  // Update draft and record in history
  const commitDraftUpdate = (newDraft: ExamDraftModel, addToHistory = true) => {
    onDraftChange(newDraft);
    triggerAutosave(newDraft);

    if (addToHistory) {
      setHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        return [...next, newDraft];
      });
      setHistoryIndex((prev) => prev + 1);
    }
  };

  // ---------------------------------------------------------------------------
  // Undo / Redo Keydown listeners (Ctrl+Z / Ctrl+Shift+Z)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          // Redo
          if (historyIndex < history.length - 1) {
            e.preventDefault();
            const nextDraft = history[historyIndex + 1];
            setHistoryIndex((prev) => prev + 1);
            onDraftChange(nextDraft);
            triggerAutosave(nextDraft);
          }
        } else {
          // Undo
          if (historyIndex > 0) {
            e.preventDefault();
            const prevDraft = history[historyIndex - 1];
            setHistoryIndex((prev) => prev - 1);
            onDraftChange(prevDraft);
            triggerAutosave(prevDraft);
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        // Redo alternative
        if (historyIndex < history.length - 1) {
          e.preventDefault();
          const nextDraft = history[historyIndex + 1];
          setHistoryIndex((prev) => prev + 1);
          onDraftChange(nextDraft);
          triggerAutosave(nextDraft);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, historyIndex, onDraftChange, triggerAutosave]);

  // ---------------------------------------------------------------------------
  // Section Actions
  // ---------------------------------------------------------------------------
  const handleAddSection = async () => {
    try {
      const created = await createDraftSection(draft.id, {
        title: `Section ${draft.sections.length + 1}`,
        instructions: "Read the questions carefully and select the best answer.",
        type_mix: { MCQ: 3, TRUE_FALSE: 1 },
        difficulty_mix: { easy: 1, medium: 2, hard: 1 },
        question_count: 4,
        marks_per_question: 1,
        order_index: draft.sections.length,
      });

      const updatedDraft: ExamDraftModel = {
        ...draft,
        sections: [...draft.sections, created],
      };
      commitDraftUpdate(updatedDraft);
      setActiveSectionId(created.id);
    } catch (err) {
      console.error("Failed to add section", err);
    }
  };

  const handleUpdateActiveSection = (updates: Partial<ExamSectionModel>) => {
    if (!activeSection) return;
    const updatedSections = draft.sections.map((sec) =>
      sec.id === activeSection.id ? { ...sec, ...updates } : sec
    );
    const updatedDraft = { ...draft, sections: updatedSections };
    commitDraftUpdate(updatedDraft);

    // Persist section updates
    updateDraftSection(activeSection.id, updates).catch((err) =>
      console.error("Update section failed", err)
    );
  };

  const handleDeleteActiveSection = async () => {
    if (!activeSection) return;
    if (draft.sections.length <= 1) {
      alert("An exam must have at least one section.");
      return;
    }
    if (!confirm(`Are you sure you want to delete "${activeSection.title}" and its questions?`)) {
      return;
    }

    try {
      await deleteDraftSection(activeSection.id);
      const remaining = draft.sections.filter((s) => s.id !== activeSection.id);
      const updatedDraft = { ...draft, sections: remaining };
      commitDraftUpdate(updatedDraft);
      setActiveSectionId(remaining[0].id);
    } catch (err) {
      console.error("Delete section failed", err);
    }
  };

  const handleSectionsDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draft.sections.findIndex((s) => s.id === active.id);
    const newIndex = draft.sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(draft.sections, oldIndex, newIndex).map((s, idx) => ({
      ...s,
      order_index: idx,
    }));

    const updatedDraft = { ...draft, sections: reordered };
    commitDraftUpdate(updatedDraft);

    try {
      await reorderDraftSections(
        draft.id,
        reordered.map((s, idx) => ({ id: s.id, order_index: idx }))
      );
    } catch (err) {
      console.error("Reorder sections failed", err);
    }
  };

  // ---------------------------------------------------------------------------
  // Question Actions
  // ---------------------------------------------------------------------------
  const handleUpdateQuestion = (qId: string, updates: Partial<ExamQuestionModel>) => {
    if (!activeSection) return;
    const updatedQuestions = (activeSection.questions || []).map((q) =>
      q.id === qId ? { ...q, ...updates } : q
    );
    const updatedSections = draft.sections.map((sec) =>
      sec.id === activeSection.id ? { ...sec, questions: updatedQuestions } : sec
    );
    const updatedDraft = { ...draft, sections: updatedSections };
    commitDraftUpdate(updatedDraft);

    // Persist to server
    updateDraftQuestion(qId, updates).catch((err) =>
      console.error("Update question failed", err)
    );
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!activeSection) return;
    const qIndex = (activeSection.questions || []).findIndex((q) => q.id === qId);
    const qToDelete = activeSection.questions?.[qIndex];
    if (!qToDelete) return;

    try {
      await deleteDraftQuestion(qId);
      const updatedQuestions = activeSection.questions.filter((q) => q.id !== qId);
      const updatedSections = draft.sections.map((sec) =>
        sec.id === activeSection.id ? { ...sec, questions: updatedQuestions } : sec
      );
      const updatedDraft = { ...draft, sections: updatedSections };
      commitDraftUpdate(updatedDraft);

      // Store in undo toast
      setDeletedUndoItem({
        question: qToDelete,
        sectionId: activeSection.id,
        index: qIndex,
      });
      setTimeout(() => setDeletedUndoItem(null), 6000);
    } catch (err) {
      console.error("Delete question failed", err);
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedUndoItem) return;
    try {
      const q = deletedUndoItem.question;
      const recreated = await createDraftQuestion(deletedUndoItem.sectionId, {
        question_type: q.question_type,
        difficulty: q.difficulty,
        marks: q.marks,
        stem: q.stem,
        payload: q.payload,
        origin: q.origin,
        rule_id: q.rule_id,
        explanation: q.explanation,
        order_index: deletedUndoItem.index,
      });

      const targetSection = draft.sections.find((s) => s.id === deletedUndoItem.sectionId);
      if (targetSection) {
        const questions = [...(targetSection.questions || [])];
        questions.splice(deletedUndoItem.index, 0, recreated);
        const updatedSections = draft.sections.map((s) =>
          s.id === targetSection.id ? { ...s, questions } : s
        );
        commitDraftUpdate({ ...draft, sections: updatedSections });
      }
      setDeletedUndoItem(null);
    } catch (err) {
      console.error("Undo delete failed", err);
    }
  };

  const handleDuplicateQuestion = async (qId: string) => {
    if (!activeSection) return;
    try {
      const duplicated = await duplicateDraftQuestion(qId);
      const updatedQuestions = [...(activeSection.questions || []), duplicated];
      const updatedSections = draft.sections.map((sec) =>
        sec.id === activeSection.id ? { ...sec, questions: updatedQuestions } : sec
      );
      const updatedDraft = { ...draft, sections: updatedSections };
      commitDraftUpdate(updatedDraft);

      // Auto-expand duplicated
      setExpandedQuestionIds((prev) => new Set([...prev, duplicated.id]));
    } catch (err) {
      console.error("Duplicate question failed", err);
    }
  };

  const handleQuestionsDragEnd = async (event: DragEndEvent) => {
    if (!activeSection) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = (activeSection.questions || []).findIndex((q) => q.id === active.id);
    const newIndex = (activeSection.questions || []).findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(activeSection.questions, oldIndex, newIndex).map((q, idx) => ({
      ...q,
      order_index: idx,
    }));

    const updatedSections = draft.sections.map((sec) =>
      sec.id === activeSection.id ? { ...sec, questions: reordered } : sec
    );
    const updatedDraft = { ...draft, sections: updatedSections };
    commitDraftUpdate(updatedDraft);

    try {
      await reorderDraftQuestions(
        activeSection.id,
        reordered.map((q, idx) => ({ id: q.id, order_index: idx }))
      );
    } catch (err) {
      console.error("Reorder questions failed", err);
    }
  };

  // Add blank manual question
  const handleAddManualQuestion = async (
    type: "MCQ" | "TRUE_FALSE" | "MULTI_SELECT" | "FILL_IN_BLANK"
  ) => {
    if (!activeSection) return;
    const defaultPayloads = {
      MCQ: {
        options: [
          { id: "opt_a", text: "Option A", is_correct: true },
          { id: "opt_b", text: "Option B", is_correct: false },
          { id: "opt_c", text: "Option C", is_correct: false },
          { id: "opt_d", text: "Option D", is_correct: false },
        ],
      },
      TRUE_FALSE: {
        options: [
          { id: "opt_true", text: "True", is_correct: true },
          { id: "opt_false", text: "False", is_correct: false },
        ],
      },
      MULTI_SELECT: {
        options: [
          { id: "opt_1", text: "Correct Answer 1", is_correct: true },
          { id: "opt_2", text: "Correct Answer 2", is_correct: true },
          { id: "opt_3", text: "Distractor 1", is_correct: false },
          { id: "opt_4", text: "Distractor 2", is_correct: false },
        ],
      },
      FILL_IN_BLANK: {
        blank_marker: "_____",
        accepted_answers: ["sample answer"],
        match_mode: "ignore_case",
      },
    };

    try {
      const created = await createDraftQuestion(activeSection.id, {
        question_type: type,
        difficulty: "medium",
        marks: activeSection.marks_per_question || 1,
        stem: "",
        payload: defaultPayloads[type],
        origin: "manual",
        order_index: activeSection.questions?.length || 0,
      });

      const updatedQuestions = [...(activeSection.questions || []), created];
      const updatedSections = draft.sections.map((sec) =>
        sec.id === activeSection.id ? { ...sec, questions: updatedQuestions } : sec
      );
      const updatedDraft = { ...draft, sections: updatedSections };
      commitDraftUpdate(updatedDraft);

      // Expand newly created card
      setExpandedQuestionIds((prev) => new Set([...prev, created.id]));

      // Scroll into view
      setTimeout(() => {
        const el = document.getElementById(`q-card-${created.id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    } catch (err) {
      console.error("Create manual question failed", err);
    }
  };

  // Add question from question bank modal
  const handleAddFromBank = (created: ExamQuestionModel) => {
    if (!activeSection) return;
    const updatedQuestions = [...(activeSection.questions || []), created];
    const updatedSections = draft.sections.map((sec) =>
      sec.id === activeSection.id ? { ...sec, questions: updatedQuestions } : sec
    );
    commitDraftUpdate({ ...draft, sections: updatedSections });
  };

  // Add generated question from AI modal
  const handleAddFromAI = (created: ExamQuestionModel) => {
    if (!activeSection) return;
    const updatedQuestions = [...(activeSection.questions || []), created];
    const updatedSections = draft.sections.map((sec) =>
      sec.id === activeSection.id ? { ...sec, questions: updatedQuestions } : sec
    );
    commitDraftUpdate({ ...draft, sections: updatedSections });
  };

  // ---------------------------------------------------------------------------
  // Delta Calculation (Diff between current questions & target mix)
  // ---------------------------------------------------------------------------
  const calculateDelta = (section: ExamSectionModel) => {
    const currentCounts = {
      MCQ: 0,
      TRUE_FALSE: 0,
      MULTI_SELECT: 0,
      FILL_IN_BLANK: 0,
      easy: 0,
      medium: 0,
      hard: 0,
    };

    (section.questions || []).forEach((q) => {
      if (q.question_type in currentCounts) {
        currentCounts[q.question_type as keyof typeof currentCounts]++;
      }
      if (q.difficulty in currentCounts) {
        currentCounts[q.difficulty as keyof typeof currentCounts]++;
      }
    });

    const targetType = section.type_mix || {};
    const targetDiff = section.difficulty_mix || {};

    const diffs: string[] = [];

    // Types
    const mcqDiff = (targetType.MCQ || 0) - currentCounts.MCQ;
    if (mcqDiff !== 0) diffs.push(`${mcqDiff > 0 ? "+" : ""}${mcqDiff} MCQ`);

    const tfDiff = (targetType.TRUE_FALSE || 0) - currentCounts.TRUE_FALSE;
    if (tfDiff !== 0) diffs.push(`${tfDiff > 0 ? "+" : ""}${tfDiff} True/False`);

    const msDiff = (targetType.MULTI_SELECT || 0) - currentCounts.MULTI_SELECT;
    if (msDiff !== 0) diffs.push(`${msDiff > 0 ? "+" : ""}${msDiff} Multi-Select`);

    const fibDiff = (targetType.FILL_IN_BLANK || 0) - currentCounts.FILL_IN_BLANK;
    if (fibDiff !== 0) diffs.push(`${fibDiff > 0 ? "+" : ""}${fibDiff} Fill-in-Blank`);

    // Difficulties
    const easyDiff = (targetDiff.easy || 0) - currentCounts.easy;
    if (easyDiff !== 0) diffs.push(`${easyDiff > 0 ? "+" : ""}${easyDiff} Easy`);

    const medDiff = (targetDiff.medium || 0) - currentCounts.medium;
    if (medDiff !== 0) diffs.push(`${medDiff > 0 ? "+" : ""}${medDiff} Medium`);

    const hardDiff = (targetDiff.hard || 0) - currentCounts.hard;
    if (hardDiff !== 0) diffs.push(`${hardDiff > 0 ? "+" : ""}${hardDiff} Hard`);

    return diffs;
  };

  const activeSectionDeltas = activeSection ? calculateDelta(activeSection) : [];

  // Apply delta / sync target to current
  const handleSyncTargetsToCurrent = () => {
    if (!activeSection) return;
    const typeMix: Record<string, number> = { MCQ: 0, TRUE_FALSE: 0, MULTI_SELECT: 0, FILL_IN_BLANK: 0 };
    const diffMix: Record<string, number> = { easy: 0, medium: 0, hard: 0 };

    (activeSection.questions || []).forEach((q) => {
      typeMix[q.question_type] = (typeMix[q.question_type] || 0) + 1;
      diffMix[q.difficulty] = (diffMix[q.difficulty] || 0) + 1;
    });

    handleUpdateActiveSection({
      type_mix: typeMix,
      difficulty_mix: diffMix,
    });
  };

  // Jump to validation error/warning
  const handleJumpToIssue = (issue: ValidationIssue) => {
    if (issue.section_id && issue.section_id !== activeSectionId) {
      setActiveSectionId(issue.section_id);
    }
    if (issue.question_id) {
      setExpandedQuestionIds((prev) => new Set([...prev, issue.question_id!]));
      setTimeout(() => {
        const el = document.getElementById(`q-card-${issue.question_id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-4", "ring-rose-500/40");
          setTimeout(() => el.classList.remove("ring-4", "ring-rose-500/40"), 2000);
        }
      }, 150);
    }
  };

  // ---------------------------------------------------------------------------
  // Summary Computations
  // ---------------------------------------------------------------------------
  const allQuestions = draft.sections.flatMap((s) => s.questions || []);
  const totalQuestions = allQuestions.length;
  const totalMarks = allQuestions.reduce((acc, q) => acc + (q.marks || 1), 0);
  const passMarks = Math.round((totalMarks * draft.pass_percent) / 100);

  const typeCounts = {
    MCQ: allQuestions.filter((q) => q.question_type === "MCQ").length,
    TRUE_FALSE: allQuestions.filter((q) => q.question_type === "TRUE_FALSE").length,
    MULTI_SELECT: allQuestions.filter((q) => q.question_type === "MULTI_SELECT").length,
    FILL_IN_BLANK: allQuestions.filter((q) => q.question_type === "FILL_IN_BLANK").length,
  };

  const diffCounts = {
    easy: allQuestions.filter((q) => q.difficulty === "easy").length,
    medium: allQuestions.filter((q) => q.difficulty === "medium").length,
    hard: allQuestions.filter((q) => q.difficulty === "hard").length,
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-background">
      {/* Top action bar: Undo/Redo, Autosave pill, Expand All / Collapse All */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-surface-border bg-surface-base/80 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          {/* Autosave status indicator */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-elevated border border-surface-border text-xs">
            {autosaveStatus === "saving" && (
              <>
                <svg className="w-3.5 h-3.5 text-brand-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-text-muted">Autosaving...</span>
              </>
            )}
            {autosaveStatus === "saved" && (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-400 font-medium">All changes saved</span>
              </>
            )}
            {autosaveStatus === "error" && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span className="text-rose-400 font-medium">Autosave failed</span>
                <button
                  type="button"
                  onClick={() => triggerAutosave(draft)}
                  className="text-xs text-brand-400 underline hover:text-brand-300 ml-1"
                >
                  Retry
                </button>
              </>
            )}
          </div>

          {/* Undo / Redo buttons */}
          <div className="flex items-center gap-1 border-l border-surface-border/60 pl-3">
            <button
              type="button"
              disabled={historyIndex <= 0}
              onClick={() => {
                if (historyIndex > 0) {
                  const prevDraft = history[historyIndex - 1];
                  setHistoryIndex((prev) => prev - 1);
                  onDraftChange(prevDraft);
                  triggerAutosave(prevDraft);
                }
              }}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l6-6M3 10l6 6" />
              </svg>
            </button>
            <button
              type="button"
              disabled={historyIndex >= history.length - 1}
              onClick={() => {
                if (historyIndex < history.length - 1) {
                  const nextDraft = history[historyIndex + 1];
                  setHistoryIndex((prev) => prev + 1);
                  onDraftChange(nextDraft);
                  triggerAutosave(nextDraft);
                }
              }}
              title="Redo (Ctrl+Shift+Z)"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-6-6m6 6l-6 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Global question toggles & preview */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (expandedQuestionIds.size > 0) {
                setExpandedQuestionIds(new Set());
              } else {
                setExpandedQuestionIds(new Set(allQuestions.map((q) => q.id)));
              }
            }}
            className="text-xs text-text-muted hover:text-text-primary transition-colors px-2 py-1"
          >
            {expandedQuestionIds.size > 0 ? "Collapse all" : "Expand all"}
          </button>

          <button
            type="button"
            onClick={() => {
              if (onOpenPreview) onOpenPreview();
              setPreviewOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-border/60 text-xs font-medium text-text-primary border border-surface-border transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Preview as Worker</span>
          </button>

          <button
            type="button"
            onClick={onProceedToLock}
            className="btn btn-primary"
            style={{
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <span>Lock & Assign</span>
            <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 14 }} />
          </button>
        </div>
      </div>

      {/* Main 3-Column Work Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* =================================================================== */}
        {/* LEFT RAIL: SECTIONS                                                 */}
        {/* =================================================================== */}
        <aside className="w-64 border-r border-surface-border bg-surface-base/40 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-surface-border/60 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Sections</h3>
              <p className="text-[11px] text-text-muted mt-0.5">{draft.sections.length} total sections</p>
            </div>
            <button
              type="button"
              onClick={handleAddSection}
              className="p-1 rounded-lg text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 transition-colors"
              title="Add Section"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionsDragEnd}
            >
              <SortableContext
                items={draft.sections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {draft.sections.map((sec, idx) => {
                  const sectionHasErrors =
                    validation?.errors.some((err) => err.section_id === sec.id) || false;
                  return (
                    <SortableSectionTab
                      key={sec.id}
                      section={sec}
                      index={idx}
                      isActive={sec.id === activeSectionId}
                      onSelect={() => setActiveSectionId(sec.id)}
                      hasErrors={sectionHasErrors}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>

          <div className="p-3 border-t border-surface-border/60">
            <button
              type="button"
              onClick={handleAddSection}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-surface-border hover:border-brand-500/60 bg-surface-elevated/30 hover:bg-brand-500/5 text-xs font-medium text-text-secondary hover:text-brand-300 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Section</span>
            </button>
          </div>
        </aside>

        {/* =================================================================== */}
        {/* CENTER CANVAS: STICKY HEADER, DELTA BANNER, QUESTIONS, ADD MENU    */}
        {/* =================================================================== */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {activeSection ? (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* STATIC SECTION HEADER (NO STICKY GLASS BLUR) */}
              <div
                className="card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: 20,
                  marginBottom: 20,
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300">
                        Section {activeSectionIndex + 1} of {draft.sections.length}
                      </span>
                      <input
                        type="text"
                        value={activeSection.title}
                        onChange={(e) => handleUpdateActiveSection({ title: e.target.value })}
                        placeholder="Section Title"
                        className="text-lg font-bold bg-transparent border-b border-transparent hover:border-surface-border focus:border-brand-500 text-text-primary px-1 py-0.5 focus:outline-none transition-colors flex-1"
                      />
                    </div>
                    <textarea
                      value={activeSection.instructions || ""}
                      onChange={(e) => handleUpdateActiveSection({ instructions: e.target.value })}
                      placeholder="Section instructions for the employee..."
                      rows={1}
                      className="w-full text-xs text-text-secondary bg-transparent border-b border-transparent hover:border-surface-border focus:border-brand-500 px-1 py-0.5 focus:outline-none transition-colors resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSectionSettings(!showSectionSettings)}
                      className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 transition-colors ${
                        showSectionSettings
                          ? "bg-brand-500/20 border-brand-500/50 text-brand-300"
                          : "bg-surface-elevated border-surface-border text-text-muted hover:text-text-primary"
                      }`}
                      title="Section Configuration"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>Settings</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteActiveSection}
                      disabled={draft.sections.length <= 1}
                      className="p-2 rounded-xl border border-surface-border hover:border-rose-500/40 text-text-muted hover:text-rose-400 bg-surface-elevated disabled:opacity-40 transition-colors"
                      title="Delete Section"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Collapsible Section Settings Drawer */}
                {showSectionSettings && (
                  <div className="mt-4 pt-4 border-t border-surface-border grid grid-cols-1 md:grid-cols-3 gap-4 text-xs animate-in fade-in duration-200">
                    <div>
                      <label className="block text-text-muted font-medium mb-1">Marks per Question</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={activeSection.marks_per_question || 1}
                        onChange={(e) =>
                          handleUpdateActiveSection({ marks_per_question: Number(e.target.value) || 1 })
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-surface-elevated border border-surface-border text-text-primary focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-text-muted font-medium mb-1">Section Min Pass % (Optional)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={activeSection.min_pass_percent ?? ""}
                        placeholder="None"
                        onChange={(e) =>
                          handleUpdateActiveSection({
                            min_pass_percent: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-surface-elevated border border-surface-border text-text-primary focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-2">
                      <label className="flex items-center gap-2 cursor-pointer text-text-secondary hover:text-text-primary">
                        <input
                          type="checkbox"
                          checked={activeSection.shuffle_questions}
                          onChange={(e) =>
                            handleUpdateActiveSection({ shuffle_questions: e.target.checked })
                          }
                          className="rounded border-surface-border text-brand-500 focus:ring-0"
                        />
                        <span>Shuffle questions</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-text-secondary hover:text-text-primary">
                        <input
                          type="checkbox"
                          checked={activeSection.shuffle_options}
                          onChange={(e) =>
                            handleUpdateActiveSection({ shuffle_options: e.target.checked })
                          }
                          className="rounded border-surface-border text-brand-500 focus:ring-0"
                        />
                        <span>Shuffle options</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* DELTA DIFF ALERT (Discrepancy between generated count & target configuration) */}
              {activeSectionDeltas.length > 0 && (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <span className="font-semibold">Target discrepancy detected: </span>
                      <span>{activeSectionDeltas.join(", ")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSyncTargetsToCurrent}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/40 font-medium transition-colors"
                      title="Update target settings to match the current questions"
                    >
                      Sync Targets
                    </button>
                  </div>
                </div>
              )}

              {/* QUESTIONS LIST */}
              <div className="space-y-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleQuestionsDragEnd}
                >
                  <SortableContext
                    items={(activeSection.questions || []).map((q) => q.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {(activeSection.questions || []).map((q, qIdx) => (
                      <div key={q.id} id={`q-card-${q.id}`}>
                        <QuestionEditorCard
                          question={q}
                          index={qIdx}
                          draftId={draft.id}
                          isExpanded={expandedQuestionIds.has(q.id)}
                          onToggleExpand={() => {
                            setExpandedQuestionIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(q.id)) {
                                next.delete(q.id);
                              } else {
                                next.add(q.id);
                              }
                              return next;
                            });
                          }}
                          onUpdate={(updates) => handleUpdateQuestion(q.id, updates)}
                          onDelete={() => handleDeleteQuestion(q.id)}
                          onDuplicate={() => handleDuplicateQuestion(q.id)}
                          rulesList={rulesList}
                          onTriggerUndoToast={(_qId, _stem) => {
                            // Handled via delete toast
                          }}
                        />
                      </div>
                    ))}
                  </SortableContext>
                </DndContext>

                {(!activeSection.questions || activeSection.questions.length === 0) && (
                  <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-surface-border bg-surface-elevated/20">
                    <svg className="w-10 h-10 mx-auto text-text-muted opacity-40 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium text-text-secondary">No questions in this section yet</p>
                    <p className="text-xs text-text-muted mt-1">
                      Choose an option below to create questions manually, from the bank, or via AI.
                    </p>
                  </div>
                )}
              </div>

              {/* FLOATING / BOTTOM ADD QUESTION MENU */}
              <div className="p-4 rounded-2xl border border-surface-border bg-surface-base/80 backdrop-blur shadow-sm">
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  + Add Question to Section
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddManualQuestion("MCQ")}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-surface-border/80 bg-surface-elevated hover:bg-brand-500/10 hover:border-brand-500/50 text-text-secondary hover:text-brand-300 transition-all text-center group"
                  >
                    <span className="text-xs font-bold font-mono text-brand-400 mb-1">MCQ</span>
                    <span className="text-[11px] font-medium leading-tight">Multiple Choice</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddManualQuestion("TRUE_FALSE")}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-surface-border/80 bg-surface-elevated hover:bg-brand-500/10 hover:border-brand-500/50 text-text-secondary hover:text-brand-300 transition-all text-center group"
                  >
                    <span className="text-xs font-bold font-mono text-emerald-400 mb-1">T / F</span>
                    <span className="text-[11px] font-medium leading-tight">True / False</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddManualQuestion("MULTI_SELECT")}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-surface-border/80 bg-surface-elevated hover:bg-brand-500/10 hover:border-brand-500/50 text-text-secondary hover:text-brand-300 transition-all text-center group"
                  >
                    <span className="text-xs font-bold font-mono text-cyan-400 mb-1">MULTI</span>
                    <span className="text-[11px] font-medium leading-tight">Multi-Select</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddManualQuestion("FILL_IN_BLANK")}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-surface-border/80 bg-surface-elevated hover:bg-brand-500/10 hover:border-brand-500/50 text-text-secondary hover:text-brand-300 transition-all text-center group"
                  >
                    <span className="text-xs font-bold font-mono text-purple-400 mb-1">BLANK</span>
                    <span className="text-[11px] font-medium leading-tight">Fill in Blank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBankModal(true)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-brand-500/30 bg-brand-500/5 hover:bg-brand-500/15 hover:border-brand-500/60 text-brand-300 transition-all text-center group"
                  >
                    <svg className="w-4 h-4 mb-1 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="text-[11px] font-medium leading-tight">From Bank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAIModal(true)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/15 hover:border-violet-500/60 text-violet-300 transition-all text-center group"
                  >
                    <svg className="w-4 h-4 mb-1 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-[11px] font-medium leading-tight">AI Generate</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-24 text-text-muted">
              Select or create a section to begin editing questions.
            </div>
          )}
        </main>

        {/* =================================================================== */}
        {/* RIGHT PANEL: LIVE SUMMARY, DIFFICULTY DISTRIBUTION, VALIDATION JUMP*/}
        {/* =================================================================== */}
        <aside className="w-80 border-l border-surface-border bg-surface-base/40 flex flex-col flex-shrink-0 overflow-y-auto p-5 space-y-6">
          {/* EXAM STATS */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Exam Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-surface-elevated border border-surface-border/60">
                <span className="text-text-muted block text-[11px]">Questions</span>
                <span className="text-base font-bold font-mono text-text-primary">{totalQuestions}</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-elevated border border-surface-border/60">
                <span className="text-text-muted block text-[11px]">Total Marks</span>
                <span className="text-base font-bold font-mono text-brand-300">{totalMarks} pts</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-elevated border border-surface-border/60">
                <span className="text-text-muted block text-[11px]">Pass Criteria</span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  {draft.pass_percent}% ({passMarks} pts)
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-elevated border border-surface-border/60">
                <span className="text-text-muted block text-[11px]">Duration</span>
                <span className="text-base font-bold font-mono text-text-primary">
                  {draft.duration_minutes} min
                </span>
              </div>
            </div>
          </div>

          {/* TYPE DISTRIBUTION */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Type Breakdown</h4>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-elevated/60">
                <span className="text-text-secondary">MCQ</span>
                <span className="font-bold text-text-primary">{typeCounts.MCQ}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-elevated/60">
                <span className="text-text-secondary">True / False</span>
                <span className="font-bold text-text-primary">{typeCounts.TRUE_FALSE}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-elevated/60">
                <span className="text-text-secondary">Multi-Select</span>
                <span className="font-bold text-text-primary">{typeCounts.MULTI_SELECT}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-elevated/60">
                <span className="text-text-secondary">Fill in the Blank</span>
                <span className="font-bold text-text-primary">{typeCounts.FILL_IN_BLANK}</span>
              </div>
            </div>
          </div>

          {/* DIFFICULTY DISTRIBUTION BARS */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Difficulty Distribution</h4>
            <div className="space-y-2 text-xs">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-emerald-400 font-medium">Easy</span>
                  <span className="text-text-muted font-mono">{diffCounts.easy} Qs</span>
                </div>
                <div className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${totalQuestions > 0 ? (diffCounts.easy / totalQuestions) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-amber-400 font-medium">Medium</span>
                  <span className="text-text-muted font-mono">{diffCounts.medium} Qs</span>
                </div>
                <div className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${totalQuestions > 0 ? (diffCounts.medium / totalQuestions) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-rose-400 font-medium">Hard</span>
                  <span className="text-text-muted font-mono">{diffCounts.hard} Qs</span>
                </div>
                <div className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all"
                    style={{ width: `${totalQuestions > 0 ? (diffCounts.hard / totalQuestions) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* LIVE VALIDATION ISSUES (Jump to question card) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Validation</h4>
              <button
                type="button"
                onClick={runValidation}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-medium"
              >
                {isValidating ? "Validating..." : "Refresh"}
              </button>
            </div>

            {validation ? (
              <div className="space-y-2">
                {validation.errors.map((err, idx) => (
                  <div
                    key={`err-${idx}`}
                    onClick={() => handleJumpToIssue(err)}
                    className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs cursor-pointer hover:bg-rose-500/20 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-rose-400">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Error</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-tight text-rose-200/90">{err.message}</p>
                    <span className="text-[10px] text-rose-400 underline mt-1 block">Jump to item →</span>
                  </div>
                ))}

                {validation.warnings.map((warn, idx) => (
                  <div
                    key={`warn-${idx}`}
                    onClick={() => handleJumpToIssue(warn)}
                    className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs cursor-pointer hover:bg-amber-500/20 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Warning</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-tight text-amber-200/90">{warn.message}</p>
                    <span className="text-[10px] text-amber-400 underline mt-1 block">Jump to item →</span>
                  </div>
                ))}

                {validation.errors.length === 0 && validation.warnings.length === 0 && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>All validation checks passed! Ready to lock and assign.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-text-muted">Loading checks...</div>
            )}
          </div>
        </aside>
      </div>

      {/* FULL-WIDTH BOTTOM ACTION BAR: PROCEED TO LOCK & ASSIGN */}
      <footer
        style={{
          height: 60,
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 30,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Total Questions: <strong style={{ color: "var(--text-primary)" }}>{totalQuestions}</strong> ({totalMarks} marks)
          </span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Pass Criteria: <strong style={{ color: "var(--emerald)" }}>{draft.pass_percent}%</strong> ({passMarks} pts)
          </span>
        </div>

        <button
          type="button"
          onClick={onProceedToLock}
          className="btn btn-primary"
          style={{
            padding: "10px 28px",
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <span>Proceed to Lock & Assign</span>
          <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 16 }} />
        </button>
      </footer>

      {/* SOFT-DELETE UNDO FLOATING TOAST */}
      {deletedUndoItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface-elevated/95 backdrop-blur-md border border-surface-border text-xs text-text-primary shadow-2xl animate-in slide-in-from-bottom duration-200">
          <span>Question deleted.</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="font-bold text-brand-400 hover:text-brand-300 underline"
          >
            Undo
          </button>
        </div>
      )}

      {/* QUESTION BANK MODAL */}
      {activeSection && (
        <QuestionBankModal
          isOpen={showBankModal}
          onClose={() => setShowBankModal(false)}
          excludedStems={allQuestions.map((q) => q.stem)}
          onSelectVariant={async (variant) => {
            try {
              const created = await createDraftQuestion(activeSection.id, {
                question_type: variant.question_type,
                difficulty: (variant.difficulty as any) || "medium",
                stem: variant.question_text,
                payload: {
                  options: (variant.options || []).map((text, idx) => ({
                    id: `opt_${idx}`,
                    text,
                    is_correct: idx === variant.correct_option_index,
                  })),
                },
                origin: "bank",
                rule_id: variant.rule_id,
              });
              handleAddFromBank(created);
            } catch (err) {
              console.error("Failed to add question from bank", err);
            }
          }}
        />
      )}

      {/* AI GENERATE SLOT MODAL */}
      {activeSection && (
        <AIGenerateSlotModal
          isOpen={showAIModal}
          onClose={() => setShowAIModal(false)}
          onGenerateSlot={async (params) => {
            try {
              const created = await createDraftQuestion(activeSection.id, {
                question_type: params.question_type,
                difficulty: params.difficulty,
                stem: "",
                rule_id: params.rule_id,
                origin: "ai",
              });
              handleAddFromAI(created);
            } catch (err) {
              console.error("Failed to generate slot", err);
            }
          }}
        />
      )}

      {/* WORKER PREVIEW DRAWER */}
      <WorkerPreviewDrawer
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        draft={draft}
      />
    </div>
  );
};
