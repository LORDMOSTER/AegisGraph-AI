import React from "react";
import { motion } from "framer-motion";
import { LogoMark } from "../components/BrandAssets";
import { ThemeToggle } from "../components/ThemeToggle";

interface NotFoundProps {
  onNavigate: (route: any) => void;
  darkMode?: boolean;
  onToggleDark?: () => void;
}

export const NotFound: React.FC<NotFoundProps> = ({
  onNavigate,
  darkMode,
  onToggleDark,
}) => {
  const attemptedPath = window.location.pathname || "/unknown-route";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--base)",
        color: "var(--ink)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Top Bar ── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 32px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
        }}
      >
        <div
          onClick={() => onNavigate("login")}
          style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
        >
          <div style={{ width: 36, height: 36 }}>
            <LogoMark style={{ width: "100%", height: "100%", color: "var(--brand-accent)" }} />
          </div>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              AegisGraph
            </span>
            <span style={{ fontSize: 11, color: "var(--green)", marginLeft: 8, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              AI
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onToggleDark && (
            <ThemeToggle darkMode={Boolean(darkMode)} onToggleDark={onToggleDark} />
          )}
          <button
            onClick={() => onNavigate("login")}
            className="btn btn-secondary"
            style={{ padding: "6px 14px", fontSize: 13, borderRadius: 999 }}
          >
            Terminal Login
          </button>
        </div>
      </header>

      {/* ── 404 Content ── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          position: "relative",
        }}
      >
        {/* Subtle grid background motif */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `radial-gradient(circle at 50% 40%, rgba(22, 163, 74, 0.06) 0%, transparent 60%)`,
            pointerEvents: "none",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{
            width: "100%",
            maxWidth: 580,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 24,
            padding: "48px 40px",
            textAlign: "center",
            boxShadow: "var(--shadow-card)",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Status Chip */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 14px", borderRadius: 999, background: "var(--red-dim)", border: "1px solid var(--red)", color: "var(--red)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", boxShadow: "0 0 6px var(--red)" }} />
            404 — NODE NOT FOUND
          </div>

          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "var(--ink)",
              letterSpacing: "-0.03em",
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            Graph Node Disconnected
          </h1>

          <p
            style={{
              fontSize: 15,
              color: "var(--muted)",
              lineHeight: 1.6,
              margin: "0 auto 24px",
              maxWidth: 460,
            }}
          >
            The requested industrial safety route or knowledge graph URI cannot be resolved. The resource may have been decommissioned or moved.
          </p>

          {/* Requested path debug pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              background: "var(--raised)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              color: "var(--ink)",
              marginBottom: 32,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <iconify-icon icon="lucide:terminal" style={{ fontSize: 15, color: "var(--muted)", flexShrink: 0 }} />
            <span style={{ color: "var(--muted)" }}>Target URI:</span>
            <span style={{ color: "var(--red)", fontWeight: 600 }}>{attemptedPath}</span>
          </div>

          {/* Action CTAs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
            }}
          >
            <button
              onClick={() => onNavigate("login")}
              className="btn btn-primary"
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "14px 24px",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "var(--shadow-btn)",
              }}
            >
              <iconify-icon icon="lucide:arrow-left" style={{ fontSize: 18 }} />
              Return to Safety Portal
            </button>

            <button
              onClick={() => onNavigate("terms")}
              className="btn btn-secondary"
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "12px 24px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <iconify-icon icon="lucide:shield-check" style={{ fontSize: 16 }} />
              Platform Compliance &amp; Terms
            </button>
          </div>

          {/* Help footer */}
          <div
            style={{
              marginTop: 36,
              paddingTop: 20,
              borderTop: "1px solid var(--line)",
              fontSize: 12.5,
              color: "var(--muted)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
            }}
          >
            <span>Need supervisor assistance?</span>
            <a
              href="mailto:safety-support@tatatechnologies.com?subject=AegisGraph%20Route%20Error%20404"
              style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
            >
              Contact Compliance Desk
            </a>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default NotFound;
