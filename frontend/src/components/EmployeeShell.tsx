import { useState } from "react";
import { ExamDashboard } from "../pages/ExamDashboard";
import { ExamSession } from "../pages/ExamSession";

interface Props {
  onLogout: () => void;
}

export function EmployeeShell({ onLogout }: Props) {
  const [route, setRoute] = useState<"dashboard" | "exam">("dashboard");
  const [activeExamId, setActiveExamId] = useState<string | null>(null);

  const handleStartExam = (examId: string) => {
    setActiveExamId(examId);
    setRoute("exam");
  };

  const handleExitExam = () => {
    setActiveExamId(null);
    setRoute("dashboard");
  };

  if (route === "exam" && activeExamId) {
    return <ExamSession examId={activeExamId} onExit={handleExitExam} />;
  }

  // Dashboard layout with top bar
  return (
    <div className="employee-layout">
      <header className="employee-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--void-4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
            👤
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              Welcome back, Employee
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--cyan)" }}>Line Operator</p>
          </div>
        </div>
        <button
          className="btn btn-ghost touch-target"
          onClick={onLogout}
        >
          Logout
        </button>
      </header>

      <main style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
        <ExamDashboard onStartExam={handleStartExam} />
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
