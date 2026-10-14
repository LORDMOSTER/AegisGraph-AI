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
import { getExam, saveAnswer, submitExam, logLockdownAnomaly } from "../api";
import { ExamUnlockScreen } from "../components/ExamUnlockScreen";
import { useAnomalyClipRecorder } from "../hooks/useAnomalyClipRecorder";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExamQuestion {
  id: string;
  rule_id: string;
  question_text: string;
  options: string[];
  question_type: "MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK" | "MULTI_SELECT";
  difficulty?: string;
  marks?: number;
  section_id?: string;
  section_title?: string;
}

export interface ExamSectionInfo {
  id: string;
  title: string;
  instructions: string;
  min_pass_percent?: number | null;
  order_index: number;
}

interface SubmitResult {
  status: string;
  score: number;
  passed: boolean;
  reveal_score_to_user: boolean;
  pass_mark_pct: number;
  all_sections_passed?: boolean;
  failed_sections?: string[];
  section_scores?: Record<string, {
    title: string;
    score: number;
    total_possible: number;
    percentage: number;
    min_pass_percent?: number | null;
    passed?: boolean;
  }>;
}

interface Props {
  examId: string;
  employeeCode: string;
  onExit: () => void;
}

type Phase = "unlock" | "proctoring" | "fullscreen" | "active" | "result" | "escalated";

/** Live stream preview component with active indicator */
function LiveStreamPreview({
  stream,
  fallbackLabel,
  aspectRatio = "16/9",
  isMirrored = false,
}: {
  stream: MediaStream | null;
  fallbackLabel: string;
  aspectRatio?: string;
  isMirrored?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  if (!stream) {
    return (
      <div
        style={{
          aspectRatio,
          background: "rgba(0,0,0,0.03)",
          borderRadius: 10,
          border: "1.5px dashed var(--line)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          color: "var(--muted)",
          fontSize: 12,
          padding: 16,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.05)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <iconify-icon icon="lucide:video-off" style={{ fontSize: 22, opacity: 0.6 }} />
        </div>
        <span style={{ fontWeight: 500 }}>{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 10,
        overflow: "hidden",
        aspectRatio,
        background: "#090d16",
        border: "1.5px solid rgba(16,185,129,0.5)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: isMirrored ? "scaleX(-1)" : "none",
          display: "block",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          background: "rgba(16,185,129,0.9)",
          color: "#fff",
          fontSize: 10,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.03em",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
        ACTIVE FEED
      </div>
    </div>
  );
}

/** Per-question navigator state */
type QState = "unanswered" | "answered" | "review";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
const MAX_ANOMALY_COUNT = 3; // auto-escalate after this many warnings
const MAX_ANOMALY_DURATION_S = 60;

// ─── Question Navigator (Section-grouped) ──────────────────────────────────────

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
  sections,
  questions,
  currentIndex,
  states,
  onNavigate,
}: {
  sections: ExamSectionInfo[];
  questions: ExamQuestion[];
  currentIndex: number;
  states: Record<string, QState>;
  onNavigate: (i: number) => void;
}) {
  const sectionList = sections.length > 0 ? sections : [{
    id: "section-a",
    title: "Section A",
    instructions: "",
    min_pass_percent: null,
    order_index: 0
  }];

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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
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
          Sections
        </p>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
          {questions.length} total
        </span>
      </div>

      {/* Sections and questions */}
      <div
        style={{
          padding: "14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          flex: 1,
          overflowY: "auto",
        }}
      >
        {sectionList.map((sec, secIdx) => {
          const secQuestions = questions
            .map((q, idx) => ({ q, idx }))
            .filter(({ q }) => (q.section_id === sec.id) || (!q.section_id && secIdx === 0));

          const answeredCount = secQuestions.filter(({ q }) => states[q.id] === "answered").length;

          return (
            <div key={sec.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Section Header with Title and Progress Count */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--ink)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 130,
                  }}
                  title={sec.title}
                >
                  {sec.title}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: answeredCount === secQuestions.length && secQuestions.length > 0
                      ? "rgba(16,185,129,0.15)"
                      : "var(--raised)",
                    color: answeredCount === secQuestions.length && secQuestions.length > 0
                      ? "#10b981"
                      : "var(--muted)",
                    fontWeight: 600,
                  }}
                >
                  {answeredCount}/{secQuestions.length}
                </span>
              </div>

              {/* Grid of question boxes for this section */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {secQuestions.map(({ q, idx }) => {
                  const state = states[q.id] ?? "unanswered";
                  const isActive = idx === currentIndex;
                  const col = Q_COLORS[state];
                  return (
                    <button
                      key={q.id}
                      onClick={() => onNavigate(idx)}
                      title={
                        state === "review"
                          ? `Q${idx + 1} — Marked for Review`
                          : state === "answered"
                          ? `Q${idx + 1} — Answered`
                          : `Q${idx + 1} — Unanswered`
                      }
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 7,
                        border: isActive && state !== "review"
                          ? "2px solid var(--accent)"
                          : state === "review" ? "2px solid #f59e0b" : `1.5px solid ${col.border}`,
                        background: isActive ? (state === "review" ? "#f59e0b" : "var(--accent)") : col.bg,
                        color: isActive ? "#fff" : col.text,
                        fontSize: 11,
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
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
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
  sections,
  questions,
  submitting,
  unansweredIndexes,
  reviewIndexes,
  onConfirm,
  onCancel,
  onJump,
}: {
  sections: ExamSectionInfo[];
  questions: ExamQuestion[];
  submitting: boolean;
  unansweredIndexes: number[];
  reviewIndexes: number[];
  onConfirm: () => void;
  onCancel: () => void;
  onJump: (idx: number) => void;
}) {
  const [doubleConfirm, setDoubleConfirm] = useState(false);
  const totalCount = questions.length;
  const unansweredCount = unansweredIndexes.length;
  const reviewCount = reviewIndexes.length;

  const sectionList = sections.length > 0 ? sections : [{
    id: "section-a",
    title: "Section A",
    instructions: "",
    min_pass_percent: null,
    order_index: 0
  }];

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
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: "rgba(37,99,235,0.08)",
            border: "1px solid rgba(37,99,235,0.2)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 16px",
          }}
        >
          <iconify-icon icon="lucide:send" style={{ fontSize: 24, color: "var(--accent)" }} />
        </div>

        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--ink)",
            textAlign: "center",
            marginBottom: 6,
          }}
        >
          Submit Exam
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            textAlign: "center",
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          Review your section progress before submitting your final answers.
        </p>

        {/* Global summary stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginBottom: 20,
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
                padding: "10px 8px",
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
                  fontSize: 20,
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

        {/* Section-by-section breakdown with jump links */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
            Section Summary & Jump Links
          </div>
          {sectionList.map((sec, secIdx) => {
            const secQuestions = questions
              .map((q, idx) => ({ q, idx }))
              .filter(({ q }) => (q.section_id === sec.id) || (!q.section_id && secIdx === 0));

            const secUnanswered = secQuestions.filter(({ idx }) => unansweredIndexes.includes(idx));
            const secReview = secQuestions.filter(({ idx }) => reviewIndexes.includes(idx));
            const isAllAnswered = secUnanswered.length === 0;

            return (
              <div
                key={sec.id}
                style={{
                  padding: 12,
                  background: "var(--raised)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (secUnanswered.length > 0 || secReview.length > 0) ? 8 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{sec.title}</span>
                    {sec.min_pass_percent && (
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>(min {sec.min_pass_percent}%)</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isAllAnswered ? "#10b981" : "#ef4444" }}>
                    {secQuestions.length - secUnanswered.length}/{secQuestions.length} answered
                  </span>
                </div>

                {secUnanswered.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>Unanswered:</span>
                    {secUnanswered.map(({ idx }) => (
                      <button
                        key={idx}
                        onClick={() => onJump(idx)}
                        style={{
                          background: "rgba(239,68,68,0.1)",
                          border: "1px solid rgba(239,68,68,0.3)",
                          borderRadius: 5,
                          color: "#dc2626",
                          padding: "2px 7px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        Q{idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                {secReview.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>For Review:</span>
                    {secReview.map(({ idx }) => (
                      <button
                        key={idx}
                        onClick={() => onJump(idx)}
                        style={{
                          background: "rgba(245,158,11,0.1)",
                          border: "1px solid rgba(245,158,11,0.3)",
                          borderRadius: 5,
                          color: "#f59e0b",
                          padding: "2px 7px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        Q{idx + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Second confirmation alert if unanswered */}
        {unansweredCount > 0 && doubleConfirm && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(239,68,68,0.08)",
              border: "1.5px solid #dc2626",
              borderRadius: 8,
              fontSize: 12,
              color: "#dc2626",
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            <strong>Second Confirmation Required:</strong> You have {unansweredCount} unanswered question{unansweredCount !== 1 ? "s" : ""} which will be marked as incorrect. Are you sure you want to finish the exam now?
          </div>
        )}

        {/* Action buttons */}
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
                Submit with {unansweredCount} Unanswered
              </>
            ) : (
              <>
                <iconify-icon icon="lucide:check" style={{ fontSize: 16 }} />
                Confirm Final Submission
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
  const [sections, setSections] = useState<ExamSectionInfo[]>([]);
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

  // Active MediaStream state for reactive UI & continuous recording
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenshareStream, setScreenshareStream] = useState<MediaStream | null>(null);
  const [requestingCam, setRequestingCam] = useState(false);
  const [requestingScreen, setRequestingScreen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  const examStartTimeRef = useRef<number>(Date.now());

  // Save in-flight guard
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Anomaly clip recorder (Section 6)
  const { triggerClipSave: triggerCamSave } = useAnomalyClipRecorder({
    examSessionId: examId,
    mediaStream: cameraStream,
    examStartTime: examStartTimeRef.current,
    prefix: "cam"
  });

  const { triggerClipSave: triggerScreenSave } = useAnomalyClipRecorder({
    examSessionId: examId,
    mediaStream: screenshareStream,
    examStartTime: examStartTimeRef.current,
    prefix: "screen"
  });

  // ── Load questions after unlocked / in proctoring ───────────────────────────
  useEffect(() => {
    if (phase !== "proctoring" && phase !== "fullscreen" && phase !== "active") return;
    async function load() {
      const data = await getExam(examId);
      const rawSections: ExamSectionInfo[] = (data.sections ?? []).map((s: any) => ({
        id: s.id,
        title: s.title,
        instructions: s.instructions ?? "",
        min_pass_percent: s.min_pass_percent ?? null,
        order_index: s.order_index ?? 0,
      }));
      setSections(rawSections);

      const qs: ExamQuestion[] = data.questions.map((q: any) => ({
        id: q.id,
        rule_id: q.rule_id,
        question_text: q.question_text,
        options: q.options ?? [],
        question_type: q.question_type ?? "MCQ",
        difficulty: q.difficulty,
        marks: q.marks ?? 1,
        section_id: q.section_id,
        section_title: q.section_title,
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
    setScreenshareStream(null);
    setCameraStream(null);
  }, []);

  // ── Fullscreen request & Launch ───────────────────────────────────────────
  const requestFullscreenAndLaunch = useCallback(async () => {
    if (!cameraStream || !screenshareStream) {
      alert("Both Web Camera and Screen Sharing must be active and verified before starting.");
      return;
    }
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
    } catch (err) {
      console.warn("Fullscreen permission / gesture warning:", err);
    }
    setPhase("active");
  }, [cameraStream, screenshareStream]);

  // ── Screen-capture request ────────────────────────────────────────────────
  const requestScreenshare = useCallback(async () => {
    setRequestingScreen(true);
    setScreenError(null);
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: { ideal: 15 } },
        audio: false,
      });
      screenshareRef.current = stream;
      setScreenshareStream(stream);

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          setScreenshareStream(null);
          screenshareRef.current = null;
          setScreenError("Screen share was terminated. Full screen sharing is mandatory.");
          if (phase === "active") {
            logAnomaly("screenshare_stopped", 0);
          }
        };
        let lastLabel = track.label;
        setInterval(() => {
          const t = screenshareRef.current?.getVideoTracks()[0];
          if (t && t.label !== lastLabel) {
            lastLabel = t.label;
            if (phase === "active") {
              logAnomaly("screenshare_changed", 0);
            }
          }
        }, 2000);
      }
    } catch (err: any) {
      console.warn("Screen share request denied/failed:", err);
      setScreenError(err?.message || "Screen sharing permission was cancelled or not granted. Entire display sharing is required.");
    } finally {
      setRequestingScreen(false);
    }
  }, [phase, logAnomaly]);

  // ── Camera access request ─────────────────────────────────────────────────
  const requestCamera = useCallback(async () => {
    setRequestingCam(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraRef.current = stream;
      setCameraStream(stream);

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          setCameraStream(null);
          cameraRef.current = null;
          setCameraError("Web camera disconnected or access revoked.");
          if (phase === "active") {
            logAnomaly("camera_stopped", 0);
          }
        };
      }
    } catch (err: any) {
      console.warn("Camera request denied/failed:", err);
      setCameraError(err?.message || "Camera access permission was denied. Please allow camera access in your browser to proceed.");
    } finally {
      setRequestingCam(false);
    }
  }, [phase, logAnomaly]);

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
      if (cameraStream) promises.push(triggerCamSave("full_session"));
      if (screenshareStream) promises.push(triggerScreenSave("full_session"));
      await Promise.allSettled(promises);
      
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
        onUnlocked={() => setPhase("proctoring")}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: MANDATORY PROCTORING & HARDWARE READINESS (No Skip Allowed)
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "proctoring") {
    const isReady = !!cameraStream && !!screenshareStream;

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
          overflowY: "auto",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 18,
            padding: "36px 32px",
            boxShadow: "0 24px 72px rgba(28,28,26,0.14)",
            margin: "auto",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: "rgba(37,99,235,0.08)",
                border: "1px solid rgba(37,99,235,0.2)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
              }}
            >
              <iconify-icon icon="lucide:shield-check" style={{ fontSize: 30, color: "var(--accent)" }} />
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: "0 0 6px" }}>
              Mandatory Proctoring & Hardware Readiness
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: 620, margin: "0 auto", lineHeight: 1.6 }}>
              Both active camera presence and full display screenshare are strictly required by safety compliance regulations. Skipping is strictly disabled.
            </p>
          </div>

          {/* Dual Feed Verification Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20, marginBottom: 24 }}>
            {/* 1. Camera Proctoring Card */}
            <div
              style={{
                background: "var(--raised)",
                border: `1.5px solid ${cameraStream ? "rgba(16,185,129,0.5)" : "var(--line)"}`,
                borderRadius: 14,
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <iconify-icon icon="lucide:camera" style={{ fontSize: 18, color: cameraStream ? "#10b981" : "var(--accent)" }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>1. Web Camera Proctoring</span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: cameraStream ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)",
                    color: cameraStream ? "#10b981" : "#dc2626",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {cameraStream ? "● READY" : "PERMISSION REQUIRED"}
                </span>
              </div>

              {/* Video Preview */}
              <LiveStreamPreview stream={cameraStream} fallbackLabel="Webcam is not yet active" isMirrored />

              {cameraError && (
                <div style={{ fontSize: 11, color: "#dc2626", background: "rgba(239,68,68,0.08)", padding: "8px 10px", borderRadius: 6, lineHeight: 1.4 }}>
                  ⚠️ {cameraError}
                </div>
              )}

              <button
                onClick={requestCamera}
                disabled={requestingCam || !!cameraStream}
                style={{
                  height: 40,
                  borderRadius: 8,
                  border: cameraStream ? "1px solid rgba(16,185,129,0.4)" : "none",
                  background: cameraStream ? "rgba(16,185,129,0.12)" : "var(--accent)",
                  color: cameraStream ? "#10b981" : "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: cameraStream ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontFamily: "var(--font-sans)",
                }}
              >
                {requestingCam ? (
                  "Requesting Camera..."
                ) : cameraStream ? (
                  <>
                    <iconify-icon icon="lucide:check" style={{ fontSize: 15 }} />
                    Camera Active & Verifying
                  </>
                ) : (
                  <>
                    <iconify-icon icon="lucide:video" style={{ fontSize: 15 }} />
                    Grant & Enable Web Camera
                  </>
                )}
              </button>
            </div>

            {/* 2. Screen Share Card */}
            <div
              style={{
                background: "var(--raised)",
                border: `1.5px solid ${screenshareStream ? "rgba(16,185,129,0.5)" : "var(--line)"}`,
                borderRadius: 14,
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <iconify-icon icon="lucide:monitor" style={{ fontSize: 18, color: screenshareStream ? "#10b981" : "var(--accent)" }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>2. Display Screen Share</span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: screenshareStream ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)",
                    color: screenshareStream ? "#10b981" : "#dc2626",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {screenshareStream ? "● READY" : "SHARE REQUIRED"}
                </span>
              </div>

              {/* Video Preview */}
              <LiveStreamPreview stream={screenshareStream} fallbackLabel="Screen share is not yet active" />

              {screenError && (
                <div style={{ fontSize: 11, color: "#dc2626", background: "rgba(239,68,68,0.08)", padding: "8px 10px", borderRadius: 6, lineHeight: 1.4 }}>
                  ⚠️ {screenError}
                </div>
              )}

              <button
                onClick={requestScreenshare}
                disabled={requestingScreen || !!screenshareStream}
                style={{
                  height: 40,
                  borderRadius: 8,
                  border: screenshareStream ? "1px solid rgba(16,185,129,0.4)" : "none",
                  background: screenshareStream ? "rgba(16,185,129,0.12)" : "var(--accent)",
                  color: screenshareStream ? "#10b981" : "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: screenshareStream ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontFamily: "var(--font-sans)",
                }}
              >
                {requestingScreen ? (
                  "Requesting Screen..."
                ) : screenshareStream ? (
                  <>
                    <iconify-icon icon="lucide:check" style={{ fontSize: 15 }} />
                    Screen Share Active
                  </>
                ) : (
                  <>
                    <iconify-icon icon="lucide:monitor-up" style={{ fontSize: 15 }} />
                    Share Entire Screen
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Compliance Notice Banner */}
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(37,99,235,0.04)",
              border: "1px solid rgba(37,99,235,0.14)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <iconify-icon icon="lucide:info" style={{ fontSize: 20, color: "var(--accent)", flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.5 }}>
              Continuous recording of webcam proctoring and screen activity is saved for integrity forensic audit. Bypassing or skipping hardware verification is disabled.
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <button
              onClick={() => {
                releaseAll();
                onExit();
              }}
              style={{
                height: 44,
                padding: "0 20px",
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
              Cancel & Exit
            </button>

            <button
              onClick={requestFullscreenAndLaunch}
              disabled={!isReady}
              style={{
                flex: 1,
                maxWidth: 420,
                height: 44,
                background: isReady ? "var(--accent)" : "var(--raised)",
                color: isReady ? "#fff" : "var(--muted)",
                border: isReady ? "none" : "1px solid var(--line)",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 700,
                cursor: isReady ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: "var(--font-sans)",
                boxShadow: isReady ? "0 4px 14px rgba(37,99,235,0.25)" : "none",
                transition: "all 0.2s",
              }}
            >
              <iconify-icon icon={isReady ? "lucide:maximize-2" : "lucide:lock"} style={{ fontSize: 16 }} />
              {isReady
                ? "Enter Fullscreen & Begin Proctored Exam"
                : "Enable Both Camera & Screenshare to Begin"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE: FULLSCREEN REQUEST (Fallback)
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "fullscreen") {
    return (
      <GateScreen
        icon="lucide:maximize"
        title="Fullscreen Required"
        body="This exam must run in fullscreen mode. Click below — your questions will not be visible until fullscreen is active."
        primaryLabel="Enter Fullscreen & Continue"
        primaryIcon="lucide:maximize-2"
        onPrimary={requestFullscreenAndLaunch}
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
      <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "var(--base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" }}>
        <div style={{ maxWidth: 480, width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "36px 32px", textAlign: "center", boxShadow: "var(--shadow-card)", margin: "auto" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: isPass ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", display: "grid", placeItems: "center", margin: "0 auto 20px" }}>
            <iconify-icon icon={isPass ? "lucide:check-circle" : "lucide:x-circle"} style={{ fontSize: 32, color: isPass ? "var(--emerald)" : "var(--red)" }} />
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
            {isPass ? "Exam Passed!" : "Exam Complete"}
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 4 }}>
            Your total score: <strong style={{ color: "var(--ink)", fontSize: 18 }}>{result.score.toFixed(1)}%</strong>
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
            Pass mark: {result.pass_mark_pct}%
          </p>

          {/* Section failure warning banner if must-pass section failed */}
          {result.failed_sections && result.failed_sections.length > 0 && (
            <div style={{ padding: "12px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 10, border: "1.5px solid #dc2626", marginBottom: 16, textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#dc2626", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 16 }} />
                <span>Must-Pass Section Failed</span>
              </div>
              <p style={{ color: "var(--ink)", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                Did not meet minimum pass requirement for: <strong>{result.failed_sections.join(", ")}</strong>. Even if your overall score passes, passing all required sections is mandatory.
              </p>
            </div>
          )}

          {isPass ? (
            <div style={{ padding: "12px 14px", background: "rgba(16,185,129,0.06)", borderRadius: 10, border: "1px solid var(--emerald)", marginBottom: 18 }}>
              <p style={{ color: "var(--emerald)", fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>Congratulations!</p>
              <p style={{ color: "var(--emerald)", fontSize: 12, opacity: 0.9, margin: 0 }}>You've passed the assessment. Your certificate has been generated.</p>
            </div>
          ) : !result.failed_sections?.length ? (
            <div style={{ padding: "12px 14px", background: "rgba(239,68,68,0.06)", borderRadius: 10, border: "1px solid var(--red)", marginBottom: 18 }}>
              <p style={{ color: "var(--red)", fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>Did not pass</p>
              <p style={{ color: "var(--red)", fontSize: 12, opacity: 0.9, margin: 0 }}>Please review the safety rules and speak to your supervisor.</p>
            </div>
          ) : null}

          {/* Per-section scores list */}
          {result.section_scores && Object.keys(result.section_scores).length > 0 && (
            <div style={{ marginBottom: 20, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 8 }}>
                Section Performance
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                {Object.entries(result.section_scores).map(([sId, sData]) => {
                  const secPassed = sData.passed !== false;
                  return (
                    <div
                      key={sId}
                      style={{
                        padding: "10px 12px",
                        background: "var(--raised)",
                        border: `1px solid ${secPassed ? "var(--line)" : "rgba(239,68,68,0.35)"}`,
                        borderRadius: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>{sData.title}</div>
                        {sData.min_pass_percent !== null && sData.min_pass_percent !== undefined && (
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>
                            Required: {sData.min_pass_percent}%
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                          color: secPassed ? "var(--ink)" : "#ef4444",
                        }}>
                          {sData.percentage ?? ((sData.total_possible > 0 ? (sData.score / sData.total_possible) * 100 : 0).toFixed(1))}%
                        </span>
                        {sData.min_pass_percent !== null && sData.min_pass_percent !== undefined && (
                          <div style={{ fontSize: 10, fontWeight: 600, color: secPassed ? "#10b981" : "#ef4444" }}>
                            {secPassed ? "Passed" : "Failed"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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

          {/* Dual proctoring recording badge */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            border: "1px solid rgba(16,185,129,0.3)",
            background: "rgba(16,185,129,0.06)",
            borderRadius: 999,
            padding: "4px 12px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--ink)",
            flexShrink: 0,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", animation: "pulse 1.5s infinite" }} />
            <span style={{ color: "#dc2626", fontWeight: 700, fontFamily: "var(--font-mono)" }}>REC</span>
            <span>Cam & Screen Active</span>
            {anomalyCount > 0 && (
              <span style={{ background: "#dc2626", color: "#fff", borderRadius: 999, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                {anomalyCount} warning{anomalyCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content (navigator + question) ────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Navigator sidebar (Req #1) */}
        <QuestionNavigator
          sections={sections}
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
                {/* Active Section Banner with Title and Instructions */}
                {(() => {
                  const currentSection = sections.find((s) => s.id === currentQ.section_id) || (sections.length > 0 ? sections[0] : null);
                  if (!currentSection) return null;
                  return (
                    <div
                      style={{
                        marginBottom: 20,
                        padding: "14px 18px",
                        background: "var(--raised)",
                        border: "1px solid var(--line)",
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: currentSection.instructions ? 6 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            background: "rgba(37,99,235,0.1)",
                            color: "var(--accent)",
                          }}>
                            <iconify-icon icon="lucide:layers" style={{ fontSize: 13 }} />
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", fontFamily: "var(--font-display)" }}>
                            {currentSection.title}
                          </span>
                        </div>
                        {currentSection.min_pass_percent !== null && currentSection.min_pass_percent !== undefined && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                            Min Pass: {currentSection.min_pass_percent}%
                          </span>
                        )}
                      </div>
                      {currentSection.instructions && (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
                          {currentSection.instructions}
                        </p>
                      )}
                    </div>
                  );
                })()}

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
                        Select all that apply (all-or-nothing)
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
            sections={sections}
            questions={questions}
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
      {(cameraStream || cameraRef.current) && (
        <div style={{
          position: "fixed", bottom: 24, left: 24, zIndex: 9999,
          width: 200, height: 150, borderRadius: 12, overflow: "hidden",
          border: "2px solid rgba(16,185,129,0.7)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
        }}>
          <video 
            autoPlay playsInline muted 
            ref={el => { if (el && el.srcObject !== (cameraStream || cameraRef.current)) el.srcObject = (cameraStream || cameraRef.current); }}
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
          />
          <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.65)", padding: "2px 8px", borderRadius: 4, fontSize: 10, color: "#fff", display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "pulse 1.5s infinite" }} />
            REC
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


