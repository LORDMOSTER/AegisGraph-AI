import { useEffect, useState } from "react";
import { AdminCertificate, getAdminCertificates, revokeCertificate } from "../api";

export function Certificates() {
  const [certs, setCerts] = useState<AdminCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const data = await getAdminCertificates();
    setCerts(data);
    setLoading(false);
  }

  const handleRevoke = async (id: string) => {
    if (window.confirm(`Are you sure you want to revoke certificate ${id}? This action cannot be undone.`)) {
      await revokeCertificate(id);
      await load();
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Issued Certificates</h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>
            Manage employee safety certifications and Ed25519 signatures.
          </p>
        </div>
      </div>

      <div className="card data-table-container glass-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Employee ID</th>
              <th>Score (SCI)</th>
              <th>Issue Date</th>
              <th>Expiry Date</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-tertiary)" }}>
                  Loading certificates...
                </td>
              </tr>
            ) : certs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-tertiary)" }}>
                  No certificates issued yet.
                </td>
              </tr>
            ) : (
              certs.map(cert => {
                let badgeClass = "badge-emerald";
                if (cert.status === "Expiring Soon") badgeClass = "badge-amber";
                if (cert.status === "Revoked") badgeClass = "badge-crimson";

                return (
                  <tr key={cert.id}>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{cert.employeeName}</td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "var(--text-secondary)" }}>{cert.employeeId}</td>
                    <td>{cert.score}%</td>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>{new Date(cert.issueDate).toLocaleDateString()}</td>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>{new Date(cert.expiryDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{cert.status}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button 
                          className="btn btn-ghost touch-target" 
                          style={{ padding: "0 12px", fontSize: 12 }}
                          onClick={() => setQrModal(cert.id)}
                        >
                          View QR
                        </button>
                        <button 
                          className="btn btn-ghost touch-target" 
                          style={{ padding: "0 12px", fontSize: 12 }}
                          onClick={() => alert("Downloading PDF...")}
                        >
                          PDF
                        </button>
                        {cert.status !== "Revoked" && (
                          <button 
                            className="btn btn-ghost touch-target" 
                            style={{ padding: "0 12px", fontSize: 12, color: "var(--crimson)" }}
                            onClick={() => handleRevoke(cert.id)}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {qrModal && (
        <div className="qr-modal-overlay">
          <div className="card glass-panel" style={{ padding: 40, textAlign: "center", maxWidth: 400, width: "100%" }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Certificate QR</h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: 13 }}>
              Scan to verify signature on the local network.
            </p>
            
            <div style={{ width: 240, height: 240, background: "white", padding: 16, margin: "0 auto 32px", borderRadius: 16 }}>
              {/* Mock QR Code UI */}
              <div style={{ width: "100%", height: "100%", border: "8px solid black", position: "relative" }}>
                 <div style={{ position: "absolute", top: 16, left: 16, width: 32, height: 32, background: "black" }} />
                 <div style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, background: "black" }} />
                 <div style={{ position: "absolute", bottom: 16, left: 16, width: 32, height: 32, background: "black" }} />
                 
                 <div style={{ position: "absolute", top: 80, left: 80, right: 80, bottom: 80, background: "black", borderRadius: 8 }} />
                 <div style={{ position: "absolute", bottom: 16, right: 16, width: 64, height: 64, display: "flex", flexWrap: "wrap", gap: 4 }}>
                   <div style={{ width: 14, height: 14, background: "black" }} />
                   <div style={{ width: 14, height: 14, background: "black" }} />
                   <div style={{ width: 14, height: 14, background: "black" }} />
                   <div style={{ width: 14, height: 14, background: "black" }} />
                 </div>
              </div>
            </div>

            <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 24, wordBreak: "break-all" }}>
              http://localhost:5173/verify/{qrModal}
            </p>

            <button className="btn btn-secondary touch-target" style={{ width: "100%", justifyContent: "center" }} onClick={() => setQrModal(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
