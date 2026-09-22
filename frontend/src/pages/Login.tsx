import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loginAdmin, loginEmployee } from "../api";

type LoginTab = "admin" | "worker";

export function Login({
  onNavigate,
  onLoginSuccess,
}: {
  onNavigate: (route: "register" | "app") => void;
  onLoginSuccess: (role: "admin" | "employee") => void;
}) {
  const [activeTab, setActiveTab] = useState<LoginTab>("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Toggle password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Admin state
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");

  // Worker state
  const [empId, setEmpId] = useState("");
  const [empPin, setEmpPin] = useState("");

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const success = await loginAdmin(adminEmail, adminPass);
      if (success) {
        onLoginSuccess("admin");
      } else {
        setError("Invalid admin credentials.");
      }
    } catch (err) {
      setError("Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const success = await loginEmployee(empId, empPin);
      if (success) {
        onLoginSuccess("employee");
      } else {
        setError("Invalid employee ID or PIN.");
      }
    } catch (err) {
      setError("Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      style={{ width: "100%" }}
    >
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em" }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 15, color: "var(--muted)" }}>
              Enter your credentials to continue.
            </p>
          </div>

          {/* Custom Pill Toggle */}
          <div style={{ background: "var(--raised)", borderRadius: 999, display: "inline-flex", padding: 4, marginBottom: 32 }}>
            <button
              type="button"
              onClick={() => { setActiveTab("admin"); setError(null); }}
              style={{
                background: activeTab === "admin" ? "var(--surface)" : "transparent",
                color: activeTab === "admin" ? "var(--ink)" : "var(--muted)",
                boxShadow: activeTab === "admin" ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                border: "none",
                borderRadius: 999,
                padding: "8px 24px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("worker"); setError(null); }}
              style={{
                background: activeTab === "worker" ? "var(--surface)" : "transparent",
                color: activeTab === "worker" ? "var(--ink)" : "var(--muted)",
                boxShadow: activeTab === "worker" ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                border: "none",
                borderRadius: 999,
                padding: "8px 24px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Worker
            </button>
          </div>

          {error && (
            <div style={{ background: "var(--red-dim)", color: "var(--red)", padding: 12, borderRadius: 12, fontSize: 14, marginBottom: 24 }}>
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === "admin" ? (
              <motion.form
                key="admin"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleAdminSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 20 }}
              >
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--accent)", marginBottom: 8 }}>
                    Work email
                  </label>
                  <div style={{ position: "relative" }}>
                    <iconify-icon icon="lucide:mail" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                    <input
                      required
                      type="text"
                      placeholder="Admin ID or Email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      style={{ width: "100%", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px 14px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                      onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                      onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                    />
                  </div>
                </div>
                
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
                      Password
                    </label>
                    <a href="#" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>Forgot password?</a>
                  </div>
                  <div style={{ position: "relative" }}>
                    <iconify-icon icon="lucide:lock" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••"
                      value={adminPass}
                      onChange={(e) => setAdminPass(e.target.value)}
                      style={{ width: "100%", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                      onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                      onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <iconify-icon icon={showPassword ? "lucide:eye-off" : "lucide:eye"} style={{ fontSize: 18 }} />
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 16, padding: 16, fontSize: 15, borderRadius: 12 }} disabled={loading}>
                  {loading ? (
                    "Signing in..."
                  ) : (
                    <>
                      <iconify-icon icon="lucide:arrow-right-to-line" style={{ fontSize: 18 }} />
                      Sign in
                    </>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="worker"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleEmployeeSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 20 }}
              >
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--accent)", marginBottom: 8 }}>
                    Worker ID
                  </label>
                  <div style={{ position: "relative" }}>
                    <iconify-icon icon="lucide:badge-check" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                    <input
                      required
                      type="text"
                      placeholder="EMP-0001"
                      value={empId}
                      onChange={(e) => setEmpId(e.target.value)}
                      style={{ width: "100%", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px 14px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                      onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                      onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                    />
                  </div>
                </div>
                
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
                    6-Digit PIN
                  </label>
                  <div style={{ position: "relative" }}>
                    <iconify-icon icon="lucide:key-round" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="••••••"
                      value={empPin}
                      onChange={(e) => setEmpPin(e.target.value)}
                      style={{ width: "100%", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s", letterSpacing: empPin ? "0.2em" : "normal" }}
                      onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                      onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <iconify-icon icon={showPassword ? "lucide:eye-off" : "lucide:eye"} style={{ fontSize: 18 }} />
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 16, padding: 16, fontSize: 15, borderRadius: 12 }} disabled={loading}>
                  {loading ? (
                    "Authenticating..."
                  ) : (
                    <>
                      <iconify-icon icon="lucide:arrow-right-to-line" style={{ fontSize: 18 }} />
                      Access Kiosk
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <div style={{ textAlign: "center", marginTop: 40 }}>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>
              New to AegisGraph?{" "}
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); onNavigate("register"); }}
                style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
              >
                Create an account
              </a>
            </p>
          </div>
        </motion.div>
  );
}
