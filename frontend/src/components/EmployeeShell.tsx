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
    <div className="w-full">
      <ExamDashboard 
        onStartExam={handleStartExam} 
        userProfile={userProfile} 
        onLogout={onLogout} 
      />
    </div>
  );
}
