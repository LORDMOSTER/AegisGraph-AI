import React, { useState, useEffect } from "react";
import { getAllAssignedExams, deleteAssignedExam } from "../api";
import { AnimatePresence, motion } from "framer-motion";

export function AdminExams() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Custom Modal State
  const [examToRemove, setExamToRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
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
                      <button 
                        className="btn btn-ghost"
                        style={{ color: "var(--rose)", border: "1px solid var(--rose-dim)" }}
                        onClick={() => setExamToRemove(e.exam_session_id)}
                      >
                        Remove
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
        {examToRemove && (
          <div className="modal-backdrop">
            <motion.div
              className="modal-content"
              style={{ maxWidth: 400 }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}>
                Remove Exam
              </h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.5 }}>
                Are you sure you want to remove this assigned exam? This action cannot be undone.
              </p>
              
              {errorMessage && (
                <div style={{ padding: 12, background: "var(--rose-dim)", color: "var(--rose)", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                  {errorMessage}
                </div>
              )}

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setExamToRemove(null);
                    setErrorMessage(null);
                  }}
                  disabled={isRemoving}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: "var(--rose)", borderColor: "var(--rose)" }}
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
