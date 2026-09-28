import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminCertificate, getEmployees, Employee } from "../api";

// --- ICONS ---
const ImportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const Certificates: React.FC = () => {
  const [certs, setCerts] = useState<AdminCertificate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { getAdminCertificates } = await import("../api");
        const certData = await getAdminCertificates();
        setCerts(certData);
        
        const empData = await getEmployees();
        setEmployees(empData);
      } catch (err) {
        console.error("Failed to load certificates:", err);
      }
    };
    loadData();
  }, []);

  // Modal State
  const [importEmp, setImportEmp] = useState("");
  const [importEmpId, setImportEmpId] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [importExpiry, setImportExpiry] = useState("");
  const [importScore, setImportScore] = useState("");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editCertId, setEditCertId] = useState("");
  const [editScore, setEditScore] = useState("");
  const [editExpiry, setEditExpiry] = useState("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);

  const [deleteCertId, setDeleteCertId] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteCertId) return;
    try {
      const { revokeCertificate, getAdminCertificates } = await import("../api");
      await revokeCertificate(deleteCertId);
      const data = await getAdminCertificates();
      setCerts(data);
      setDeleteCertId(null);
    } catch (e) {
      console.error(e);
      alert("Failed to delete certificate");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { updateCertificate, getAdminCertificates } = await import("../api");
      await updateCertificate(editCertId, parseFloat(editScore), editExpiry);
      const data = await getAdminCertificates();
      setCerts(data);
      setIsEditModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to update certificate.");
    }
  };

  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiringCerts = certs.filter((c) => {
    const expDate = new Date(c.expiryDate);
    return expDate > today && expDate <= thirtyDaysFromNow;
  });

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    if (!importEmpId) {
      setImportError("Please select a registered employee from the dropdown list. AI extracted name could not be exactly matched.");
      return;
    }
    setIsSaving(true);
    try {
      const { importCertificate, getAdminCertificates } = await import("../api");
      const parsedScore = importScore === "" ? null : parseFloat(importScore);
      await importCertificate(importEmpId, parsedScore, importExpiry);
      const data = await getAdminCertificates();
      setCerts(data);
      setIsModalOpen(false);
      setImportEmp("");
      setImportEmpId("");
      setImportScore("");
      setImportExpiry("");
      setImportError(null);
      setImportWarning(null);
    } catch (err) {
      console.error(err);
      setImportError("Failed to import and save certificate.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: "40px", minHeight: "100vh" }}>
      <header style={{ marginBottom: "40px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "1px solid var(--line)", paddingBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "2rem", margin: 0, fontWeight: 300, letterSpacing: "-0.02em" }}>
            CERTIFICATE <span style={{ color: "var(--accent)", fontWeight: 600 }}>VAULT</span>
          </h1>
          <p className="t-secondary" style={{ marginTop: "8px", fontSize: "0.9rem" }}>
            Manage cryptographically signed credentials and external imports.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn btn-primary"
        >
          <ImportIcon /> Import External Certificate
        </button>
      </header>

      {expiringCerts.length > 0 && (
        <div style={{ backgroundColor: "var(--amber-dim)", border: "1px solid var(--amber)", padding: "16px 20px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "12px", color: "var(--amber)", borderRadius: "var(--radius-md)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <strong>Alert:</strong> {expiringCerts.length} certificate(s) expiring within the next 30 days.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "24px" }}>
        {certs.map((cert) => {
          const d = new Date(cert.expiryDate);
          const expDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
          return (
            <div key={cert.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", gap: "16px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "1.2rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cert.employeeName}</h3>
                  <div className="t-secondary" style={{ fontSize: "0.9rem" }}>EMP-ID: {cert.employeeId}</div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  {cert.status === "Expired" && (
                    <div className="badge" style={{ backgroundColor: "rgba(255, 60, 60, 0.1)", color: "var(--error)" }}>
                      EXPIRED
                    </div>
                  )}
                  {cert.status === "Expiring Soon" && (
                    <div className="badge badge-amber">
                      EXPIRING SOON
                    </div>
                  )}
                  {cert.status === "Valid" && (
                    <div className="badge badge-emerald">
                      VALID
                    </div>
                  )}
                  {cert.isImported ? (
                    <div className="badge badge-amber">
                      IMPORTED
                    </div>
                  ) : (
                    <div className="badge badge-emerald">
                      <ShieldIcon /> NATIVE
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
                <div>
                  <div className="label" style={{ marginBottom: "4px" }}>SCI Score</div>
                  <div className="mono t-primary" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>
                    {cert.score !== null && cert.score !== undefined ? `${cert.score.toFixed(1)}%` : "N/A"}
                  </div>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: "4px" }}>Expiry</div>
                  <div className="mono t-primary" style={{ fontSize: "0.9rem", marginTop: "2px" }}>{expDate}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button 
                  onClick={() => {
                    if (cert.pdfUrl) {
                      const urlPath = cert.pdfUrl.startsWith('/') ? cert.pdfUrl : `/${cert.pdfUrl}`;
                      window.open(`http://localhost:8000${urlPath}`, '_blank');
                    } else {
                      alert("No document available for this certificate.");
                    }
                  }} 
                  className="btn" 
                  style={{ flex: 1, padding: "6px" }}
                >
                  View
                </button>
                <button 
                  onClick={() => {
                    setEditCertId(cert.id);
                    setEditScore(String(cert.score));
                    setEditExpiry(cert.expiryDate.split("T")[0]);
                    setIsEditModalOpen(true);
                  }} 
                  className="btn" 
                  style={{ flex: 1, padding: "6px" }}
                >
                  Edit
                </button>
                <button 
                  onClick={() => setDeleteCertId(cert.id)} 
                  className="btn btn-destructive" 
                  style={{ flex: 1, padding: "6px" }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="card"
              style={{ width: "500px", padding: 0, overflow: "hidden" }}
            >
              <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 500 }}>Import Certificate</h2>
                <button onClick={() => {
                  setIsModalOpen(false);
                  setImportError(null);
                  setImportWarning(null);
                }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                  <CloseIcon />
                </button>
              </div>

              <form onSubmit={handleImport} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                
                {importError && (
                  <div style={{ padding: "12px", backgroundColor: "rgba(255, 60, 60, 0.1)", border: "1px solid var(--error)", color: "var(--error)", borderRadius: "var(--radius-md)", fontSize: "0.9rem" }}>
                    {importError}
                  </div>
                )}
                
                {importWarning && (
                  <div style={{ padding: "12px", backgroundColor: "rgba(255, 170, 0, 0.1)", border: "1px solid var(--amber)", color: "var(--amber)", borderRadius: "var(--radius-md)", fontSize: "0.9rem" }}>
                    {importWarning}
                  </div>
                )}
                <div 
                  style={{ border: "1px dashed var(--line)", padding: "32px", textAlign: "center", cursor: "pointer", borderRadius: "var(--radius-md)", backgroundColor: "var(--surface)", position: "relative" }}
                >
                  <input 
                    type="file" 
                    accept="application/pdf"
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                    disabled={isAnalyzing}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsAnalyzing(true);
                      setImportError(null);
                      setImportWarning(null);
                      setImportEmp("Analyzing with AI...");
                      setImportScore("");
                      setImportExpiry("");
                      try {
                        const { analyzeCertificate } = await import("../api");
                        const data = await analyzeCertificate(file);
                        
                        const extractedName = data.employee_name || "";
                        setImportEmp(extractedName);
                        
                        // Attempt exact match
                        const empMatch = employees.find(emp => emp.name.toLowerCase() === extractedName.toLowerCase() || extractedName.toLowerCase().includes(emp.name.toLowerCase()));
                        if (empMatch) {
                            setImportEmpId(empMatch.id);
                        } else {
                            setImportEmpId("");
                        }
                        
                        setImportScore(data.score ? String(data.score) : "");
                        setImportExpiry(data.expiry_date || "");
                        
                        // Handle grounding validation display
                        let warnings = [];
                        if (data.grounding && !data.grounding.holder_name) {
                            warnings.push("Name could not be verified in the PDF text.");
                        }
                        if (data.derived_expiry) {
                            warnings.push("Expiry date was derived from validity rules.");
                        }
                        if (warnings.length > 0) {
                            setImportWarning(warnings.join(" "));
                        }
                      } catch (err) {
                        console.error(err);
                        setImportEmp("");
                        setImportError("AI extraction failed. Please fill manually.");
                      } finally {
                        setIsAnalyzing(false);
                        e.target.value = '';
                      }
                    }}
                  />
                  {isAnalyzing ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ width: 24, height: 24, border: "3px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%" }} />
                      <div style={{ color: "var(--accent)", fontWeight: 500 }}>AI is reading your document...</div>
                    </div>
                  ) : (
                    <>
                      <ImportIcon />
                      <div style={{ marginTop: "12px", fontSize: "0.9rem" }} className="t-secondary">
                        Drag & Drop PDF here or <span style={{ color: "var(--accent)" }}>browse</span>
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--muted)" }}>
                    AI will automatically extract details.
                  </div>
                </div>

                <div className="field-group" style={{ position: "relative" }}>
                  <label className="field-label">Employee Name <span style={{ fontSize: "0.7rem", color: "var(--amber)", marginLeft: 8 }}>(Please verify AI match)</span></label>
                  <select 
                    required 
                    value={importEmpId} 
                    onChange={(e) => {
                      setImportEmpId(e.target.value);
                      const emp = employees.find(emp => emp.id === e.target.value);
                      if (emp) {
                        setImportEmp(emp.name);
                      }
                    }} 
                    className="field-input" 
                  >
                    <option value="" disabled>Select an employee...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.designation ? `- ${emp.designation}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", gap: "16px" }}>
                  <div className="field-group" style={{ flex: 1 }}>
                    <label className="field-label">SCI Score</label>
                    <input type="number" step="0.1" placeholder="85.0 (Optional)" value={importScore} onChange={(e) => setImportScore(e.target.value)} className="field-input" />
                  </div>
                  <div className="field-group" style={{ flex: 1 }}>
                    <label className="field-label">Expiry Date</label>
                    <input required type="date" value={importExpiry} onChange={(e) => setImportExpiry(e.target.value)} className="field-input" />
                  </div>
                </div>

                <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" className="btn btn-primary" disabled={isAnalyzing || isSaving}>
                    {isSaving ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%" }} />
                        Saving...
                      </span>
                    ) : (
                      "Generate QR & Save"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="card"
              style={{ width: "400px", padding: 0, overflow: "hidden" }}
            >
              <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 500 }}>Edit Certificate</h2>
                <button onClick={() => setIsEditModalOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                  <CloseIcon />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div className="field-group">
                  <label className="field-label">SCI Score</label>
                  <input required type="number" step="0.1" value={editScore} onChange={(e) => setEditScore(e.target.value)} className="field-input" />
                </div>
                <div className="field-group">
                  <label className="field-label">Expiry Date</label>
                  <input required type="date" value={editExpiry} onChange={(e) => setEditExpiry(e.target.value)} className="field-input" />
                </div>
                <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" className="btn btn-primary">
                    Update
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteCertId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card"
              style={{ width: "400px", padding: "24px", textAlign: "center" }}
            >
              <h2 style={{ marginTop: 0, fontSize: "1.2rem", fontWeight: 500, color: "var(--error)" }}>Delete Certificate</h2>
              <p className="t-secondary" style={{ marginBottom: "24px" }}>
                Are you sure you want to permanently delete this certificate? This action cannot be undone.
              </p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                <button onClick={() => setDeleteCertId(null)} className="btn">
                  Cancel
                </button>
                <button onClick={confirmDelete} className="btn btn-destructive">
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Certificates;
