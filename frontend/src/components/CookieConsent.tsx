import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CookieConsentProps {
  onNavigatePolicy?: (route: "privacy" | "terms") => void;
}

export interface CookiePreferences {
  essential: boolean;
  functional: boolean;
  analytics: boolean;
  timestamp: string;
}

export function CookieConsent({ onNavigatePolicy }: CookieConsentProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);

  const [functionalConsent, setFunctionalConsent] = useState(true);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("aegis_cookie_consent");
    if (!saved) {
      // Small timeout to allow initial page animation to complete smoothly
      const timer = setTimeout(() => setIsVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for custom trigger to reopen cookie settings from the footer
  useEffect(() => {
    const handleReopen = () => {
      const saved = localStorage.getItem("aegis_cookie_consent");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFunctionalConsent(!!parsed.functional);
          setAnalyticsConsent(!!parsed.analytics);
        } catch {}
      }
      setIsCustomizing(true);
      setIsVisible(true);
    };

    window.addEventListener("aegis:reopen-cookie-settings", handleReopen);
    return () => window.removeEventListener("aegis:reopen-cookie-settings", handleReopen);
  }, []);

  const saveConsent = (functional: boolean, analytics: boolean) => {
    const prefs: CookiePreferences = {
      essential: true, // Always required
      functional,
      analytics,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("aegis_cookie_consent", JSON.stringify(prefs));
    setIsVisible(false);
    setIsCustomizing(false);
  };

  const handleAcceptAll = () => saveConsent(true, true);
  const handleEssentialOnly = () => saveConsent(false, false);
  const handleSaveCustom = () => saveConsent(functionalConsent, analyticsConsent);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            right: 24,
            maxWidth: isCustomizing ? 560 : 720,
            margin: "0 auto",
            zIndex: 99999,
            background: "var(--surface)",
            color: "var(--ink)",
            borderRadius: 16,
            border: "1px solid var(--line)",
            boxShadow: "0 12px 36px rgba(0,0,0,0.16)",
            backdropFilter: "blur(12px)",
            padding: 24,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--raised)",
                display: "grid",
                placeItems: "center",
                color: "var(--accent)",
                flexShrink: 0,
              }}
            >
              <iconify-icon icon="lucide:cookie" style={{ fontSize: 20 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    fontWeight: 600,
                    margin: 0,
                    color: "var(--ink)",
                  }}
                >
                  Cookie &amp; Local Storage Consent
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--green)",
                    background: "var(--green-dim)",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontWeight: 500,
                  }}
                >
                  100% Offline Architecture
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--muted)",
                  margin: "6px 0 0",
                }}
              >
                AegisGraph AI uses essential client storage and cookies for session authentication,
                exam proctoring lockouts, and theme memory. We do not use third-party marketing trackers.
                Review our{" "}
                <button
                  type="button"
                  onClick={() => onNavigatePolicy?.("privacy")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--accent)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "inherit",
                    fontWeight: 500,
                  }}
                >
                  Privacy Policy
                </button>{" "}
                and{" "}
                <button
                  type="button"
                  onClick={() => onNavigatePolicy?.("terms")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--accent)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "inherit",
                    fontWeight: 500,
                  }}
                >
                  Terms
                </button>
                .
              </p>
            </div>
          </div>

          {/* Granular Preference Tray */}
          {isCustomizing && (
            <div
              style={{
                marginTop: 16,
                marginBottom: 16,
                padding: 14,
                background: "var(--base)",
                borderRadius: 12,
                border: "1px solid var(--line)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Essential Item */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Strictly Necessary</span>
                    <span style={{ fontSize: 10, background: "var(--raised)", color: "var(--muted)", padding: "1px 6px", borderRadius: 4 }}>Required</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0" }}>
                    JWT authentication, CSRF tokens, biometric proctoring lockdown state.
                  </p>
                </div>
                <input type="checkbox" checked disabled style={{ cursor: "not-allowed", accentColor: "var(--accent)" }} />
              </div>

              {/* Functional Item */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Preferences &amp; Display</span>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0" }}>
                    Dark/light theme selection and customized UI density settings.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={functionalConsent}
                  onChange={(e) => setFunctionalConsent(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                />
              </div>

              {/* Analytics Item */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Local Pipeline Latency</span>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0" }}>
                    Anonymous local tracking of offline GraphRAG inference and query speeds.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={analyticsConsent}
                  onChange={(e) => setAnalyticsConsent(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid var(--line)",
            }}
          >
            {!isCustomizing ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsCustomizing(true)}
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8 }}
                >
                  Preferences
                </button>
                <button
                  type="button"
                  onClick={handleEssentialOnly}
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: "8px 16px", borderRadius: 8 }}
                >
                  Essential Only
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: "8px 18px", borderRadius: 8 }}
                >
                  Accept All
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsCustomizing(false)}
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustom}
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: "8px 18px", borderRadius: 8 }}
                >
                  Save Preferences
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent("aegis:reopen-cookie-settings"));
}
