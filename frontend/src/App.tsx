import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AssessmentResponse, checkHealth, generateAssessment } from "./api";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { IngestionTerminal } from "./components/IngestionTerminal";
import {
  ConstraintDashboard,
  DifficultyProfile,
  GRAPH_SECTIONS,
} from "./components/ConstraintDashboard";
import { ExecutionPanel } from "./components/ExecutionPanel";
import { AssessmentRenderer } from "./components/AssessmentRenderer";
import { Login } from "./pages/Login";
import { RegisterCompany } from "./pages/RegisterCompany";
import { Departments } from "./pages/Departments";
import { Employees } from "./pages/Employees";
import { EmployeeShell } from "./components/EmployeeShell";
import { Certificates } from "./pages/Certificates";
import { AuthLayout } from "./components/AuthLayout";
import { VerifyCertificate } from "./pages/VerifyCertificate";
import { Rules } from "./pages/Rules";
import { QuestionBank } from "./pages/QuestionBank";
import { Settings } from "./pages/Settings";
import { ThemeToggle } from "./components/ThemeToggle";
import SpecularButton from "./components/SpecularButton";

// ─────────────────────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────────────────────

export type Tab =
  | "dashboard"
  | "manuals"
  | "rules"
  | "question-bank"
  | "departments"
  | "employees"
  | "assessments"
  | "exams"
  | "certificates"
  | "audit"
  | "settings"
  | "results";

function buildDefaults(): Record<string, number> {
  return Object.fromEntries(GRAPH_SECTIONS.map((s) => [s, 0]));
}

const adminTabs: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard",    label: "Dashboard",    icon: "gauge" },
  { id: "manuals",      label: "Manuals",      icon: "file-text" },
  { id: "rules",        label: "Rules",        icon: "list-checks" },
  { id: "question-bank",label: "Question Bank",icon: "library" },
  { id: "departments",  label: "Departments",  icon: "building-2" },
  { id: "employees",    label: "Employees",    icon: "users" },
  { id: "assessments",  label: "Assessments",  icon: "clipboard-list" },
  { id: "exams",        label: "Exams",        icon: "monitor-check" },
  { id: "certificates", label: "Certificates", icon: "badge-check" },
  { id: "audit",        label: "Audit Log",    icon: "scroll-text" },
  { id: "settings",     label: "Settings",     icon: "settings" },
];

const pageVariants = {
  initial:    { opacity: 0, y: 12 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<"login" | "register" | "app" | "verify">(() => {
    if (window.location.pathname.startsWith("/verify/")) {
      return "verify";
    }
    return "login";
  });
  
  const [verifyCertId, _setVerifyCertId] = useState<string | null>(() => {
    if (window.location.pathname.startsWith("/verify/")) {
      return window.location.pathname.split("/verify/")[1];
    }
    return null;
  });

  const [userRole, setUserRole] = useState<"admin" | "employee">("admin");
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("aegis_theme");
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const [constraints, setConstraints] = useState<Record<string, number>>(buildDefaults);
  const [difficultyProfile, setDifficultyProfile] = useState<DifficultyProfile>({
    high_risk_ratio: 0.6,
    routine_ratio: 0.4,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AssessmentResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [incompleteData, setIncompleteData] = useState<{message: string, missingRules: string[]} | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("aegis_theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // Resize listener
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Health poll every 10 s
  const checkBackend = useCallback(async () => {
    try {
      await checkHealth();
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    checkBackend();
    const id = setInterval(checkBackend, 10000);
    return () => clearInterval(id);
  }, [checkBackend]);

  const totalRequested = Object.values(constraints).reduce((a, b) => a + b, 0);

  async function handleGenerate() {
    const active = Object.fromEntries(
      Object.entries(constraints).filter(([, v]) => v > 0)
    );
    setIsLoading(true);
    setResult(null);
    setErrorMessage(null);

    try {
      const data = await generateAssessment(active, difficultyProfile);
      if (data.status === "incomplete") {
        setIncompleteData({
          message: data.message || "Not enough approved questions.",
          missingRules: data.missing_questions_for_rules || []
        });
      } else {
        setResult(data);
        setActiveTab("results");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsLoading(false);
    }
  }

  // Common main content
  const renderMainContent = () => (
    <main style={{ flex: 1, maxWidth: 1400, width: "100%", margin: "0 auto", padding: "32px 28px" }}>
      {/* Global error banner */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="card"
            style={{ borderColor: "var(--red)", marginBottom: 20, padding: "14px 18px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--red)", fontSize: 13 }}>
                <strong>Pipeline Error:</strong> {errorMessage}
              </p>
              <button
                onClick={() => setErrorMessage(null)}
                className="btn btn-ghost"
                style={{ padding: "4px 10px", fontSize: 11 }}
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {activeTab === "dashboard" && (
          <motion.div key="dashboard" {...pageVariants}>
            <AnalyticsDashboard backendOnline={backendOnline} setActiveTab={setActiveTab} />
          </motion.div>
        )}

        {activeTab === "manuals" && (
          <motion.div key="manuals" {...pageVariants}>
            <IngestionTerminal />
          </motion.div>
        )}

        {activeTab === "assessments" && (
          <motion.div key="assessments" {...pageVariants}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <ConstraintDashboard
                constraints={constraints}
                difficultyProfile={difficultyProfile}
                onConstraintChange={(s, v) =>
                  setConstraints((prev) => ({ ...prev, [s]: v }))
                }
                onDifficultyChange={setDifficultyProfile}
              />
              <ExecutionPanel
                isLoading={isLoading}
                isDisabled={totalRequested === 0}
                onGenerate={handleGenerate}
                incompleteData={incompleteData}
                onNavigateToBank={() => {
                  setIncompleteData(null);
                  setActiveTab("rules"); // the button to generate is in rules for now, or Question Bank
                }}
              />
            </div>
          </motion.div>
        )}

        {activeTab === "results" && result && (
          <motion.div key="results" {...pageVariants}>
            <AssessmentRenderer
              rules={result.rules}
              assessment={result.assessment}
              queryMs={result.query_duration_ms}
              inferenceMs={result.inference_latency_ms}
            />
          </motion.div>
        )}

        {activeTab === "departments" && (
          <motion.div key="departments" {...pageVariants}>
            <Departments />
          </motion.div>
        )}

        {activeTab === "employees" && (
          <motion.div key="employees" {...pageVariants}>
            <Employees />
          </motion.div>
        )}

        {activeTab === "certificates" && (
          <motion.div key="certificates" {...pageVariants}>
            <Certificates />
          </motion.div>
        )}

        {activeTab === "rules" && (
          <motion.div key="rules" {...pageVariants}>
            <Rules />
          </motion.div>
        )}

        {activeTab === "question-bank" && (
          <motion.div key="question-bank" {...pageVariants}>
            <QuestionBank />
          </motion.div>
        )}

        {activeTab === "settings" && (
          <motion.div key="settings" {...pageVariants}>
            <Settings darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />
          </motion.div>
        )}

        {/* Placeholders for remaining tabs */}
        {["exams", "audit"].includes(activeTab) && (
          <motion.div key={activeTab} {...pageVariants} className="qr-center" style={{ height: 400 }}>
            <div className="qr-status-card glass-panel" style={{ textAlign: "center" }}>
              <h3 className="qr-status-label" style={{ textTransform: "capitalize" }}>{activeTab}</h3>
              <p className="qr-status-sub">Module coming soon.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );

  const renderFooter = () => (
    <footer style={{
      borderTop: "1px solid var(--line)",
      background: "var(--surface)",
      padding: "14px 28px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
    }}>
      <p style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-display)", fontWeight: 500 }}>
        AegisGraph AI · Industrial Safety Certification Platform
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent2)", display: "inline-block" }} />
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          System Operational · 100% Offline
        </p>
        <span style={{ fontSize: 12, color: "var(--line)" }}>|</span>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>Tata Technologies</p>
      </div>
    </footer>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Admin Shell
  // ─────────────────────────────────────────────────────────────────────────────
  const renderAdminShell = () => (
    <div className="admin-layout">
      {/* Mobile Sidebar Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <AnimatePresence>
        {(!isMobile || isMobileMenuOpen) && (
          <motion.aside
            className={isMobile ? "admin-sidebar-mobile" : "admin-sidebar"}
            initial={isMobile ? { x: -240 } : false}
            animate={{ x: 0 }}
            exit={isMobile ? { x: -240 } : undefined}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px", borderBottom: "1px solid var(--line)" }}>
              <div style={{
                width: 32, height: 32,
                borderRadius: 8,
                flexShrink: 0,
                overflow: "hidden"
              }}>
                <img src="/logo.png" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-display)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                AegisGraph
              </span>
            </div>

            <nav style={{ flex: 1, padding: "12px", overflowY: "auto" }}>
              {adminTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`sidebar-link ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (isMobile) setIsMobileMenuOpen(false);
                  }}
                >
                  <iconify-icon icon={`lucide:${tab.icon}`} style={{ fontSize: 18 }} />
                  {tab.label}
                </button>
              ))}
              {activeTab === "results" && result && (
                <button className="sidebar-link active">
                  <iconify-icon icon="lucide:check-circle" style={{ fontSize: 18 }} />
                  Results
                </button>
              )}
            </nav>

            <div style={{ padding: "16px", borderTop: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--raised)", border: "1px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <iconify-icon icon="lucide:user" style={{ fontSize: 16, color: "var(--ink)" }} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Admin</p>
                </div>
                {!isMobile && (
                  <ThemeToggle darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />
                )}
              </div>

              <SpecularButton
                size="sm"
                radius={10}
                tint="#dc2626"
                tintOpacity={0.08}
                lineColor="#ef4444"
                baseColor="#7f1d1d"
                textColor="#ef4444"
                intensity={1.2}
                shineSize={14}
                shineFade={50}
                thickness={1}
                speed={0.4}
                followMouse
                proximity={180}
                onClick={() => setCurrentRoute("login")}
                className="specular-logout"
              >
                <iconify-icon icon="lucide:log-out" style={{ fontSize: 14, marginRight: 6 }} />
                Log out
              </SpecularButton>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="admin-main" style={{ position: "relative" }}>

        {isMobile && (
          <header style={{ height: 56, borderBottom: "1px solid var(--line)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button className="btn btn-icon touch-target" onClick={() => setIsMobileMenuOpen(true)} style={{ padding: "0 10px" }}>
                <iconify-icon icon="lucide:menu" style={{ fontSize: 20 }} />
              </button>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>AegisGraph</span>
            </div>
            
            {/* Mobile Theme Toggle */}
            <div style={{ padding: "0 10px" }}>
              <ThemeToggle darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />
            </div>
          </header>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {renderMainContent()}
          {renderFooter()}
        </div>
      </div>
    </div>
  );

  if (currentRoute === "verify" && verifyCertId) {
    return <VerifyCertificate certId={verifyCertId} />;
  }

  if (currentRoute === "login" || currentRoute === "register") {
    return (
      <AuthLayout darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)}>
        {currentRoute === "login" ? (
          <Login
            onNavigate={setCurrentRoute}
            onLoginSuccess={(role) => {
              setUserRole(role);
              setCurrentRoute("app");
            }}
          />
        ) : (
          <RegisterCompany onNavigate={setCurrentRoute} />
        )}
      </AuthLayout>
    );
  }

  return userRole === "admin" ? renderAdminShell() : <EmployeeShell onLogout={() => setCurrentRoute("login")} />;
}
