import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Department, getDepartments, createDepartment } from "../api";

export function Departments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Modal State
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [codeCollisionNote, setCodeCollisionNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    setLoading(true);
    const deps = await getDepartments();
    setDepartments(deps);
    setLoading(false);
  };

  // Auto-suggest code logic
  useEffect(() => {
    if (!newName) {
      setNewCode("");
      setCodeCollisionNote(null);
      return;
    }

    // Strip vowels and spaces, take first 3 letters
    let suggested = newName
      .toUpperCase()
      .replace(/[AEIOU\s]/g, "")
      .substring(0, 3);
    
    // Fallback if we stripped everything
    if (suggested.length === 0) suggested = "DPT";

    // Check collision
    const existingCodes = departments.map(d => d.code);
    if (existingCodes.includes(suggested)) {
      let suffix = 2;
      while (existingCodes.includes(`${suggested}${suffix}`)) {
        suffix++;
      }
      suggested = `${suggested}${suffix}`;
      setCodeCollisionNote(`Note: Code auto-incremented to ${suggested} to ensure uniqueness.`);
    } else {
      setCodeCollisionNote(null);
    }
    
    setNewCode(suggested);
  }, [newName, departments]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newCode) return;
    setSaving(true);
    await createDepartment(newName, newCode);
    await loadDepartments();
    setSaving(false);
    setShowModal(false);
    setNewName("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Departments</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Manage organizational units and their access codes.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Add Department
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Department Name</th>
                <th>Code</th>
                <th>Employees</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No departments found.
                  </td>
                </tr>
              ) : (
                departments.map(dep => (
                  <tr key={dep.id}>
                    <td style={{ fontWeight: 500 }}>{dep.name}</td>
                    <td>
                      <span className="badge badge-indigo" style={{ fontFamily: "var(--font-mono)" }}>
                        {dep.code}
                      </span>
                    </td>
                    <td>{dep.employeeCount}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost" style={{ padding: "4px 8px" }}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="qr-modal-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card glass-panel"
              style={{ width: "100%", maxWidth: 420, padding: 24 }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Add Department</h2>
              <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="field-group">
                  <label className="field-label">Department Name</label>
                  <input
                    required
                    type="text"
                    className="field-input"
                    placeholder="e.g. Mechanical Maintenance"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                
                <div className="field-group">
                  <label className="field-label">Department Code</label>
                  <input
                    required
                    type="text"
                    className="field-input"
                    style={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  />
                  {codeCollisionNote && (
                    <span style={{ fontSize: 11, color: "var(--amber)", marginTop: 4 }}>
                      {codeCollisionNote}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 16, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Department"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
