import { motion } from "framer-motion";
import { LogoMark } from "../components/BrandAssets";
import { ThemeToggle } from "../components/ThemeToggle";

interface PrivacyPolicyProps {
  onBack: () => void;
  darkMode?: boolean;
  onToggleDark?: () => void;
}

export function PrivacyPolicy({ onBack, darkMode, onToggleDark }: PrivacyPolicyProps) {
  const lastUpdated = "October 2026";

  const sections = [
    {
      id: "scope",
      title: "1. Scope & System Architecture",
      icon: "lucide:layers",
      content: (
        <>
          <p>
            AegisGraph AI operates as an on-premises, edge-first industrial safety certification and assessment engine.
            This Privacy Policy governs how personal data, worker performance telemetry, and proctoring records are
            collected, processed, and safeguarded when employees and administrators interact with the AegisGraph platform.
          </p>
          <p>
            Unlike traditional cloud assessment platforms, AegisGraph AI is engineered to operate in 100% offline, air-gapped,
            or local intranet environments. All GraphRAG knowledge graph queries, local Large Language Model (LLM) inferences,
            and safety evaluations are executed within your organization’s dedicated perimeter.
          </p>
        </>
      ),
    },
    {
      id: "data-collection",
      title: "2. Categories of Information Collected",
      icon: "lucide:database",
      content: (
        <>
          <p>We process only data strictly necessary for verifying occupational safety compliance and certifying workplace competencies:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <li>
              <strong>Personnel Identification:</strong> Full name, employee code/ID, company affiliation, assigned department,
              designation, and corporate email.
            </li>
            <li>
              <strong>Competency & Examination Telemetry:</strong> Assessment scores, response latency per cognitive level
              (Remember, Understand, Apply, Analyze, Evaluate), pass/fail status, and historical qualification records.
            </li>
            <li>
              <strong>Identity & Anti-Impersonation Biometrics:</strong> Camera-captured reference facial descriptor vectors
              (128-dimensional floating-point embeddings). Raw facial images are stored locally under encrypted file storage,
              and facial vector matching occurs locally via WebAssembly/TensorFlow.
            </li>
            <li>
              <strong>Proctoring & Anomaly Forensics:</strong> Event flags recorded during locked-down assessments, including tab
              switching, multi-face presence, gaze diversion, and short rolling-buffer video anomaly clips (5–10s clips recorded
              to encrypted local client storage when suspicious events trigger).
            </li>
            <li>
              <strong>Audit & Cryptographic Logs:</strong> Immutable event timestamps, supervisor unlock signatures, IP addresses,
              and SHA-256 certificate hashes for verification.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "purpose",
      title: "3. Purpose and Legal Basis of Processing",
      icon: "lucide:check-circle-2",
      content: (
        <>
          <p>All processing is conducted under legitimate industrial compliance grounds and statutory occupational safety mandates:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <li>Ensuring that industrial workers have demonstrated mandatory safety standard operating procedure (SOP) comprehension prior to high-risk floor deployment.</li>
            <li>Fulfilling legal safety compliance standards (such as OSHA, ISO 45001, and plant-specific safety guidelines).</li>
            <li>Preventing proxy examination fraud and maintaining the forensic integrity of safety licenses and certifications.</li>
            <li>Continuous calibration of rule difficulty profiles and question validity metrics.</li>
          </ul>
        </>
      ),
    },
    {
      id: "biometrics",
      title: "4. Biometric Data Protection & Retention",
      icon: "lucide:scan-face",
      content: (
        <>
          <p>
            Biometric facial embeddings are generated strictly for candidate identification at exam initialization. We adhere to
            rigorous data minimization standards:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <li><strong>No Cloud Transmissions:</strong> Biometric vectors and proctoring video clips are never transmitted to external third-party cloud vendors or public AI training pipelines.</li>
            <li><strong>Automated Rolling Pruning:</strong> By default, anomaly proctoring video clips and telemetry are automatically purged after 30 days (configurable by your organization&apos;s corporate compliance policy).</li>
            <li><strong>Tamper-Proof Storage:</strong> Local clips are stored in client IndexedDB storage and verified with SHA-256 integrity checks.</li>
          </ul>
        </>
      ),
    },
    {
      id: "security",
      title: "5. Security Safeguards & Encryption",
      icon: "lucide:shield-check",
      content: (
        <>
          <p>AegisGraph implements state-of-the-art cryptographic and architectural controls:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <li><strong>Password Security:</strong> All user passwords are encrypted using Argon2id with cryptographically generated salts.</li>
            <li><strong>Transport Security:</strong> Strict HTTPS and Transport Layer Security (TLS 1.3) enforcement with HSTS preloading headers for all network endpoints.</li>
            <li><strong>Role-Based Access Control (RBAC):</strong> Strict isolation between Administrator, Supervisor, and Worker roles with digitally signed JSON Web Tokens (JWT).</li>
            <li><strong>Dual-Factor Kiosk Lockdown:</strong> Kiosk exam terminals require supervisor physical or keyed authorizations before releasing exam payloads.</li>
          </ul>
        </>
      ),
    },
    {
      id: "cookies",
      title: "6. Cookies & Client-Side Storage",
      icon: "lucide:cookie",
      content: (
        <>
          <p>
            AegisGraph AI uses only essential and functional storage mechanisms. We do not incorporate third-party advertising cookies,
            cross-site tracking pixels, or commercial ad networks.
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <li><strong>Essential Tokens:</strong> Short-lived authentication JWTs and CSRF tokens stored in secure client storage to maintain authorized session access.</li>
            <li><strong>Functional Preferences:</strong> Theme selection (dark/light mode) and cookie consent status.</li>
            <li><strong>Offline Cache:</strong> Machine learning weight matrices for offline face verification cached locally in the browser cache.</li>
          </ul>
        </>
      ),
    },
    {
      id: "rights",
      title: "7. Candidate & Employee Rights",
      icon: "lucide:user-check",
      content: (
        <>
          <p>
            In compliance with global data protection frameworks (including GDPR, CCPA, and national data protection regulations),
            personnel retain the following rights:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <li><strong>Right of Access:</strong> Review all safety certification records, scores, and exam logs associated with your employee identifier.</li>
            <li><strong>Right to Rectification:</strong> Request correction of inaccurate personal or departmental affiliation details through plant administration.</li>
            <li><strong>Right to Contest Proctoring Flags:</strong> Request human safety officer review of any automated proctoring anomalies or exam lockouts.</li>
            <li><strong>Data Portability:</strong> Obtain certified copies of issued PDF certificates with cryptographic QR validation marks.</li>
          </ul>
        </>
      ),
    },
    {
      id: "contact",
      title: "8. Data Protection & Compliance Contact",
      icon: "lucide:mail",
      content: (
        <>
          <p>
            For compliance inquiries, audit trail inspections, or privacy rights requests, contact your designated Plant Safety
            Officer or the AegisGraph Compliance Secretariat:
          </p>
          <div style={{ marginTop: 12, padding: "16px 20px", background: "var(--base)", borderRadius: 12, border: "1px solid var(--line)" }}>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>AegisGraph AI Compliance & Safety Office</p>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>Enterprise Industrial Safety Architecture</p>
            <p style={{ margin: "4px 0 0", color: "var(--accent)", fontSize: 13 }}>Email: compliance@aegisgraph.internal · safety-audit@tatatechnologies.com</p>
          </div>
        </>
      ),
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--base)", color: "var(--ink)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, display: "grid", placeItems: "center" }}>
              <LogoMark style={{ width: "100%", height: "100%", color: "var(--brand-accent)" }} />
            </div>
            <div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>
                AegisGraph AI
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8, paddingLeft: 8, borderLeft: "1px solid var(--line)" }}>
                Privacy Policy
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {onToggleDark && (
              <ThemeToggle darkMode={!!darkMode} onToggleDark={onToggleDark} />
            )}
            <button
              onClick={onBack}
              className="btn btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                fontSize: 13,
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              <iconify-icon icon="lucide:arrow-left" style={{ fontSize: 16 }} />
              Return
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: 900, width: "100%", margin: "0 auto", padding: "48px 24px 64px" }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Hero Banner */}
          <div style={{ marginBottom: 40, borderBottom: "1px solid var(--line)", paddingBottom: 32 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--green-dim)", border: "1px solid var(--green)", padding: "4px 12px", borderRadius: 999, fontSize: 12, color: "var(--green)", fontWeight: 500, marginBottom: 16 }}>
              <iconify-icon icon="lucide:shield-check" style={{ fontSize: 14 }} />
              On-Premises Industrial Safety Compliance Standards
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)", margin: "0 0 12px" }}>
              AegisGraph AI Privacy Policy
            </h1>
            <p style={{ fontSize: 15, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
              Last revised: {lastUpdated} · Formal policy for worker proctoring telemetry, biometric verifications, and offline GraphRAG certification data.
            </p>
          </div>

          {/* Policy Sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {sections.map((sec) => (
              <div
                key={sec.id}
                id={sec.id}
                className="card"
                style={{
                  background: "var(--surface)",
                  borderRadius: 16,
                  padding: "28px 32px",
                  border: "1px solid var(--line)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
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
                    <iconify-icon icon={sec.icon} style={{ fontSize: 18 }} />
                  </div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
                    {sec.title}
                  </h2>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink)" }}>
                  {sec.content}
                </div>
              </div>
            ))}
          </div>

          {/* Footer inside Policy */}
          <div style={{ marginTop: 48, textAlign: "center", paddingTop: 32, borderTop: "1px solid var(--line)" }}>
            <button
              onClick={onBack}
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 28px",
                fontSize: 14,
                borderRadius: 999,
              }}
            >
              <iconify-icon icon="lucide:arrow-left" style={{ fontSize: 16 }} />
              I Understand &amp; Agree
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
