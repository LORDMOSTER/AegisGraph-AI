/**
 * ExamSession.tsx  — Free-navigation + Lockdown Edition
 *
 * Flow:
 *   UNLOCK → SCREENSHARE → IDENTITY CHECK → FULLSCREEN → ACTIVE EXAM → RESULT
 *
 * Active Exam features:
 *   • Free navigation via question navigator sidebar (Req #1)
 *   • Color-coded question state: unanswered / answered / marked-for-review (Req #1)
 *   • Immediate answer persistence on every selection/keystroke (Req #2)
 *   • FILL_IN_BLANK text input (Req #3)
 *   • MULTI_SELECT checkbox UI with count display (Section 2)
 *   • Persistent "Submit Exam" bar, always visible (Req #4)
 *   • Pre-submit modal with jump-to links for unanswered/review (Section 4)
 *   • Double-confirm if unanswered count > 0 (Section 4)
 *   • 3-warning escalation counter shown to worker (Section 6)
 *   • Anomaly clip recording via rolling buffer (Section 6)
 *   • Identity verification with face-api.js (Section 5)
 */
import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { getExam, saveAnswer, submitExam, logLockdownAnomaly, getFaceEmbedding } from "../api";
import { ExamUnlockScreen } from "../components/ExamUnlockScreen";
import { FaceVerification } from "../components/FaceVerification";
import { useAnomalyClipRecorder } from "../hooks/useAnomalyClipRecorder";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExamQuestion {
  id: string;
  rule_id: string;
  question_text: string;
  options: string[];
  question_type: "MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK" | "MULTI_SELECT";
  difficulty?: string;
  correct_option_indices?: number[]; // for MULTI_SELECT (pre-loaded to validate answer completeness)
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

type Phase = "unlock" | "screenshare" | "identity" | "fullscreen" | "active" | "result" | "escalated";

/** Per-question navigator state */
type QState = "unanswered" | "answered" | "review";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
const MAX_ANOMALY_COUNT = 3; // auto-escalate after this many warnings
const MAX_ANOMALY_DURATION_S = 60;

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
        width: 120,
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

      {/* Flex grid of question buttons */}
      <div
        style={{
          padding: "14px 12px",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignContent: "flex-start",
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
                width: 40,
                height: 40,
                borderRadius: 7,
                border: isActive && state !== "review"
                  ? "2px solid var(--accent)"
                  : state === "review" ? "2px solid #f59e0b" : `1.5px solid ${col.border}`,
                background: isActive ? (state === "review" ? "#f59e0b" : "var(--accent)") : col.bg,
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
                flexShrink: 0,
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
  unansweredIndexes,
  reviewIndexes,
  onConfirm,
  onCancel,
  onJump,
}: {
  unansweredCount: number;
  reviewCount: number;
  totalCount: number;
  submitting: boolean;
  unansweredIndexes: number[];
  reviewIndexes: number[];
  onConfirm: () => void;
  onCancel: () => void;
  onJump: (idx: number) => void;
}) {
  const [doubleConfirm, setDoubleConfirm] = useState(false);
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
              flexDirection: "column",
              lineHeight: 1.6,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>{unansweredCount} question{unansweredCount !== 1 ? "s" : ""} left unanswered.</strong>
                <br /> Unanswered questions will be marked as incorrect.
              </div>
            </div>
          </div>
        )}

        {/* Jump Links (Section 4) */}
        {(unansweredIndexes.length > 0 || reviewIndexes.length > 0) && (
          <div style={{ marginBottom: 24 }}>
            {unansweredIndexes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Unanswered</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {unansweredIndexes.map(idx => (
                    <button key={idx} onClick={() => onJump(idx)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#dc2626", padding: "4px 8px", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-mono)" }}>Q{idx + 1}</button>
                  ))}
                </div>
              </div>
            )}
            {reviewIndexes.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Marked for Review</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {reviewIndexes.map(idx => (
                    <button key={idx} onClick={() => onJump(idx)} style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, color: "#f59e0b", padding: "4px 8px", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-mono)" }}>Q{idx + 1}</button>
                  ))}
                </div>
              </div>
            )}
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
            onClick={() => {
              if (unansweredCount > 0 && !doubleConfirm) {
                setDoubleConfirm(true);
              } else {
                onConfirm();
              }
            }}
            disabled={submitting}
            style={{
              flex: 2,
              height: 44,
              background: (unansweredCount > 0 && !doubleConfirm) ? "#dc2626" : "var(--accent)",
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
              boxShadow: (unansweredCount > 0 && !doubleConfirm) ? "0 4px 14px rgba(220,38,38,0.25)" : "0 4px 14px rgba(37,99,235,0.25)",
              transition: "all 0.2s",
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
            ) : unansweredCount > 0 && !doubleConfirm ? (
              <>
                <iconify-icon icon="lucide:alert-triangle" style={{ fontSize: 16 }} />
                Submit with Unanswered
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
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // ── Navigation & answer state ─────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // MCQ / FITB
  const [multiAnswers, setMultiAnswers] = useState<Record<string, number[]>>({}); // MULTI_SELECT indices
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

  // Identity verification state (Section 5)
  const [enrolledEmbedding, setEnrolledEmbedding] = useState<number[] | null | undefined>(undefined); // undefined = loading
  const examStartTimeRef = useRef<number>(Date.now());

  // Save in-flight guard
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Anomaly clip recorder (Section 6)
  const { triggerClipSave: triggerCamSave, isRecording: isCamRecording } = useAnomalyClipRecorder({
    examSessionId: examId,
    mediaStream: cameraRef.current,
    examStartTime: examStartTimeRef.current,
    prefix: "cam"
  });

  const { triggerClipSave: triggerScreenSave, isRecording: isScreenRecording } = useAnomalyClipRecorder({
    examSessionId: examId,
    mediaStream: screenshareRef.current,
    examStartTime: examStartTimeRef.current,
    prefix: "screen"
  });

  // ── Load questions after fullscreen granted ──────────────────────────────────
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
        correct_option_indices: q.correct_option_indices ?? null,
      }));
      setQuestions(qs);
      setAssessmentName(data.assessment_name ?? "Safety Assessment");
      examStartTimeRef.current = Date.now();
      if (data.duration_mins) {
        setTimeLeft(data.duration_mins * 60);
      }

      // Restore any previously saved answers (crash-recovery)
      if (data.responses && typeof data.responses === "object") {
        const restored: Record<string, string> = {};
        const multiRestored: Record<string, number[]> = {};
        const states: Record<string, QState> = {};
        for (const q of qs) {
          const raw = data.responses[q.id];
          if (raw !== undefined && raw !== null) {
            if (q.question_type === "MULTI_SELECT" && typeof raw === "object" && Array.isArray(raw.selected_option_indices)) {
              multiRestored[q.id] = raw.selected_option_indices;
              if (raw.selected_option_indices.length > 0) states[q.id] = "answered";
            } else {
              const val = typeof raw === "object" ? (raw.text_answer ?? String(raw.selected_option_index ?? "")) : String(raw);
              restored[q.id] = val;
              states[q.id] = "answered";
            }
          }
        }
        setAnswers(restored);
        setMultiAnswers(multiRestored);
        setQStates(states);
      }

      setLoading(false);
    }
    load();
  }, [examId, phase]);

  // ── Timer Countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "active") return;
    
    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null) return null;
        if (prev <= 1 && !submitting) {
          clearInterval(timerId);
          handleConfirmSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timerId);
  }, [phase, submitting]);

  // ── Load face embedding when entering identity phase ───────────────────────
  useEffect(() => {
    if (phase !== "identity") return;
    getFaceEmbedding(employeeCode)
      .then((data) => setEnrolledEmbedding(data.embedding))
      .catch(() => setEnrolledEmbedding(null)); // null = skip check
  }, [phase, employeeCode]);

  // ── Lockdown anomaly logger — Section 6: 3-warning system ────────────────
  const logAnomaly = useCallback(
    async (type: string, durationS: number) => {
      setCumulativeDuration((prev) => prev + durationS);

      // Increment visible warning counter (Section 6)
      setAnomalyCount((prev) => {
        const next = prev + 1;
        const labels: Record<string, string> = {
          fullscreen_exit: "Fullscreen exited — please press F11 to return.",
          focus_blur: "Window focus lost — please return to this window.",
          tab_hidden: "Tab was hidden — please keep this tab active.",
          screenshare_stopped: "Screen monitoring stopped — please re-share your screen.",
          screenshare_changed: "Shared screen changed — please share the correct screen.",
        };
        const baseMsg = labels[type] ?? "Monitoring anomaly detected.";
        setAnomalyBanner(`⚠️ Warning ${next} of ${MAX_ANOMALY_COUNT} — ${baseMsg}`);
        setTimeout(() => setAnomalyBanner(null), 7000);

        // Auto-escalate on 3rd warning (Section 6)
        if (next >= MAX_ANOMALY_COUNT) {
          setTimeout(() => setPhase("escalated"), 2000);
        }
        return next;
      });

      // Trigger anomaly clip save (Section 6)
      triggerCamSave(type).catch(() => {});
      triggerScreenSave(type).catch(() => {});

      try {
        const res = await logLockdownAnomaly(examId, type, durationS);
        if (res?.escalated) setPhase("escalated");
      } catch {
        // Fire-and-forget; never interrupt exam on network blip
      }
    },
    [examId, triggerCamSave, triggerScreenSave]
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
    setPhase("active");
  }, []);

  // ── Screen-capture request ────────────────────────────────────────────────
  const requestScreenshare = useCallback(async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: { ideal: 15 } },
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
    } catch {
      alert("Screen sharing is required for this exam.");
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      cameraRef.current = camStream;
    } catch {
      alert("Camera access is required for monitoring.");
      return;
    }

    setPhase("fullscreen");
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

  // ── Multi-select toggle (Section 2) ─────────────────────────────────────
  const handleMultiSelect = useCallback(
    (qId: string, optionIndex: number) => {
      setMultiAnswers((prev) => {
        const current = prev[qId] ?? [];
        const updated = current.includes(optionIndex)
          ? current.filter((i) => i !== optionIndex)  // deselect
          : [...current, optionIndex];                  // select
        // Update navigator state
        setQStates((ps) => ({
          ...ps,
          [qId]: updated.length > 0 ? (ps[qId] === "review" ? "review" : "answered") : "unanswered",
        }));
        // Immediate persistence for multi-select
        saveAnswer(examId, qId, -1, undefined, updated).catch(() => {});
        return { ...prev, [qId]: updated };
      });
    },
    [examId]
  );
  const currentQ = questions[currentIndex];

  const toggleReview = useCallback((qId: string) => {
    setQStates((prev) => {
      const cur = prev[qId] ?? "unanswered";
      const isMulti = currentQ?.question_type === "MULTI_SELECT";
      const hasAnswer = isMulti ? (multiAnswers[qId]?.length ?? 0) > 0 : !!answers[qId]?.trim();
      if (cur === "review") return { ...prev, [qId]: hasAnswer ? "answered" : "unanswered" };
      return { ...prev, [qId]: "review" };
    });
  }, [answers, multiAnswers, currentQ]);

  // ── Submit logic ──────────────────────────────────────────────────────────
  async function handleConfirmSubmit() {
    setSubmitting(true);
    try {
      // Trigger a final clip save containing the entire session buffer for both feeds
      const promises = [];
      if (isCamRecording) promises.push(triggerCamSave("full_session"));
      if (isScreenRecording) promises.push(triggerScreenSave("full_session"));
      await Promise.all(promises);
      
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

  // ── Derived values ───────────────────────────────────────────────────────────
  const unansweredIndexes: number[] = [];
  const reviewIndexes: number[] = [];
  let answeredCount = 0;

  questions.forEach((q, idx) => {
    const isMulti = q.question_type === "MULTI_SELECT";
    const hasAnswer = isMulti ? (multiAnswers[q.id]?.length ?? 0) > 0 : !!answers[q.id]?.trim();
    
    if (hasAnswer) answeredCount++;
    else unansweredIndexes.push(idx);

    if (qStates[q.id] === "review") reviewIndexes.push(idx);
  });

  const unansweredCount = unansweredIndexes.length;
  const reviewCount = reviewIndexes.length;
  const progress = questions.length > 0 ? answeredCount / questions.length : 0;

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: UNLOCK
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "unlock") {
    return (
      <ExamUnlockScreen
        examId={examId}
        employeeCode={employeeCode}
        onUnlocked={() => setPhase("screenshare")}
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
            <button onClick={() => setPhase("fullscreen")} style={secondaryBtnStyle}>Skip</button>
            <button onClick={requestScreenshare} style={primaryBtnStyle}>
              <iconify-icon icon="lucide:monitor-check" style={{ fontSize: 16 }} />
              Allow Monitoring & Begin
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE: IDENTITY CHECK (Section 5)
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "identity") {
    if (enrolledEmbedding === undefined) {
      // Still loading embedding from server
      return (
        <div style={{ position: "fixed", inset: 0, background: "var(--base)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--accent)" }} />
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Preparing identity check...</p>
        </div>
      );
    }
    return (
      <FaceVerification
        employeeCode={employeeCode}
        enrolledEmbedding={enrolledEmbedding}
        onVerified={() => setPhase("fullscreen")}
        onSkip={() => setPhase("fullscreen")}
        onSupervisorOverride={onExit}
      />
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

          {timeLeft !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: timeLeft < 60 ? "var(--red-dim)" : "var(--surface-hover)", padding: "4px 12px", borderRadius: 999, border: `1px solid ${timeLeft < 60 ? "var(--red)" : "transparent"}` }}>
              <iconify-icon icon="lucide:clock" style={{ fontSize: 14, color: timeLeft < 60 ? "var(--red)" : "var(--muted)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: timeLeft < 60 ? "var(--red)" : "var(--ink)" }}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
              </span>
            </div>
          )}

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
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => <span {...props} />
                    }}
                  >
                    {currentQ.question_text}
                  </ReactMarkdown>
                </h1>

                {/* ── MCQ / TRUE_FALSE options ─────────────────────────────── */}
                {(currentQ.question_type === "MCQ" || currentQ.question_type === "TRUE_FALSE") && (
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
                )}

                {/* ── MULTI_SELECT checkboxes (Section 2) ─────────────────── */}
                {currentQ.question_type === "MULTI_SELECT" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <span style={{ background: "rgba(124,58,237,0.08)", color: "#7c3aed", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 600 }}>
                        Select all that apply
                      </span>
                      {(multiAnswers[currentQ.id]?.length ?? 0) > 0 && (
                        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                          {multiAnswers[currentQ.id]?.length} selected
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {currentQ.options.map((opt, i) => {
                        const sel = multiAnswers[currentQ.id] ?? [];
                        const isChecked = sel.includes(i);
                        return (
                          <button
                            key={i}
                            onClick={() => handleMultiSelect(currentQ.id, i)}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 14,
                              padding: "14px 18px",
                              textAlign: "left",
                              background: isChecked ? "rgba(124,58,237,0.05)" : "var(--surface)",
                              border: isChecked ? "2px solid #7c3aed" : "1px solid var(--line)",
                              borderRadius: 10,
                              color: isChecked ? "var(--ink)" : "var(--muted)",
                              fontSize: 14,
                              cursor: "pointer",
                              minHeight: 56,
                              transition: "all 0.12s",
                              fontFamily: "var(--font-sans)",
                              width: "100%",
                            }}
                          >
                            {/* Checkbox visual */}
                            <span
                              style={{
                                display: "grid",
                                placeItems: "center",
                                width: 22,
                                height: 22,
                                borderRadius: 5,
                                background: isChecked ? "#7c3aed" : "var(--raised)",
                                border: isChecked ? "none" : "1.5px solid var(--line)",
                                flexShrink: 0,
                                marginTop: 2,
                                transition: "all 0.12s",
                              }}
                            >
                              {isChecked && (
                                <iconify-icon icon="lucide:check" style={{ fontSize: 13, color: "#fff" }} />
                              )}
                            </span>
                            <span style={{ lineHeight: 1.55, flex: 1 }}>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── FILL_IN_BLANK (Req #3) ───────────────────────────────── */}
                {currentQ.question_type === "FILL_IN_BLANK" && (
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
            unansweredIndexes={unansweredIndexes}
            reviewIndexes={reviewIndexes}
            onConfirm={handleConfirmSubmit}
            onCancel={() => setShowSubmitModal(false)}
            onJump={(idx) => {
              setCurrentIndex(idx);
              setShowSubmitModal(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Floating Webcam PiP */}
      {cameraRef.current && (
        <div style={{
          position: "fixed", bottom: 24, left: 24, zIndex: 9999,
          width: 200, height: 150, borderRadius: 12, overflow: "hidden",
          border: "2px solid rgba(255,255,255,0.1)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
        }}>
          <video 
            autoPlay playsInline muted 
            ref={el => { if (el && el.srcObject !== cameraRef.current) el.srcObject = cameraRef.current; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
          />
          <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.6)", padding: "2px 6px", borderRadius: 4, fontSize: 10, color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "pulse 2s infinite" }} />
            Recording
          </div>
        </div>
      )}
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
