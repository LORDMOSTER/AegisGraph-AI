import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";




// ── Layout ───────────────────────────────────────────────────────────────────
export function AuthLayout({ children, darkMode, onToggleDark }: { children: React.ReactNode, darkMode?: boolean, onToggleDark?: () => void }) {
  return (
    <div style={{ minHeight: "100vh", height: "100vh", display: "flex", background: "var(--base)", overflow: "hidden" }}>

      {/* ── LEFT ── */}
      <div style={{ flex: "0 0 54%", position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8% 0 9%", overflow: "hidden" }}>



        {/* Vignette */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 38%, var(--base) 100%)", pointerEvents: "none" }} />

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ position: "relative", zIndex: 10, display: "flex", justifyContent: "center" }}
        >
          {/* Logo */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
            <img src="/logo.png" alt="AegisGraph AI Logo" style={{ borderRadius: 18, objectFit: "cover", maxWidth: "100%", maxHeight: "150px" }} />
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.04em", lineHeight: 1, margin: 0, textAlign: "center" }}>
              AegisGraph<span style={{ color: "var(--accent)" }}> AI</span>
            </h1>
          </div>


        </motion.div>
      </div>

      {/* ── RIGHT ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6%", background: "var(--base)", position: "relative", overflow: "hidden" }}>
        
        {/* Top Right Theme Toggle */}
        {onToggleDark && (
          <div style={{ position: "absolute", top: 24, right: 32, zIndex: 100 }}>
            <ThemeToggle darkMode={!!darkMode} onToggleDark={onToggleDark} />
          </div>
        )}

        {/* corner glows */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(37,99,235,0.09) 0%, transparent 68%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, left: -80, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.055) 0%, transparent 68%)", pointerEvents: "none" }} />

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
