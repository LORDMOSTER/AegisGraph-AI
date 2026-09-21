import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { registerCompany } from "../api";

export function RegisterCompany({ onNavigate }: { onNavigate: (route: "login" | "app") => void }) {
  const [step, setStep] = useState<"admin" | "company" | "success">("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyName: "",
    industryType: "Manufacturing",
    address: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.adminPassword !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setStep("company");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { companyCode } = await registerCompany({
        companyName: formData.companyName,
        industryType: formData.industryType,
        address: formData.address,
        adminName: formData.adminName,
        adminEmail: formData.adminEmail,
        adminPassword: formData.adminPassword,
      });
      setGeneratedCode(companyCode);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register company.");
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
          className="card"
          style={{ width: "100%", maxWidth: 520, padding: 48 }}
        >
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em" }}>
              Admin Profile
            </h2>
            <p style={{ fontSize: 15, color: "var(--muted)" }}>
              Create your admin credentials (Step 1 of 2)
            </p>
          </div>

          {error && (
            <div style={{ background: "var(--red-dim)", color: "var(--red)", padding: 12, borderRadius: 12, fontSize: 14, marginBottom: 24 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleNext} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
                Admin Full Name
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon icon="lucide:user" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                <input required type="text" name="adminName" placeholder="Jane Doe" value={formData.adminName} onChange={handleChange} 
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                  onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
                Admin Email
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon icon="lucide:mail" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                <input required type="email" name="adminEmail" placeholder="jane@acme.com" value={formData.adminEmail} onChange={handleChange} 
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                  onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <iconify-icon icon="lucide:lock" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                  <input required type="password" name="adminPassword" placeholder="••••••••" value={formData.adminPassword} onChange={handleChange} 
                    style={{ width: "100%", background: "transparent", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                    onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                    onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                  />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
                  Confirm
                </label>
                <div style={{ position: "relative" }}>
                  <iconify-icon icon="lucide:lock" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                  <input required type="password" name="confirmPassword" placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange} 
                    style={{ width: "100%", background: "transparent", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                    onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                    onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                  />
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8, padding: 14, fontSize: 15, borderRadius: 12 }}>
              Continue
              <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 18, marginLeft: 8 }} />
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>
              Already registered?{" "}
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); onNavigate("login"); }}
                style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
              >
                Sign in
              </a>
            </p>
          </div>
        </motion.div>
      )}

      {step === "company" && (
        <motion.div
          key="company"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="card"
          style={{ width: "100%", maxWidth: 520, padding: 48 }}
        >
          <div style={{ marginBottom: 32, position: "relative" }}>
            <button 
              onClick={() => setStep("admin")}
              className="btn btn-ghost touch-target" 
              style={{ position: "absolute", left: -16, top: -4, color: "var(--muted)" }}
            >
              <iconify-icon icon="lucide:arrow-left" style={{ fontSize: 20 }} />
            </button>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em", paddingLeft: 24 }}>
              Company Details
            </h2>
            <p style={{ fontSize: 15, color: "var(--muted)", paddingLeft: 24 }}>
              Set up your workspace (Step 2 of 2)
            </p>
          </div>

          {error && (
            <div style={{ background: "var(--red-dim)", color: "var(--red)", padding: 12, borderRadius: 12, fontSize: 14, marginBottom: 24 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
                Company Name
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon icon="lucide:building-2" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                <input required type="text" name="companyName" placeholder="Acme Corp" value={formData.companyName} onChange={handleChange} 
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                  onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
                  Industry Type
                </label>
                <div style={{ position: "relative" }}>
                  <iconify-icon icon="lucide:factory" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                  <select name="industryType" value={formData.industryType} onChange={handleChange}
                    style={{ width: "100%", background: "transparent", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s", appearance: "none" }}
                    onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                    onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                  >
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Mining">Mining</option>
                    <option value="Automotive">Automotive</option>
                    <option value="Construction">Construction</option>
                    <option value="Aerospace">Aerospace</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
                Company Address
              </label>
              <div style={{ position: "relative" }}>
                <iconify-icon icon="lucide:map-pin" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 18 }} />
                <input required type="text" name="address" placeholder="123 Industrial Blvd" value={formData.address} onChange={handleChange} 
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px 12px 42px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                  onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8, padding: 14, fontSize: 15, borderRadius: 12 }} disabled={loading}>
              {loading ? (
                "Registering..."
              ) : (
                <>
                  <iconify-icon icon="lucide:building-2" style={{ fontSize: 18 }} />
                  Register Workspace
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
          className="card"
          style={{ width: "100%", maxWidth: 440, padding: 48, textAlign: "center" }}
        >
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--green-dim)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 32 }}>
            <iconify-icon icon="lucide:check-circle-2" />
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em" }}>
            Registration Complete
          </h2>
          <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 32 }}>
            Save this code — your team will need it.
          </p>

          <div style={{ background: "rgba(12, 12, 17, 0.05)", border: "1px dashed var(--line)", padding: 24, borderRadius: 12, marginBottom: 32 }}>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
              Company Code
            </span>
            <code style={{ fontSize: 36, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}>
              {generatedCode}
            </code>
          </div>

          <button className="btn btn-primary" style={{ width: "100%", padding: 14, fontSize: 15, borderRadius: 12 }} onClick={() => onNavigate("login")}>
            Continue to Login
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
