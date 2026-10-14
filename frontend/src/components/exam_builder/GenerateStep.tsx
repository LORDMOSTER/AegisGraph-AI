/**
 * GenerateStep.tsx
 * Step 3: SSE Background Generation Job with Real-Time Progress, Retry/Failure telemetry, and Safe Resume
 */

import React, { useState, useEffect, useRef } from "react";
import {
  ExamDraftModel,
  generateDraftQuestions,
  getGenerationJob,
  cancelGenerationJob,
} from "../../api";

interface GenerateStepProps {
  draft: ExamDraftModel;
  onGenerationComplete: () => void;
  onProceedToReview: () => void;
}

interface SlotEvent {
  id: string;
  section_id: string;
  section_title?: string;
  slot_index: number;
  question_type: string;
  difficulty: string;
  status: "ready" | "retrying" | "failed";
  attempt?: number;
  stem?: string;
  reason?: string;
  timestamp: string;
}

export const GenerateStep: React.FC<GenerateStepProps> = ({
  draft,
  onGenerationComplete,
  onProceedToReview,
}) => {
  const [jobId, setJobId] = useState<string | null>(() => {
    return localStorage.getItem(`aegis_gen_job_${draft.id}`) || null;
  });
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [completedSlots, setCompletedSlots] = useState(0);
  const [totalSlots, setTotalSlots] = useState(() => {
    return draft.sections.reduce((acc, s) => acc + (s.questions?.length || 5), 0);
  });
  const [events, setEvents] = useState<SlotEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Resume or check existing job on mount
  useEffect(() => {
    if (jobId) {
      getGenerationJob(jobId)
        .then((job) => {
          setJobStatus(job.status);
          if (job.status === "running" || job.status === "pending") {
            connectSSE(job.id);
          } else if (job.status === "completed") {
            setCompletedSlots(totalSlots);
          }
        })
        .catch(() => {
          localStorage.removeItem(`aegis_gen_job_${draft.id}`);
          setJobId(null);
        });
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [jobId]);

  const connectSSE = (id: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Standard EventSource connection
    const es = new EventSource(`/api/generation-jobs/${id}/events`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setJobStatus("running");
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === "job_started") {
          setTotalSlots(data.total_slots || totalSlots);
        } else if (data.event === "slot_progress" || data.event === "slot_completed") {
          setCompletedSlots((prev) => Math.min(totalSlots, prev + 1));
          const newEvt: SlotEvent = {
            id: `${data.section_id}-${data.slot_index}-${Date.now()}`,
            section_id: data.section_id,
            slot_index: data.slot_index,
            question_type: data.question_type || "MCQ",
            difficulty: data.difficulty || "medium",
            status: data.status === "failed" ? "failed" : data.status === "retrying" ? "retrying" : "ready",
            attempt: data.attempt,
            stem: data.stem,
            reason: data.reason || data.error,
            timestamp: new Date().toLocaleTimeString(),
          };
          setEvents((prev) => [newEvt, ...prev].slice(0, 30));
        } else if (data.event === "job_completed") {
          setJobStatus("completed");
          setCompletedSlots(totalSlots);
          onGenerationComplete();
          es.close();
        } else if (data.event === "job_failed") {
          setJobStatus("failed");
          es.close();
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    es.onerror = () => {
      // Re-poll job status if SSE drops
      getGenerationJob(id).then((job) => {
        setJobStatus(job.status);
        if (job.status === "completed") {
          onGenerationComplete();
          es.close();
        }
      });
    };
  };

  const handleStartGeneration = async () => {
    setIsStarting(true);
    try {
      const job = await generateDraftQuestions(draft.id);
      setJobId(job.id);
      setJobStatus("running");
      setEvents([]);
      setCompletedSlots(0);
      localStorage.setItem(`aegis_gen_job_${draft.id}`, job.id);
      connectSSE(job.id);
    } catch (err: any) {
      console.error("Failed to start generation", err);
      alert(err.message || "Failed to launch generation job");
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    setIsCancelling(true);
    try {
      await cancelGenerationJob(jobId);
      setJobStatus("cancelled");
      if (eventSourceRef.current) eventSourceRef.current.close();
    } catch (err) {
      console.error("Cancel failed", err);
    } finally {
      setIsCancelling(false);
    }
  };

  const progressPct = totalSlots > 0 ? Math.min(100, Math.round((completedSlots / totalSlots) * 100)) : 0;

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Overview & Action Card */}
      <div className="card" style={{ padding: 24, background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
              AI Question Generation & Grounding Engine
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              Assembles grounded questions matching your section filters, type mixes, and cognitive difficulty requirements.
            </p>
          </div>
          <span
            className={`badge badge-${
              jobStatus === "completed"
                ? "emerald"
                : jobStatus === "running"
                ? "cyan"
                : jobStatus === "failed"
                ? "rose"
                : "secondary"
            }`}
          >
            {jobStatus.toUpperCase()}
          </span>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: "var(--muted)" }}>
              Progress: {completedSlots} of {totalSlots} slots processed
            </span>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{progressPct}%</span>
          </div>
          <div
            style={{
              width: "100%",
              height: 10,
              borderRadius: 6,
              background: "var(--raised)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>

        {/* Job Control Buttons */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {jobStatus === "idle" || jobStatus === "failed" || jobStatus === "cancelled" ? (
            <button
              type="button"
              onClick={handleStartGeneration}
              disabled={isStarting}
              className="btn btn-primary"
              style={{ padding: "10px 20px", fontSize: 14 }}
            >
              <iconify-icon icon="lucide:play" style={{ marginRight: 8 }} />
              {isStarting ? "Starting Background Worker..." : "Start Question Generation"}
            </button>
          ) : jobStatus === "running" ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isCancelling}
              className="btn btn-ghost"
              style={{ color: "var(--rose, #f43f5e)", border: "1px solid var(--rose, #f43f5e)", padding: "8px 16px" }}
            >
              <iconify-icon icon="lucide:square" style={{ marginRight: 6 }} />
              Cancel Generation
            </button>
          ) : null}

          {/* Proceed to Review Button */}
          {(jobStatus === "completed" || draft.sections.some((s) => s.questions?.length > 0)) && (
            <button
              type="button"
              onClick={onProceedToReview}
              className="btn btn-primary"
              style={{ padding: "10px 20px", fontSize: 14 }}
            >
              <span>Proceed to Review & Edit (Builder)</span>
              <iconify-icon icon="lucide:arrow-right" style={{ marginLeft: 8 }} />
            </button>
          )}

          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
            ⚡ Safe to leave this tab; job runs asynchronously on local backend.
          </div>
        </div>
      </div>

      {/* Real-Time Live Events Telemetry Stream */}
      <div className="card" style={{ padding: 20, background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: jobStatus === "running" ? "var(--accent)" : "var(--muted)",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Live Telemetry Stream</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "monospace" }}>
            SSE CHANNEL ACTIVE
          </span>
        </div>

        {events.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            {jobStatus === "idle"
              ? "Click 'Start Question Generation' to begin SSE streaming."
              : "Connecting to telemetry event channel..."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
            {events.map((evt) => (
              <div
                key={evt.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  background:
                    evt.status === "failed"
                      ? "rgba(244, 63, 94, 0.08)"
                      : evt.status === "retrying"
                      ? "rgba(245, 158, 11, 0.08)"
                      : "rgba(16, 185, 129, 0.06)",
                  border: `1px solid ${
                    evt.status === "failed"
                      ? "rgba(244, 63, 94, 0.2)"
                      : evt.status === "retrying"
                      ? "rgba(245, 158, 11, 0.2)"
                      : "rgba(16, 185, 129, 0.15)"
                  }`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <span
                    className={`badge badge-${
                      evt.status === "ready" ? "emerald" : evt.status === "retrying" ? "amber" : "rose"
                    }`}
                    style={{ fontSize: 10, whiteSpace: "nowrap" }}
                  >
                    {evt.status.toUpperCase()}
                  </span>
                  <span style={{ color: "var(--accent)", fontFamily: "monospace" }}>
                    Slot #{evt.slot_index + 1}
                  </span>
                  <span style={{ color: "var(--muted)" }}>[{evt.question_type}]</span>
                  <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {evt.stem || evt.reason || "Grounding check passed"}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 12 }}>
                  {evt.timestamp}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
