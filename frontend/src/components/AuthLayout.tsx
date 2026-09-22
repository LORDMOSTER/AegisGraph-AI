import React from "react";
import { motion } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";
import { LogoLockup, CornerMotif } from "./BrandAssets";

// ── Layout ───────────────────────────────────────────────────────────────────
export function AuthLayout({ children, darkMode, onToggleDark }: { children: React.ReactNode, darkMode?: boolean, onToggleDark?: () => void }) {
  return (
    <div className="auth-split-container">
      
      {/* ── LEFT PANEL (Empty, logo in BG image) ── */}
      <div className="auth-split-left" />

      {/* ── RIGHT PANEL ── */}
      <div className="auth-split-right">
        {/* Theme Toggle Top Right */}
        {onToggleDark && (
          <div style={{ position: "absolute", top: 24, right: 32, zIndex: 100 }}>
            <ThemeToggle darkMode={!!darkMode} onToggleDark={onToggleDark} />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="auth-form-wrapper"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
