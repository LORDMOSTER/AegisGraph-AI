/**
 * LockAndAssignStep.tsx
 * Step 5: Preview assignment target, optional exam access key, then lock & assign in one action.
 */

import React, { useState, useEffect } from "react";
import {
  ExamDraftModel,
  ValidationResponse,
  validateDraft,
  lockDraft,
  assignDraftExam,
  getEmployees,
  getDepartments,
  Employee,
  Department,
} from "../../api";

interface LockAndAssignStepProps {
  draft: ExamDraftModel;
  onBackToEdit: () => void;
  onDone: () => void;
  onStartFresh?: () => void;
}

export const LockAndAssignStep: React.FC<LockAndAssignStepProps> = ({
  draft,
  onBackToEdit,
  onDone,
  onStartFresh,
}) => {
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [validating, setValidating] = useState(true);

  const [isWorking, setIsWorking] = useState(false);
  const [assignResult, setAssignResult] = useState<{
    status: string;
    sessions_created: number;
    assessment_id: string;
  } | null>(null);

  const [examKey, setExamKey] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // For showing assigned user info
  const [targetLabel, setTargetLabel] = useState<string>("");
  const [targetUserCount, setTargetUserCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    validateDraft(draft.id)
      .then((res) => {
        if (mounted) {
          setValidation(res);
          setValidating(false);
        }
      })
      .catch((err) => {
        console.error("Validation error", err);
        if (mounted) setValidating(false);
      });

    return () => {
      mounted = false;
    };
  }, [draft.id]);

  // Resolve target to human-readable label + user count
  useEffect(() => {
    const target = (draft as any).target || {};
    const ttype = target.type;
    const tval = target.value;
    const tlabel = target.label;

    if (!ttype || !tval) {
      setTargetLabel("No target selected");
      return;
    }

    if (ttype === "employee_id") {
      if (tlabel) {
        setTargetLabel(tlabel);
        setTargetUserCount(1);
      } else {
        // Look up employee name
        getEmployees()
          .then((emps: Employee[]) => {
            const emp = emps.find((e) => e.id === tval);
            if (emp) {
              setTargetLabel(`${emp.name} (${emp.id})`);
              setTargetUserCount(1);
            } else {
              setTargetLabel(tval);
              setTargetUserCount(1);
            }
          })
          .catch(() => {
            setTargetLabel(tval);
            setTargetUserCount(1);
          });
      }
    } else if (ttype === "department") {
      getDepartments()
        .then((depts: Department[]) => {
          const dept = depts.find((d) => d.code === tval);
          if (dept) {
            setTargetLabel(`${dept.name} Department (${dept.code})`);
            setTargetUserCount(dept.employeeCount || null);
          } else {
            setTargetLabel(tlabel || tval);
          }
        })
        .catch(() => setTargetLabel(tlabel || tval));
    } else if (ttype === "role") {
      setTargetLabel(`All users with role: ${tlabel || tval}`);
    }
  }, [draft]);

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

  const hasBlockingErrors = (validation?.errors?.length || 0) > 0;

  const handleLockAndAssign = async () => {
    setIsWorking(true);
    setActionError(null);
    try {
      // Step 1: Lock (if not yet locked)
      if (draft.status === "draft") {
        await lockDraft(draft.id);
      }

      // Step 2: Assign
      const res = await assignDraftExam(draft.id, {
        exam_key: examKey.trim() || undefined,
      });

      // Clear active draft from local storage so next session starts completely fresh
      localStorage.removeItem("aegis_active_draft_id");

      setAssignResult({
        status: res.status,
        sessions_created: res.sessions_created || res.assigned_count || 0,
        assessment_id: res.assessment_id,
      });
    } catch (err: any) {
      setActionError(err.message || "Failed to lock and assign exam");
    } finally {
      setIsWorking(false);
    }
  };

  // SUCCESS VIEW
  if (assignResult) {
    return (
      <div style={{ maxWidth: 560, margin: "60px auto", padding: "0 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Check Icon */}
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(16, 185, 129, 0.15)", border: "2px solid rgba(16, 185, 129, 0.4)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <iconify-icon icon="lucide:check" style={{ fontSize: 36, color: "var(--emerald, #10b981)" }} />
        </div>

        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
            Exam Assigned Successfully!
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            <strong>{draft.title}</strong> has been locked and dispatched.
          </p>
        </div>

        {/* Summary Card */}
        <div style={{ padding: 20, borderRadius: 12, background: "var(--surface-elevated, var(--raised))", border: "1px solid var(--border)", textAlign: "left", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--text-secondary)" }}>Sessions Created:</span>
            <span style={{ fontWeight: 700, color: "var(--emerald)" }}>{assignResult.sessions_created}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--text-secondary)" }}>Assigned To:</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", textAlign: "right", maxWidth: "60%" }}>{targetLabel}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--text-secondary)" }}>Total Questions:</span>
            <span style={{ fontWeight: 600 }}>{totalQuestions}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--text-secondary)" }}>Assessment ID:</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--accent)" }}>{assignResult.assessment_id}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {onStartFresh && (
            <button
              type="button"
              onClick={onStartFresh}
              className="btn btn-secondary"
              style={{ padding: "12px 24px", fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <iconify-icon icon="lucide:plus" style={{ fontSize: 16 }} />
              <span>Build Another Exam</span>
            </button>
          )}
          <button
            type="button"
            onClick={onDone}
            className="btn btn-primary"
            style={{ padding: "12px 28px", fontSize: 14, fontWeight: 600 }}
          >
            Done — Go to Assigned Exams
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
        <div>
          <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)" }}>
            Step 5 of 5
          </span>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 4, marginBottom: 4 }}>
            Lock & Assign
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Review, then lock and dispatch to your selected target.
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToEdit}
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: "6px 14px", whiteSpace: "nowrap" }}
        >
          ← Back to Editor
        </button>
      </div>

      {actionError && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.3)", color: "var(--rose, #f43f5e)", fontSize: 13 }}>
          <iconify-icon icon="lucide:alert-circle" style={{ marginRight: 6 }} />
          {actionError}
        </div>
      )}

      {/* ASSIGNMENT TARGET PREVIEW */}
      <div className="card" style={{ padding: 20, background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Assignment Target
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(6, 182, 212, 0.12)", border: "1px solid rgba(6, 182, 212, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cyan, #06b6d4)", flexShrink: 0 }}>
            <iconify-icon
              icon={
                (draft as any).target?.type === "employee_id"
                  ? "lucide:user"
                  : (draft as any).target?.type === "department"
                  ? "lucide:building-2"
                  : "lucide:briefcase"
              }
              style={{ fontSize: 22 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{targetLabel || "Loading..."}</div>
            {targetUserCount !== null && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {targetUserCount === 1 ? "1 user will receive this exam" : `${targetUserCount} users will receive this exam`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EXAM SUMMARY METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <div style={{ padding: 16, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Questions</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{totalQuestions}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{draft.sections.length} section{draft.sections.length !== 1 ? "s" : ""}</div>
        </div>

        <div style={{ padding: 16, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Total Marks</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", fontFamily: "monospace" }}>{totalMarks}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Pass: {passMarks} pts ({draft.pass_percent}%)</div>
        </div>

        <div style={{ padding: 16, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Duration</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{draft.duration_minutes}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>minutes</div>
        </div>

        <div style={{ padding: 16, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Type Mix</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
            {typeCounts.MCQ > 0 && <div>MCQ: {typeCounts.MCQ}</div>}
            {typeCounts.TRUE_FALSE > 0 && <div>T/F: {typeCounts.TRUE_FALSE}</div>}
            {typeCounts.MULTI_SELECT > 0 && <div>Multi: {typeCounts.MULTI_SELECT}</div>}
          </div>
        </div>
      </div>

      {/* SECTIONS TABLE */}
      {draft.sections.length > 0 && (
        <div className="card" style={{ padding: 20, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Sections
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.sections.map((sec, idx) => {
              const sQ = sec.questions?.length || 0;
              const sM = (sec.questions || []).reduce((a, q) => a + (q.marks || 1), 0);
              return (
                <div
                  key={sec.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "var(--raised, rgba(255,255,255,0.03))",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                    {idx + 1}. {sec.title}
                  </span>
                  <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {sQ} Qs · {sM} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VALIDATION */}
      <div className="card" style={{ padding: 20, background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Pre-Lock Check
          </h4>
          {validating && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Checking...</span>}
        </div>

        {validation && (
          <div>
            {validation.errors.length > 0 && (
              <div style={{ padding: 14, borderRadius: 10, background: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.3)", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--rose, #f43f5e)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <iconify-icon icon="lucide:x-circle" style={{ fontSize: 15 }} />
                  {validation.errors.length} blocking error{validation.errors.length !== 1 ? "s" : ""} must be fixed:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "rgba(244, 63, 94, 0.9)" }}>
                  {validation.errors.map((err, i) => (
                    <li key={i}>{err.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div style={{ padding: 12, borderRadius: 10, background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--amber, #f59e0b)", marginBottom: 4 }}>
                  {validation.warnings.length} warning{validation.warnings.length !== 1 ? "s" : ""}:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "rgba(245, 158, 11, 0.9)" }}>
                  {validation.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {validation.errors.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--emerald, #10b981)" }}>
                <iconify-icon icon="lucide:check-circle" style={{ fontSize: 16 }} />
                All integrity checks passed. Ready to lock.
              </div>
            )}
          </div>
        )}
      </div>

      {/* EXAM KEY & LOCK/ASSIGN */}
      <div className="card" style={{ padding: 24, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            Exam Access Key <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(Optional)</span>
          </label>
          <input
            type="text"
            value={examKey}
            onChange={(e) => setExamKey(e.target.value.toUpperCase())}
            placeholder="e.g. SAFE-2026"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--raised)",
              border: "1px solid var(--border)",
              fontSize: 14,
              fontFamily: "monospace",
              letterSpacing: "0.08em",
              color: "var(--text-primary)",
              boxSizing: "border-box",
            }}
          />
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
            Workers must enter this code at the kiosk before starting. Leave blank for no access code requirement.
          </p>
        </div>

        <button
          type="button"
          disabled={hasBlockingErrors || isWorking || validating}
          onClick={handleLockAndAssign}
          className="btn btn-primary"
          style={{
            padding: "14px 32px",
            fontSize: 15,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: hasBlockingErrors || validating ? 0.5 : 1,
            cursor: hasBlockingErrors || validating ? "not-allowed" : isWorking ? "wait" : "pointer",
          }}
        >
          {isWorking ? (
            <>
              <iconify-icon icon="lucide:loader-2" className="spin" style={{ fontSize: 18 }} />
              <span>Locking & Assigning...</span>
            </>
          ) : (
            <>
              <iconify-icon icon="lucide:lock" style={{ fontSize: 18 }} />
              <span>Lock & Assign Exam</span>
            </>
          )}
        </button>

        {hasBlockingErrors && (
          <p style={{ fontSize: 12, color: "var(--rose, #f43f5e)", textAlign: "center", margin: 0 }}>
            Fix blocking errors before assigning.
          </p>
        )}
      </div>
    </div>
  );
};
