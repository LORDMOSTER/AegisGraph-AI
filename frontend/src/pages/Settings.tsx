import React from "react";
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

export function Settings({ darkMode, onToggleDark }: SettingsProps) {
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
            <span className="badge badge-emerald">Standard</span>
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
            description="Using phi-3-mini via local Ollama. All inference runs fully offline — no data leaves the system."
          >
            <span className="badge badge-emerald">phi-3-mini · Local</span>
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
            description="pdfplumber with font-size-based structural segmentation. Heading detection threshold: 1.15× median body size."
          >
            <span className="badge badge-indigo">pdfplumber</span>
          </SettingRow>

          <SettingRow
            icon="lucide:filter"
            label="Noise Filter"
            description="Blocks shorter than 20 chars, TOC fragments, copyright notices, and page artefacts are automatically discarded and logged."
          >
            <span className="badge badge-emerald">Enabled</span>
          </SettingRow>

          <SettingRow
            icon="lucide:shield-check"
            label="Grounding Verification"
            description="After LLM structuring, all generated rule text is checked for hallucinated numbers or units. Suspect rules are flagged for manual review."
          >
            <span className="badge badge-emerald">Enabled</span>
          </SettingRow>

          <SettingRow
            icon="lucide:copy-slash"
            label="Deduplication"
            description="Exact-match normalisation (lowercase, punctuation-stripped) prevents duplicate rules from being stored."
          >
            <span className="badge badge-emerald">Enabled</span>
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
