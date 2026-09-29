/**
 * ExamUnlockScreen.tsx
 *
 * Dual-factor unlock gate shown before any exam question is visible (Req #2).
 * Collects employee PIN + supervisor Exam Key, submits to backend unlock endpoint.
 * Generic error is shown to user; specific failure is logged server-side.
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { unlockExam } from "../api";

interface Props {
  examId: string;
  employeeCode: string;
  onUnlocked: () => void;
}

export function ExamUnlockScreen({ examId, employeeCode, onUnlocked }: Props) {
  const [pin, setPin] = useState("");
  const [examKey, setExamKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pinRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || !examKey) return;
    setLoading(true);
    setError(null);

    const ok = await unlockExam(examId, employeeCode, pin, examKey);
    setLoading(false);

    if (ok) {
      onUnlocked();
    } else {
      setError("Credentials incorrect. Please ask your supervisor to verify the Exam Key.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
  };

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
        flexDirection: "column",
        gap: 0,
        padding: 24,
      }}
    >
      {/* Dim grid background pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(37,99,235,0.07) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          pointerEvents: "none",
        }}
      />

      <motion.div
        animate={shake ? { x: [-8, 8, -6, 6, -4, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: 36,
          boxShadow: "0 24px 72px rgba(28,28,26,0.14)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Lock icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "rgba(37,99,235,0.08)",
            border: "1px solid rgba(37,99,235,0.18)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 24px",
          }}
        >
          <iconify-icon icon="lucide:shield-check" style={{ fontSize: 26, color: "var(--accent)" }} />
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--ink)",
            textAlign: "center",
            marginBottom: 6,
            letterSpacing: "-0.01em",
          }}
        >
          Exam Lockdown Verification
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            textAlign: "center",
            marginBottom: 28,
            lineHeight: 1.6,
          }}
        >
          Enter your PIN and the Exam Key provided by your supervisor to begin.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* PIN field */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Your PIN
            </label>
            <input
              ref={pinRef}
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter your PIN"
              maxLength={12}
              autoComplete="off"
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--raised)",
                border: "1.5px solid var(--line)",
                borderRadius: 10,
                color: "var(--ink)",
                fontSize: 15,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.1em",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
            />
          </div>

          {/* Exam Key field */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Exam Key <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}>(from supervisor)</span>
            </label>
            <input
              type="text"
              value={examKey}
              onChange={(e) => setExamKey(e.target.value.toUpperCase())}
              placeholder="e.g. AX7K2B"
              maxLength={8}
              autoComplete="off"
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--raised)",
                border: "1.5px solid var(--line)",
                borderRadius: 10,
                color: "var(--ink)",
                fontSize: 18,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
            />
          </div>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  padding: "12px 14px",
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.22)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 16, flexShrink: 0 }} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={!pin || !examKey || loading}
            style={{
              marginTop: 4,
              width: "100%",
              height: 48,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "var(--font-sans)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: (!pin || !examKey || loading) ? 0.5 : 1,
              transition: "opacity 0.15s",
              boxShadow: "0 4px 14px rgba(37,99,235,0.25)",
            }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16, borderTopColor: "#fff" }} />
                Verifying...
              </>
            ) : (
              <>
                <iconify-icon icon="lucide:unlock" style={{ fontSize: 17 }} />
                Unlock and Begin Exam
              </>
            )}
          </button>
        </form>

        {/* Info note */}
        <p
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textAlign: "center",
            marginTop: 20,
            lineHeight: 1.6,
          }}
        >
          This exam requires a supervisor to be physically present to provide the Exam Key.
          Answers cannot be submitted without completing this step.
        </p>
      </motion.div>
    </div>
  );
}
