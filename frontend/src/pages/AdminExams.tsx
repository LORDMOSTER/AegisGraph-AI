import React, { useState, useEffect } from "react";
import { getAllAssignedExams, deleteAssignedExam, grantRetake } from "../api";
import { AnimatePresence, motion } from "framer-motion";

export function AdminExams() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: "asc" | "desc" } | null>(null);
  
  // Custom Modal State
  const [examToRemove, setExamToRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [examToReset, setExamToReset] = useState<string | null>(null);
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

  const handleConfirmReset = async () => {
    if (!examToReset) return;
    setIsResetting(true);
    setErrorMessage(null);
    try {
      await grantRetake(examToReset);
      await loadData();
      setExamToReset(null);
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to grant retake.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const filteredExams = [...exams]
    .filter((e: any) => 
      (e.employee_name && e.employee_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.employee_id && e.employee_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.assessment_name && e.assessment_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.status && String(e.status).toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a: any, b: any) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      let aVal = a[key] || "";
      let bVal = b[key] || "";
      if (key === "assigned_at") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });

  const renderSortableHeader = (label: string, key: string) => (
    <th onClick={() => handleSort(key)} style={{ cursor: "pointer", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {sortConfig?.key === key ? (
          <iconify-icon icon={sortConfig.direction === "asc" ? "lucide:chevron-up" : "lucide:chevron-down"} style={{ fontSize: 14 }} />
        ) : (
          <iconify-icon icon="lucide:chevrons-up-down" style={{ fontSize: 14, color: "var(--text-tertiary)", opacity: 0.5 }} />
        )}
      </div>
    </th>
  );

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Assigned Exams</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Manage exams currently assigned to employees.</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <iconify-icon icon="lucide:search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
            <input
              type="text"
              placeholder="Search exams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "8px 12px 8px 36px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 13, width: 220 }}
            />
          </div>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {renderSortableHeader("Employee ID", "employee_id")}
                {renderSortableHeader("Employee Name", "employee_name")}
                {renderSortableHeader("Assessment Name", "assessment_name")}
                {renderSortableHeader("Status", "status")}
                {renderSortableHeader("Assigned At", "assigned_at")}
                <th>Enable Attempt</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {filteredExams.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No assigned exams found matching your search.
                  </td>
                </tr>
              ) : (
                filteredExams.map((e: any) => (
                  <tr key={e.exam_session_id}>
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: "var(--cyan)" }}>
                        {e.employee_id || "N/A"}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{e.employee_name}</td>
                    <td>{e.assessment_name}</td>
                    <td>
                      <span className={`badge badge-${String(e.status).toUpperCase() === 'COMPLETED' ? 'emerald' : String(e.status).toUpperCase() === 'FAILED' ? 'rose' : 'amber'}`}>
                        {e.status}
                      </span>
                    </td>
                    <td>{new Date(e.assigned_at).toLocaleString()}</td>
                    <td>
                      {String(e.status).toUpperCase() === 'RETAKE_REQUESTED' && (
                        <button 
                          className="btn btn-ghost"
                          style={{ color: "var(--emerald)", border: "1px solid var(--emerald-dim)" }}
                          onClick={() => setExamToReset(e.exam_session_id)}
                          disabled={isResetting}
                        >
                          Enable Attempt
                        </button>
                      )}
                    </td>
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

        {examToReset && (
          <div 
            style={{ position: "fixed", inset: 0, zIndex: 10001, display: "grid", placeItems: "center", background: "rgba(28,28,26,0.2)", backdropFilter: "blur(4px)", padding: 20 }}
            onClick={(e) => { if (e.target === e.currentTarget) setExamToReset(null); }}
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
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", display: "grid", placeItems: "center", flexShrink: 0, color: "#10b981" }}>
                  <iconify-icon icon="lucide:refresh-cw" style={{ fontSize: 20 }} />
                </div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                    Enable Attempt
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                    Are you sure you want to enable a new attempt for this user? This will reset their progress.
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
                    setExamToReset(null);
                    setErrorMessage(null);
                  }}
                  disabled={isResetting}
                >
                  Cancel
                </button>
                <button
                  style={{ background: "#10b981", border: "1px solid #10b981", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 500, color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)" }}
                  onClick={handleConfirmReset}
                  disabled={isResetting}
                >
                  {isResetting ? "Processing..." : "Confirm Enable"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
