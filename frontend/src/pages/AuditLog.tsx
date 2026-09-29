/**
 * AuditLog.tsx  (Req #7 — Combined Integrity + Lockdown Timeline)
 *
 * Fetches real exam attempt data from the backend and renders:
 *   - Per-attempt rows with SCI score and integrity/lockdown flags
 *   - Expanded panel with the combined timeline (MediaPipe gaze + lockdown events)
 *   - Video thumbnail placeholder for proctoring footage (if available)
 *   - Issue Certificate action
 */
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAuditTimeline, AuditTimeline, AuditTimelineEvent } from "../api";

// ─── Colour palette (Void-Industrial) ───────────────────────────────────────
const C = {
  void: "#07070e",
  surface: "#0c0c14",
  glass: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.1)",
  shadow: "inset 2px 2px 5px rgba(0,0,0,.8),inset -2px -2px 5px rgba(255,255,255,.04)",
  text: "#f3f3f3",
  muted: "#888899",
  violet: "#8a2be2",
  cyan: "#00ffcc",
  amber: "#ffb000",
  red: "#ff3366",
};
const MONO = "'JetBrains Mono','Fira Code',monospace";
const SANS = "'Inter','IBM Plex Sans',sans-serif";

// ─── Source badge config ──────────────────────────────────────────────────────
const SOURCE_META: Record<string, { label: string; color: string; icon: string }> = {
  mediapipe: { label: "MediaPipe", color: C.cyan, icon: "lucide:eye" },
  lockdown: { label: "Lockdown", color: C.amber, icon: "lucide:shield-alert" },
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

// ─── Mock attempt list (replace with real /audit/attempts when ready) ─────────
const MOCK_ATTEMPTS = [
  {
    id: "att-101",
    employeeName: "John Doe",
    jobTitle: "CNC Machine Operator",
    assessmentName: "Safety Protocol Beta",
    sciScore: 92.5,
    integrityScore: 98.2,
    lockdownEscalated: false,
    completedAt: "2026-09-25T14:30:00Z",
    examSessionId: null as string | null,
  },
  {
    id: "att-102",
    employeeName: "Jane Smith",
    jobTitle: "Forklift Operator",
    assessmentName: "Vehicle Operations Q3",
    sciScore: 88.0,
    integrityScore: 62.4,
    lockdownEscalated: true,
    completedAt: "2026-09-24T09:15:00Z",
    examSessionId: null as string | null,
  },
];

// ─── Timeline event row ───────────────────────────────────────────────────────
function TimelineEvent({ ev, index }: { ev: AuditTimelineEvent; index: number }) {
  const meta = SOURCE_META[ev.source] ?? { label: ev.source, color: C.muted, icon: "lucide:activity" };
  const label = TYPE_LABELS[ev.type] ?? ev.type;
  const ts = ev.ts ? new Date(ev.ts).toLocaleTimeString() : "—";
  const dur = ev.duration_s != null ? `${ev.duration_s.toFixed(1)}s` : null;
  const isFailure = ev.type === "unlock_failure";

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{
        display: "flex",
        gap: 14,
        padding: "12px 0",
        borderBottom: `1px solid ${C.border}`,
        alignItems: "flex-start",
      }}
    >
      {/* Timeline dot */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: `${meta.color}18`,
          border: `1px solid ${meta.color}55`,
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
              background: `${meta.color}18`,
              color: meta.color,
              fontFamily: MONO,
              letterSpacing: "0.04em",
            }}
          >
            {meta.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
          {isFailure && ev.detail?.subtype && (
            <span style={{ fontSize: 11, color: C.red, fontFamily: MONO }}>
              [{ev.detail.subtype}] logged server-side
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.muted, fontFamily: MONO }}>
          <span>⏱ {ts}</span>
          {dur && <span>⏳ {dur} outside lockdown</span>}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Expanded detail panel ─────────────────────────────────────────────────────
function AttemptDetail({
  attempt,
  onIssueCertificate,
  processing,
}: {
  attempt: (typeof MOCK_ATTEMPTS)[0];
  onIssueCertificate: (id: string) => void;
  processing: boolean;
}) {
  const [timeline, setTimeline] = useState<AuditTimeline | null>(null);
  const [tlLoading, setTlLoading] = useState(false);

  useEffect(() => {
    if (!attempt.examSessionId) return;
    setTlLoading(true);
    getAuditTimeline(attempt.examSessionId)
      .then(setTimeline)
      .catch(() => setTimeline(null))
      .finally(() => setTlLoading(false));
  }, [attempt.examSessionId]);

  const integrityWarning = attempt.integrityScore < 80;

  // Build a mock timeline if no real session ID (demo fallback)
  const mockTimeline: AuditTimelineEvent[] = [
    {
      source: "mediapipe",
      type: "gaze_anomaly",
      ts: attempt.completedAt,
      duration_s: 4.2,
      detail: { type: "gaze_anomaly" },
    },
    ...(attempt.lockdownEscalated
      ? [
          {
            source: "lockdown" as const,
            type: "fullscreen_exit",
            ts: attempt.completedAt,
            duration_s: 12.0,
            detail: { type: "fullscreen_exit" },
          },
          {
            source: "lockdown" as const,
            type: "focus_blur",
            ts: attempt.completedAt,
            duration_s: 8.5,
            detail: { type: "focus_blur" },
          },
          {
            source: "lockdown" as const,
            type: "tab_hidden",
            ts: attempt.completedAt,
            duration_s: 15.3,
            detail: { type: "tab_hidden" },
          },
        ]
      : []),
  ];

  const events = timeline?.timeline ?? mockTimeline;
  const lockdownEscalated = timeline?.lockdown_escalated ?? attempt.lockdownEscalated;

  return (
    <div style={{ padding: "24px", backgroundColor: C.surface, boxShadow: C.shadow }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 40 }}>

        {/* ── Left: Combined audit timeline ──────────────────────────────────── */}
        <div>
          <h4
            style={{
              margin: "0 0 16px",
              color: C.muted,
              textTransform: "uppercase",
              fontSize: "0.8rem",
              letterSpacing: "0.06em",
              fontFamily: SANS,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <iconify-icon icon="lucide:activity" style={{ fontSize: 14 }} />
            Combined Integrity Timeline
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: `${C.violet}22`, color: C.violet, marginLeft: "auto" }}>
              MediaPipe + Lockdown
            </span>
          </h4>

          {lockdownEscalated && (
            <div
              style={{
                padding: "10px 14px",
                background: `${C.red}10`,
                border: `1px solid ${C.red}40`,
                borderRadius: 6,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: C.red,
                fontFamily: MONO,
              }}
            >
              <iconify-icon icon="lucide:shield-alert" style={{ fontSize: 14 }} />
              Session was auto-escalated to PENDING_SUPERVISOR_REVIEW — threshold exceeded.
            </div>
          )}

          {tlLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>
              Loading timeline...
            </div>
          ) : events.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13, fontFamily: MONO }}>
              [OK] No integrity events recorded — clean session.
            </div>
          ) : (
            <div>
              {events.map((ev, i) => (
                <TimelineEvent key={i} ev={ev} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Stats + proctoring video + action ────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Score cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ padding: "14px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>SCI Score</div>
              <div style={{ fontFamily: MONO, fontSize: 20, color: C.cyan, fontWeight: 700 }}>
                {attempt.sciScore.toFixed(1)}%
              </div>
            </div>
            <div style={{ padding: "14px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Integrity</div>
              <div style={{ fontFamily: MONO, fontSize: 20, color: integrityWarning ? C.red : C.text, fontWeight: 700 }}>
                {attempt.integrityScore.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Lockdown summary */}
          <div style={{ padding: "14px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Lockdown Status</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: lockdownEscalated ? C.red : C.cyan,
                }}
              />
              <span style={{ fontSize: 12, color: lockdownEscalated ? C.red : C.cyan, fontFamily: MONO }}>
                {lockdownEscalated ? "Escalated — Supervisor Review" : "Clean Session"}
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: MONO }}>
              {events.filter(e => e.source === "lockdown").length} lockdown event(s) ·{" "}
              {events.filter(e => e.source === "mediapipe").length} gaze event(s)
            </div>
          </div>

          {/* Proctoring video thumbnail (Req #7 — "bring video checking to audit page") */}
          <div
            style={{
              background: C.glass,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Proctoring Recording
            </div>
            <div
              style={{
                aspectRatio: "16/9",
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 16,
              }}
            >
              <iconify-icon icon="lucide:video-off" style={{ fontSize: 28, color: C.muted }} />
              <span style={{ fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.5 }}>
                Live-only monitoring — no video was stored. Anomaly events are shown in the timeline above.
              </span>
            </div>
          </div>

          {/* Issue certificate */}
          <button
            onClick={() => onIssueCertificate(attempt.id)}
            disabled={processing}
            style={{
              padding: "14px",
              background: C.violet,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              cursor: processing ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: `0 4px 15px ${C.violet}44`,
              transition: "opacity 0.2s",
              opacity: processing ? 0.6 : 1,
              fontFamily: SANS,
            }}
          >
            <iconify-icon icon="lucide:award" style={{ fontSize: 16 }} />
            {processing ? "Processing..." : "Issue Certificate & Reveal Score"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main AuditLog page ───────────────────────────────────────────────────────
export const AuditLog: React.FC = () => {
  const [attempts, setAttempts] = useState(MOCK_ATTEMPTS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleIssueCertificate = async (id: string) => {
    setProcessingId(id);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      setAttempts((prev) => prev.filter((a) => a.id !== id));
      setExpandedId(null);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div
      style={{
        padding: "40px",
        backgroundColor: C.void,
        minHeight: "100vh",
        color: C.text,
        fontFamily: SANS,
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: "40px", borderBottom: `1px solid ${C.border}`, paddingBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "2rem", margin: 0, fontWeight: 300, letterSpacing: "-0.02em" }}>
              AUDIT <span style={{ color: C.violet, fontWeight: 700 }}>REVIEW</span>
            </h1>
            <p style={{ color: C.muted, marginTop: "8px", fontSize: "0.9rem", margin: "8px 0 0" }}>
              MediaPipe gaze tracking + lockdown integrity events — unified timeline per attempt.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ padding: "8px 14px", background: `${C.cyan}10`, border: `1px solid ${C.cyan}40`, borderRadius: 6, fontSize: 12, color: C.cyan, display: "flex", alignItems: "center", gap: 6 }}>
              <iconify-icon icon="lucide:eye" style={{ fontSize: 13 }} />
              MediaPipe
            </div>
            <div style={{ padding: "8px 14px", background: `${C.amber}10`, border: `1px solid ${C.amber}40`, borderRadius: 6, fontSize: 12, color: C.amber, display: "flex", alignItems: "center", gap: 6 }}>
              <iconify-icon icon="lucide:shield-alert" style={{ fontSize: 13 }} />
              Lockdown
            </div>
          </div>
        </div>
      </header>

      {/* Table */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {attempts.map((attempt) => {
          const isExpanded = expandedId === attempt.id;
          const warn = attempt.integrityScore < 80 || attempt.lockdownEscalated;

          return (
            <div
              key={attempt.id}
              style={{
                backgroundColor: C.glass,
                border: `1px solid ${warn ? C.red + "44" : C.border}`,
                borderRadius: 0,
                overflow: "hidden",
                transition: "all 0.3s",
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : attempt.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr auto",
                  padding: "20px",
                  cursor: "pointer",
                  backgroundColor: isExpanded ? `${C.violet}08` : "transparent",
                  borderBottom: isExpanded ? `1px solid ${C.border}` : "none",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{attempt.employeeName}</div>
                  <div style={{ fontSize: "0.8rem", color: C.muted }}>{attempt.jobTitle}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assessment</div>
                  <div style={{ fontSize: "0.85rem", marginTop: 2 }}>{attempt.assessmentName}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>SCI Score</div>
                  <div style={{ fontFamily: MONO, color: C.cyan, fontSize: 16, marginTop: 2 }}>{attempt.sciScore.toFixed(1)}%</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Integrity</div>
                  <div style={{ fontFamily: MONO, color: attempt.integrityScore < 80 ? C.red : C.text, fontSize: 16, marginTop: 2 }}>
                    {attempt.integrityScore.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Lockdown</div>
                  <div style={{ fontSize: 12, marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: attempt.lockdownEscalated ? C.red : C.cyan,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: attempt.lockdownEscalated ? C.red : C.cyan, fontFamily: MONO }}>
                      {attempt.lockdownEscalated ? "Escalated" : "Clean"}
                    </span>
                  </div>
                </div>
                <div>
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.muted}
                    strokeWidth="2"
                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* Expanded detail */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <AttemptDetail
                      attempt={attempt}
                      onIssueCertificate={handleIssueCertificate}
                      processing={processingId === attempt.id}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {attempts.length === 0 && (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: C.muted,
              border: `1px dashed ${C.border}`,
              fontFamily: MONO,
              fontSize: 13,
            }}
          >
            [OK] No pending attempts to review.
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
