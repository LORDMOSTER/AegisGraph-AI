import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Employee, Department, getEmployees, getDepartments, createEmployee, updateEmployeePin, deleteEmployee } from "../api";

export function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<"form" | "credential">("form");
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [name, setName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [designation, setDesignation] = useState("");
  
  // Credential State (after save)
  const [newEmp, setNewEmp] = useState<Employee | null>(null);

  // Custom Dialog States
  const [dialog, setDialog] = useState<{
    type: "none" | "alert" | "confirmDelete" | "promptPin";
    title?: string;
    message?: string;
    targetEmp?: Employee;
  }>({ type: "none" });
  const [pinInput, setPinInput] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [emps, deps] = await Promise.all([getEmployees(), getDepartments()]);
    setEmployees(emps);
    setDepartments(deps);
    if (deps.length > 0 && !deptCode) {
      setDeptCode(deps[0].code);
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !deptCode || !designation) return;
    
    setSaving(true);
    const dep = departments.find(d => d.code === deptCode);
    const emp = await createEmployee(name, deptCode, dep?.name || "", designation);
    setNewEmp(emp);
    await loadData();
    setSaving(false);
    setStep("credential");
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setTimeout(() => {
      setStep("form");
      setName("");
      setDesignation("");
      setNewEmp(null);
    }, 300);
  };

  const handleCopy = () => {
    if (newEmp) {
      const text = `ID: ${newEmp.id}\nPIN: ${newEmp.pin}`;
      navigator.clipboard.writeText(text);
      setDialog({ type: "alert", title: "Copied", message: "Credentials copied to clipboard!" });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const openChangePin = (emp: Employee) => {
    setPinInput("");
    setDialog({ type: "promptPin", title: "Change PIN", targetEmp: emp });
  };

  const submitChangePin = async () => {
    const emp = dialog.targetEmp;
    if (!emp) return;
    if (pinInput && pinInput.length === 6 && /^\d+$/.test(pinInput)) {
      setDialog({ type: "none" });
      setLoading(true);
      await updateEmployeePin(emp.id, pinInput);
      await loadData();
    } else {
      setDialog({ type: "alert", title: "Invalid PIN", message: "PIN must be exactly 6 digits." });
    }
  };

  const openDelete = (emp: Employee) => {
    setDialog({ type: "confirmDelete", title: "Confirm Deletion", message: `Are you sure you want to delete employee ${emp.name} (${emp.id})?`, targetEmp: emp });
  };

  const submitDelete = async () => {
    const emp = dialog.targetEmp;
    if (!emp) return;
    setDialog({ type: "none" });
    setLoading(true);
    try {
      await deleteEmployee(emp.id);
      await loadData();
    } catch (err) {
      setDialog({ type: "alert", title: "Error", message: "Failed to delete employee." });
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Employees</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Manage workforce access and certification history.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Add Employee
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Job Title</th>
                <th>Department</th>
                <th>Status</th>
                <th>Last Certified</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No employees found.
                  </td>
                </tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id}>
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: "var(--cyan)" }}>
                        {emp.id}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{emp.name}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{emp.designation}</td>
                    <td>{emp.departmentName}</td>
                    <td>
                      <span className={`badge ${emp.status === 'Active' ? 'badge-emerald' : 'badge-crimson'}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-tertiary)" }}>
                      {emp.lastCertified || "Never"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => openChangePin(emp)}>Change PIN</button>
                        <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Assign Exam</button>
                        <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11, color: "var(--crimson)" }} onClick={() => openDelete(emp)}>Delete</button>
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
        {showModal && (
          <div className="qr-modal-overlay">
            {step === "form" ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card glass-panel"
                style={{ width: "100%", maxWidth: 460, padding: 24 }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Add Employee</h2>
                <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="field-group">
                    <label className="field-label">Full Name</label>
                    <input required type="text" className="field-input" placeholder="e.g. Robert Hawkins" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  
                  <div className="field-group">
                    <label className="field-label">Department</label>
                    {departments.length === 0 ? (
                      <div style={{ color: "var(--amber)", fontSize: 12 }}>Please create a department first.</div>
                    ) : (
                      <select required className="field-select" value={deptCode} onChange={e => setDeptCode(e.target.value)}>
                        {departments.map(d => (
                          <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="field-group">
                    <label className="field-label">Designation</label>
                    <input required type="text" className="field-input" placeholder="e.g. Line Operator" value={designation} onChange={e => setDesignation(e.target.value)} />
                  </div>

                  <div style={{ display: "flex", gap: 12, marginTop: 16, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-ghost" onClick={handleCloseModal}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving || departments.length === 0}>
                      {saving ? "Generating..." : "Generate Credentials"}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="credential"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="print-only"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 400 }}
              >
                <div style={{ textAlign: "center", marginBottom: 16, color: "var(--text-primary)" }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>Employee Registered</h2>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Please print or copy these credentials.</p>
                </div>

                {/* The Credential Badge (Printed) */}
                <div className="card glass-panel" style={{ width: "100%", padding: 32, position: "relative", overflow: "hidden", border: "1px solid var(--border-indigo)" }}>
                  <div className="glow-corner-tl" style={{ opacity: 0.5 }} />
                  <div className="glow-corner-br" style={{ opacity: 0.5 }} />
                  
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, position: "relative", zIndex: 1 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--void-3)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                      👤
                    </div>
                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{newEmp?.name}</h3>
                      <p style={{ fontSize: 12, color: "var(--cyan)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>{newEmp?.designation}</p>
                    </div>
                  </div>

                  <div style={{ background: "rgba(5, 5, 7, 0.6)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)", marginBottom: 16, position: "relative", zIndex: 1 }}>
                    <label style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Employee ID</label>
                    <div className="mono" style={{ fontSize: 20, color: "var(--text-primary)", letterSpacing: "0.05em", marginBottom: 12 }}>
                      {newEmp?.id}
                    </div>
                    <label style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>6-Digit PIN</label>
                    <div className="mono" style={{ fontSize: 24, color: "var(--emerald)", letterSpacing: "0.2em", fontWeight: 700 }}>
                      {newEmp?.pin}
                    </div>
                  </div>
                  
                  <div style={{ textAlign: "center", fontSize: 10, color: "var(--text-disabled)", position: "relative", zIndex: 1 }}>
                    AegisGraph AI · Offline Access Credential
                  </div>
                </div>

                {/* Actions (Not printed) */}
                <div style={{ display: "flex", gap: 12, marginTop: 24, width: "100%" }} className="no-print">
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleCopy}>
                    Copy
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handlePrint}>
                    Print Badge
                  </button>
                </div>
                
                <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={handleCloseModal}>
                  Close
                </button>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Custom Dialog Modals */}
      <AnimatePresence>
        {dialog.type !== "none" && (
          <div className="qr-modal-overlay" style={{ zIndex: 9999 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card glass-panel"
              style={{ width: "100%", maxWidth: 400, padding: 24, textAlign: "center" }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>{dialog.title}</h3>
              
              {dialog.message && (
                <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.5 }}>{dialog.message}</p>
              )}

              {dialog.type === "promptPin" && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                    Enter new 6-digit PIN for {dialog.targetEmp?.name}:
                  </p>
                  <input
                    type="password"
                    className="field-input"
                    placeholder="******"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    style={{ textAlign: "center", fontSize: 20, letterSpacing: "0.2em", width: "100%" }}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                {dialog.type !== "alert" && (
                  <button className="btn btn-ghost" onClick={() => setDialog({ type: "none" })}>
                    Cancel
                  </button>
                )}
                {dialog.type === "alert" && (
                  <button className="btn btn-primary" onClick={() => setDialog({ type: "none" })}>
                    OK
                  </button>
                )}
                {dialog.type === "confirmDelete" && (
                  <button className="btn btn-primary" style={{ background: "var(--crimson)", borderColor: "var(--crimson)" }} onClick={submitDelete}>
                    Delete
                  </button>
                )}
                {dialog.type === "promptPin" && (
                  <button className="btn btn-primary" onClick={submitChangePin}>
                    Save PIN
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Hide actions in print mode */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
