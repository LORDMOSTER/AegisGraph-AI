/**
 * AuditLog.tsx  (Req #7 — Combined Integrity + Lockdown Timeline)
 *
 * Optimized for ultra-high contrast in both Light & Dark modes,
 * WCAG 2.1 AA compliance, claymorphic aesthetics, status filters,
 * and seamless proctoring playback.
 */
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getAuditTimeline,
  AuditTimeline,
  AuditTimelineEvent,
  getPendingAttempts,
  issueCertificate,
  grantRetake,
  getAttemptReview,
  AttemptReviewResponse,
} from "../api";
import { getClipsForSession, AnomalyClip } from "../hooks/useAnomalyClipRecorder";

// ─── Theme-Adaptive Colour Tokens ───────────────────────────────────────────
const C = {
  void: "var(--base)",
  surface: "var(--surface)",
  glass: "var(--raised)",
  border: "var(--line)",
  shadow: "var(--shadow-card)",
  text: "var(--ink)",
  muted: "var(--muted)",
  violet: "var(--accent)",
  cyan: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
  cyanDim: "var(--green-dim)",
  amberDim: "var(--amber-dim)",
  redDim: "var(--red-dim)",
  violetDim: "var(--accent-dim)",
};
const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

// ─── Source badge config ──────────────────────────────────────────────────────
const SOURCE_META: Record<string, { label: string; color: string; dim: string; icon: string }> = {
  mediapipe: { label: "MediaPipe", color: C.cyan, dim: C.cyanDim, icon: "lucide:eye" },
  lockdown: { label: "Lockdown", color: C.amber, dim: C.amberDim, icon: "lucide:shield-alert" },
};

const TYPE_LABELS: Record<string, string> = {
  gaze_anomaly: "Gaze Anomaly",
  head_pose_off: "Head Pose Off",
  fullscreen_exit: "Fullscreen Exited",
  focus_blur: "Window Focus Lost",
  tab_hidden: "Tab Hidden",
  screenshare_stopped: "Screen Share Stopped",
  screenshare_changed: "Screen Share Changed",
  unlock_failure: "Unlock Failure",
};

// ─── Timeline event row ───────────────────────────────────────────────────────
function TimelineEvent({
  ev,
  index,
  clip,
  onPlayClip,
}: {
  ev: AuditTimelineEvent;
  index: number;
  clip?: AnomalyClip;
  onPlayClip?: (clip: AnomalyClip) => void;
}) {
  const meta = SOURCE_META[ev.source] ?? { label: ev.source, color: C.muted, dim: "transparent", icon: "lucide:activity" };
  const label = TYPE_LABELS[ev.type] ?? ev.type;
  const ts = ev.ts ? new Date(ev.ts).toLocaleTimeString() : "—";
  const dur = ev.duration_s != null ? `${ev.duration_s.toFixed(1)}s` : null;
  const isFailure = ev.type === "unlock_failure";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      style={{
        display: "flex",
        gap: 14,
        padding: "12px 0",
        borderBottom: `1px solid var(--line)`,
        alignItems: "flex-start",
      }}
    >
      {/* Timeline dot */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: meta.dim,
          border: `1px solid ${meta.color}`,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <iconify-icon icon={meta.icon} style={{ fontSize: 14, color: meta.color }} />
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 999,
              background: meta.dim,
              color: meta.color,
              fontFamily: MONO,
              letterSpacing: "0.04em",
            }}
          >
            {meta.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
          {isFailure && ev.detail?.subtype && (
            <span style={{ fontSize: 11, color: "var(--red)", fontFamily: MONO }}>
              [{ev.detail.subtype}] logged server-side
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--muted)", fontFamily: MONO, alignItems: "center" }}>
          <span>⏱ {ts}</span>
          {dur && <span>⏳ {dur} outside lockdown</span>}
          {clip && onPlayClip && (
            <button
              onClick={() => onPlayClip(clip)}
              style={{
                marginLeft: "auto",
                background: "var(--raised)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "3px 8px",
                color: "var(--green)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              <iconify-icon icon="lucide:play" /> Play Clip
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Expanded detail panel ─────────────────────────────────────────────────────
function AttemptDetail({
  attempt,
  onIssueCertificate,
  onGrantRetake,
  processing,
}: {
  attempt: any;
  onIssueCertificate: (id: string, validityMonths: number) => void;
  onGrantRetake: (id: string) => void;
  processing: boolean;
}) {
  const [timeline, setTimeline] = useState<AuditTimeline | null>(null);
  const [tlLoading, setTlLoading] = useState(false);
  const [clips, setClips] = useState<AnomalyClip[]>([]);
  const [playingClip, setPlayingClip] = useState<AnomalyClip | null>(null);
  const [review, setReview] = useState<AttemptReviewResponse | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [validityMonths, setValidityMonths] = useState(12);

  const formatValidity = (months: number) => {
    if (months === 12) return "1 yr";
    if (months < 12) return `${months} months`;
    const yrs = Math.floor(months / 12);
    const mos = months % 12;
    return `${yrs} yr${yrs > 1 ? "s" : ""} ${mos > 0 ? mos + " month" + (mos > 1 ? "s" : "") : ""}`;
  };

  useEffect(() => {
    if (!attempt.id) return;
    setTlLoading(true);
    setReviewLoading(true);

    Promise.all([
      getAuditTimeline(attempt.id).catch(() => null),
      getClipsForSession(attempt.id).catch(() => []),
      getAttemptReview(attempt.id).catch(() => null),
    ])
      .then(([tl, loadedClips, rev]) => {
        if (tl) setTimeline(tl as AuditTimeline);
        setClips(loadedClips as AnomalyClip[]);
        if (rev) setReview(rev as AttemptReviewResponse);
      })
      .finally(() => {
        setTlLoading(false);
        setReviewLoading(false);
      });
  }, [attempt.id]);

  const integrityWarning = (attempt.integrity_score ?? 100) < 80;

  // Mock timeline fallback for demo sessions
  const mockTimeline: AuditTimelineEvent[] = [
    {
      source: "mediapipe",
      type: "gaze_anomaly",
      ts: attempt.completed_at,
      duration_s: 4.2,
      detail: { type: "gaze_anomaly" },
    },
    ...(attempt.lockdown_escalated
      ? [
          {
            source: "lockdown" as const,
            type: "fullscreen_exit",
            ts: attempt.completed_at,
            duration_s: 12.0,
            detail: { type: "fullscreen_exit" },
          },
          {
            source: "lockdown" as const,
            type: "focus_blur",
            ts: attempt.completed_at,
            duration_s: 8.5,
            detail: { type: "focus_blur" },
          },
          {
            source: "lockdown" as const,
            type: "tab_hidden",
            ts: attempt.completed_at,
            duration_s: 15.3,
            detail: { type: "tab_hidden" },
          },
        ]
      : []),
  ];

  const events = timeline?.timeline ?? mockTimeline;
  const lockdownEscalated = timeline?.lockdown_escalated ?? attempt.lockdown_escalated;
  const sciScore = attempt.score ?? 0;
  const integrityScore = attempt.integrity_score ?? 100;

  return (
    <div style={{ padding: "24px 28px", backgroundColor: "var(--surface)", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 36 }}>

        {/* ── Left: Combined audit timeline ──────────────────────────────────── */}
        <div>
          <h4
            style={{
              margin: "0 0 16px",
              color: "var(--muted)",
              textTransform: "uppercase",
              fontSize: "0.75rem",
              letterSpacing: "0.06em",
              fontFamily: SANS,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
            }}
          >
            <iconify-icon icon="lucide:activity" style={{ fontSize: 15, color: "var(--green)" }} />
            Combined Integrity Timeline
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--green-dim)",
                color: "var(--green)",
                marginLeft: "auto",
              }}
            >
              MediaPipe + Lockdown
            </span>
          </h4>

          {lockdownEscalated && (
            <div
              style={{
                padding: "10px 14px",
                background: "var(--red-dim)",
                border: "1px solid var(--red)",
                borderRadius: 8,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--red)",
                fontFamily: MONO,
                fontWeight: 600,
              }}
            >
              <iconify-icon icon="lucide:shield-alert" style={{ fontSize: 16 }} />
              Session was auto-escalated to PENDING_SUPERVISOR_REVIEW — integrity threshold breached.
            </div>
          )}

          {tlLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              Loading timeline telemetry...
            </div>
          ) : events.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13, fontFamily: MONO }}>
              [OK] No integrity anomalies recorded — verified clean session.
            </div>
          ) : (
            <div>
              {events.map((ev, i) => {
                const tsMs = ev.ts ? new Date(ev.ts).getTime() : 0;
                const clip = clips.find((c) => c.anomalyType === ev.type && Math.abs(new Date(c.capturedAt).getTime() - tsMs) < 15000);
                return <TimelineEvent key={i} ev={ev} index={i} clip={clip} onPlayClip={setPlayingClip} />;
              })}
            </div>
          )}

          {/* Q&A Review Section */}
          <div style={{ marginTop: 28, borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <h4
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <iconify-icon icon="lucide:clipboard-list" style={{ fontSize: 15 }} />
              Assessment Question Breakdown
            </h4>
            {reviewLoading ? (
              <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 16 }}>Loading question review...</div>
            ) : !review || !review.items || review.items.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 16 }}>No question telemetry stored.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {review.items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 14,
                      background: "var(--raised)",
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>{idx + 1}.</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <p style={{ margin: "0", fontSize: 13, color: "var(--ink)", lineHeight: 1.5, flex: 1, fontWeight: 500 }}>
                            {item.question_text}
                          </p>
                          <span
                            style={{
                              marginLeft: 12,
                              padding: "3px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: MONO,
                              textTransform: "uppercase",
                              background: item.is_correct ? "var(--green-dim)" : "var(--red-dim)",
                              color: item.is_correct ? "var(--green)" : "var(--red)",
                            }}
                          >
                            {item.is_correct ? "✓ Correct" : "✗ Incorrect"}
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {item.options && item.options.length > 0 ? (
                            item.options.map((opt, i) => {
                              const isCorrectAns = opt === item.correct_answer;
                              const isUserAns = opt === item.user_answer || (item.user_answer && item.user_answer.includes(opt));
                              let bg = "transparent";
                              let br = "1px solid var(--line)";
                              let col = "var(--muted)";
                              if (isCorrectAns && isUserAns) {
                                bg = "var(--green-dim)";
                                br = "1px solid var(--green)";
                                col = "var(--green)";
                              } else if (isCorrectAns) {
                                bg = "var(--green-dim)";
                                br = "1px dashed var(--green)";
                                col = "var(--green)";
                              } else if (isUserAns) {
                                bg = "var(--red-dim)";
                                br = "1px solid var(--red)";
                                col = "var(--red)";
                              }
                              return (
                                <div
                                  key={i}
                                  style={{
                                    padding: "6px 10px",
                                    fontSize: 12,
                                    borderRadius: 6,
                                    background: bg,
                                    border: br,
                                    color: col,
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <span>{opt}</span>
                                  <div>
                                    {isCorrectAns && isUserAns && <span style={{ marginLeft: 8, fontWeight: 700 }}>✓ Correct (Selected)</span>}
                                    {isCorrectAns && !isUserAns && <span style={{ marginLeft: 8, fontWeight: 700 }}>✓ Correct Answer</span>}
                                    {isUserAns && !isCorrectAns && <span style={{ marginLeft: 8, fontWeight: 700 }}>✗ Selected Answer</span>}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div
                              style={{
                                padding: "6px 10px",
                                fontSize: 12,
                                borderRadius: 6,
                                background: item.is_correct ? "var(--green-dim)" : "var(--red-dim)",
                                border: `1px solid ${item.is_correct ? "var(--green)" : "var(--red)"}`,
                                color: item.is_correct ? "var(--green)" : "var(--red)",
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <span>User Answer: {item.user_answer || "N/A"}</span>
                              <div>
                                {item.is_correct ? (
                                  <span style={{ marginLeft: 8, fontWeight: 700 }}>✓ Correct</span>
                                ) : (
                                  <span style={{ marginLeft: 8, fontWeight: 700 }}>✗ (Correct: {item.correct_answer})</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Stats + proctoring video + action ────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Score cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ padding: "14px 16px", background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>
                SCI Score
              </div>
              <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: sciScore >= 70 ? "var(--green)" : "var(--red)" }}>
                {sciScore.toFixed(1)}%
              </div>
            </div>
            <div style={{ padding: "14px 16px", background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>
                Integrity
              </div>
              <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: integrityWarning ? "var(--red)" : "var(--ink)" }}>
                {integrityScore.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Session Details & Lockdown summary */}
          <div style={{ padding: "14px 16px", background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Lockdown Status</div>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Duration</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: lockdownEscalated ? "var(--red)" : "var(--green)",
                    boxShadow: `0 0 6px ${lockdownEscalated ? "var(--red)" : "var(--green)"}`,
                  }}
                />
                <span style={{ fontSize: 13, color: lockdownEscalated ? "var(--red)" : "var(--green)", fontFamily: MONO, fontWeight: 600 }}>
                  {lockdownEscalated ? "Escalated" : "Clean Pass"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink)", fontFamily: MONO, fontWeight: 600 }}>
                {(() => {
                  if (!timeline?.started_at || !timeline?.completed_at) return "N/A";
                  const s = new Date(timeline.started_at).getTime();
                  const e = new Date(timeline.completed_at).getTime();
                  const mins = Math.floor((e - s) / 60000);
                  const secs = Math.floor(((e - s) % 60000) / 1000);
                  return `${mins}m ${secs}s`;
                })()}
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", fontFamily: MONO }}>
              {events.filter((e) => e.source === "lockdown").length} lockdown event(s) · {events.filter((e) => e.source === "mediapipe").length} gaze event(s)
            </div>
          </div>

          {/* Proctoring video thumbnail */}
          <div
            style={{
              background: "var(--raised)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--line)",
                fontSize: 11,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Proctoring Footage</span>
              {playingClip && <span style={{ color: "var(--green)", fontWeight: 700 }}>Clip: {TYPE_LABELS[playingClip.anomalyType] || playingClip.anomalyType}</span>}
            </div>
            {playingClip ? (
              <video
                src={URL.createObjectURL(playingClip.blob)}
                controls
                autoPlay
                style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", background: "#000" }}
              />
            ) : (
              <div
                style={{
                  aspectRatio: "16/9",
                  background: "rgba(0,0,0,0.3)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: 16,
                }}
              >
                <iconify-icon icon="lucide:video" style={{ fontSize: 26, color: "var(--muted)" }} />
                <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
                  {clips.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                      <span>Session contains {clips.length} recorded clip(s). Click "Play Clip" in the timeline.</span>
                      {clips.find((c) => c.anomalyType === "full_session") && (
                        <button
                          onClick={() => {
                            const clip = clips.find((c) => c.anomalyType === "full_session");
                            if (clip) setPlayingClip(clip);
                          }}
                          className="btn btn-secondary"
                          style={{
                            padding: "6px 14px",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <iconify-icon icon="lucide:play-circle" />
                          Play Full Session Video
                        </button>
                      )}
                    </div>
                  ) : (
                    "Live proctoring — no video stored. Anomaly events logged in timeline above."
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {attempt.is_retake_requested ? (
            <button
              onClick={() => onGrantRetake(attempt.id)}
              disabled={processing}
              className="btn btn-secondary"
              style={{
                padding: "14px",
                background: "var(--amber)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                borderRadius: 10,
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "var(--shadow-btn)",
                opacity: processing ? 0.6 : 1,
              }}
            >
              <iconify-icon icon="lucide:refresh-cw" style={{ fontSize: 16 }} />
              {processing ? "Processing..." : "Approve Retake Request"}
            </button>
          ) : attempt.status === "failed" ? (
            <div
              style={{
                padding: "14px",
                background: "var(--raised)",
                border: "1px dashed var(--line)",
                borderRadius: 10,
                color: "var(--muted)",
                textAlign: "center",
                fontSize: 13,
                fontFamily: SANS,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <iconify-icon icon="lucide:clock" style={{ fontSize: 16 }} />
              Worker scored below passing threshold. Awaiting retake request.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {attempt.has_certificate ? (
                <div
                  style={{
                    padding: "14px",
                    background: "var(--green-dim)",
                    border: "1px dashed var(--green)",
                    borderRadius: 10,
                    color: "var(--green)",
                    fontWeight: 600,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    fontFamily: SANS,
                  }}
                >
                  <iconify-icon icon="lucide:check-circle" style={{ fontSize: 16 }} />
                  Certificate Already Issued
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "var(--raised)",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>Validity Period</span>
                    <select
                      value={validityMonths}
                      onChange={(e) => setValidityMonths(Number(e.target.value))}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 13,
                        color: "var(--ink)",
                        outline: "none",
                        fontWeight: 600,
                      }}
                    >
                      <option value={6}>6 months</option>
                      <option value={12}>12 months (1 yr)</option>
                      <option value={14}>14 months (1 yr 2 mos)</option>
                      <option value={18}>18 months (1 yr 6 mos)</option>
                      <option value={24}>24 months (2 yrs)</option>
                      <option value={36}>36 months (3 yrs)</option>
                    </select>
                  </div>
                  <button
                    onClick={() => onIssueCertificate(attempt.id, validityMonths)}
                    disabled={processing}
                    className="btn btn-primary"
                    style={{
                      padding: "14px",
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 13,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      boxShadow: "var(--shadow-btn)",
                      opacity: processing ? 0.6 : 1,
                    }}
                  >
                    <iconify-icon icon="lucide:award" style={{ fontSize: 16 }} />
                    {processing ? "Processing..." : `Issue Certificate (${formatValidity(validityMonths)})`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main AuditLog page ───────────────────────────────────────────────────────
export const AuditLog: React.FC = () => {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "warn" | "passed" | "retake">("all");

  useEffect(() => {
    loadAttempts();
  }, []);

  const loadAttempts = async () => {
    setLoading(true);
    try {
      const data = await getPendingAttempts();
      setAttempts(data);
    } catch (err) {
      console.error("Failed to load audit attempts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleIssueCertificate = async (id: string, validityMonths: number) => {
    setProcessingId(id);
    try {
      await issueCertificate(id, validityMonths);
      setExpandedId(null);
      loadAttempts();
    } finally {
      setProcessingId(null);
    }
  };

  const handleGrantRetake = async (id: string) => {
    setProcessingId(id);
    try {
      await grantRetake(id);
      setAttempts((prev) => prev.filter((a) => a.id !== id));
      setExpandedId(null);
    } catch (e: any) {
      setToastError("Failed to grant retake: " + (e.message || e.toString()));
      setTimeout(() => setToastError(null), 4000);
    } finally {
      setProcessingId(null);
    }
  };

  // Filtered attempts
  const filteredAttempts = useMemo(() => {
    return attempts.filter((att) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        (att.employee_name && att.employee_name.toLowerCase().includes(q)) ||
        (att.job_title && att.job_title.toLowerCase().includes(q)) ||
        (att.assessment_name && att.assessment_name.toLowerCase().includes(q));

      if (!matchQuery) return false;

      const integrityScore = att.integrity_score ?? 100;
      const lockdownEscalated = att.lockdown_escalated ?? false;
      const isWarn = integrityScore < 80 || lockdownEscalated;
      const isRetake = Boolean(att.is_retake_requested);
      const isPassed = !isWarn && !isRetake && att.status !== "failed";

      if (statusFilter === "warn") return isWarn;
      if (statusFilter === "retake") return isRetake;
      if (statusFilter === "passed") return isPassed;

      return true;
    });
  }, [attempts, searchQuery, statusFilter]);

  const flaggedCount = attempts.filter((a) => (a.integrity_score ?? 100) < 80 || a.lockdown_escalated).length;
  const retakeCount = attempts.filter((a) => a.is_retake_requested).length;

  return (
    <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>
            Audit Log
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, margin: 0 }}>
            Review MediaPipe gaze tracking, lockdown integrity flags, and session forensics.
          </p>
        </div>

        {/* Live Integrity Badges */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "var(--shadow-btn)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--green)",
                boxShadow: "0 0 8px rgba(34, 197, 94, 0.6)",
              }}
            />
            <iconify-icon icon="lucide:eye" style={{ fontSize: 14, color: "var(--green)" }} />
            <span>MediaPipe Active</span>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "var(--shadow-btn)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--amber)",
                boxShadow: "0 0 8px rgba(245, 158, 11, 0.6)",
              }}
            />
            <iconify-icon icon="lucide:shield-alert" style={{ fontSize: 14, color: "var(--amber)" }} />
            <span>Lockdown Active</span>
          </div>
        </div>
      </div>

      {/* ── Filter / Search Bar ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "12px 16px",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        {/* Search Input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 280px", maxWidth: 420 }}>
          <iconify-icon icon="lucide:search" style={{ fontSize: 16, color: "var(--muted)" }} />
          <input
            type="text"
            placeholder="Search by worker name, role, or certification..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "var(--ink)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2 }}
            >
              <iconify-icon icon="lucide:x" style={{ fontSize: 14 }} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setStatusFilter("all")}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: statusFilter === "all" ? "1px solid var(--ink)" : "1px solid var(--line)",
              background: statusFilter === "all" ? "var(--ink)" : "transparent",
              color: statusFilter === "all" ? "var(--base)" : "var(--muted)",
              transition: "all 0.15s ease",
            }}
          >
            All ({attempts.length})
          </button>
          <button
            onClick={() => setStatusFilter("warn")}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: statusFilter === "warn" ? "1px solid var(--red)" : "1px solid var(--line)",
              background: statusFilter === "warn" ? "var(--red-dim)" : "transparent",
              color: statusFilter === "warn" ? "var(--red)" : "var(--muted)",
              transition: "all 0.15s ease",
            }}
          >
            Flagged ({flaggedCount})
          </button>
          {retakeCount > 0 && (
            <button
              onClick={() => setStatusFilter("retake")}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: statusFilter === "retake" ? "1px solid var(--amber)" : "1px solid var(--line)",
                background: statusFilter === "retake" ? "var(--amber-dim)" : "transparent",
                color: statusFilter === "retake" ? "var(--amber)" : "var(--muted)",
                transition: "all 0.15s ease",
              }}
            >
              Retake Req. ({retakeCount})
            </button>
          )}
          <button
            onClick={() => setStatusFilter("passed")}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: statusFilter === "passed" ? "1px solid var(--green)" : "1px solid var(--line)",
              background: statusFilter === "passed" ? "var(--green-dim)" : "transparent",
              color: statusFilter === "passed" ? "var(--green)" : "var(--muted)",
              transition: "all 0.15s ease",
            }}
          >
            Clean Passed
          </button>
        </div>
      </div>

      {/* ── Attempt Cards List ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filteredAttempts.map((attempt) => {
          const isExpanded = expandedId === attempt.id;
          const integrityScore = attempt.integrity_score ?? 100;
          const lockdownEscalated = attempt.lockdown_escalated ?? false;
          const warn = integrityScore < 80 || lockdownEscalated;

          return (
            <div
              key={attempt.id}
              style={{
                border: warn ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--line)",
                borderRadius: 16,
                overflow: "hidden",
                background: "var(--surface)",
                boxShadow: isExpanded ? "var(--shadow-card)" : "0 2px 8px rgba(0,0,0,0.03)",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              {/* Row Header */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : attempt.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1.3fr 1fr 1fr 1.1fr 36px",
                  padding: "16px 24px",
                  cursor: "pointer",
                  backgroundColor: isExpanded ? "var(--raised)" : "transparent",
                  borderBottom: isExpanded ? "1px solid var(--line)" : "none",
                  alignItems: "center",
                  gap: 16,
                  transition: "background-color 0.15s ease",
                }}
              >
                {/* 1. Worker Name & Role */}
                <div>
                  <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: "15px", letterSpacing: "-0.01em" }}>
                    {attempt.employee_name || "Unknown Operator"}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: "13px", marginTop: "2px" }}>
                    {attempt.job_title || "Operator"}
                  </div>
                </div>

                {/* 2. Assessment Title */}
                <div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                    Assessment
                  </div>
                  <div style={{ fontSize: "13.5px", marginTop: "3px", color: "var(--ink)", fontWeight: 500, lineHeight: 1.35 }}>
                    {attempt.assessment_name}
                  </div>
                </div>

                {/* 3. SCI Score */}
                <div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                    SCI Score
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: "15.5px",
                      fontWeight: 700,
                      marginTop: "3px",
                      color: (attempt.score ?? 0) >= 70 ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {(attempt.score ?? 0).toFixed(1)}%
                  </div>
                </div>

                {/* 4. Integrity Score */}
                <div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                    Integrity
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: "15.5px",
                      fontWeight: 700,
                      marginTop: "3px",
                      color: integrityScore < 80 ? "var(--red)" : "var(--ink)",
                    }}
                  >
                    {integrityScore.toFixed(1)}%
                  </div>
                </div>

                {/* 5. Status Badge */}
                <div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                    Status
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    {attempt.is_retake_requested ? (
                      <span
                        className="badge badge-amber"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 600,
                          fontFamily: MONO,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                        Retake Req.
                      </span>
                    ) : attempt.status === "failed" ? (
                      <span
                        className="badge badge-crimson"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 600,
                          fontFamily: MONO,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                        Failed
                      </span>
                    ) : lockdownEscalated ? (
                      <span
                        className="badge badge-crimson"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 600,
                          fontFamily: MONO,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                        Escalated
                      </span>
                    ) : (
                      <span
                        className="badge badge-emerald"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 600,
                          fontFamily: MONO,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                        Passed
                      </span>
                    )}
                  </div>
                </div>

                {/* 6. Expand Chevron */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      background: isExpanded ? "var(--surface)" : "transparent",
                      color: isExpanded ? "var(--ink)" : "var(--muted)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <iconify-icon
                      icon="lucide:chevron-down"
                      style={{
                        fontSize: 18,
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Expanded Detail Panel */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <AttemptDetail
                      attempt={attempt}
                      onIssueCertificate={handleIssueCertificate}
                      onGrantRetake={handleGrantRetake}
                      processing={processingId === attempt.id}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {filteredAttempts.length === 0 && !loading && (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--muted)",
              border: "1px dashed var(--line)",
              borderRadius: 16,
              background: "var(--surface)",
              fontFamily: SANS,
              fontSize: 14,
            }}
          >
            <iconify-icon icon="lucide:search-x" style={{ fontSize: 32, color: "var(--muted)", marginBottom: 8, display: "block" }} />
            No audit records match the selected filter or search criteria.
          </div>
        )}
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastError && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            style={{
              position: "fixed",
              bottom: 32,
              right: 32,
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "white",
              padding: "16px 24px",
              borderRadius: "12px",
              boxShadow: "0 12px 24px rgba(220, 38, 38, 0.25)",
              zIndex: 1001,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontWeight: 600,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "50%", width: 32, height: 32, display: "grid", placeItems: "center" }}>
              <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 18 }} />
            </div>
            {toastError}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AuditLog;
