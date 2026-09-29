/**
 * ExamSession.tsx  — Free-navigation + Lockdown Edition
 *
 * Flow:
 *   UNLOCK → FULLSCREEN REQUEST → SCREENSHARE REQUEST → ACTIVE EXAM → RESULT
 *
 * Active Exam features:
 *   • Free navigation via question navigator sidebar (Req #1)
 *   • Color-coded question state: unanswered / answered / marked-for-review (Req #1)
 *   • Immediate answer persistence on every selection/keystroke (Req #2)
 *   • FILL_IN_BLANK text input styled consistently with MCQ buttons (Req #3)
 *   • Persistent "Submit Exam" bar, always visible (Req #4)
 *   • Confirmation modal counts unanswered questions (Req #4)
 *   • On submit: lockdown teardown + reveal_score logic (Req #5)
 *   • Lockdown monitoring never interrupted by navigation (Req #6)
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getExam, saveAnswer, submitExam, logLockdownAnomaly } from "../api";
import { ExamUnlockScreen } from "../components/ExamUnlockScreen";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExamQuestion {
  id: string;
  rule_id: string;
  question_text: string;
  options: string[];
  question_type: "MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK";
  difficulty?: string;
}

interface SubmitResult {
  status: string;
  score: number;
  passed: boolean;
  reveal_score_to_user: boolean;
  pass_mark_pct: number;
}

interface Props {
  examId: string;
  employeeCode: string;
  onExit: () => void;
}

type Phase = "unlock" | "fullscreen" | "screenshare" | "active" | "result" | "escalated";

/** Per-question navigator state */
type QState = "unanswered" | "answered" | "review";

const OPTION_LABELS = ["A", "B", "C", "D", "E"];
const MAX_ANOMALY_COUNT = 3;
const MAX_ANOMALY_DURATION_S = 30;

// ─── Question Navigator ───────────────────────────────────────────────────────

const Q_COLORS: Record<QState, { bg: string; border: string; text: string }> = {
  unanswered: {
    bg: "var(--raised)",
    border: "var(--line)",
    text: "var(--muted)",
  },
  answered: {
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.5)",
    text: "#10b981",
  },
  review: {
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.5)",
    text: "#f59e0b",
  },
};

function QuestionNavigator({
  questions,
  currentIndex,
  states,
  onNavigate,
}: {
  questions: ExamQuestion[];
  currentIndex: number;
  states: Record<string, QState>;
  onNavigate: (i: number) => void;
}) {
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--line)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--muted)",
            margin: 0,
          }}
        >
          Questions
        </p>
      </div>

      {/* Grid of question buttons */}
      <div
        style={{
          padding: "14px 12px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          flex: 1,
        }}
      >
        {questions.map((q, i) => {
          const state = states[q.id] ?? "unanswered";
          const isActive = i === currentIndex;
          const col = Q_COLORS[state];
          return (
            <button
              key={q.id}
              onClick={() => onNavigate(i)}
              title={
                state === "review"
                  ? `Q${i + 1} — Marked for Review`
                  : state === "answered"
                  ? `Q${i + 1} — Answered`
                  : `Q${i + 1} — Unanswered`
              }
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 7,
                border: isActive
                  ? "2px solid var(--accent)"
                  : `1.5px solid ${col.border}`,
                background: isActive ? "var(--accent)" : col.bg,
                color: isActive ? "#fff" : col.text,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                transition: "all 0.12s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isActive ? "0 2px 8px rgba(37,99,235,0.3)" : "none",
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {(
          [
            ["answered", "Answered"],
            ["review", "Marked for Review"],
            ["unanswered", "Unanswered"],
          ] as [QState, string][]
        ).map(([state, label]) => {
          const col = Q_COLORS[state];
          return (
            <div
              key={state}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "var(--muted)",
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: col.bg,
                  border: `1.5px solid ${col.border}`,
                  flexShrink: 0,
                }}
              />
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Submit Confirmation Modal ────────────────────────────────────────────────

function SubmitModal({
  unansweredCount,
  reviewCount,
  totalCount,
  submitting,
  onConfirm,
  onCancel,
}: {
  unansweredCount: number;
  reviewCount: number;
  totalCount: number;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10010,
        display: "grid",
        placeItems: "center",
        background: "rgba(7,7,14,0.7)",
        backdropFilter: "blur(6px)",
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: "rgba(37,99,235,0.08)",
            border: "1px solid rgba(37,99,235,0.2)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 20px",
          }}
        >
          <iconify-icon icon="lucide:send" style={{ fontSize: 24, color: "var(--accent)" }} />
        </div>

        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 19,
            fontWeight: 700,
            color: "var(--ink)",
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Submit Exam?
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            textAlign: "center",
            marginBottom: 22,
            lineHeight: 1.6,
          }}
        >
          You are about to submit your final answers. This cannot be undone.
        </p>

        {/* Summary stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginBottom: 22,
          }}
        >
          {[
            {
              label: "Answered",
              value: totalCount - unansweredCount,
              color: "#10b981",
              icon: "lucide:check-circle-2",
            },
            {
              label: "Unanswered",
              value: unansweredCount,
              color: unansweredCount > 0 ? "#ef4444" : "var(--muted)",
              icon: "lucide:circle",
            },
            {
              label: "For Review",
              value: reviewCount,
              color: reviewCount > 0 ? "#f59e0b" : "var(--muted)",
              icon: "lucide:bookmark",
            },
          ].map(({ label, value, color, icon }) => (
            <div
              key={label}
              style={{
                padding: "12px 8px",
                background: "var(--raised)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                textAlign: "center",
              }}
            >
              <iconify-icon
                icon={icon}
                style={{ fontSize: 18, color, display: "block", margin: "0 auto 4px" }}
              />
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {value}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Warning if unanswered */}
        {unansweredCount > 0 && (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8,
              fontSize: 12,
              color: "#dc2626",
              marginBottom: 20,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              lineHeight: 1.6,
            }}
          >
            <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }} />
            {unansweredCount} question{unansweredCount !== 1 ? "s" : ""} left unanswered.
            Unanswered questions will be marked as incorrect.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              height: 44,
              background: "var(--raised)",
              border: "1px solid var(--line)",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--muted)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Back to Exam
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            style={{
              flex: 2,
              height: 44,
              background: "var(--accent)",
              border: "none",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "var(--font-sans)",
              opacity: submitting ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              boxShadow: "0 4px 14px rgba(37,99,235,0.25)",
            }}
          >
            {submitting ? (
              <>
                <div
                  className="spinner"
                  style={{ width: 14, height: 14, borderTopColor: "#fff" }}
                />
                Submitting...
              </>
            ) : (
              <>
                <iconify-icon icon="lucide:check" style={{ fontSize: 16 }} />
                Confirm & Submit
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main ExamSession ─────────────────────────────────────────────────────────

export function ExamSession({ examId, employeeCode, onExit }: Props) {
  // ── Phase machine ─────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("unlock");

  // ── Exam data ─────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [assessmentName, setAssessmentName] = useState("");
  const [revealScore, setRevealScore] = useState(false);
  const [passMark, setPassMark] = useState(80);
  const [loading, setLoading] = useState(true);

  // ── Navigation & answer state ─────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [qStates, setQStates] = useState<Record<string, QState>>({});

  // ── Submit state ─────────────────────────────────────────────────────────
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  // ── Lockdown state (persists across all question navigation) ──────────────
  const [anomalyBanner, setAnomalyBanner] = useState<string | null>(null);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [cumulativeDuration, setCumulativeDuration] = useState(0);
  const screenshareRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);

  // Save in-flight guard: queue saves so rapid typing doesn't race
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load questions after unlock+fullscreen granted ────────────────────────
  useEffect(() => {
    if (phase !== "fullscreen") return;
    async function load() {
      const data = await getExam(examId);
      const qs: ExamQuestion[] = data.questions.map((q: any) => ({
        id: q.id,
        rule_id: q.rule_id,
        question_text: q.question_text,
        options: q.options ?? [],
        question_type: q.question_type ?? "MCQ",
        difficulty: q.difficulty,
      }));
      setQuestions(qs);
      setAssessmentName(data.assessment_name ?? "Safety Assessment");
      setRevealScore(!!data.reveal_score_to_user);
      setPassMark(data.pass_mark_pct ?? 80);

      // Restore any previously saved answers (crash-recovery)
      if (data.responses && typeof data.responses === "object") {
        const restored: Record<string, string> = {};
        const states: Record<string, QState> = {};
        for (const q of qs) {
          const raw = data.responses[q.id];
          if (raw !== undefined && raw !== null) {
            const val = typeof raw === "object" ? (raw.text_answer ?? String(raw.selected_option_index ?? "")) : String(raw);
            restored[q.id] = val;
            states[q.id] = "answered";
          }
        }
        setAnswers(restored);
        setQStates(states);
      }

      setLoading(false);
    }
    load();
  }, [examId, phase]);

  // ── Lockdown anomaly logger ────────────────────────────────────────────────
  // Uses functional state update so it never captures stale closures
  const logAnomaly = useCallback(
    async (type: string, durationS: number) => {
      setAnomalyCount((prev) => prev + 1);
      setCumulativeDuration((prev) => prev + durationS);

      const labels: Record<string, string> = {
        fullscreen_exit: "⚠️ Fullscreen exited — please press F11 to return.",
        focus_blur: "⚠️ Window focus lost — please return to this window.",
        tab_hidden: "⚠️ Tab was hidden — please keep this tab active.",
        screenshare_stopped: "⚠️ Screen monitoring stopped — please re-share your screen.",
        screenshare_changed: "⚠️ Shared screen changed — please share the correct screen.",
      };
      setAnomalyBanner(labels[type] ?? "⚠️ Lockdown anomaly detected.");
      setTimeout(() => setAnomalyBanner(null), 6000);

      try {
        const res = await logLockdownAnomaly(examId, type, durationS);
        if (res?.escalated) setPhase("escalated");
      } catch {
        // Fire-and-forget; never interrupt exam on network blip
      }
    },
    [examId]
  );

  // Check thresholds as separate effect responding to count/duration changes
  useEffect(() => {
    if (
      phase === "active" &&
      (anomalyCount >= MAX_ANOMALY_COUNT || cumulativeDuration >= MAX_ANOMALY_DURATION_S)
    ) {
      setPhase("escalated");
    }
  }, [anomalyCount, cumulativeDuration, phase]);

  // ── Fullscreen listener (Req #5 — active only, survives navigation) ────────
  useEffect(() => {
    if (phase !== "active") return;
    let outStart: number | null = null;

    const onFsChange = () => {
      const isFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (!isFs) {
        outStart = Date.now();
        setAnomalyBanner("⚠️ Fullscreen exited — press F11 or click the button below to return.");
      } else {
        if (outStart !== null) {
          logAnomaly("fullscreen_exit", (Date.now() - outStart) / 1000);
          outStart = null;
        }
        setAnomalyBanner(null);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, [phase, logAnomaly]);

  // ── Focus + visibility listeners (survives navigation) ────────────────────
  useEffect(() => {
    if (phase !== "active") return;
    let blurStart: number | null = null;
    let hiddenStart: number | null = null;

    const onBlur = () => { blurStart = Date.now(); };
    const onFocus = () => {
      if (blurStart !== null) {
        logAnomaly("focus_blur", (Date.now() - blurStart) / 1000);
        blurStart = null;
      }
    };
    const onVis = () => {
      if (document.hidden) { hiddenStart = Date.now(); }
      else if (hiddenStart !== null) {
        logAnomaly("tab_hidden", (Date.now() - hiddenStart) / 1000);
        hiddenStart = null;
      }
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [phase, logAnomaly]);

  // ── Cleanup: exit fullscreen + stop all streams ────────────────────────────
  const releaseAll = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    screenshareRef.current?.getTracks().forEach((t) => t.stop());
    screenshareRef.current = null;
    cameraRef.current?.getTracks().forEach((t) => t.stop());
    cameraRef.current = null;
  }, []);

  // ── Fullscreen request ────────────────────────────────────────────────────
  const requestFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
    } catch {}
    setPhase("screenshare");
  }, []);

  // ── Screen-capture request ────────────────────────────────────────────────
  const requestScreenshare = useCallback(async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });
      screenshareRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => logAnomaly("screenshare_stopped", 0);
        let lastLabel = track.label;
        setInterval(() => {
          const t = screenshareRef.current?.getVideoTracks()[0];
          if (t && t.label !== lastLabel) {
            lastLabel = t.label;
            logAnomaly("screenshare_changed", 0);
          }
        }, 2000);
      }
    } catch {}
    setPhase("active");
  }, [logAnomaly]);

  // ── Answer selection (MCQ / TRUE_FALSE) ───────────────────────────────────
  const handleSelect = useCallback(
    (qId: string, option: string, optionIndex: number) => {
      setAnswers((prev) => ({ ...prev, [qId]: option }));
      setQStates((prev) => ({
        ...prev,
        [qId]: prev[qId] === "review" ? "review" : "answered",
      }));
      // Immediate persistence (Req #2) — no debounce for MCQ clicks
      saveAnswer(examId, qId, optionIndex).catch(() => {});
    },
    [examId]
  );

  // ── Fill-in-blank input (debounced to avoid flooding API) ─────────────────
  const handleFillChange = useCallback(
    (qId: string, text: string) => {
      setAnswers((prev) => ({ ...prev, [qId]: text }));
      setQStates((prev) => ({
        ...prev,
        [qId]: text.trim() ? (prev[qId] === "review" ? "review" : "answered") : "unanswered",
      }));
      // Debounced save: 600ms quiet period (Req #2)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveAnswer(examId, qId, -1, text).catch(() => {});
      }, 600);
    },
    [examId]
  );

  // ── Toggle Mark for Review ────────────────────────────────────────────────
  const toggleReview = useCallback((qId: string) => {
    setQStates((prev) => {
      const cur = prev[qId] ?? "unanswered";
      if (cur === "review") return { ...prev, [qId]: answers[qId] ? "answered" : "unanswered" };
      return { ...prev, [qId]: "review" };
    });
  }, [answers]);

  // ── Submit logic ──────────────────────────────────────────────────────────
  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    try {
      // Compute a simple integrity score from anomaly count (lower = worse)
      const integrityScore = Math.max(0, 100 - anomalyCount * 15 - cumulativeDuration * 0.5);
      const res = await submitExam(examId, integrityScore);
      setResult(res as SubmitResult);
      releaseAll();
      setPhase("result");
    } catch (e) {
      console.error("Submit failed", e);
    } finally {
      setSubmitting(false);
      setShowSubmitModal(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const unansweredCount = questions.filter((q) => !answers[q.id]?.trim()).length;
  const reviewCount = Object.values(qStates).filter((s) => s === "review").length;
  const currentQ = questions[currentIndex];
  const progress = questions.length > 0 ? Object.keys(answers).filter((k) => answers[k]?.trim()).length / questions.length : 0;

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: UNLOCK
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "unlock") {
    return (
      <ExamUnlockScreen
        examId={examId}
        employeeCode={employeeCode}
        onUnlocked={() => setPhase("fullscreen")}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: FULLSCREEN REQUEST
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "fullscreen") {
    return (
      <GateScreen
        icon="lucide:maximize"
        title="Fullscreen Required"
        body="This exam must run in fullscreen mode. Click below — your questions will not be visible until fullscreen is active."
        primaryLabel="Enter Fullscreen & Continue"
        primaryIcon="lucide:maximize-2"
        onPrimary={requestFullscreen}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: SCREENSHARE REQUEST
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "screenshare") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "var(--base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 500,
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 36,
            textAlign: "center",
            boxShadow: "0 24px 72px rgba(28,28,26,0.14)",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "rgba(37,99,235,0.08)",
              border: "1px solid rgba(37,99,235,0.18)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 20px",
            }}
          >
            <iconify-icon icon="lucide:monitor" style={{ fontSize: 26, color: "var(--accent)" }} />
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>
            Screen Monitoring Consent
          </h2>
          <div
            style={{
              background: "rgba(37,99,235,0.04)",
              border: "1px solid rgba(37,99,235,0.15)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 20,
              textAlign: "left",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.7, margin: 0 }}>
              <strong>Privacy Notice:</strong> This exam monitors for window switching during the test.{" "}
              <strong>Nothing is recorded, saved, or sent anywhere</strong> — screen capture detects focus changes only.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setPhase("active")} style={secondaryBtnStyle}>Skip</button>
            <button onClick={requestScreenshare} style={primaryBtnStyle}>
              <iconify-icon icon="lucide:monitor-check" style={{ fontSize: 16 }} />
              Allow Monitoring & Begin
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: LOADING
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "active" && loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--base)", flexDirection: "column", gap: 16 }}>
        <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--accent)" }} />
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading exam questions...</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: ESCALATED
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "escalated") {
    releaseAll();
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "var(--base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 440, width: "100%", background: "var(--surface)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: 36, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "grid", placeItems: "center", margin: "0 auto 20px" }}>
            <iconify-icon icon="lucide:shield-alert" style={{ fontSize: 26, color: "#dc2626" }} />
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>Exam Session Suspended</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 20 }}>
            Too many monitoring violations were detected. Your attempt has been flagged for <strong>supervisor review</strong>.
          </p>
          <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 22, fontSize: 12, color: "#dc2626" }}>
            {anomalyCount} violation{anomalyCount !== 1 ? "s" : ""} · {cumulativeDuration.toFixed(1)}s cumulative outside lockdown
          </div>
          <button onClick={onExit} style={{ width: "100%", height: 44, background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "var(--ink)", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: RESULT
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "result" && result) {
    // Req #5: respect reveal_score_to_user
    if (!result.reveal_score_to_user) {
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "var(--base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 440, width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: "var(--shadow-card)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", display: "grid", placeItems: "center", margin: "0 auto 24px" }}>
              <iconify-icon icon="lucide:clipboard-check" style={{ fontSize: 30, color: "var(--accent)" }} />
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>Exam Submitted</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, lineHeight: 1.7 }}>
              Your exam has been submitted for review. Your supervisor will notify you of your result.
            </p>
            <MonitoringEndedNotice />
            <button onClick={onExit} style={{ ...primaryBtnStyle, width: "100%", marginTop: 24, justifyContent: "center" }}>
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    const isPass = result.passed;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "var(--base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 440, width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: "var(--shadow-card)" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: isPass ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", display: "grid", placeItems: "center", margin: "0 auto 24px" }}>
            <iconify-icon icon={isPass ? "lucide:check-circle" : "lucide:x-circle"} style={{ fontSize: 32, color: isPass ? "var(--emerald)" : "var(--red)" }} />
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
            {isPass ? "Exam Passed!" : "Exam Complete"}
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 6 }}>
            Your score: <strong style={{ color: "var(--ink)", fontSize: 18 }}>{result.score.toFixed(1)}%</strong>
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 22 }}>
            Pass mark: {result.pass_mark_pct}%
          </p>

          {isPass ? (
            <div style={{ padding: "14px", background: "rgba(16,185,129,0.05)", borderRadius: 8, border: "1px solid var(--emerald)", marginBottom: 20 }}>
              <p style={{ color: "var(--emerald)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Congratulations!</p>
              <p style={{ color: "var(--emerald)", fontSize: 12, opacity: 0.9 }}>You've passed. Your certificate has been generated.</p>
            </div>
          ) : (
            <div style={{ padding: "14px", background: "rgba(239,68,68,0.05)", borderRadius: 8, border: "1px solid var(--red)", marginBottom: 20 }}>
              <p style={{ color: "var(--red)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Did not pass</p>
              <p style={{ color: "var(--red)", fontSize: 12, opacity: 0.9 }}>Please review the safety rules and speak to your supervisor.</p>
            </div>
          )}

          <MonitoringEndedNotice />
          <button onClick={onExit} style={{ width: "100%", height: 44, background: "var(--ink)", color: "var(--surface)", border: "none", borderRadius: 9, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", marginTop: 20 }}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: ACTIVE EXAM
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--base)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── Anomaly Banner ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {anomalyBanner && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10002,
              background: "#dc2626",
              color: "#fff",
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <iconify-icon icon="lucide:alert-triangle" style={{ fontSize: 16, flexShrink: 0 }} />
            {anomalyBanner}
            <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.85, fontFamily: "var(--font-mono)" }}>
              Violations: {anomalyCount}/{MAX_ANOMALY_COUNT}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)", flexShrink: 0, zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px" }}>
          {/* Exam title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", margin: 0 }}>
              {assessmentName}
            </p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", margin: 0, marginTop: 1 }}>
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>

          {/* Progress bar */}
          <div style={{ flex: 2, height: 6, background: "var(--raised)", borderRadius: 4, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${progress * 100}%` }}
              style={{ height: "100%", background: "var(--accent)", borderRadius: 4 }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
            {Math.round(progress * 100)}% answered
          </span>

          {/* Monitoring badge */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid var(--line)",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--ink)",
            flexShrink: 0,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", animation: "pulse 2s infinite" }} />
            Monitoring
            {anomalyCount > 0 && (
              <span style={{ background: "#dc2626", color: "#fff", borderRadius: 999, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                {anomalyCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content (navigator + question) ────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Navigator sidebar (Req #1) */}
        <QuestionNavigator
          questions={questions}
          currentIndex={currentIndex}
          states={qStates}
          onNavigate={setCurrentIndex}  // Navigation NEVER re-triggers unlock or screenshare (Req #6)
        />

        {/* Question area */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <AnimatePresence mode="wait">
            {currentQ && (
              <motion.div
                key={currentQ.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
                style={{ flex: 1, maxWidth: 780, margin: "0 auto", padding: "32px 32px 24px", width: "100%" }}
              >
                {/* Meta row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <span style={{ background: "rgba(37,99,235,0.08)", color: "#1d4ed8", borderRadius: 999, padding: "3px 12px", fontSize: 11, fontWeight: 600 }}>
                    Q{currentIndex + 1}
                  </span>
                  {currentQ.question_type === "FILL_IN_BLANK" && (
                    <span style={{ background: "rgba(124,58,237,0.08)", color: "#7c3aed", borderRadius: 999, padding: "3px 12px", fontSize: 11, fontWeight: 600 }}>
                      Fill in the Blank
                    </span>
                  )}
                  {currentQ.difficulty && (
                    <span style={{
                      background: currentQ.difficulty === "hard" ? "rgba(239,68,68,0.08)" : currentQ.difficulty === "easy" ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
                      color: currentQ.difficulty === "hard" ? "#ef4444" : currentQ.difficulty === "easy" ? "#10b981" : "#f59e0b",
                      borderRadius: 999,
                      padding: "3px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}>
                      {currentQ.difficulty}
                    </span>
                  )}

                  {/* Mark for Review toggle (Req #1) */}
                  <button
                    onClick={() => toggleReview(currentQ.id)}
                    style={{
                      marginLeft: "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: qStates[currentQ.id] === "review" ? "rgba(245,158,11,0.1)" : "var(--raised)",
                      border: qStates[currentQ.id] === "review" ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--line)",
                      borderRadius: 7,
                      padding: "5px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: qStates[currentQ.id] === "review" ? "#f59e0b" : "var(--muted)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <iconify-icon icon="lucide:bookmark" style={{ fontSize: 13 }} />
                    {qStates[currentQ.id] === "review" ? "Marked for Review" : "Mark for Review"}
                  </button>
                </div>

                {/* Question text */}
                <h1
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 21,
                    fontWeight: 600,
                    color: "var(--ink)",
                    lineHeight: 1.55,
                    marginBottom: 28,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {currentQ.question_text}
                </h1>

                {/* ── MCQ / TRUE_FALSE options ─────────────────────────────── */}
                {currentQ.question_type !== "FILL_IN_BLANK" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {currentQ.options.map((opt, i) => {
                      const isSelected = answers[currentQ.id] === opt;
                      return (
                        <button
                          key={i}
                          onClick={() => handleSelect(currentQ.id, opt, i)}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 14,
                            padding: "14px 18px",
                            textAlign: "left",
                            background: isSelected ? "rgba(37,99,235,0.05)" : "var(--surface)",
                            border: isSelected ? "2px solid var(--accent)" : "1px solid var(--line)",
                            borderRadius: 10,
                            color: isSelected ? "var(--ink)" : "var(--muted)",
                            fontSize: 14,
                            cursor: "pointer",
                            minHeight: 56,
                            transition: "all 0.12s",
                            fontFamily: "var(--font-sans)",
                            boxShadow: isSelected ? "0 0 0 1px rgba(37,99,235,0.12)" : "var(--shadow-card)",
                            width: "100%",
                          }}
                        >
                          <span
                            style={{
                              display: "grid",
                              placeItems: "center",
                              width: 26,
                              height: 26,
                              borderRadius: 6,
                              background: isSelected ? "var(--accent)" : "var(--raised)",
                              color: isSelected ? "#fff" : "var(--muted)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0,
                              marginTop: 1,
                              transition: "all 0.12s",
                            }}
                          >
                            {OPTION_LABELS[i]}
                          </span>
                          <span style={{ lineHeight: 1.55, flex: 1 }}>{opt}</span>
                          {isSelected && (
                            <iconify-icon
                              icon="lucide:check-circle-2"
                              style={{ fontSize: 18, color: "var(--accent)", flexShrink: 0, marginTop: 3 }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* ── FILL_IN_BLANK (Req #3) ─────────────────────────────── */
                  <div>
                    <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, fontStyle: "italic" }}>
                      Type your answer below. Whether your answer is correct will be revealed only after submission.
                    </p>
                    <input
                      type="text"
                      value={answers[currentQ.id] ?? ""}
                      onChange={(e) => handleFillChange(currentQ.id, e.target.value)}
                      placeholder="Type your answer here..."
                      autoComplete="off"
                      style={{
                        width: "100%",
                        padding: "14px 18px",
                        background: "var(--surface)",
                        border: answers[currentQ.id]?.trim() ? "2px solid var(--accent)" : "1.5px solid var(--line)",
                        borderRadius: 10,
                        color: "var(--ink)",
                        fontSize: 16,
                        fontFamily: "var(--font-sans)",
                        outline: "none",
                        boxSizing: "border-box",
                        transition: "border-color 0.15s",
                        boxShadow: "var(--shadow-card)",
                        minHeight: 56,
                      }}
                      onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                      onBlur={(e) => (e.target.style.borderColor = answers[currentQ.id]?.trim() ? "var(--accent)" : "var(--line)")}
                    />
                    {answers[currentQ.id]?.trim() && (
                      <p style={{ marginTop: 8, fontSize: 12, color: "#10b981", display: "flex", alignItems: "center", gap: 5 }}>
                        <iconify-icon icon="lucide:check-circle" style={{ fontSize: 13 }} />
                        Answer saved
                      </p>
                    )}
                  </div>
                )}

                {/* ── Prev / Next navigation ───────────────────────────────── */}
                <div
                  style={{
                    marginTop: 36,
                    paddingTop: 20,
                    borderTop: "1px solid var(--line)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                    disabled={currentIndex === 0}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      borderRadius: 8,
                      padding: "9px 18px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--muted)",
                      cursor: currentIndex === 0 ? "default" : "pointer",
                      opacity: currentIndex === 0 ? 0.4 : 1,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <iconify-icon icon="lucide:arrow-left" style={{ fontSize: 15 }} />
                    Previous
                  </button>

                  <button
                    onClick={() => setCurrentIndex((p) => Math.min(questions.length - 1, p + 1))}
                    disabled={currentIndex === questions.length - 1}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      borderRadius: 8,
                      padding: "9px 18px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--muted)",
                      cursor: currentIndex === questions.length - 1 ? "default" : "pointer",
                      opacity: currentIndex === questions.length - 1 ? 0.4 : 1,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    Next
                    <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 15 }} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Persistent Submit Bar (Req #4, always visible) ───────────────── */}
      <div
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--line)",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Status summary */}
          <div style={{ display: "flex", gap: 10 }}>
            <StatusChip
              count={questions.length - unansweredCount}
              label="answered"
              color="#10b981"
              icon="lucide:check-circle-2"
            />
            {unansweredCount > 0 && (
              <StatusChip
                count={unansweredCount}
                label="unanswered"
                color="#ef4444"
                icon="lucide:circle"
              />
            )}
            {reviewCount > 0 && (
              <StatusChip
                count={reviewCount}
                label="for review"
                color="#f59e0b"
                icon="lucide:bookmark"
              />
            )}
          </div>
        </div>

        <button
          onClick={() => setShowSubmitModal(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            padding: "10px 22px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(37,99,235,0.25)",
            fontFamily: "var(--font-sans)",
            flexShrink: 0,
          }}
        >
          <iconify-icon icon="lucide:send" style={{ fontSize: 15 }} />
          Submit Exam
        </button>
      </div>

      {/* ── Submit Confirmation Modal (Req #4) ────────────────────────────── */}
      <AnimatePresence>
        {showSubmitModal && (
          <SubmitModal
            unansweredCount={unansweredCount}
            reviewCount={reviewCount}
            totalCount={questions.length}
            submitting={submitting}
            onConfirm={handleConfirmSubmit}
            onCancel={() => setShowSubmitModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Small shared components ──────────────────────────────────────────────────

function StatusChip({ count, label, color, icon }: { count: number; label: string; color: string; icon: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)" }}>
      <iconify-icon icon={icon} style={{ fontSize: 13, color }} />
      <span style={{ fontWeight: 600, color }}>{count}</span>
      <span>{label}</span>
    </div>
  );
}

function MonitoringEndedNotice() {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "rgba(22,163,74,0.05)",
        border: "1px solid rgba(22,163,74,0.2)",
        borderRadius: 8,
        fontSize: 12,
        color: "#15803d",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <iconify-icon icon="lucide:shield-off" style={{ fontSize: 14, flexShrink: 0 }} />
      Exam submitted — monitoring ended. Fullscreen and screen capture have been released.
    </div>
  );
}

function GateScreen({
  icon,
  title,
  body,
  primaryLabel,
  primaryIcon,
  onPrimary,
}: {
  icon: string;
  title: string;
  body: string;
  primaryLabel: string;
  primaryIcon: string;
  onPrimary: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "var(--base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 36, textAlign: "center", boxShadow: "0 24px 72px rgba(28,28,26,0.14)" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)", display: "grid", placeItems: "center", margin: "0 auto 20px" }}>
          <iconify-icon icon={icon} style={{ fontSize: 26, color: "var(--accent)" }} />
        </div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>{title}</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 24 }}>{body}</p>
        <button onClick={onPrimary} style={{ ...primaryBtnStyle, width: "100%", justifyContent: "center" }}>
          <iconify-icon icon={primaryIcon} style={{ fontSize: 16 }} />
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Shared button style objects ─────────────────────────────────────────────
const primaryBtnStyle: React.CSSProperties = {
  flex: "1",
  height: 44,
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  boxShadow: "0 4px 14px rgba(37,99,235,0.25)",
};

const secondaryBtnStyle: React.CSSProperties = {
  flex: "0 0 auto",
  height: 44,
  background: "var(--raised)",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  padding: "0 18px",
};
