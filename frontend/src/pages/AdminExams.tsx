import React, { useState, useEffect } from "react";
import { getAssessments, assignExam, getEmployees, Employee } from "../api";
import { AnimatePresence, motion } from "framer-motion";

export function AdminExams() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assessmentsData, employeesData] = await Promise.all([
        getAssessments(),
        getEmployees(),
      ]);
      setAssessments(assessmentsData);
      setEmployees(employeesData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openAssignModal = (assessmentId: string) => {
    setSelectedAssessmentId(assessmentId);
    setSelectedEmployeeIds(new Set());
    setAssignModalOpen(true);
  };

  const toggleEmployee = (empId: string) => {
    const next = new Set(selectedEmployeeIds);
    if (next.has(empId)) next.delete(empId);
    else next.add(empId);
    setSelectedEmployeeIds(next);
  };

  const handleConfirmAssign = async () => {
    if (!selectedAssessmentId || selectedEmployeeIds.size === 0) return;
    setAssigning(true);
    try {
      await assignExam(selectedAssessmentId, Array.from(selectedEmployeeIds));
      alert("Exam assigned successfully!");
      setAssignModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to assign exam.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Exam Templates</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Manage generated assessment templates and assign them to employees.</p>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Total Questions</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assessments.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No assessment templates found. Go to Constraints to generate one.
                  </td>
                </tr>
              ) : (
                assessments.map((a: any) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td>{a.total_question_count}</td>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                    <td>
                      <button 
                        className="btn btn-primary"
                        onClick={() => openAssignModal(a.id)}
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {assignModalOpen && (
          <div className="modal-backdrop">
            <motion.div
              className="modal-content"
              style={{ maxWidth: 500 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
                Assign Exam
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                Select employees to assign this exam to.
              </p>

              <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 8 }}>
                {employees.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: 16 }}>
                    No employees found.
                  </p>
                ) : (
                  employees.map(emp => (
                    <label 
                      key={emp.id} 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: 12, 
                        padding: "8px 12px", 
                        cursor: "pointer",
                        borderRadius: "var(--radius)",
                        background: selectedEmployeeIds.has(emp.id) ? "var(--bg-hover)" : "transparent"
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={selectedEmployeeIds.has(emp.id)}
                        onChange={() => toggleEmployee(emp.id)}
                      />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{emp.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{emp.designation} - {emp.departmentName}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setAssignModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmAssign}
                  disabled={selectedEmployeeIds.size === 0 || assigning}
                >
                  {assigning ? "Assigning..." : `Assign to ${selectedEmployeeIds.size} Employee(s)`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
