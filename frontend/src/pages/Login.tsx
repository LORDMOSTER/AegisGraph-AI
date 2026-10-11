import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loginAdmin, loginEmployee } from "../api";
import { analytics } from "../utils/analytics";

type LoginTab = "worker" | "admin";

export function Login({
  onNavigate,
  onLoginSuccess,
}: {
  onNavigate: (route: "register" | "app" | "privacy" | "terms") => void;
  onLoginSuccess: (role: "admin" | "employee") => void;
}) {
  // Default to worker for immediate industrial kiosk access
  const [activeTab, setActiveTab] = useState<LoginTab>("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toggle password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Form field states
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [empId, setEmpId] = useState("");
  const [empPin, setEmpPin] = useState("");

  // Validation states
  const [emailTouched, setEmailTouched] = useState(false);
  const [passTouched, setPassTouched] = useState(false);
  const [empIdTouched, setEmpIdTouched] = useState(false);
  const [pinTouched, setPinTouched] = useState(false);

  // Spam / Bot Protection
  const [honeypot, setHoneypot] = useState(""); // Bots fill this, humans don't
  const [mountTime] = useState<number>(() => Date.now());
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    analytics.trackPageView("Terminal Authentication", "/login");
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (cooldownRemaining > 0) {
      cooldownTimerRef.current = setTimeout(() => {
        setCooldownRemaining((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [cooldownRemaining]);

  // Validation rules
  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  const isEmailValid = adminEmail.trim().length > 0 && (isValidEmail(adminEmail) || adminEmail.trim().length >= 3);
  const isPassValid = adminPass.length >= 1;
  const isEmpIdValid = empId.trim().length >= 3;
  const isPinValid = /^\d{6}$/.test(empPin.trim());

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Spam / bot check 1: Honeypot trap
    if (honeypot) {
      console.warn("[Security] Bot honeypot triggered.");
      setError("Automated submission flagged by security gateway.");
      return;
    }

    // Spam / bot check 2: Super-fast headless script check (< 400ms from load)
    if (Date.now() - mountTime < 400) {
      setError("Request rejected by anti-bot challenge.");
      return;
    }

    // Cooldown check
    if (cooldownRemaining > 0) {
      setError(`Brute-force protection: Please wait ${cooldownRemaining}s before retrying.`);
      return;
    }

    // Validation
    setEmailTouched(true);
    setPassTouched(true);
    if (!isEmailValid || !isPassValid) {
      setError("Please enter your admin email and password.");
      return;
    }

    setLoading(true);
    analytics.trackEvent("Auth", "Admin_Login_Attempt", adminEmail);

    try {
      const success = await loginAdmin(adminEmail.trim(), adminPass);
      if (success) {
        analytics.trackEvent("Auth", "Admin_Login_Success");
        setFailedAttempts(0);
        onLoginSuccess("admin");
      } else {
        const nextFails = failedAttempts + 1;
        setFailedAttempts(nextFails);
        if (nextFails >= 3) {
          setCooldownRemaining(30);
          setError("Too many invalid attempts. 30-second security cooldown enabled.");
        } else {
          setError("Invalid admin credentials. Please re-check email or password.");
        }
        analytics.trackEvent("Auth", "Admin_Login_Failed", "Invalid Credentials");
      }
    } catch (err: any) {
      setError("Connection to safety authentication server failed.");
      analytics.trackEvent("Auth", "Admin_Login_Error", err?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Spam / bot check 1: Honeypot
    if (honeypot) {
      setError("Automated submission flagged by security gateway.");
      return;
    }

    // Spam / bot check 2: Rapid script check
    if (Date.now() - mountTime < 400) {
      setError("Request rejected by anti-bot challenge.");
      return;
    }

    if (cooldownRemaining > 0) {
      setError(`Brute-force protection: Please wait ${cooldownRemaining}s before retrying.`);
      return;
    }

    setEmpIdTouched(true);
    setPinTouched(true);
    if (!isEmpIdValid) {
      setError("Worker ID must be at least 3 characters.");
      return;
    }
    if (!isPinValid) {
      setError("PIN must be exactly 6 numeric digits (0-9).");
      return;
    }

    setLoading(true);
    analytics.trackEvent("Auth", "Worker_Login_Attempt", empId);

    try {
      const success = await loginEmployee(empId.trim(), empPin.trim());
      if (success) {
        analytics.trackEvent("Auth", "Worker_Login_Success");
        setFailedAttempts(0);
        onLoginSuccess("employee");
      } else {
        const nextFails = failedAttempts + 1;
        setFailedAttempts(nextFails);
        if (nextFails >= 3) {
          setCooldownRemaining(30);
          setError("Too many invalid attempts. 30-second security cooldown enabled.");
        } else {
          setError("Invalid Worker ID or 6-digit PIN. Please re-enter.");
        }
        analytics.trackEvent("Auth", "Worker_Login_Failed");
      }
    } catch (err: any) {
      setError("Unable to reach authentication server.");
      analytics.trackEvent("Auth", "Worker_Login_Error", err?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("safety-it@tatatechnologies.com");
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      style={{ width: "100%", maxWidth: 440, margin: "0 auto" }}
    >
      {/* ── Heading ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "var(--green-dim)", color: "var(--green)", fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", marginBottom: 12 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px var(--green)" }} />
          DCWGT v2 ENGINE ONLINE
        </div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--ink)",
            marginBottom: 6,
            letterSpacing: "-0.02em",
          }}
        >
          {activeTab === "admin" ? "Compliance Control" : "Operator Terminal"}
        </h2>
        <p style={{ fontSize: 14.5, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
          {activeTab === "admin"
            ? "Sign in with administrator credentials to manage rules, exams, and audit logs."
            : "Enter your verified worker credentials to launch your proctored assessment."}
        </p>
      </div>

      {/* ── Mode Switcher Tabs ── */}
      <div
        style={{
          background: "var(--raised)",
          borderRadius: 999,
          display: "inline-flex",
          padding: 4,
          marginBottom: 24,
          border: "1px solid var(--line)",
          width: "100%",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab("admin");
            setError(null);
            analytics.trackEvent("Auth", "Switch_Tab", "admin");
          }}
          style={{
            flex: 1,
            background: activeTab === "admin" ? "var(--surface)" : "transparent",
            color: activeTab === "admin" ? "var(--ink)" : "var(--muted)",
            boxShadow: activeTab === "admin" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            border: "none",
            borderRadius: 999,
            padding: "9px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <iconify-icon icon="lucide:shield" style={{ fontSize: 16 }} />
          Administrator
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("worker");
            setError(null);
            analytics.trackEvent("Auth", "Switch_Tab", "worker");
          }}
          style={{
            flex: 1,
            background: activeTab === "worker" ? "var(--surface)" : "transparent",
            color: activeTab === "worker" ? "var(--ink)" : "var(--muted)",
            boxShadow: activeTab === "worker" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            border: "none",
            borderRadius: 999,
            padding: "9px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <iconify-icon icon="lucide:user-check" style={{ fontSize: 16 }} />
          Operator Kiosk
        </button>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "var(--red-dim)",
            color: "var(--red)",
            border: "1px solid var(--red)",
            padding: "10px 14px",
            borderRadius: 12,
            fontSize: 13.5,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 500,
          }}
        >
          <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 18, flexShrink: 0 }} />
          <span>{error}</span>
        </motion.div>
      )}

      {/* ── Cooldown Alert ── */}
      {cooldownRemaining > 0 && (
        <div
          style={{
            background: "var(--amber-dim)",
            color: "var(--amber)",
            border: "1px solid var(--amber)",
            padding: "10px 14px",
            borderRadius: 12,
            fontSize: 13,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
          }}
        >
          <iconify-icon icon="lucide:timer" style={{ fontSize: 16 }} />
          Rate Limit: Cooling down ({cooldownRemaining}s remaining)
        </div>
      )}

      {/* ── Forms ── */}
      <AnimatePresence mode="wait">
        {activeTab === "worker" ? (
          <motion.form
            key="worker"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleEmployeeSubmit}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: 18 }}
          >
            {/* Honeypot hidden input */}
            <input
              type="text"
              name="hp_website_title"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ opacity: 0, position: "absolute", top: -9999, left: -9999, height: 0, width: 0, zIndex: -1 }}
            />

            {/* Worker ID Field */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                  Worker ID
                </label>
                <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  Format: EMP-XXXX
                </span>
              </div>
              <div style={{ position: "relative" }}>
                <iconify-icon
                  icon="lucide:badge-check"
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: empIdTouched && !isEmpIdValid ? "var(--red)" : "var(--muted)",
                    fontSize: 18,
                  }}
                />
                <input
                  type="text"
                  placeholder="e.g. EMP-0001"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  onBlur={() => setEmpIdTouched(true)}
                  style={{
                    width: "100%",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    border: `1px solid ${empIdTouched && !isEmpIdValid ? "var(--red)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: "13px 16px 13px 42px",
                    fontSize: 14.5,
                    outline: "none",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    transition: "border-color 0.2s ease",
                  }}
                />
              </div>
              {empIdTouched && !isEmpIdValid && (
                <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>
                  Worker ID must be at least 3 characters.
                </div>
              )}
            </div>

            {/* 6-Digit PIN Field */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                  Security PIN
                </label>
                <span style={{ fontSize: 11, color: empPin.length === 6 ? "var(--green)" : "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  {empPin.length}/6 digits
                </span>
              </div>
              <div style={{ position: "relative" }}>
                <iconify-icon
                  icon="lucide:key-round"
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: pinTouched && !isPinValid ? "var(--red)" : "var(--muted)",
                    fontSize: 18,
                  }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={empPin}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, "");
                    setEmpPin(clean);
                  }}
                  onBlur={() => setPinTouched(true)}
                  style={{
                    width: "100%",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    border: `1px solid ${pinTouched && !isPinValid ? "var(--red)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: "13px 44px",
                    fontSize: 15,
                    letterSpacing: empPin ? "0.22em" : "normal",
                    outline: "none",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    transition: "border-color 0.2s ease",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label={showPassword ? "Hide PIN" : "Show PIN"}
                >
                  <iconify-icon icon={showPassword ? "lucide:eye-off" : "lucide:eye"} style={{ fontSize: 18 }} />
                </button>
              </div>
              {pinTouched && !isPinValid && (
                <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>
                  PIN must be exactly 6 numeric digits.
                </div>
              )}
            </div>

            {/* ── ONE CLEAR CALL TO ACTION (CTA) ── */}
            <button
              type="submit"
              disabled={loading || cooldownRemaining > 0}
              className="btn btn-primary"
              style={{
                width: "100%",
                marginTop: 8,
                padding: "15px 20px",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 14,
                letterSpacing: "-0.01em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                boxShadow: "var(--shadow-btn)",
                opacity: loading || cooldownRemaining > 0 ? 0.7 : 1,
                cursor: loading || cooldownRemaining > 0 ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <iconify-icon icon="lucide:loader" style={{ fontSize: 18, animation: "spin 1s linear infinite" }} />
                  Verifying Operator Credentials...
                </>
              ) : (
                <>
                  <iconify-icon icon="lucide:play-circle" style={{ fontSize: 20 }} />
                  Launch Proctored Assessment Terminal
                </>
              )}
            </button>
          </motion.form>
        ) : (
          <motion.form
            key="admin"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleAdminSubmit}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: 18 }}
          >
            {/* Honeypot hidden input */}
            <input
              type="text"
              name="hp_website_title"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ opacity: 0, position: "absolute", top: -9999, left: -9999, height: 0, width: 0, zIndex: -1 }}
            />

            {/* Admin Email */}
            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                Work Email or Admin ID
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon
                  icon="lucide:mail"
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: emailTouched && !isEmailValid ? "var(--red)" : "var(--muted)",
                    fontSize: 18,
                  }}
                />
                <input
                  type="email"
                  placeholder="admin@internal.tatatechnologies.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  style={{
                    width: "100%",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    border: `1px solid ${emailTouched && !isEmailValid ? "var(--red)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: "13px 16px 13px 42px",
                    fontSize: 14.5,
                    outline: "none",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    transition: "border-color 0.2s ease",
                  }}
                />
              </div>
              {emailTouched && !isEmailValid && (
                <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>
                  Please enter a valid administrator email or ID.
                </div>
              )}
            </div>

            {/* Password */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                  Password
                </label>
                {/* Fixed broken link */}
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 12.5,
                    color: "var(--accent)",
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: 500,
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <iconify-icon
                  icon="lucide:lock"
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: passTouched && !isPassValid ? "var(--red)" : "var(--muted)",
                    fontSize: 18,
                  }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  onBlur={() => setPassTouched(true)}
                  style={{
                    width: "100%",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    border: `1px solid ${passTouched && !isPassValid ? "var(--red)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: "13px 44px",
                    fontSize: 14.5,
                    outline: "none",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    transition: "border-color 0.2s ease",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <iconify-icon icon={showPassword ? "lucide:eye-off" : "lucide:eye"} style={{ fontSize: 18 }} />
                </button>
              </div>
              {passTouched && adminPass.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>
                  Password is required.
                </div>
              )}
            </div>

            {/* ── ONE CLEAR CALL TO ACTION (CTA) ── */}
            <button
              type="submit"
              disabled={loading || cooldownRemaining > 0}
              className="btn btn-primary"
              style={{
                width: "100%",
                marginTop: 8,
                padding: "15px 20px",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 14,
                letterSpacing: "-0.01em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                boxShadow: "var(--shadow-btn)",
                opacity: loading || cooldownRemaining > 0 ? 0.7 : 1,
                cursor: loading || cooldownRemaining > 0 ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <iconify-icon icon="lucide:loader" style={{ fontSize: 18, animation: "spin 1s linear infinite" }} />
                  Signing In...
                </>
              ) : (
                <>
                  <iconify-icon icon="lucide:shield-check" style={{ fontSize: 18 }} />
                  Access Compliance Mission Control
                </>
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* ── Bottom Links & Registration ── */}
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 16px" }}>
          New organization?{" "}
          <a
            href="#register"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("register");
            }}
            style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
          >
            Register Company Workspace
          </a>
        </p>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, fontSize: 12.5 }}>
          <a
            href="#privacy"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("privacy");
            }}
            style={{ color: "var(--muted)", textDecoration: "none" }}
          >
            Privacy Policy
          </a>
          <span style={{ color: "var(--line)" }}>•</span>
          <a
            href="#terms"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("terms");
            }}
            style={{ color: "var(--muted)", textDecoration: "none" }}
          >
            Terms of Service
          </a>
        </div>
      </div>

      {/* ── Password Reset Modal ── */}
      <AnimatePresence>
        {showForgotModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(6px)",
              display: "grid",
              placeItems: "center",
              zIndex: 9999,
              padding: 20,
            }}
            onClick={() => setShowForgotModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 460,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 20,
                padding: "28px 28px",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-dim)", display: "grid", placeItems: "center", color: "var(--accent)" }}>
                    <iconify-icon icon="lucide:shield-alert" style={{ fontSize: 20 }} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>
                    Enterprise Credential Reset
                  </h3>
                </div>
                <button
                  onClick={() => setShowForgotModal(false)}
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}
                >
                  <iconify-icon icon="lucide:x" style={{ fontSize: 20 }} />
                </button>
              </div>

              <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 18px" }}>
                For high-risk industrial safety compliance, automated self-service password resets are disabled. Station Supervisors and Company Admins can request a secure reset voucher through the Compliance Desk.
              </p>

              <div
                style={{
                  background: "var(--raised)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Support Contact</div>
                  <div style={{ fontSize: 13.5, color: "var(--ink)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>safety-it@tatatechnologies.com</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="btn btn-secondary"
                  style={{ padding: "6px 12px", fontSize: 12, borderRadius: 8 }}
                >
                  {copiedEmail ? "Copied!" : "Copy Email"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="btn btn-primary"
                style={{ width: "100%", padding: "12px", borderRadius: 10, fontSize: 14 }}
              >
                Understood
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
