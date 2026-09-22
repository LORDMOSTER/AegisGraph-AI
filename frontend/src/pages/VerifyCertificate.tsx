import { useEffect, useState } from "react";
import { VerificationResult, verifyCertificate } from "../api";
import { LogoLockup, CornerMotif } from "../components/BrandAssets";

interface Props {
  certId: string;
}

export function VerifyCertificate({ certId }: Props) {
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    async function runVerify() {
      const res = await verifyCertificate(certId);
      setResult(res);
    }
    runVerify();
  }, [certId]);

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#111", position: "relative", overflow: "hidden" }}>
      
      {/* Decorative Corner Motif */}
      <CornerMotif 
        style={{ position: 'absolute', top: -50, right: -50, width: 300, height: 300, color: 'var(--brand-accent)', opacity: 0.7, zIndex: 0 }} 
      />

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 24px", position: "relative", zIndex: 10 }}>

        {/* Brand header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 48 }}>
          <LogoLockup style={{ transform: 'scale(0.8)', transformOrigin: 'left top' }} />
          <span style={{ fontSize: 14, color: "#666", fontWeight: 500 }}>Safety certification, verified.</span>
        </div>

        {/* Loading */}
        {!result && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 16px", borderTopColor: "var(--accent)" }} />
            <p style={{ fontSize: 14, color: "var(--muted)" }}>Verifying Ed25519 Signature...</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ display: 'contents' }}>
            {/* Main status card */}
            {/* Main framed card */}
            <div style={{
              background: "#FFFFFF",
              border: "3px solid var(--brand-accent)",
              borderRadius: 32,
              padding: 48,
              boxShadow: "0 20px 40px rgba(0,0,0,0.05)",
              marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
                <div style={{
                  width: 56, height: 56,
                  borderRadius: "50%",
                  background: result.isValid ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
                  border: "1px solid var(--line)",
                  display: "grid", placeItems: "center",
                  flexShrink: 0,
                }}>
                  <iconify-icon
                    icon={result.isValid ? "lucide:check" : "lucide:x"}
                    style={{ fontSize: 28, color: result.isValid ? "#16a34a" : "#dc2626" }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                      {result.isValid ? "Certificate verified" : "Certificate invalid"}
                    </h1>
                    <span style={{
                      borderRadius: 999,
                      padding: "3px 12px",
                      fontSize: 12,
                      fontWeight: 500,
                      background: result.isValid ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
                      color: result.isValid ? "#15803d" : "#b91c1c",
                    }}>
                      {result.isValid ? "Verified" : "Invalid"}
                    </span>
                  </div>

                  {result.isValid && result.certificate && (
                    <>
                      <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>
                        {result.certificate.employeeName}
                      </p>
                      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>{result.certificate.company}</p>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                        {[
                          { label: "Structured ID", value: result.certificate.employeeId, mono: true },
                          { label: "Exam score", value: `${result.certificate.score}%`, mono: false },
                          { label: "Issued", value: new Date(result.certificate.issueDate).toLocaleDateString(), mono: false },
                        ].map(item => (
                          <div key={item.label} style={{ background: "var(--base)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px" }}>
                            <p style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: 4 }}>{item.label}</p>
                            <p style={{ fontFamily: item.mono ? "var(--font-mono)" : "var(--font-display)", fontSize: item.mono ? 12 : 17, fontWeight: 600, color: "var(--ink)" }}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {!result.isValid && (
                    <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{result.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Certificate detail */}
            {result.isValid && result.certificate && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--card-radius)", boxShadow: "var(--shadow-card)", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Certificate detail</h2>
                  <span style={{ background: "rgba(37,99,235,0.08)", color: "#1d4ed8", borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 500 }}>Active</span>
                </div>
                <dl>
                  {[
                    { label: "Certificate number", value: result.certificate.id, mono: true },
                    { label: "Issuing company", value: result.certificate.company, mono: false },
                    { label: "Issued on", value: new Date(result.certificate.issueDate).toLocaleDateString(), mono: false },
                  ].map((row, i) => (
                    <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "14px 20px", borderBottom: i < 2 ? "1px solid var(--line)" : "none" }}>
                      <dt style={{ fontSize: 13, color: "var(--muted)" }}>{row.label}</dt>
                      <dd style={{ fontFamily: row.mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--ink)", textAlign: "right" }}>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Trust footer */}
            <div style={{ borderTop: "1px solid #eee", paddingTop: 24, marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "#f8f8f8", border: "1px solid #eee", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <iconify-icon icon="lucide:shield-check" style={{ fontSize: 18, color: "#111" }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 4 }}>
                    Verified at {new Date().toLocaleTimeString()}, {new Date().toLocaleDateString()}
                  </p>
                  <p style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                    This verification ran offline against a signed local copy of the certificate registry. Ed25519 signature validation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
