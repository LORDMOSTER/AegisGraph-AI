import { useState, useEffect } from "react";
import { getMe } from "../api";
import { ExamDashboard } from "../pages/ExamDashboard";
import { ExamSession } from "../pages/ExamSession";

interface Props {
  onLogout: () => void;
}

export function EmployeeShell({ onLogout }: Props) {
  const [route, setRoute] = useState<"dashboard" | "exam">("dashboard");
  const [activeExamId, setActiveExamId] = useState<string | null>(null);

  const [userProfile, setUserProfile] = useState<any>(null);

  // Employee code is stored on login (employee_code from JWT/login response)
  const employeeCode = localStorage.getItem("aegis_employee_code") || "";

  useEffect(() => {
    getMe().then((data) => setUserProfile(data)).catch(console.error);
  }, []);

  const handleStartExam = (examId: string) => {
    setActiveExamId(examId);
    setRoute("exam");
  };

  const handleExitExam = () => {
    setActiveExamId(null);
    setRoute("dashboard");
  };

  if (route === "exam" && activeExamId) {
    return <ExamSession examId={activeExamId} employeeCode={employeeCode} onExit={handleExitExam} />;
  }

  // Dashboard layout with top bar
  return (
    <div className="employee-layout">
      <header 
        className="employee-topbar clay-card" 
        style={{ 
          margin: "24px 32px", 
          borderRadius: "24px", 
          padding: "0 24px", 
          border: "none", 
          justifyContent: "space-between" 
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--void-4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
            👤
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              Welcome back, {userProfile?.full_name || "Employee"}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--cyan)" }}>{userProfile?.designation || "Line Operator"}</p>
          </div>
        </div>
        <button
          className="btn"
          onClick={onLogout}
          style={{ 
            backgroundColor: "var(--red)", 
            color: "white", 
            borderColor: "var(--red)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "var(--shadow-btn)",
            padding: "6px 14px",
            fontSize: "13px"
          }}
        >
          <iconify-icon icon="lucide:log-out" style={{ fontSize: 14 }} />
          Logout
        </button>
      </header>

      <main style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
        <ExamDashboard onStartExam={handleStartExam} userProfile={userProfile} />
      </main>

      <footer style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", background: "var(--void)", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text-tertiary)", fontSize: 11 }}>
        <div>AegisGraph AI · Industrial Safety Certification Platform</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--emerald)" }}>●</span> System Operational · 100% Offline | Tata Technologies
        </div>
      </footer>
    </div>
  );
}
