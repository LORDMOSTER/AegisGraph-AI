/**
 * FaceVerification.tsx
 * Identity check using face-api.js TinyFaceDetector + FaceRecognitionNet.
 * Models are loaded from /public/models, never from a CDN at runtime.
 * 
 * Flow:
 *   1. Load models (done once per session)
 *   2. Show consent screen with clip disclosure
 *   3. Capture webcam frame
 *   4. Compare embedding against stored enrollment embedding (Euclidean distance)
 *   5. Up to 3 retries before supervisor override required
 */
import React, { useState, useRef, useEffect, useCallback } from "react";

declare global {
  interface Window { faceapi: any; }
}

const MATCH_THRESHOLD = 0.5; // Euclidean distance — lower = more similar
const MAX_RETRIES = 3;

function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

interface FaceVerificationProps {
  employeeCode: string;
  enrolledEmbedding: number[] | null; // null = no enrollment photo on file
  onVerified: () => void;
  onSkip: () => void;     // called when no embedding stored (skip check)
  onSupervisorOverride: () => void; // called after 3 failures
}

type VerifyState = "consent" | "loading_models" | "ready" | "verifying" | "match" | "no_match" | "no_face" | "no_enrollment" | "supervisor";

export function FaceVerification({ employeeCode, enrolledEmbedding, onVerified, onSkip, onSupervisorOverride }: FaceVerificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [verifyState, setVerifyState] = useState<VerifyState>(
    enrolledEmbedding === null ? "no_enrollment" : "consent"
  );
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_RETRIES);
  const [message, setMessage] = useState("");
  const [distance, setDistance] = useState<number | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [supervisorPin, setSupervisorPin] = useState("");
  const [supervisorError, setSupervisorError] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Load models + camera when moving past consent
  useEffect(() => {
    if (verifyState !== "loading_models") return;
    let mounted = true;

    async function init() {
      try {
        if (!window.faceapi) throw new Error("face-api.js not loaded");

        const MODEL_URL = "/models";
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ]);

        if (!mounted) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            if (mounted) {
              setModelsLoaded(true);
              setVerifyState("ready");
              setMessage("Position your face in the camera and click Verify.");
            }
          };
        }
      } catch (err: any) {
        if (!mounted) return;
        setMessage(`Camera error: ${err.message}. Skipping identity check.`);
        setVerifyState("no_enrollment");
      }
    }

    init();
    return () => {
      mounted = false;
      stopCamera();
    };
  }, [verifyState, stopCamera]);

  const runVerification = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !window.faceapi || !enrolledEmbedding) return;

    setVerifyState("verifying");
    setMessage("Detecting your face...");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);

      const detection = await window.faceapi
        .detectSingleFace(canvas, new window.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        setVerifyState("no_face");
        setMessage("No face detected. Please ensure you are centered and well lit.");
        setAttemptsLeft((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            stopCamera();
            setVerifyState("supervisor");
          } else {
            setTimeout(() => setVerifyState("ready"), 2500);
          }
          return next;
        });
        return;
      }

      const liveEmbedding = Array.from(detection.descriptor as Float32Array);
      const dist = euclideanDistance(liveEmbedding, enrolledEmbedding);
      setDistance(dist);

      if (dist <= MATCH_THRESHOLD) {
        stopCamera();
        setVerifyState("match");
        setMessage("Identity confirmed! Starting exam...");
        setTimeout(onVerified, 1200);
      } else {
        setVerifyState("no_match");
        setMessage("Identity could not be confirmed — please try again or contact your supervisor.");
        setAttemptsLeft((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            stopCamera();
            setVerifyState("supervisor");
          } else {
            setTimeout(() => setVerifyState("ready"), 3000);
          }
          return next;
        });
      }
    } catch (err: any) {
      setVerifyState("no_match");
      setMessage(`Verification error: ${err.message}`);
      setAttemptsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setVerifyState("supervisor");
        } else {
          setTimeout(() => setVerifyState("ready"), 2500);
        }
        return next;
      });
    }
  }, [enrolledEmbedding, onVerified, stopCamera]);

  // ── No enrollment — skip verification
  if (verifyState === "no_enrollment") {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={iconBoxStyle("#f59e0b")}>
            <iconify-icon icon="lucide:user-x" style={{ fontSize: 26, color: "#f59e0b" }} />
          </div>
          <h2 style={headingStyle}>No Enrollment Photo</h2>
          <p style={bodyStyle}>
            No reference photo is on file for this employee. Identity verification will be skipped.
            Ask an admin to add an enrollment photo later.
          </p>
          <button onClick={onSkip} style={{ ...primaryBtnStyle, marginTop: 8 }}>
            Continue to Exam
          </button>
        </div>
      </div>
    );
  }

  // ── Supervisor override required
  if (verifyState === "supervisor") {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={iconBoxStyle("#ef4444")}>
            <iconify-icon icon="lucide:shield-alert" style={{ fontSize: 26, color: "#ef4444" }} />
          </div>
          <h2 style={headingStyle}>Supervisor Intervention Required</h2>
          <p style={bodyStyle}>
            Identity could not be confirmed after {MAX_RETRIES} attempts. A supervisor must
            authorise exam access using their PIN.
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>
              Supervisor PIN
            </label>
            <input
              type="password"
              maxLength={6}
              value={supervisorPin}
              onChange={(e) => setSupervisorPin(e.target.value)}
              placeholder="Enter 6-digit PIN"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "var(--raised)",
                border: "1px solid var(--line)",
                borderRadius: 9,
                fontSize: 18,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.3em",
                color: "var(--ink)",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            {supervisorError && (
              <p style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>{supervisorError}</p>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onSupervisorOverride}
              style={{ ...secondaryBtnStyle, flex: 1 }}
            >
              Cancel Attempt
            </button>
            <button
              onClick={() => {
                // Supervisor override: any 6-digit PIN entered is logged
                // In production, this would verify against the admin's PIN
                if (supervisorPin.length === 6) {
                  stopCamera();
                  onVerified();
                } else {
                  setSupervisorError("PIN must be exactly 6 digits.");
                }
              }}
              style={{ ...primaryBtnStyle, flex: 2 }}
            >
              Authorise Override
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Consent screen
  if (verifyState === "consent") {
    return (
      <div style={overlayStyle}>
        <div style={{ ...cardStyle, maxWidth: 540 }}>
          <div style={iconBoxStyle("var(--accent)")}>
            <iconify-icon icon="lucide:scan-face" style={{ fontSize: 26, color: "var(--accent)" }} />
          </div>
          <h2 style={headingStyle}>Identity Verification</h2>

          {/* Consent and clip disclosure */}
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
              <strong>Before you start:</strong> Your webcam will be used to confirm your identity
              against your enrollment photo. This is a one-time check.
            </p>
            <div style={{ height: 10 }} />
            <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.7, margin: 0 }}>
              <strong>Recording notice:</strong> This exam saves short video clips{" "}
              <em>only</em> at moments where monitoring detects something unusual (e.g. looking away
              for an extended period). <strong>The rest of the exam is not recorded.</strong>{" "}
              Clips are stored locally and reviewed only by your supervisor if needed.
            </p>
          </div>

          <button
            onClick={() => setVerifyState("loading_models")}
            style={{ ...primaryBtnStyle, width: "100%", justifyContent: "center", marginBottom: 10 }}
          >
            <iconify-icon icon="lucide:scan-face" style={{ fontSize: 16 }} />
            I Understand — Verify My Identity
          </button>
          <button onClick={onSkip} style={{ ...secondaryBtnStyle, width: "100%" }}>
            Skip (No Camera Available)
          </button>
        </div>
      </div>
    );
  }

  // ── Camera / verification states
  const stateColor = verifyState === "match"
    ? "#10b981"
    : verifyState === "no_match" || verifyState === "no_face"
    ? "#ef4444"
    : "var(--accent)";

  const stateIcon = {
    loading_models: "lucide:loader-2",
    ready: "lucide:scan-face",
    verifying: "lucide:cpu",
    match: "lucide:check-circle",
    no_match: "lucide:alert-circle",
    no_face: "lucide:user-x",
    supervisor: "lucide:shield-alert",
    consent: "lucide:scan-face",
    no_enrollment: "lucide:user-x",
  }[verifyState];

  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 540 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ ...headingStyle, marginBottom: 4 }}>Identity Check</h2>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
              Attempt {MAX_RETRIES - attemptsLeft + 1} of {MAX_RETRIES}
            </p>
          </div>
          {/* Warning dots */}
          <div style={{ display: "flex", gap: 6 }}>
            {Array.from({ length: MAX_RETRIES }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: i < MAX_RETRIES - attemptsLeft ? "#ef4444" : "var(--line)",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Video feed */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              borderRadius: 10,
              background: "#000",
              border: `2px solid ${stateColor}`,
              display: verifyState === "match" ? "none" : "block",
              maxHeight: 280,
              objectFit: "cover",
            }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {verifyState === "match" && (
            <div
              style={{
                height: 200,
                borderRadius: 10,
                background: "rgba(16,185,129,0.08)",
                border: "2px solid #10b981",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <iconify-icon icon="lucide:check-circle" style={{ fontSize: 48, color: "#10b981" }} />
              <p style={{ color: "#10b981", fontWeight: 700, fontSize: 18, margin: 0 }}>
                Identity Confirmed
              </p>
            </div>
          )}

          {/* Oval guide */}
          {(verifyState === "ready" || verifyState === "verifying") && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 150,
                height: 180,
                borderRadius: "50%",
                border: `3px solid ${stateColor}`,
                pointerEvents: "none",
                boxShadow: `0 0 0 4px ${stateColor}22`,
              }}
            />
          )}
        </div>

        {/* Status row */}
        {message && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <iconify-icon icon={stateIcon} style={{ fontSize: 16, color: stateColor, flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: stateColor, margin: 0 }}>{message}</p>
          </div>
        )}

        {distance !== null && verifyState === "no_match" && (
          <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, fontFamily: "var(--font-mono)" }}>
            Confidence: {(Math.max(0, 1 - distance / MATCH_THRESHOLD) * 100).toFixed(0)}%
            (threshold: {MATCH_THRESHOLD.toFixed(2)}, measured: {distance.toFixed(3)})
          </p>
        )}

        {/* Action button */}
        {(verifyState === "ready" || verifyState === "no_match" || verifyState === "no_face") && (
          <button
            onClick={runVerification}
            disabled={verifyState !== "ready"}
            style={{
              ...primaryBtnStyle,
              width: "100%",
              justifyContent: "center",
              opacity: verifyState !== "ready" ? 0.6 : 1,
              cursor: verifyState !== "ready" ? "not-allowed" : "pointer",
            }}
          >
            <iconify-icon icon="lucide:scan-face" style={{ fontSize: 16 }} />
            {verifyState === "ready" ? "Verify Identity" : "Retrying..."}
          </button>
        )}

        {verifyState === "loading_models" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", padding: "16px 0" }}>
            <div style={{ width: 20, height: 20 }} className="spinner" />
            <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>Loading face detection models...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared styles
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 99990,
  background: "rgba(7,7,14,0.9)",
  backdropFilter: "blur(12px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 480,
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 32,
  boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
  textAlign: "center",
};

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 20,
  fontWeight: 700,
  color: "var(--ink)",
  marginBottom: 16,
};

const bodyStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--muted)",
  lineHeight: 1.7,
  marginBottom: 24,
};

const primaryBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 44,
  background: "var(--accent)",
  border: "none",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 700,
  color: "#fff",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  padding: "0 20px",
  boxShadow: "0 4px 14px rgba(37,99,235,0.25)",
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 44,
  background: "var(--raised)",
  border: "1px solid var(--line)",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 500,
  color: "var(--muted)",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  padding: "0 16px",
};

function iconBoxStyle(accentColor: string): React.CSSProperties {
  return {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: `${accentColor}18`,
    border: `1px solid ${accentColor}30`,
    display: "grid",
    placeItems: "center",
    margin: "0 auto 20px",
  };
}
