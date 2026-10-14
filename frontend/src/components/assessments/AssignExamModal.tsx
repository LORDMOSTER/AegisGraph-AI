import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  assembleExam,
  Employee,
  swapQuestion,
  regenerateDraftQuestion,
  getQuestionAlternatives,
  swapDraftQuestion,
  undoDraftQuestion,
  type AlternativeVariant,
} from "../../api";

// --- STYLING CONSTANTS (Void-Glass-Clay) ---


// --- ICONS (Mathematically Generated SVGs) ---
const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SwapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8h16v-8" />
    <polyline points="8 8 12 4 16 8" />
    <line x1="12" y1="4" x2="12" y2="16" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
  </svg>
);

const PinIcon = ({ pinned }: { pinned: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d={pinned ? "M7 11V7a5 5 0 0 1 10 0v4" : "M7 11V7a5 5 0 0 1 9.9-1"} />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const LoadingAnimation = ({ roleTemplate }: { roleTemplate: string }) => {
  const messages = [
    `Parsing ${roleTemplate} safety standards...`,
    "Analyzing cognitive patterns...",
    "Generating context-aware scenarios...",
    "Validating compliance rules...",
    "Finalizing question set..."
  ];
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((prev) => (prev < messages.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", padding: "40px" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ y: [0, -10, 0], opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "var(--accent)" }}
          />
        ))}
      </div>
      <motion.p
        key={msgIdx}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        style={{ color: "var(--text-primary)", fontSize: "1.1rem", margin: 0, minHeight: "24px" }}
      >
        {messages[msgIdx]}
      </motion.p>
    </div>
  );
};

// --- INTERFACES ---
interface AssignExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
}

export interface QuestionVariant {
  id: string;
  question_text: string;
  stem?: string;
  question_type: string;
  difficulty: string;
  marks?: number;
  options: string[];
  correct_answer_index?: number;
  correct_option_indices?: number[];
  correct_answer?: string;
  blank_answer_variants?: string[];
  statement_true?: string;
  statement_false?: string;
  rule_id?: string;
  is_locked?: boolean;
  draft_id?: string;
}

export const AssignExamModal: React.FC<AssignExamModalProps> = ({
  isOpen,
  onClose,
  employees,
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1 State
  const today = new Date().toISOString().split("T")[0];
  const [validFrom, setValidFrom] = useState(today);
  const [validTo, setValidTo] = useState("");
  const [targetCount, setTargetCount] = useState<number>(10);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);
  const roleTemplate = selectedEmployee?.designation || "";

  // Step 2 State
  const [questions, setQuestions] = useState<QuestionVariant[]>([]);

  // Per-card Regeneration, Alternatives, Pin & Undo state
  const [cardLoading, setCardLoading] = useState<Record<string, boolean>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string | null>>({});
  const [popoverQuestionId, setPopoverQuestionId] = useState<string | null>(null);
  const [popoverOptions, setPopoverOptions] = useState<{
    mode: "same_rule" | "other_rule";
    change_type?: "MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK" | "MULTI_SELECT";
    difficulty?: "easy" | "medium" | "hard";
    focus_hint: string;
  }>({
    mode: "same_rule",
    focus_hint: "",
  });
  const [alternativesModalQuestionId, setAlternativesModalQuestionId] = useState<string | null>(null);
  const [alternativesList, setAlternativesList] = useState<AlternativeVariant[]>([]);
  const [alternativesLoading, setAlternativesLoading] = useState<boolean>(false);
  const [undoToast, setUndoToast] = useState<{
    questionId: string;
    previousQuestion: QuestionVariant;
    secondsLeft: number;
  } | null>(null);

  // Step 3 State
  const [revealScore, setRevealScore] = useState(false);
  const [examKey, setExamKey] = useState("");
  const [durationMins, setDurationMins] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedEmployeeId("");
      setQuestions([]);
      setCardLoading({});
      setCardErrors({});
      setPopoverQuestionId(null);
      setAlternativesModalQuestionId(null);
      setUndoToast(null);
      setRevealScore(false);
      setExamKey("");
      setDurationMins("");
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Undo 10s countdown timer
  useEffect(() => {
    if (!undoToast) return;
    const timer = setInterval(() => {
      setUndoToast((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) return null;
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [undoToast?.questionId]);

  const cleanMarkdown = (text: string) => {
    let t = text.replace(/\*\*(.*?)\*\*/g, "$1");
    t = t.replace(/\\underline\{_*\}/g, "_____"); // Fix LaTeX underline
    return t;
  };

  const cleanQuestion = (q: any): QuestionVariant => {
    const rawText = q.question_text || q.stem || "";
    const payload = q.payload || {};
    let rawOptions = q.options || payload.options || [];
    let cleanedOptions = rawOptions.map((o: any) => cleanMarkdown(String(o)).trim());

    // Safely remove A, B, C, D prefixes if all options start with them sequentially
    const isABCD = cleanedOptions.length >= 4 &&
      cleanedOptions[0].match(/^A[\.\)\-\s]/i) &&
      cleanedOptions[1].match(/^B[\.\)\-\s]/i) &&
      cleanedOptions[2].match(/^C[\.\)\-\s]/i) &&
      cleanedOptions[3].match(/^D[\.\)\-\s]/i);

    if (isABCD) {
      cleanedOptions = cleanedOptions.map((o: string) => o.replace(/^[A-D][\.\)\-\s]+/i, ""));
    }

    return {
      id: String(q.id),
      question_text: cleanMarkdown(rawText),
      stem: cleanMarkdown(rawText),
      question_type: q.question_type || payload.question_type || "MCQ",
      difficulty: q.difficulty || payload.difficulty || "medium",
      marks: q.marks ?? 1,
      options: cleanedOptions,
      correct_answer_index: q.correct_answer_index ?? payload.correct_option_index,
      correct_option_indices: q.correct_option_indices ?? payload.correct_option_indices,
      correct_answer: q.correct_answer ?? payload.correct_answer,
      blank_answer_variants: q.blank_answer_variants ?? payload.blank_answer_variants,
      statement_true: q.statement_true ?? payload.statement_true,
      statement_false: q.statement_false ?? payload.statement_false,
      rule_id: q.rule_id ? String(q.rule_id) : (payload.rule_id ? String(payload.rule_id) : undefined),
      is_locked: q.is_locked || false,
      draft_id: q.draft_id ? String(q.draft_id) : undefined,
    };
  };

  const handleAssemble = async () => {
    setLoading(true);
    try {
      setErrorMsg(null);
      const data = await assembleExam(roleTemplate, targetCount);
      if (data.status === "incomplete") {
        setErrorMsg("INSUFFICIENT CONTENT: " + data.reason);
      }
      setQuestions((data.questions || []).map(cleanQuestion));
    } catch (err) {
      console.error("Assembly failed", err);
    } finally {
      setLoading(false);
    }
  };

  // Pin Toggle
  const handleTogglePin = (q: QuestionVariant) => {
    setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, is_locked: !item.is_locked } : item));
    setCardErrors(prev => ({ ...prev, [q.id]: null }));
  };

  // Open Regenerate Popover
  const handleOpenRegeneratePopover = (q: QuestionVariant) => {
    if (q.is_locked) {
      setCardErrors(prev => ({ ...prev, [q.id]: "HTTP 423 Locked: Question is pinned. Unpin before regenerating." }));
      return;
    }
    setCardErrors(prev => ({ ...prev, [q.id]: null }));
    setPopoverOptions({
      mode: "same_rule",
      change_type: q.question_type as any,
      difficulty: q.difficulty as any,
      focus_hint: "",
    });
    setPopoverQuestionId(popoverQuestionId === q.id ? null : q.id);
    setAlternativesModalQuestionId(null);
  };

  // Execute Regenerate (AI)
  const handleExecuteRegenerate = async (q: QuestionVariant) => {
    if (q.is_locked) {
      setCardErrors(prev => ({ ...prev, [q.id]: "HTTP 423 Locked: Question is pinned. Unpin before regenerating." }));
      return;
    }
    setPopoverQuestionId(null);
    setCardLoading(prev => ({ ...prev, [q.id]: true }));
    setCardErrors(prev => ({ ...prev, [q.id]: null }));
    const prevSnapshot = { ...q };

    try {
      let updatedData: any;
      if (q.draft_id) {
        updatedData = await regenerateDraftQuestion(q.id, popoverOptions, q.draft_id);
      } else {
        try {
          updatedData = await regenerateDraftQuestion(q.id, popoverOptions);
        } catch {
          // Fallback to legacy swap passing type, current stem, and options
          if (q.rule_id) {
            const legacyRes = await swapQuestion(
              q.rule_id,
              q.id,
              popoverOptions.change_type || q.question_type,
              q.question_text
            );
            if (legacyRes.error) throw new Error(legacyRes.error);
            updatedData = legacyRes;
          } else {
            throw new Error("Cannot regenerate question without rule_id or draft_id");
          }
        }
      }

      const cleaned = cleanQuestion(updatedData);
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...cleaned, id: q.id, is_locked: false } : item));
      setUndoToast({
        questionId: q.id,
        previousQuestion: prevSnapshot,
        secondsLeft: 10,
      });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Regeneration failed across ladder rungs.";
      setCardErrors(prev => ({ ...prev, [q.id]: typeof msg === "string" ? msg : JSON.stringify(msg) }));
    } finally {
      setCardLoading(prev => ({ ...prev, [q.id]: false }));
    }
  };

  // Open Swap Alternatives
  const handleOpenAlternatives = async (q: QuestionVariant) => {
    if (q.is_locked) {
      setCardErrors(prev => ({ ...prev, [q.id]: "HTTP 423 Locked: Question is pinned. Unpin before swapping." }));
      return;
    }
    setCardErrors(prev => ({ ...prev, [q.id]: null }));
    setPopoverQuestionId(null);
    setAlternativesModalQuestionId(alternativesModalQuestionId === q.id ? null : q.id);
    if (alternativesModalQuestionId !== q.id) {
      setAlternativesLoading(true);
      setAlternativesList([]);
      try {
        const list = await getQuestionAlternatives(q.id, q.draft_id);
        setAlternativesList(list || []);
      } catch (err) {
        console.warn("Alternatives endpoint fallback", err);
        setAlternativesList([]);
      } finally {
        setAlternativesLoading(false);
      }
    }
  };

  // Execute Swap with variant
  const handleExecuteSwap = async (q: QuestionVariant, alt: AlternativeVariant) => {
    setAlternativesModalQuestionId(null);
    setCardLoading(prev => ({ ...prev, [q.id]: true }));
    setCardErrors(prev => ({ ...prev, [q.id]: null }));
    const prevSnapshot = { ...q };

    try {
      let updatedData: any;
      if (q.draft_id) {
        updatedData = await swapDraftQuestion(q.id, alt.id, q.draft_id);
      } else {
        try {
          updatedData = await swapDraftQuestion(q.id, alt.id);
        } catch {
          updatedData = {
            ...alt,
            id: q.id,
            question_text: alt.stem,
            rule_id: alt.rule_id || q.rule_id,
          };
        }
      }

      const cleaned = cleanQuestion(updatedData);
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...cleaned, id: q.id, is_locked: false } : item));
      setUndoToast({
        questionId: q.id,
        previousQuestion: prevSnapshot,
        secondsLeft: 10,
      });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Swap failed.";
      setCardErrors(prev => ({ ...prev, [q.id]: typeof msg === "string" ? msg : JSON.stringify(msg) }));
    } finally {
      setCardLoading(prev => ({ ...prev, [q.id]: false }));
    }
  };

  // Execute Undo
  const handleExecuteUndo = async () => {
    if (!undoToast) return;
    const { questionId, previousQuestion } = undoToast;
    try {
      if (previousQuestion.draft_id) {
        await undoDraftQuestion(questionId, previousQuestion.draft_id);
      } else {
        await undoDraftQuestion(questionId).catch(() => {});
      }
    } catch (err) {
      console.warn("Backend undo call error, rolling back local state", err);
    }
    setQuestions(prev => prev.map(item => item.id === questionId ? previousQuestion : item));
    setUndoToast(null);
  };

  const handleFinalize = async () => {
    setLoading(true);
    try {
      if (!selectedEmployeeId) return;
      console.log(`Assigning exam to employee: ${selectedEmployeeId}`);

      const manifest = questions.map(q => ({
        rule_id: q.rule_id || "00000000-0000-0000-0000-000000000000",
        question_variant_id: q.id,
        question_text: q.question_text,
        options: q.options,
        correct_answer_index: q.correct_answer_index
      }));

      const { saveAssembledExam, assignExam } = await import("../../api");
      const parsedDuration = parseInt(durationMins, 10);
      const finalDuration = isNaN(parsedDuration) || parsedDuration <= 0 ? null : parsedDuration;
      const saveRes = await saveAssembledExam(`${roleTemplate} Certification`, manifest, finalDuration);
      if (saveRes && saveRes.assessment_id) {
        await assignExam(saveRes.assessment_id, [selectedEmployeeId], examKey || undefined, revealScore);
      }

      setStep(4);
    } catch (err) {
      console.error("Finalization failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        key="assign-exam-backdrop"
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
          className="card glass-panel"
          style={{
            width: step >= 2 ? "90vw" : "600px",
            height: step >= 2 ? "90vh" : "auto",
            maxWidth: step >= 2 ? "1200px" : "90%",
            padding: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            transition: "all 0.3s ease",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "24px",
              borderBottom: "1px solid var(--border-muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
              {step === 4 ? "Exam Summary" : "Assign Exam"}
              {step < 4 && <span style={{ color: "var(--accent)", marginLeft: "8px" }}>[{step}/3]</span>}
            </h2>
            <button
              onClick={onClose}
              className="btn-icon btn-ghost"
              style={{ border: "none", background: "transparent", padding: "4px" }}
            >
              <CloseIcon />
            </button>
          </div>

          {errorMsg && (
            <div
              style={{
                padding: "12px 16px",
                margin: "16px 24px 0",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                color: "#ef4444",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "10px"
              }}
            >
              <iconify-icon icon="lucide:alert-circle" style={{ fontSize: "16px", flexShrink: 0 }} />
              <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{errorMsg}</span>
            </div>
          )}

          {/* Content Area */}
          <div style={{ padding: "24px", flex: 1, overflowY: "auto", maxHeight: "60vh" }}>
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ display: "flex", gap: "16px" }}>
                  <div style={{ flex: 1 }}>
                    <label className="field-label" style={{ display: "block", marginBottom: "8px" }}>Valid From</label>
                    <input
                      type="date"
                      min={today}
                      value={validFrom}
                      onChange={(e) => {
                        setValidFrom(e.target.value);
                        if (validTo && e.target.value > validTo) {
                          setValidTo("");
                        }
                      }}
                      className="field-input"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="field-label" style={{ display: "block", marginBottom: "8px" }}>Valid To</label>
                    <input
                      type="date"
                      min={validFrom || today}
                      value={validTo}
                      onChange={(e) => setValidTo(e.target.value)}
                      className="field-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label" style={{ display: "block", marginBottom: "8px" }}>Target Question Count</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[10, 15, 20, 30].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTargetCount(val)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${targetCount === val ? 'var(--accent)' : 'var(--line)'}`,
                          background: targetCount === val ? 'var(--accent)' : 'var(--surface)',
                          color: targetCount === val ? '#fff' : 'var(--ink)',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        {val} Qs
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="Custom"
                      value={![10, 15, 20, 30].includes(targetCount) && targetCount > 0 ? targetCount : ''}
                      onChange={(e) => setTargetCount(e.target.value ? Number(e.target.value) : 0)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${![10, 15, 20, 30].includes(targetCount) && targetCount > 0 ? 'var(--accent)' : 'var(--line)'}`,
                        background: 'var(--surface)',
                        width: '90px',
                        outline: 'none',
                        color: 'var(--ink)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label" style={{ display: "block", marginBottom: "8px" }}>Select Employee</label>
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="field-select"
                  >
                    <option value="" disabled>-- Select an employee --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.designation})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {questions.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", gap: "16px" }}>
                    {loading ? (
                      <LoadingAnimation roleTemplate={roleTemplate} />
                    ) : (
                      <>
                        <p style={{ color: "var(--text-secondary)", textAlign: "center" }}>
                          Ready to generate questions based on the {roleTemplate} role template.
                        </p>
                        <button
                          onClick={handleAssemble}
                          disabled={loading}
                          className="btn btn-primary"
                          style={{ padding: "12px 32px", fontSize: "1rem" }}
                        >
                          Start Generation
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  questions.map((q, idx) => {
                    const isLoading = !!cardLoading[q.id];
                    const isPinned = !!q.is_locked;
                    const cardError = cardErrors[q.id];
                    const isPopoverOpen = popoverQuestionId === q.id;
                    const isAlternativesOpen = alternativesModalQuestionId === q.id;

                    const getTypeBadge = (type: string) => {
                      switch (type) {
                        case "TRUE_FALSE":
                          return { label: "TRUE / FALSE", bg: "rgba(168, 85, 247, 0.15)", color: "#c084fc" };
                        case "FILL_IN_BLANK":
                          return { label: "FILL IN BLANK", bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" };
                        case "MULTI_SELECT":
                          return { label: "MULTI-SELECT", bg: "rgba(20, 184, 166, 0.15)", color: "#2dd4bf" };
                        case "MCQ":
                        default:
                          return { label: "MCQ", bg: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" };
                      }
                    };

                    const getDiffBadge = (diff: string) => {
                      switch (diff?.toLowerCase()) {
                        case "easy":
                          return { bg: "rgba(16, 185, 129, 0.15)", color: "var(--emerald)" };
                        case "hard":
                          return { bg: "rgba(239, 68, 68, 0.15)", color: "#f87171" };
                        case "medium":
                        default:
                          return { bg: "rgba(234, 179, 8, 0.15)", color: "#facc15" };
                      }
                    };

                    const typeBadge = getTypeBadge(q.question_type);
                    const diffBadge = getDiffBadge(q.difficulty);

                    return (
                      <div
                        key={q.id}
                        style={{
                          padding: "16px",
                          background: "var(--surface)",
                          border: isPinned ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--line)",
                          borderRadius: 12,
                          boxShadow: "var(--shadow-sm)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          position: "relative",
                          opacity: isLoading ? 0.75 : 1,
                          transition: "all 0.2s ease",
                        }}
                      >
                        {/* Top Control Bar */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "var(--muted)", fontWeight: 700, fontSize: "14px" }}>#{idx + 1}</span>
                            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: typeBadge.bg, color: typeBadge.color, letterSpacing: "0.04em" }}>
                              {typeBadge.label}
                            </span>
                            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: diffBadge.bg, color: diffBadge.color, textTransform: "uppercase" }}>
                              {q.difficulty}
                            </span>
                            {isPinned && (
                              <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}>
                                PINNED (423)
                              </span>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {/* Pin / Unpin Button */}
                            <button
                              onClick={() => handleTogglePin(q)}
                              title={isPinned ? "Question is pinned (HTTP 423). Click to unpin." : "Click to pin question against regeneration"}
                              style={{
                                background: isPinned ? "rgba(239, 68, 68, 0.15)" : "var(--base)",
                                border: isPinned ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--line)",
                                borderRadius: "6px",
                                color: isPinned ? "#f87171" : "var(--muted)",
                                cursor: "pointer",
                                padding: "6px 8px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              <PinIcon pinned={isPinned} />
                              <span>{isPinned ? "Pinned" : "Pin"}</span>
                            </button>

                            {isLoading ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--accent)", fontSize: "12px", padding: "6px 12px" }}>
                                <SpinnerIcon />
                                <span>Generating...</span>
                              </div>
                            ) : (
                              <>
                                {/* Swap (Instant) Button */}
                                <button
                                  onClick={() => handleOpenAlternatives(q)}
                                  disabled={isPinned}
                                  title={isPinned ? "Question is pinned. Unpin before swapping." : "Swap with approved bank variant (instant)"}
                                  style={{
                                    background: "var(--base)",
                                    border: isAlternativesOpen ? "1px solid var(--accent)" : "1px solid var(--line)",
                                    borderRadius: "6px",
                                    color: isPinned ? "var(--muted)" : "var(--text)",
                                    cursor: isPinned ? "not-allowed" : "pointer",
                                    padding: "6px 10px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    opacity: isPinned ? 0.5 : 1,
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseOver={(e) => { if (!isPinned) { e.currentTarget.style.borderColor = "var(--accent)"; } }}
                                  onMouseOut={(e) => { if (!isPinned && !isAlternativesOpen) { e.currentTarget.style.borderColor = "var(--line)"; } }}
                                >
                                  <SwapIcon />
                                  <span>Swap (Instant)</span>
                                </button>

                                {/* Regenerate (AI) Button */}
                                <button
                                  onClick={() => handleOpenRegeneratePopover(q)}
                                  disabled={isPinned}
                                  title={isPinned ? "Question is pinned. Unpin before regenerating." : "Regenerate variation ladder with Ollama (AI)"}
                                  style={{
                                    background: isPopoverOpen ? "rgba(99, 102, 241, 0.15)" : "var(--base)",
                                    border: isPopoverOpen ? "1px solid var(--accent)" : "1px solid var(--line)",
                                    borderRadius: "6px",
                                    color: isPinned ? "var(--muted)" : "var(--accent)",
                                    cursor: isPinned ? "not-allowed" : "pointer",
                                    padding: "6px 10px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    opacity: isPinned ? 0.5 : 1,
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseOver={(e) => { if (!isPinned) { e.currentTarget.style.borderColor = "var(--accent)"; } }}
                                  onMouseOut={(e) => { if (!isPinned && !isPopoverOpen) { e.currentTarget.style.borderColor = "var(--line)"; } }}
                                >
                                  <SparklesIcon />
                                  <span>Regenerate (AI)</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Inline Error Alert */}
                        {cardError && (
                          <div
                            style={{
                              padding: "8px 12px",
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              borderRadius: 6,
                              color: "#ef4444",
                              fontSize: "12px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: "8px",
                            }}
                          >
                            <span style={{ lineHeight: 1.4, flex: 1 }}>{cardError}</span>
                            <button
                              onClick={() => setCardErrors(prev => ({ ...prev, [q.id]: null }))}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "14px", padding: 0 }}
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {/* Regenerate Options Popover */}
                        {isPopoverOpen && (
                          <div
                            style={{
                              padding: "14px",
                              background: "var(--base)",
                              border: "1px solid var(--accent)",
                              borderRadius: 8,
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                              boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                ✨ Regenerate Options (Variation Ladder)
                              </span>
                              <button
                                onClick={() => setPopoverQuestionId(null)}
                                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "14px" }}
                              >
                                ✕
                              </button>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", marginBottom: 4 }}>Ladder Mode</label>
                                <select
                                  value={popoverOptions.mode}
                                  onChange={(e) => setPopoverOptions(p => ({ ...p, mode: e.target.value as any }))}
                                  style={{ width: "100%", padding: "6px 8px", fontSize: "12px", background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6 }}
                                >
                                  <option value="same_rule">Same Rule (different clause/term)</option>
                                  <option value="other_rule">Other Approved Rule in Section</option>
                                </select>
                              </div>

                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", marginBottom: 4 }}>Question Type</label>
                                <select
                                  value={popoverOptions.change_type || q.question_type}
                                  onChange={(e) => setPopoverOptions(p => ({ ...p, change_type: e.target.value as any }))}
                                  style={{ width: "100%", padding: "6px 8px", fontSize: "12px", background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6 }}
                                >
                                  <option value="MCQ">MCQ (Multiple Choice)</option>
                                  <option value="TRUE_FALSE">True / False</option>
                                  <option value="FILL_IN_BLANK">Fill in Blank</option>
                                  <option value="MULTI_SELECT">Multi-Select</option>
                                </select>
                              </div>

                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", marginBottom: 4 }}>Difficulty</label>
                                <select
                                  value={popoverOptions.difficulty || q.difficulty}
                                  onChange={(e) => setPopoverOptions(p => ({ ...p, difficulty: e.target.value as any }))}
                                  style={{ width: "100%", padding: "6px 8px", fontSize: "12px", background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6 }}
                                >
                                  <option value="easy">Easy</option>
                                  <option value="medium">Medium</option>
                                  <option value="hard">Hard</option>
                                </select>
                              </div>

                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", marginBottom: 4 }}>Focus Hint (Optional)</label>
                                <input
                                  type="text"
                                  placeholder="e.g. ask about voltage threshold"
                                  value={popoverOptions.focus_hint}
                                  onChange={(e) => setPopoverOptions(p => ({ ...p, focus_hint: e.target.value }))}
                                  style={{ width: "100%", padding: "6px 8px", fontSize: "12px", background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, boxSizing: "border-box" }}
                                />
                              </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: 4 }}>
                              <button
                                onClick={() => setPopoverQuestionId(null)}
                                className="btn btn-secondary"
                                style={{ padding: "5px 12px", fontSize: "12px" }}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleExecuteRegenerate(q)}
                                className="btn btn-primary"
                                style={{ padding: "5px 16px", fontSize: "12px", background: "var(--accent)" }}
                              >
                                ✨ Run Ladder
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Instant Alternatives Modal */}
                        {isAlternativesOpen && (
                          <div
                            style={{
                              padding: "14px",
                              background: "var(--base)",
                              border: "1px solid var(--line)",
                              borderRadius: 8,
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                              boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                ⚡ Instant Alternatives ({alternativesList.length} approved bank variants)
                              </span>
                              <button
                                onClick={() => setAlternativesModalQuestionId(null)}
                                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "14px" }}
                              >
                                ✕
                              </button>
                            </div>

                            {alternativesLoading ? (
                              <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                                Loading alternatives from Question Bank...
                              </div>
                            ) : alternativesList.length === 0 ? (
                              <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                                No alternative approved variants in bank for this rule & difficulty. Use AI Regenerate instead.
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "240px", overflowY: "auto" }}>
                                {alternativesList.map((alt) => (
                                  <div
                                    key={alt.id}
                                    style={{
                                      padding: "10px 12px",
                                      background: "var(--surface)",
                                      border: "1px solid var(--line)",
                                      borderRadius: 6,
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      gap: "12px",
                                    }}
                                  >
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: 4 }}>
                                        {alt.is_same_rule && (
                                          <span style={{ fontSize: "10px", background: "rgba(16, 185, 129, 0.15)", color: "var(--emerald)", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                                            Same Rule
                                          </span>
                                        )}
                                        <span style={{ fontSize: "10px", background: "rgba(255,255,255,0.06)", color: "var(--muted)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                                          {alt.difficulty}
                                        </span>
                                        <span style={{ fontSize: "10px", background: "rgba(59, 130, 246, 0.1)", color: "#60a5fa", padding: "1px 6px", borderRadius: 4 }}>
                                          {alt.question_type}
                                        </span>
                                      </div>
                                      <p style={{ margin: 0, fontSize: "12px", color: "var(--ink)", lineHeight: 1.4 }}>
                                        {alt.stem}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => handleExecuteSwap(q, alt)}
                                      className="btn btn-primary"
                                      style={{ padding: "5px 12px", fontSize: "12px", whiteSpace: "nowrap" }}
                                    >
                                      Select & Swap
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Question Stem Textarea */}
                        <div>
                          <textarea
                            value={q.question_text}
                            disabled={isLoading}
                            onChange={(e) => {
                              const val = e.target.value;
                              setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, question_text: val, stem: val } : x));
                            }}
                            style={{
                              margin: 0,
                              fontSize: "14px",
                              fontWeight: 600,
                              lineHeight: 1.5,
                              color: "var(--ink)",
                              background: "transparent",
                              border: "none",
                              width: "100%",
                              resize: "vertical",
                              outline: "none",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>

                        {/* Question Type Specific Body */}
                        {q.question_type === "MCQ" && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            {(q.options || []).map((opt, i) => {
                              const isCorrect = q.correct_answer_index === i;
                              return (
                                <input
                                  key={i}
                                  value={opt}
                                  disabled={isLoading}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setQuestions(prev => prev.map(x => {
                                      if (x.id === q.id) {
                                        const newOpts = [...x.options];
                                        newOpts[i] = val;
                                        return { ...x, options: newOpts };
                                      }
                                      return x;
                                    }));
                                  }}
                                  style={{
                                    padding: "8px 12px",
                                    fontSize: "13px",
                                    backgroundColor: isCorrect ? "rgba(16, 185, 129, 0.08)" : "var(--base)",
                                    border: isCorrect ? "1.5px solid var(--emerald)" : "1px solid var(--line)",
                                    borderRadius: "8px",
                                    color: isCorrect ? "var(--emerald)" : "var(--text)",
                                    fontWeight: isCorrect ? 600 : 400,
                                    width: "100%",
                                    outline: "none",
                                    fontFamily: "inherit",
                                    boxSizing: "border-box",
                                  }}
                                />
                              );
                            })}
                          </div>
                        )}

                        {q.question_type === "TRUE_FALSE" && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            {["True", "False"].map((tfVal, i) => {
                              const isCorrect = q.correct_answer_index === i ||
                                (i === 0 && (q.correct_answer === "True" || q.correct_answer === "true")) ||
                                (i === 1 && (q.correct_answer === "False" || q.correct_answer === "false"));
                              return (
                                <div
                                  key={tfVal}
                                  style={{
                                    padding: "10px 14px",
                                    fontSize: "13px",
                                    backgroundColor: isCorrect ? "rgba(16, 185, 129, 0.12)" : "var(--base)",
                                    border: isCorrect ? "1.5px solid var(--emerald)" : "1px solid var(--line)",
                                    borderRadius: "8px",
                                    color: isCorrect ? "var(--emerald)" : "var(--text)",
                                    fontWeight: isCorrect ? 600 : 400,
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <span>{tfVal}</span>
                                  {isCorrect && (
                                    <span style={{ fontSize: "10px", background: "var(--emerald)", color: "#fff", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>
                                      CORRECT
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.question_type === "FILL_IN_BLANK" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px", background: "var(--base)", borderRadius: 8, border: "1px solid var(--line)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Correct Blank Answer:</span>
                              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--emerald)", background: "rgba(16, 185, 129, 0.12)", padding: "2px 8px", borderRadius: 4 }}>
                                {q.correct_answer || (q.blank_answer_variants && q.blank_answer_variants[0]) || "____"}
                              </span>
                            </div>
                            {q.blank_answer_variants && q.blank_answer_variants.length > 1 && (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: 2 }}>
                                <span style={{ fontSize: "11px", color: "var(--muted)" }}>Accepted variants:</span>
                                {q.blank_answer_variants.slice(1).map((bv, bvi) => (
                                  <span key={bvi} style={{ fontSize: "11px", color: "var(--text)", background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 4 }}>
                                    {bv}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {q.question_type === "MULTI_SELECT" && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            {(q.options || []).map((opt, i) => {
                              const isChecked = (q.correct_option_indices || []).includes(i);
                              return (
                                <div
                                  key={i}
                                  style={{
                                    padding: "8px 12px",
                                    fontSize: "13px",
                                    backgroundColor: isChecked ? "rgba(16, 185, 129, 0.08)" : "var(--base)",
                                    border: isChecked ? "1.5px solid var(--emerald)" : "1px solid var(--line)",
                                    borderRadius: "8px",
                                    color: isChecked ? "var(--emerald)" : "var(--text)",
                                    fontWeight: isChecked ? 600 : 400,
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <span>{opt}</span>
                                  {isChecked && (
                                    <span style={{ fontSize: "10px", background: "var(--emerald)", color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                                      CORRECT
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }))}
              </div>
            )}

            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
                <h3 style={{ fontSize: "1.5rem", fontWeight: 400, color: "var(--accent)", margin: 0, textAlign: "center" }}>
                  Ready to Assign
                </h3>

                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-muted)", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", minWidth: "300px" }}>
                  <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--raised)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", color: "var(--text-primary)" }}>
                    {selectedEmployee?.name.charAt(0) || "U"}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "1.2rem", color: "var(--text-primary)" }}>{selectedEmployee?.name}</h4>
                    <p style={{ margin: 0, color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "0.9rem" }}>ID: {selectedEmployee?.id}</p>
                    <p style={{ margin: "4px 0 0 0", color: "var(--accent)", fontSize: "0.85rem" }}>{selectedEmployee?.designation}</p>
                  </div>
                </div>

                <p style={{ color: "var(--text-secondary)", textAlign: "center", maxWidth: "80%", margin: 0 }}>
                  This will lock the current {questions.length}-question set and schedule the assessment.
                </p>

                {/* Exam Key (Req #1) */}
                <div style={{ width: "100%", maxWidth: 360, marginTop: 8 }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                    Exam Key{" "}<span style={{ fontWeight: 400, textTransform: "none", fontSize: "0.75rem" }}>(spoken to worker at test time)</span>
                  </label>
                  <input
                    type="text"
                    value={examKey}
                    onChange={(e) => setExamKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    maxLength={8}
                    placeholder="e.g. AX7K2B (leave blank to skip)"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      fontSize: "1.1rem",
                      fontFamily: "monospace",
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border-muted)",
                      borderRadius: 8,
                      color: "var(--text-primary)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    This key is verbal-only — do <strong>not</strong> send it digitally. The worker must enter it at test time in the presence of a supervisor. It is stored hashed and never revealed.
                  </p>
                </div>

                <div style={{ marginTop: 20 }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                    Exam Duration <span style={{ fontWeight: 400, textTransform: "none", fontSize: "0.75rem" }}>(in minutes)</span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { label: '30 mins', val: '30' },
                      { label: '1 hour', val: '60' },
                      { label: '1.5 hours', val: '90' },
                      { label: 'No Limit', val: '' }
                    ].map(opt => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setDurationMins(opt.val)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${durationMins === opt.val ? 'var(--accent)' : 'var(--line)'}`,
                          background: durationMins === opt.val ? 'var(--accent)' : 'var(--surface)',
                          color: durationMins === opt.val ? '#fff' : 'var(--ink)',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      placeholder="Custom mins"
                      value={!['30', '60', '90', ''].includes(durationMins) ? durationMins : ''}
                      onChange={(e) => setDurationMins(e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${!['30', '60', '90', ''].includes(durationMins) && durationMins !== '' ? 'var(--accent)' : 'var(--line)'}`,
                        background: 'var(--surface)',
                        width: '110px',
                        outline: 'none',
                        color: 'var(--ink)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    Setting a duration limit will auto-submit the exam when time runs out.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "16px" }}>
                  <span style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>Reveal Score to Worker Upon Completion</span>
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
                        backgroundColor: revealScore ? "var(--accent)" : "var(--raised)",
                        border: "1px solid var(--border-muted)",
                        transition: ".4s",
                        borderRadius: "24px",

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
                          backgroundColor: revealScore ? "#fff" : "var(--text-secondary)",
                          transition: ".4s",
                          borderRadius: "50%",
                        }}
                      />
                    </span>
                  </label>
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ marginBottom: "16px", padding: "16px", background: "rgba(0, 255, 100, 0.1)", borderRadius: "8px", border: "1px solid var(--emerald)" }}>
                  <h3 style={{ fontSize: "1.2rem", color: "var(--emerald)", margin: "0 0 8px 0" }}>Exam Successfully Assigned!</h3>
                  <p style={{ color: "var(--text-secondary)", margin: 0 }}>The exam has been locked and assigned to {selectedEmployee?.name}. Below is the final question set for review.</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {questions.map((q, idx) => (
                    <div key={q.id} style={{ padding: "16px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--ink)" }}>#{idx + 1}</span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(59, 130, 246, 0.1)", color: "#60a5fa" }}>
                            {q.question_type}
                          </span>
                          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(255, 255, 255, 0.05)", color: "var(--muted)", textTransform: "uppercase" }}>
                            {q.difficulty}
                          </span>
                        </div>
                      </div>
                      <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5, fontSize: "14px" }}>
                        {q.question_text}
                      </p>

                      {q.question_type === "MCQ" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          {(q.options || []).map((opt, i) => {
                            const isCorrect = q.correct_answer_index === i;
                            return (
                              <div key={i} style={{
                                padding: "8px 12px",
                                fontSize: "13px",
                                backgroundColor: isCorrect ? "rgba(16, 185, 129, 0.08)" : "var(--base)",
                                border: isCorrect ? "1.5px solid var(--emerald)" : "1px solid var(--line)",
                                borderRadius: "8px",
                                color: isCorrect ? "var(--emerald)" : "var(--text)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontWeight: isCorrect ? 600 : 400
                              }}>
                                <span>{opt}</span>
                                {isCorrect && <iconify-icon icon="lucide:check" style={{ fontSize: 16 }} />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.question_type === "TRUE_FALSE" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          {["True", "False"].map((tfVal, i) => {
                            const isCorrect = q.correct_answer_index === i ||
                              (i === 0 && (q.correct_answer === "True" || q.correct_answer === "true")) ||
                              (i === 1 && (q.correct_answer === "False" || q.correct_answer === "false"));
                            return (
                              <div key={tfVal} style={{
                                padding: "8px 12px",
                                fontSize: "13px",
                                backgroundColor: isCorrect ? "rgba(16, 185, 129, 0.12)" : "var(--base)",
                                border: isCorrect ? "1.5px solid var(--emerald)" : "1px solid var(--line)",
                                borderRadius: "8px",
                                color: isCorrect ? "var(--emerald)" : "var(--text)",
                                fontWeight: isCorrect ? 600 : 400,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}>
                                <span>{tfVal}</span>
                                {isCorrect && <span style={{ fontSize: "10px", background: "var(--emerald)", color: "#fff", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>CORRECT</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.question_type === "FILL_IN_BLANK" && (
                        <div style={{ padding: "8px 12px", background: "var(--base)", borderRadius: 8, border: "1px solid var(--line)", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Answer:</span>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--emerald)" }}>
                            {q.correct_answer || (q.blank_answer_variants && q.blank_answer_variants[0]) || "____"}
                          </span>
                        </div>
                      )}

                      {q.question_type === "MULTI_SELECT" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          {(q.options || []).map((opt, i) => {
                            const isChecked = (q.correct_option_indices || []).includes(i);
                            return (
                              <div key={i} style={{
                                padding: "8px 12px",
                                fontSize: "13px",
                                backgroundColor: isChecked ? "rgba(16, 185, 129, 0.08)" : "var(--base)",
                                border: isChecked ? "1.5px solid var(--emerald)" : "1px solid var(--line)",
                                borderRadius: "8px",
                                color: isChecked ? "var(--emerald)" : "var(--text)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontWeight: isChecked ? 600 : 400
                              }}>
                                <span>{opt}</span>
                                {isChecked && <span style={{ fontSize: "10px", background: "var(--emerald)", color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>CORRECT</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: "24px",
              borderTop: "1px solid var(--border-muted)",
              display: "flex",
              justifyContent: "space-between",
              backgroundColor: "var(--raised)",
            }}
          >
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="btn btn-secondary"
              >
                Back
              </button>
            ) : (
              <div /> // Placeholder to align next button right
            )}

            {step === 4 ? (
              <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                <button
                  onClick={onClose}
                  className="btn btn-primary"
                  style={{ padding: "10px 32px", fontSize: "1rem" }}
                >
                  Done
                </button>
              </div>
            ) : step < 3 ? (
              <button
                onClick={() => {
                  if (step === 1) {
                    if (!selectedEmployeeId) {
                      alert("Please select an employee first.");
                      return;
                    }
                    setStep(2);
                  }
                  else if (step === 2 && questions.length > 0) setStep(3);
                }}
                disabled={loading || (step === 2 && questions.length === 0)}
                className="btn btn-primary"
                style={{ opacity: (loading || (step === 2 && questions.length === 0)) ? 0.5 : 1 }}
              >
                {loading ? "Processing..." : "Next Step"}
              </button>
            ) : (
              <button
                onClick={handleFinalize}
                disabled={loading}
                className="btn btn-primary"
                style={{ padding: "10px 32px", fontSize: "1rem", background: "var(--accent)" }}
              >
                {loading ? "Locking..." : "Lock & Assign"}
              </button>
            )}
          </div>
        </motion.div>

        {/* Undo Toast Notification (10s countdown) */}
        <AnimatePresence>
          {undoToast && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              style={{
                position: "fixed",
                bottom: 28,
                right: 28,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "12px 18px",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                zIndex: 99999,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>⚡</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>
                  Question modified
                </span>
              </div>
              <button
                onClick={handleExecuteUndo}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 6px rgba(99, 102, 241, 0.3)",
                }}
              >
                <span>Undo</span>
                <span style={{ opacity: 0.85, fontSize: "11px" }}>({undoToast.secondsLeft}s)</span>
              </button>
              <button
                onClick={() => setUndoToast(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontSize: "15px",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
};
