import React, { useState, useEffect } from "react";
import { getAssessments, assignExam } from "../api";
// Assuming there's a way to get employees, for now we will just use a hardcoded or a fetched list
// Wait, we need to fetch employees to assign exams.
// Let's assume there is a fetchUsers or similar. Let's check api.ts if there's a way to fetch users.

export function AdminExams() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // We will just do a simple UI to list templates and a button to "Assign to All" or "Assign to Employee"
  // For simplicity since I don't have get_users API available, I will just prompt for an employee ID.

  useEffect(() => {
    loadAssessments();
  }, []);

  const loadAssessments = async () => {
    setLoading(true);
    try {
      const data = await getAssessments();
      setAssessments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (assessmentId: string) => {
    const empId = prompt("Enter Employee UUID to assign this exam to:");
    if (!empId) return;

    try {
      await assignExam(assessmentId, [empId]);
      alert("Exam assigned successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to assign exam.");
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
                        onClick={() => handleAssign(a.id)}
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
    </div>
  );
}
