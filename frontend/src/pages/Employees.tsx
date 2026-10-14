import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Employee, Department, getEmployees, getDepartments, createEmployee, updateEmployeePin, deleteEmployee, verifyAdminPassword, storeFaceEmbedding } from "../api";
import { WebcamCapture } from "../components/WebcamCapture";

export function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: "asc" | "desc" } | null>(null);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<"form" | "capture" | "credential">("form");
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [name, setName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [formPhoto, setFormPhoto] = useState<string | null>(null);
  
  // Credential & Capture State
  const [newEmp, setNewEmp] = useState<Employee | null>(null);
  const [captureTarget, setCaptureTarget] = useState<Employee | null>(null);

  // Dedicated Photo Upload & Management State
  const [photoTarget, setPhotoTarget] = useState<Employee | null>(null);
  const [photoModalTab, setPhotoModalTab] = useState<"upload" | "webcam">("upload");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Custom Dialog States
  const [dialog, setDialog] = useState<{
    type: "none" | "alert" | "confirmDelete" | "promptPin" | "promptAdminVerify";
    title?: string;
    message?: string;
    targetEmp?: Employee;
  }>({ type: "none" });
  const [pinInput, setPinInput] = useState("");
  const [adminPassInput, setAdminPassInput] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (employees.length === 0) setLoading(true);
    try {
      const [emps, deps] = await Promise.all([getEmployees(), getDepartments()]);
      setEmployees(emps);
      setDepartments(deps);
      if (deps.length > 0 && !deptCode) {
        setDeptCode(deps[0].code);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !deptCode || !designation) return;
    
    setSaving(true);
    try {
      const dep = departments.find(d => d.code === deptCode);
      const emp = await createEmployee(name, deptCode, dep?.name || "", designation);
      setNewEmp(emp);
      if (formPhoto) {
        await storeFaceEmbedding(emp.id, null, formPhoto);
      }
      await loadData();
      if (formPhoto) {
        setStep("credential");
      } else {
        setStep("capture");
      }
    } catch (err: any) {
      alert(`Error creating employee: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const openPhotoModal = (emp: Employee) => {
    setPhotoTarget(emp);
    setPreviewPhoto(emp.photo || null);
    setPhotoModalTab("upload");
  };

  const closePhotoModal = () => {
    setPhotoTarget(null);
    setPreviewPhoto(null);
    setUploadingPhoto(false);
  };

  const handleFilePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (PNG, JPG, JPEG, WEBP)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveUploadedPhoto = async () => {
    const target = photoTarget || newEmp;
    if (!target || !previewPhoto) return;
    setUploadingPhoto(true);
    try {
      await storeFaceEmbedding(target.id, null, previewPhoto);
      await loadData();
      if (newEmp) {
        setStep("credential");
      } else {
        closePhotoModal();
      }
    } catch (err: any) {
      alert(`Error saving photo: ${err.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCaptureComplete = async (embedding: number[], photoBase64: string) => {
    try {
      const target = newEmp || photoTarget || captureTarget;
      if (target) {
        await storeFaceEmbedding(target.id, embedding, photoBase64);
        await loadData();
      }
      if (newEmp) {
        setStep("credential");
      } else {
        closePhotoModal();
        setCaptureTarget(null);
      }
    } catch (err: any) {
      alert(`Error saving photo: ${err.message}`);
      if (newEmp) {
        setStep("credential");
      } else {
        closePhotoModal();
        setCaptureTarget(null);
      }
    }
  };

  const handleCaptureSkip = () => {
    if (newEmp) {
      setStep("credential");
    } else {
      closePhotoModal();
      setCaptureTarget(null);
    }
  };


  const handleCloseModal = () => {
    setShowModal(false);
    setTimeout(() => {
      setStep("form");
      setName("");
      setDesignation("");
      setFormPhoto(null);
      setNewEmp(null);
      setCaptureTarget(null);
      setPreviewPhoto(null);
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
    setAdminPassInput("");
    setDialog({ type: "promptPin", title: "Change PIN", targetEmp: emp });
  };

  const submitChangePin = async () => {
    const emp = dialog.targetEmp;
    if (!emp) return;
    
    if (!adminPassInput) {
      setDialog({ type: "alert", title: "Error", message: "Admin password is required." });
      return;
    }
    
    if (pinInput && pinInput.length === 6 && /^\d+$/.test(pinInput)) {
      try {
        const isValid = await verifyAdminPassword(adminPassInput);
        if (!isValid) {
          setDialog({ type: "alert", title: "Error", message: "Incorrect admin password." });
          return;
        }
        
        setDialog({ type: "none" });
        await updateEmployeePin(emp.id, pinInput);
        await loadData();
      } catch (err) {
        setDialog({ type: "alert", title: "Error", message: "Failed to update PIN." });
      }
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
    try {
      await deleteEmployee(emp.id);
      await loadData();
    } catch (err) {
      setDialog({ type: "alert", title: "Error", message: "Failed to delete employee." });
    }
  };
  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const filteredEmployees = [...employees]
    .filter(emp => 
      (emp.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (emp.id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.designation || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.departmentName || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a: any, b: any) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      const aVal = a[key] || "";
      const bVal = b[key] || "";
      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });

  const getInitials = (fullName: string) => {
    if (!fullName) return "EMP";
    const parts = fullName.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "EMP";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

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
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Employees</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Manage workforce access and certification history.</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <iconify-icon icon="lucide:search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
            <input
              type="text"
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "8px 12px 8px 36px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 13, width: 220 }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <iconify-icon icon="lucide:user-plus" style={{ marginRight: 6 }} />
            Add Employee
          </button>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {renderSortableHeader("Employee ID", "id")}
                {renderSortableHeader("Name", "name")}
                {renderSortableHeader("Job Title", "job_title")}
                {renderSortableHeader("Department", "department_name")}
                <th>Photo</th>
                <th>Status</th>
                <th>Last Certified</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No employees found matching your search.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => (
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
                      {emp.photo ? (
                        <div
                          style={{ position: "relative", width: 36, height: 36, cursor: "pointer", display: "inline-block" }}
                          onClick={() => openPhotoModal(emp)}
                          title="Click to view or change picture"
                        >
                          <img
                            src={emp.photo}
                            alt={emp.name}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              objectFit: "cover",
                              border: "2px solid var(--emerald)",
                              boxShadow: "0 2px 6px rgba(16, 185, 129, 0.25)"
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              bottom: -2,
                              right: -2,
                              width: 13,
                              height: 13,
                              borderRadius: "50%",
                              background: "var(--emerald)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 8,
                              color: "#fff",
                              fontWeight: "bold"
                            }}
                          >
                            ✓
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{ position: "relative", width: 36, height: 36, cursor: "pointer", display: "inline-block" }}
                          onClick={() => openPhotoModal(emp)}
                          title="No picture yet. Click to add picture"
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: emp.face_embedding_stored ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
                              border: emp.face_embedding_stored ? "1.5px dashed var(--emerald)" : "1.5px dashed var(--border-subtle)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: emp.face_embedding_stored ? "var(--emerald)" : "var(--text-tertiary)",
                              fontSize: 11,
                              fontWeight: 600
                            }}
                          >
                            {getInitials(emp.name)}
                          </div>
                          <span
                            style={{
                              position: "absolute",
                              bottom: -2,
                              right: -2,
                              width: 13,
                              height: 13,
                              borderRadius: "50%",
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              color: "var(--cyan)",
                              fontWeight: "bold"
                            }}
                          >
                            +
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${emp.status === 'Active' ? 'badge-emerald' : 'badge-crimson'}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-tertiary)" }}>
                      {emp.lastCertified || "Never"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
                          onClick={() => {
                            localStorage.removeItem("aegis_active_draft_id");
                            window.history.pushState({}, "", `/admin/exams/new?employee_id=${emp.id}`);
                            window.dispatchEvent(new PopStateEvent("popstate"));
                          }}
                        >
                          <iconify-icon icon="lucide:clipboard-check" style={{ fontSize: 13 }} />
                          Assign Exam
                        </button>
                        <button 
                          className="btn btn-ghost" 
                          style={{ padding: "4px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }} 
                          title="Add or update photo" 
                          onClick={() => openPhotoModal(emp)}
                        >
                          <iconify-icon icon="lucide:camera" style={{ fontSize: 13 }} />
                          Photo
                        </button>
                        <button 
                          className="btn btn-ghost" 
                          style={{ padding: "4px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }} 
                          title="Change employee PIN" 
                          onClick={() => openChangePin(emp)}
                        >
                          <iconify-icon icon="lucide:key" style={{ fontSize: 13 }} />
                          PIN
                        </button>
                        <button 
                          className="btn btn-ghost" 
                          style={{ padding: "4px 8px", fontSize: 11, color: "var(--crimson)", display: "inline-flex", alignItems: "center" }} 
                          title="Delete Employee" 
                          onClick={() => openDelete(emp)}
                        >
                          <iconify-icon icon="lucide:trash-2" style={{ fontSize: 13 }} />
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

                  <div className="field-group">
                    <label className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Profile Picture (Optional)</span>
                      {formPhoto && (
                        <button 
                          type="button" 
                          onClick={() => setFormPhoto(null)} 
                          style={{ background: "none", border: "none", color: "var(--crimson)", fontSize: 11, cursor: "pointer", padding: 0 }}
                        >
                          Remove
                        </button>
                      )}
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {formPhoto ? (
                        <img 
                          src={formPhoto} 
                          alt="Employee preview" 
                          style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--emerald)", boxShadow: "0 2px 6px rgba(16, 185, 129, 0.2)" }} 
                        />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--void-3)", border: "1px dashed var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                          <iconify-icon icon="lucide:user" style={{ fontSize: 20 }} />
                        </div>
                      )}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                        <input
                          type="file"
                          id="add-emp-photo-input"
                          accept="image/png,image/jpeg,image/webp,image/jpg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => setFormPhoto(reader.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                          style={{ display: "none" }}
                        />
                        <label 
                          htmlFor="add-emp-photo-input" 
                          className="btn btn-secondary" 
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "5px 12px", width: "fit-content" }}
                        >
                          <iconify-icon icon="lucide:upload" /> {formPhoto ? "Change Picture" : "Choose Picture"}
                        </label>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Upload JPG, PNG or WEBP from your device</span>
                      </div>
                    </div>
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
            ) : step === "capture" ? (
              <motion.div
                key="capture"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card glass-panel"
                style={{ width: "100%", maxWidth: 640, padding: 24, overflow: "hidden" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Enroll Face Photo</h2>
                  <button className="btn btn-ghost" onClick={handleCaptureSkip} style={{ padding: "4px 12px", fontSize: 13 }}>
                    Skip for now
                  </button>
                </div>
                <WebcamCapture 
                  onEmbeddingCaptured={handleCaptureComplete} 
                  onCancel={handleCaptureSkip}
                  employeeName={newEmp?.name || "Employee"} 
                />
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
                    Enter admin password to authorize:
                  </p>
                  <input
                    type="password"
                    className="field-input"
                    placeholder="Admin Password"
                    value={adminPassInput}
                    onChange={(e) => setAdminPassInput(e.target.value)}
                    style={{ textAlign: "center", fontSize: 16, width: "100%", marginBottom: 16 }}
                  />
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
         {/* Dedicated Photo Modal (Upload File or Webcam Capture) */}
      <AnimatePresence>
        {photoTarget && (
          <div className="qr-modal-overlay" style={{ zIndex: 10000 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card glass-panel"
              style={{ width: "100%", maxWidth: 520, padding: 24 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    {photoTarget.photo ? "Manage Photo" : "Add Photo"}
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--cyan)", margin: "4px 0 0 0" }}>
                    {photoTarget.name} ({photoTarget.id})
                  </p>
                </div>
                <button className="btn btn-ghost" onClick={closePhotoModal} style={{ padding: 6 }}>
                  <iconify-icon icon="lucide:x" style={{ fontSize: 18 }} />
                </button>
              </div>

              {/* Tabs: Upload File vs Webcam */}
              <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
                <button
                  type="button"
                  style={{
                    padding: "8px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: photoModalTab === "upload" ? "2px solid var(--indigo-400)" : "2px solid transparent",
                    color: photoModalTab === "upload" ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: photoModalTab === "upload" ? 600 : 400,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}
                  onClick={() => setPhotoModalTab("upload")}
                >
                  <iconify-icon icon="lucide:upload" /> Upload Picture File
                </button>
                <button
                  type="button"
                  style={{
                    padding: "8px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: photoModalTab === "webcam" ? "2px solid var(--indigo-400)" : "2px solid transparent",
                    color: photoModalTab === "webcam" ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: photoModalTab === "webcam" ? 600 : 400,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}
                  onClick={() => setPhotoModalTab("webcam")}
                >
                  <iconify-icon icon="lucide:camera" /> Use Webcam
                </button>
              </div>

              {photoModalTab === "upload" ? (
                <div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                    {previewPhoto ? (
                      <div style={{ position: "relative" }}>
                        <img
                          src={previewPhoto}
                          alt={photoTarget.name}
                          style={{
                            width: 170,
                            height: 170,
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "3px solid var(--emerald)",
                            boxShadow: "0 6px 20px rgba(16, 185, 129, 0.25)"
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto(null)}
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "rgba(0,0,0,0.75)",
                            border: "1px solid var(--border)",
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                          title="Clear preview"
                        >
                          <iconify-icon icon="lucide:x" style={{ fontSize: 14 }} />
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="emp-photo-upload-input"
                        style={{
                          width: "100%",
                          padding: "36px 20px",
                          borderRadius: 12,
                          border: "2px dashed var(--border-subtle)",
                          background: "rgba(255, 255, 255, 0.02)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          gap: 10,
                          transition: "all 0.2s"
                        }}
                      >
                        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--indigo-400)" }}>
                          <iconify-icon icon="lucide:image-plus" style={{ fontSize: 24 }} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                          Click to select a picture
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          Supports JPG, PNG, WEBP (under 5MB)
                        </span>
                      </label>
                    )}

                    <input
                      id="emp-photo-upload-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/jpg"
                      onChange={handleFilePhotoSelect}
                      style={{ display: "none" }}
                    />

                    {previewPhoto && (
                      <label htmlFor="emp-photo-upload-input" className="btn btn-secondary" style={{ cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <iconify-icon icon="lucide:refresh-cw" /> Choose Different Picture
                      </label>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
                    <button type="button" className="btn btn-ghost" onClick={closePhotoModal}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!previewPhoto || uploadingPhoto || previewPhoto === photoTarget.photo}
                      onClick={handleSaveUploadedPhoto}
                    >
                      {uploadingPhoto ? "Saving..." : "Save Picture"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ overflow: "hidden" }}>
                  <WebcamCapture
                    onEmbeddingCaptured={handleCaptureComplete}
                    onCancel={closePhotoModal}
                    employeeName={photoTarget.name}
                  />
                </div>
              )}
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
