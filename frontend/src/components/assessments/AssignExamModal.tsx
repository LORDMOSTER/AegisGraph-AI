import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { assembleExam, Employee, swapQuestion } from "../../api";

// --- STYLING CONSTANTS (Void-Glass-Clay) ---


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

interface QuestionVariant {
  id: string;
  question_text: string;
  options: string[];
  correct_answer_index?: number;
  rule_id?: string;
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
      setRevealScore(false);
      setExamKey("");
      setDurationMins("");
      setErrorMsg(null);
    }
  }, [isOpen]);

  const cleanMarkdown = (text: string) => {
    let t = text.replace(/\*\*(.*?)\*\*/g, "$1");
    t = t.replace(/\\underline\{_*\}/g, "_____"); // Fix LaTeX underline
    return t;
  };
  
  const cleanQuestion = (q: any) => {
    let cleanedOptions = (q.options || []).map((o: string) => cleanMarkdown(o).trim());
    
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
      ...q,
      question_text: cleanMarkdown(q.question_text || ""),
      options: cleanedOptions
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

  const handleSwap = async (q: QuestionVariant) => {
    if (!q.rule_id) return;
    try {
      setErrorMsg(null);
      const newQ = await swapQuestion(q.rule_id, q.id);
      if (newQ.error) {
        setErrorMsg(newQ.error);
        return;
      }
      const cleaned = cleanQuestion(newQ);
      setQuestions((prev) => prev.map((old) => (old.id === q.id ? cleaned : old)));
    } catch (e) {
      console.error(e);
    }
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
                  questions.map((q, idx) => (
                  <div
                    key={q.id}
                    style={{ padding: "16px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
                      <div style={{ display: "flex", flex: 1 }}>
                        <span style={{ color: "var(--muted)", marginRight: "8px", marginTop: "2px" }}>{idx + 1}.</span>
                        <textarea
                          value={q.question_text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, question_text: val } : x));
                          }}
                          style={{
                            margin: 0,
                            fontSize: "15px",
                            fontWeight: 600,
                            lineHeight: 1.5,
                            color: "var(--ink)",
                            background: "transparent",
                            border: "none",
                            width: "100%",
                            resize: "vertical",
                            outline: "none",
                            fontFamily: "inherit"
                          }}
                        />
                      </div>
                      <button
                        onClick={() => handleSwap(q)}
                        title="Swap/Regenerate Question"
                        style={{
                          background: "var(--base)",
                          border: "1px solid var(--line)",
                          borderRadius: "8px",
                          color: "var(--text)",
                          cursor: "pointer",
                          padding: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.2s",
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--text)"; }}
                      >
                        <SwapIcon />
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      {q.options.map((opt, i) => (
                        <input
                          key={i}
                          value={opt}
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
                            padding: "10px 14px",
                            fontSize: "13px",
                            backgroundColor: q.correct_answer_index === i ? "rgba(16, 185, 129, 0.08)" : "var(--base)",
                            border: q.correct_answer_index === i ? "1px solid var(--emerald)" : "1px solid var(--line)",
                            borderRadius: "8px",
                            color: q.correct_answer_index === i ? "var(--emerald)" : "var(--text)",
                            fontWeight: q.correct_answer_index === i ? 600 : 400,
                            width: "100%",
                            outline: "none",
                            fontFamily: "inherit",
                            boxSizing: "border-box"
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )))}
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
                    <div key={q.id} style={{ padding: "16px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>
                      <p style={{ margin: "0 0 16px 0", fontWeight: 600, color: "var(--ink)", lineHeight: 1.5, fontSize: "15px" }}>
                        <span style={{ color: "var(--muted)", marginRight: "8px" }}>{idx + 1}.</span>
                        {q.question_text}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        {q.options.map((opt, i) => {
                          const isCorrect = q.correct_answer_index === i;
                          return (
                            <div key={i} style={{
                              padding: "10px 14px",
                              fontSize: "13px",
                              backgroundColor: isCorrect ? "rgba(16, 185, 129, 0.08)" : "var(--base)",
                              border: isCorrect ? "1px solid var(--emerald)" : "1px solid var(--line)",
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
      </motion.div>
    </>
  );
};
