/**
 * WebcamCapture.tsx
 * Live webcam photo capture for employee enrollment.
 * Computes face-api.js embedding from the captured frame.
 * Raw image is never stored — only the 128-d embedding is saved.
 */
import React, { useRef, useState, useCallback, useEffect } from "react";

declare global {
  interface Window {
    faceapi: any;
  }
}

interface WebcamCaptureProps {
  onEmbeddingCaptured: (embedding: number[]) => void;
  onCancel: () => void;
  employeeName: string;
}

type CaptureState = "loading" | "ready" | "capturing" | "processing" | "success" | "no_face" | "error";

export function WebcamCapture({ onEmbeddingCaptured, onCancel, employeeName }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CaptureState>("loading");
  const [message, setMessage] = useState("Initializing camera...");
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);

  // Load face-api.js models
  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      try {
        // Check if face-api.js is loaded
        if (!window.faceapi) {
          setMessage("face-api.js not available. Please add the library to the project.");
          setState("error");
          return;
        }

        const MODEL_URL = "/models";
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ]);

        if (!mounted) return;
        setFaceApiLoaded(true);

        // Start camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            if (mounted) {
              setState("ready");
              setMessage("Position your face in the center and click Capture.");
            }
          };
        }
      } catch (err: any) {
        if (!mounted) return;
        if (err.name === "NotAllowedError") {
          setMessage("Camera access denied. Please allow camera access and try again.");
        } else {
          setMessage(`Failed to initialize: ${err.message}`);
        }
        setState("error");
      }
    }

    loadModels();
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !window.faceapi || !faceApiLoaded) return;
    setState("capturing");
    setMessage("Detecting face...");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);

      setState("processing");
      setMessage("Computing face embedding...");

      // Detect face and compute embedding
      const detection = await window.faceapi
        .detectSingleFace(canvas, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        setState("no_face");
        setMessage("No face detected. Please ensure you are centered in the frame and well lit.");
        setTimeout(() => {
          setState("ready");
          setMessage("Position your face in the center and click Capture.");
        }, 3000);
        return;
      }

      // embedding is a Float32Array — convert to regular number[]
      const embedding = Array.from(detection.descriptor as Float32Array);
      setState("success");
      setMessage("Face captured successfully!");

      // Stop camera
      streamRef.current?.getTracks().forEach((t) => t.stop());

      setTimeout(() => onEmbeddingCaptured(embedding), 800);
    } catch (err: any) {
      setState("error");
      setMessage(`Error during capture: ${err.message}`);
    }
  }, [faceApiLoaded, onEmbeddingCaptured]);

  const statusColor = {
    loading: "var(--muted)",
    ready: "var(--accent)",
    capturing: "#f59e0b",
    processing: "#f59e0b",
    success: "#10b981",
    no_face: "#ef4444",
    error: "#ef4444",
  }[state];

  const statusIcon = {
    loading: "lucide:loader-2",
    ready: "lucide:camera",
    capturing: "lucide:scan-face",
    processing: "lucide:cpu",
    success: "lucide:check-circle",
    no_face: "lucide:alert-triangle",
    error: "lucide:x-circle",
  }[state];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        background: "rgba(7,7,14,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(37,99,235,0.1)",
              border: "1px solid rgba(37,99,235,0.2)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <iconify-icon icon="lucide:scan-face" style={{ fontSize: 20, color: "var(--accent)" }} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
              Enrollment Photo
            </h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
              Capturing reference for {employeeName}
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
              fontSize: 20,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Privacy notice */}
        <div
          style={{
            margin: "16px 24px 0",
            padding: "10px 14px",
            background: "rgba(37,99,235,0.04)",
            border: "1px solid rgba(37,99,235,0.15)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--muted)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--ink)" }}>Privacy:</strong> Only the mathematical face
          embedding (128 numbers) is stored — never the raw photo. This is used solely for identity
          verification at exam start.
        </div>

        {/* Video feed */}
        <div style={{ position: "relative", margin: 24 }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              borderRadius: 10,
              background: "#000",
              display: state === "success" ? "none" : "block",
              border: state === "no_face" || state === "error" ? "2px solid #ef4444" : "2px solid var(--line)",
            }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {state === "success" && (
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
              <p style={{ color: "#10b981", fontWeight: 600, fontSize: 16, margin: 0 }}>
                Embedding captured!
              </p>
            </div>
          )}

          {/* Overlay guide ring */}
          {(state === "ready" || state === "capturing") && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 160,
                height: 190,
                borderRadius: "50%",
                border: `3px solid ${statusColor}`,
                pointerEvents: "none",
                opacity: 0.7,
                boxShadow: `0 0 0 4px ${statusColor}22`,
              }}
            />
          )}
        </div>

        {/* Status */}
        <div style={{ padding: "0 24px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <iconify-icon icon={statusIcon} style={{ fontSize: 16, color: statusColor, flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: statusColor, margin: 0 }}>{message}</p>
        </div>

        {/* Actions */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              height: 42,
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
            Skip for Now
          </button>
          <button
            onClick={handleCapture}
            disabled={state !== "ready"}
            style={{
              flex: 2,
              height: 42,
              background: state === "ready" ? "var(--accent)" : "var(--raised)",
              border: "none",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 700,
              color: state === "ready" ? "#fff" : "var(--muted)",
              cursor: state === "ready" ? "pointer" : "not-allowed",
              fontFamily: "var(--font-sans)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s",
            }}
          >
            <iconify-icon icon="lucide:camera" style={{ fontSize: 16 }} />
            Capture Enrollment Photo
          </button>
        </div>
      </div>
    </div>
  );
}
