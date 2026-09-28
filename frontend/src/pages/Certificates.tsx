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
    import("../api").then(({ getAdminCertificates }) => {
      getAdminCertificates().then(data => {
        setCerts(data);
      }).catch(err => console.error("Failed to load certificates:", err));
    });
    getEmployees().then(data => setEmployees(data)).catch(console.error);
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
    try {
      const { importCertificate, getAdminCertificates } = await import("../api");
      await importCertificate(importEmp, parseFloat(importScore) || 0, importExpiry);
      const data = await getAdminCertificates();
      setCerts(data);
      setIsModalOpen(false);
      setImportEmp("");
      setImportEmpId("");
      setImportScore("");
      setImportExpiry("");
    } catch (err) {
      console.error(err);
      alert("Failed to import and save certificate.");
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
          const expDate = new Date(cert.expiryDate).toLocaleDateString();
          return (
            <div key={cert.id} className="card" style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: "24px", right: "24px" }}>
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

              <div style={{ marginBottom: "24px", paddingRight: "100px" }}>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "1.2rem", fontWeight: 500 }}>{cert.employeeName}</h3>
                <div className="t-secondary" style={{ fontSize: "0.9rem" }}>EMP-ID: {cert.employeeId}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
                <div>
                  <div className="label" style={{ marginBottom: "4px" }}>SCI Score</div>
                  <div className="mono t-primary" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>{cert.score.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: "4px" }}>Expiry</div>
                  <div className="mono t-primary" style={{ fontSize: "0.9rem", marginTop: "2px" }}>{expDate}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
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
                  onClick={async () => {
                    const { revokeCertificate, getAdminCertificates } = await import("../api");
                    try {
                      await revokeCertificate(cert.id);
                      const data = await getAdminCertificates();
                      setCerts(data);
                    } catch (e) {
                      console.error(e);
                      alert("Failed to delete certificate");
                    }
                  }} 
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
                <button onClick={() => setIsModalOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                  <CloseIcon />
                </button>
              </div>

              <form onSubmit={handleImport} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div 
                  style={{ border: "1px dashed var(--line)", padding: "32px", textAlign: "center", cursor: "pointer", borderRadius: "var(--radius-md)", backgroundColor: "var(--surface)", position: "relative" }}
                >
                  <input 
                    type="file" 
                    accept="application/pdf"
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImportEmp("Analyzing with AI...");
                      setImportScore("");
                      setImportExpiry("");
                      try {
                        const { analyzeCertificate } = await import("../api");
                        const data = await analyzeCertificate(file);
                        
                        setImportEmp(data.employee_name || "");
                        setImportScore(data.score ? String(data.score) : "");
                        setImportExpiry(data.expiry_date || "");
                        
                        // Handle grounding validation display (mocked state usage)
                        if (data.grounding) {
                            if (!data.grounding.holder_name) {
                                alert("Warning: Name could not be verified in the PDF text. Please double check.");
                            }
                        }
                        if (data.derived_expiry) {
                            alert("Note: Expiry date was derived from validity rules. Please confirm.");
                        }
                      } catch (err) {
                        console.error(err);
                        setImportEmp("");
                        alert("AI extraction failed. Please fill manually.");
                      }
                    }}
                  />
                  <ImportIcon />
                  <div style={{ marginTop: "12px", fontSize: "0.9rem" }} className="t-secondary">
                    Drag & Drop PDF here or <span style={{ color: "var(--accent)" }}>browse</span>
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--muted)" }}>
                    AI will automatically extract details.
                  </div>
                </div>

                <div className="field-group" style={{ position: "relative" }}>
                  <label className="field-label">Employee Name <span style={{ fontSize: "0.7rem", color: "var(--amber)", marginLeft: 8 }}>(Please verify AI match)</span></label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Search and select an employee..." 
                    value={importEmp} 
                    onChange={(e) => {
                      setImportEmp(e.target.value);
                      setIsDropdownOpen(true);
                    }} 
                    onFocus={() => setIsDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                    className="field-input" 
                  />
                  {isDropdownOpen && employees.length > 0 && (
                    <div style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: "4px",
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "var(--shadow-dropdown)",
                      maxHeight: "200px",
                      overflowY: "auto",
                      zIndex: 1000
                    }}>
                      {employees
                        .filter(emp => emp.name.toLowerCase().includes(importEmp.toLowerCase()))
                        .map(emp => (
                          <div
                            key={emp.id}
                            onClick={() => {
                              setImportEmp(emp.name);
                              setImportEmpId(emp.id);
                              setIsDropdownOpen(false);
                            }}
                            style={{
                              padding: "10px 14px",
                              cursor: "pointer",
                              borderBottom: "1px solid var(--line)"
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--raised)"}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                          >
                            <div style={{ fontWeight: 500, color: "var(--ink)" }}>{emp.name}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{emp.designation}</div>
                          </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "16px" }}>
                  <div className="field-group" style={{ flex: 1 }}>
                    <label className="field-label">SCI Score</label>
                    <input required type="number" step="0.1" placeholder="85.0" value={importScore} onChange={(e) => setImportScore(e.target.value)} className="field-input" />
                  </div>
                  <div className="field-group" style={{ flex: 1 }}>
                    <label className="field-label">Expiry Date</label>
                    <input required type="date" value={importExpiry} onChange={(e) => setImportExpiry(e.target.value)} className="field-input" />
                  </div>
                </div>

                <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" className="btn btn-primary" disabled={importEmp === "Analyzing with AI..."}>
                    Generate QR & Save
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
    </div>
  );
};

export default Certificates;
