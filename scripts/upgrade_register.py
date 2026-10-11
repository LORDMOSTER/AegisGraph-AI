import os

reg_code = '''import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { registerCompany } from "../api";
import { analytics } from "../utils/analytics";

export function RegisterCompany({ onNavigate }: { onNavigate: (route: "login" | "app" | "privacy" | "terms") => void }) {
  const [step, setStep] = useState<"admin" | "company" | "success">("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  // Bot & Spam Protection
  const [honeypot, setHoneypot] = useState("");
  const [mountTime] = useState<number>(() => Date.now());

  const [formData, setFormData] = useState({
    companyName: "",
    industryType: "Manufacturing",
    address: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    confirmPassword: "",
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    analytics.trackPageView("Organization Registration", "/register");
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Anti-bot check
    if (honeypot) {
      setError("Automated registration blocked.");
      return;
    }
    if (Date.now() - mountTime < 500) {
      setError("Registration request rejected by anti-bot challenge.");
      return;
    }

    if (!formData.adminName.trim()) {
      setError("Please provide administrator full name.");
      return;
    }
    if (!isValidEmail(formData.adminEmail)) {
      setError("Please provide a valid corporate work email address.");
      return;
    }
    if (formData.adminPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (formData.adminPassword !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    analytics.trackEvent("Registration", "Step_1_Completed", formData.adminEmail);
    setStep("company");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (honeypot) {
      setError("Automated registration blocked.");
      return;
    }

    if (!formData.companyName.trim() || formData.companyName.trim().length < 2) {
      setError("Company name must be at least 2 characters.");
      return;
    }

    setLoading(true);
    analytics.trackEvent("Registration", "Submission_Attempt", formData.companyName);

    try {
      const { companyCode } = await registerCompany({
        companyName: formData.companyName.trim(),
        industryType: formData.industryType,
        address: formData.address.trim(),
        adminName: formData.adminName.trim(),
        adminEmail: formData.adminEmail.trim(),
        adminPassword: formData.adminPassword,
      });
      setGeneratedCode(companyCode);
      analytics.trackEvent("Registration", "Registration_Success", companyCode);
      setStep("success");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Failed to register organization.";
      setError(msg);
      analytics.trackEvent("Registration", "Registration_Failure", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {step === "admin" && (
        <motion.div
          key="admin"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          style={{ width: "100%", maxWidth: 440, margin: "0 auto" }}
        >
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "var(--accent-dim)", color: "var(--accent)", fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font-mono)", marginBottom: 12 }}>
              STEP 1 OF 2 — ADMINISTRATOR SETUP
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginBottom: 6, letterSpacing: "-0.02em" }}>
              Administrator Profile
            </h2>
            <p style={{ fontSize: 14.5, color: "var(--muted)", margin: 0 }}>
              Create your organization super-admin credentials.
            </p>
          </div>

          {error && (
            <div style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red)", padding: "10px 14px", borderRadius: 12, fontSize: 13.5, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
              <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 18 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleNext} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Honeypot */}
            <input
              type="text"
              name="hp_organization_title"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ opacity: 0, position: "absolute", top: -9999, left: -9999, height: 0, width: 0, zIndex: -1 }}
            />

            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                Admin Full Name
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon icon="lucide:user" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                <input
                  type="text"
                  name="adminName"
                  placeholder="Jane Doe"
                  value={formData.adminName}
                  onChange={handleChange}
                  onBlur={() => handleBlur("adminName")}
                  style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 14.5, color: "var(--ink)", outline: "none" }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                Corporate Work Email
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon icon="lucide:mail" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                <input
                  type="email"
                  name="adminEmail"
                  placeholder="jane@company.com"
                  value={formData.adminEmail}
                  onChange={handleChange}
                  onBlur={() => handleBlur("adminEmail")}
                  style={{
                    width: "100%",
                    background: "var(--surface)",
                    border: `1px solid ${touched.adminEmail && !isValidEmail(formData.adminEmail) ? "var(--red)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: "12px 16px 12px 42px",
                    fontSize: 14.5,
                    color: "var(--ink)",
                    outline: "none",
                  }}
                />
              </div>
              {touched.adminEmail && !isValidEmail(formData.adminEmail) && (
                <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>
                  Please enter a valid corporate email format.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <iconify-icon icon="lucide:lock" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                  <input
                    type="password"
                    name="adminPassword"
                    placeholder="Min 8 chars"
                    value={formData.adminPassword}
                    onChange={handleChange}
                    onBlur={() => handleBlur("adminPassword")}
                    style={{
                      width: "100%",
                      background: "var(--surface)",
                      border: `1px solid ${touched.adminPassword && formData.adminPassword.length < 8 ? "var(--red)" : "var(--line)"}`,
                      borderRadius: 12,
                      padding: "12px 16px 12px 42px",
                      fontSize: 14.5,
                      color: "var(--ink)",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                  Confirm
                </label>
                <div style={{ position: "relative" }}>
                  <iconify-icon icon="lucide:lock" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Repeat password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    onBlur={() => handleBlur("confirmPassword")}
                    style={{
                      width: "100%",
                      background: "var(--surface)",
                      border: `1px solid ${touched.confirmPassword && formData.adminPassword !== formData.confirmPassword ? "var(--red)" : "var(--line)"}`,
                      borderRadius: 12,
                      padding: "12px 16px 12px 42px",
                      fontSize: 14.5,
                      color: "var(--ink)",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: "100%",
                marginTop: 8,
                padding: "14px 20px",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "var(--shadow-btn)",
              }}
            >
              Continue to Workspace Details
              <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 18 }} />
            </button>
          </form>

          {/* Bottom sign-in link with fixed href */}
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 16px" }}>
              Already registered?{" "}
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("login");
                }}
                style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
              >
                Sign in
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
        </motion.div>
      )}

      {step === "company" && (
        <motion.div
          key="company"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          style={{ width: "100%", maxWidth: 440, margin: "0 auto" }}
        >
          <div style={{ marginBottom: 28, position: "relative" }}>
            <button
              onClick={() => setStep("admin")}
              className="btn btn-ghost"
              style={{ position: "absolute", left: -16, top: -4, color: "var(--muted)", padding: 6 }}
            >
              <iconify-icon icon="lucide:arrow-left" style={{ fontSize: 20 }} />
            </button>
            <div style={{ paddingLeft: 24 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "var(--accent-dim)", color: "var(--accent)", fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font-mono)", marginBottom: 12 }}>
                STEP 2 OF 2 — FACILITY IDENTITY
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginBottom: 6, letterSpacing: "-0.02em" }}>
                Company Details
              </h2>
              <p style={{ fontSize: 14.5, color: "var(--muted)", margin: 0 }}>
                Define your industrial facility profile.
              </p>
            </div>
          </div>

          {error && (
            <div style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red)", padding: "10px 14px", borderRadius: 12, fontSize: 13.5, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
              <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 18 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                Organization / Plant Name
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon icon="lucide:building-2" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                <input
                  type="text"
                  name="companyName"
                  placeholder="Tata Motors Auto Plant #4"
                  value={formData.companyName}
                  onChange={handleChange}
                  style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 14.5, color: "var(--ink)", outline: "none" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                  Industry Sector
                </label>
                <div style={{ position: "relative" }}>
                  <iconify-icon icon="lucide:factory" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                  <select
                    name="industryType"
                    value={formData.industryType}
                    onChange={handleChange}
                    style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 14.5, color: "var(--ink)", outline: "none", appearance: "none" }}
                  >
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Mining">Mining & Extraction</option>
                    <option value="Automotive">Automotive Assembly</option>
                    <option value="Construction">Heavy Construction</option>
                    <option value="Aerospace">Aerospace & Defense</option>
                    <option value="Chemicals">Chemical Processing</option>
                    <option value="Other">Other Industrial</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                Facility Location / Address
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon icon="lucide:map-pin" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                <input
                  type="text"
                  name="address"
                  placeholder="Industrial Corridor, Pune, MH"
                  value={formData.address}
                  onChange={handleChange}
                  style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 14.5, color: "var(--ink)", outline: "none" }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: "100%",
                marginTop: 8,
                padding: "14px 20px",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "var(--shadow-btn)",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <>
                  <iconify-icon icon="lucide:loader" style={{ fontSize: 18, animation: "spin 1s linear infinite" }} />
                  Provisioning Security Partition...
                </>
              ) : (
                <>
                  <iconify-icon icon="lucide:check-circle" style={{ fontSize: 18 }} />
                  Complete Registration & Deploy Partition
                </>
              )}
            </button>
          </form>
        </motion.div>
      )}

      {step === "success" && (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ width: "100%", maxWidth: 440, margin: "0 auto", textAlign: "center" }}
        >
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--green-dim)", border: "2px solid var(--green)", display: "grid", placeItems: "center", margin: "0 auto 20px", color: "var(--green)" }}>
            <iconify-icon icon="lucide:shield-check" style={{ fontSize: 32 }} />
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
            Workspace Provisioned
          </h2>
          <p style={{ fontSize: 14.5, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>
            Your organization safety partition has been created. Save your unique Company ID code below.
          </p>

          <div style={{ background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 24px", marginBottom: 28 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>
              Company Identifier Code
            </div>
            <div style={{ fontSize: 24, fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--ink)", letterSpacing: "0.06em" }}>
              {generatedCode}
            </div>
          </div>

          <button
            onClick={() => onNavigate("login")}
            className="btn btn-primary"
            style={{ width: "100%", padding: "14px", borderRadius: 12, fontSize: 15, fontWeight: 700 }}
          >
            Proceed to Terminal Sign In
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
'''

with open(r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\RegisterCompany.tsx", "w", encoding="utf-8", newline="\n") as f:
    f.write(reg_code)

print("RegisterCompany.tsx updated with form validation, anti-bot security, and link fixes")
