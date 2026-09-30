import React, { useState, useEffect } from "react";
import { getAllAssignedExams, deleteAssignedExam, resetAssignedExam } from "../api";
import { AnimatePresence, motion } from "framer-motion";

export function AdminExams() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Custom Modal State
  const [examToRemove, setExamToRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAllAssignedExams();
      setExams(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!examToRemove) return;
    setIsRemoving(true);
    setErrorMessage(null);
    try {
      await deleteAssignedExam(examToRemove);
      await loadData();
      setExamToRemove(null);
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to remove exam.");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleReset = async (examId: string) => {
    setIsResetting(true);
    try {
      await resetAssignedExam(examId);
      await loadData();
    } catch (err) {
      console.error(err);
      alert("Failed to reset exam.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Assigned Exams</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Manage exams currently assigned to employees.</p>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Assessment Name</th>
                <th>Status</th>
                <th>Assigned At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No assigned exams found. Assign them from the Employees page.
                  </td>
                </tr>
              ) : (
                exams.map((e: any) => (
                  <tr key={e.exam_session_id}>
                    <td style={{ fontWeight: 500 }}>{e.employee_name}</td>
                    <td>{e.assessment_name}</td>
                    <td>
                      <span className={`badge badge-${e.status === 'COMPLETED' ? 'emerald' : e.status === 'FAILED' ? 'rose' : 'amber'}`}>
                        {e.status}
                      </span>
                    </td>
                    <td>{new Date(e.assigned_at).toLocaleString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        {e.status !== 'ASSIGNED' && (
                          <button 
                            className="btn btn-ghost"
                            style={{ color: "var(--emerald)", border: "1px solid var(--emerald-dim)" }}
                            onClick={() => handleReset(e.exam_session_id)}
                            disabled={isResetting}
                          >
                            Enable Attempt
                          </button>
                        )}
                        <button 
                          className="btn btn-ghost"
                          style={{ color: "var(--rose)", border: "1px solid var(--rose-dim)" }}
                          onClick={() => setExamToRemove(e.exam_session_id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {examToRemove && (
          <div 
            style={{ position: "fixed", inset: 0, zIndex: 10001, display: "grid", placeItems: "center", background: "rgba(28,28,26,0.2)", backdropFilter: "blur(4px)", padding: 20 }}
            onClick={(e) => { if (e.target === e.currentTarget) setExamToRemove(null); }}
          >
            <motion.div
              style={{
                width: "100%", maxWidth: 440,
                background: "var(--surface)", border: "1px solid var(--line)",
                borderRadius: "var(--card-radius)", padding: 24,
                boxShadow: "0 20px 60px rgba(28,28,26,0.15)",
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", display: "grid", placeItems: "center", flexShrink: 0, color: "#ef4444" }}>
                  <iconify-icon icon="lucide:alert-triangle" style={{ fontSize: 20 }} />
                </div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                    Remove Exam
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                    Are you sure you want to remove this assigned exam? This action cannot be undone.
                  </p>
                </div>
              </div>
              
              {errorMessage && (
                <div style={{ padding: 12, background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                  {errorMessage}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 500, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
                  onClick={() => {
                    setExamToRemove(null);
                    setErrorMessage(null);
                  }}
                  disabled={isRemoving}
                >
                  Cancel
                </button>
                <button
                  style={{ background: "#dc2626", border: "1px solid #dc2626", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 500, color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)" }}
                  onClick={handleConfirmRemove}
                  disabled={isRemoving}
                >
                  {isRemoving ? "Removing..." : "Remove Exam"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
