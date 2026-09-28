import React, { useState, useEffect } from "react";
import { ThemeToggle } from "../components/ThemeToggle";

interface SettingsProps {
  darkMode: boolean;
  onToggleDark: () => void;
}

interface SettingRowProps {
  icon: string;
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ icon, label, description, children }: SettingRowProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "18px 0",
      borderBottom: "1px solid var(--line)",
      gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flex: 1 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: "var(--raised)",
          border: "1px solid var(--line)",
          display: "grid", placeItems: "center",
          flexShrink: 0,
          marginTop: 2,
        }}>
          <iconify-icon icon={icon} style={{ fontSize: 17, color: "var(--accent)" }} />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 3 }}>{label}</p>
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{description}</p>
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// Simple Toggle Switch component
function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div 
      onClick={() => onChange(!enabled)}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: enabled ? "var(--accent)" : "var(--raised)",
        border: "1px solid var(--line)",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s"
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: "50%",
        background: "white",
        position: "absolute",
        top: 1, left: enabled ? 21 : 1,
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
      }} />
    </div>
  );
}

export function Settings({ darkMode, onToggleDark }: SettingsProps) {
  // Load settings from localStorage or defaults
  const [llmEngine, setLlmEngine] = useState(() => localStorage.getItem("aegis_llm_engine") || "phi-3-mini");
  const [pdfParser, setPdfParser] = useState(() => localStorage.getItem("aegis_pdf_parser") || "pdfplumber");
  const [noiseFilter, setNoiseFilter] = useState(() => localStorage.getItem("aegis_noise_filter") !== "false");
  const [groundingVerif, setGroundingVerif] = useState(() => localStorage.getItem("aegis_grounding_verif") !== "false");
  const [deduplication, setDeduplication] = useState(() => localStorage.getItem("aegis_deduplication") !== "false");
  const [displayDensity, setDisplayDensity] = useState(() => localStorage.getItem("aegis_display_density") || "standard");

  // Save on change
  useEffect(() => localStorage.setItem("aegis_llm_engine", llmEngine), [llmEngine]);
  useEffect(() => localStorage.setItem("aegis_pdf_parser", pdfParser), [pdfParser]);
  useEffect(() => localStorage.setItem("aegis_noise_filter", String(noiseFilter)), [noiseFilter]);
  useEffect(() => localStorage.setItem("aegis_grounding_verif", String(groundingVerif)), [groundingVerif]);
  useEffect(() => localStorage.setItem("aegis_deduplication", String(deduplication)), [deduplication]);
  useEffect(() => localStorage.setItem("aegis_display_density", displayDensity), [displayDensity]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 720 }}>

      {/* Page header */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
          System Configuration
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
          Manage appearance, system preferences, and platform configuration.
        </p>
      </div>

      {/* Appearance */}
      <section>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16 }}>
          Appearance
        </p>
        <div className="card" style={{ padding: "4px 24px" }}>

          <SettingRow
            icon="lucide:moon"
            label="Dark Mode"
            description="Switch between a clean white interface and a deep obsidian dark theme. Your preference is saved locally."
          >
            <ThemeToggle darkMode={darkMode} onToggleDark={onToggleDark} />
          </SettingRow>

          <SettingRow
            icon="lucide:type"
            label="Interface Font"
            description="Currently using Inter — optimised for high-density information displays."
          >
            <span className="badge badge-indigo">Inter</span>
          </SettingRow>

          <SettingRow
            icon="lucide:monitor"
            label="Display Density"
            description="Standard layout with comfortable spacing for admin interfaces."
          >
            <select 
              value={displayDensity} 
              onChange={e => setDisplayDensity(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", outline: "none" }}
            >
              <option value="standard">Standard</option>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </SettingRow>

        </div>
      </section>

      {/* System */}
      <section>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16 }}>
          Platform
        </p>
        <div className="card" style={{ padding: "4px 24px" }}>

          <SettingRow
            icon="lucide:cpu"
            label="LLM Engine"
            description="Select the language model for local offline inference (requires Ollama running)."
          >
            <select 
              value={llmEngine} 
              onChange={e => setLlmEngine(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", outline: "none" }}
            >
              <option value="phi3:mini">phi3:mini (Fast & Recommended)</option>
              <option value="llama3:latest">llama3:latest</option>
              <option value="llama3.2:3b">llama3.2:3b</option>
              <option value="phi4-mini:latest">phi4-mini:latest</option>
            </select>
          </SettingRow>

          <SettingRow
            icon="lucide:database"
            label="Database"
            description="PostgreSQL via SQLAlchemy async session. Schema version includes FilteredBlock audit table."
          >
            <span className="badge badge-indigo">PostgreSQL</span>
          </SettingRow>

          <SettingRow
            icon="lucide:wifi-off"
            label="Offline Mode"
            description="AegisGraph runs entirely offline. No external API calls are made during ingestion or assessment generation."
          >
            <span className="badge badge-emerald">Active</span>
          </SettingRow>

        </div>
      </section>

      {/* Ingestion */}
      <section>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16 }}>
          Ingestion Pipeline
        </p>
        <div className="card" style={{ padding: "4px 24px" }}>

          <SettingRow
            icon="lucide:scan-text"
            label="PDF Parser"
            description="Select the parsing backend. pdfplumber offers structural segmentation, PyMuPDF is faster for raw text."
          >
            <select 
              value={pdfParser} 
              onChange={e => setPdfParser(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", outline: "none" }}
            >
              <option value="pdfplumber">pdfplumber (Recommended)</option>
              <option value="pymupdf">PyMuPDF</option>
            </select>
          </SettingRow>

          <SettingRow
            icon="lucide:filter"
            label="Noise Filter"
            description="Blocks shorter than 20 chars, TOC fragments, copyright notices, and page artefacts are automatically discarded and logged."
          >
            <ToggleSwitch enabled={noiseFilter} onChange={setNoiseFilter} />
          </SettingRow>

          <SettingRow
            icon="lucide:shield-check"
            label="Grounding Verification"
            description="After LLM structuring, all generated rule text is checked for hallucinated numbers or units. Suspect rules are flagged for manual review."
          >
            <ToggleSwitch enabled={groundingVerif} onChange={setGroundingVerif} />
          </SettingRow>

          <SettingRow
            icon="lucide:copy-slash"
            label="Deduplication"
            description="Exact-match normalisation (lowercase, punctuation-stripped) prevents duplicate rules from being stored."
          >
            <ToggleSwitch enabled={deduplication} onChange={setDeduplication} />
          </SettingRow>

        </div>
      </section>

      {/* Danger zone */}
      <section>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--red)", marginBottom: 16 }}>
          Danger Zone
        </p>
        <div className="card" style={{ padding: "4px 24px", border: "1px solid rgba(239,68,68,0.2)" }}>

          <SettingRow
            icon="lucide:trash-2"
            label="Clear Session Token"
            description="Removes the stored JWT from your browser. You will be logged out immediately."
          >
            <button
              className="btn btn-destructive"
              style={{ fontSize: 12 }}
              onClick={() => {
                localStorage.removeItem("aegis_token");
                window.location.reload();
              }}
            >
              Clear & Logout
            </button>
          </SettingRow>

        </div>
      </section>

    </div>
  );
}
