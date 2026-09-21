import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AssignedExam, Certificate, getEmployeeExams, getEmployeeCertificates } from "../api";

interface Props {
  onStartExam: (examId: string) => void;
}

const EXAM_ICONS: string[] = ["shield-alert", "lock", "hard-hat", "flame", "zap"];

export function ExamDashboard({ onStartExam }: Props) {
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [e, c] = await Promise.all([getEmployeeExams(), getEmployeeCertificates()]);
      setExams(e);
      setCerts(c);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px", width: 24, height: 24 }} />
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", borderRadius: 999, padding: "4px 12px", fontSize: 12, color: "var(--muted)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent2)", display: "inline-block" }} />
              Kiosk mode
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Employee Portal</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--ink)", marginBottom: 4, letterSpacing: "-0.01em" }}>
            Welcome back, Employee
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Complete your assigned safety certifications below.</p>
        </div>

        {/* ID strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "var(--card-radius)", padding: "12px 16px", boxShadow: "var(--shadow-card)" }}>
          <div style={{ width: 48, height: 48, borderRadius: "var(--card-radius)", background: "var(--raised)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 22, flexShrink: 0 }}>👷</div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: 2 }}>Operator ID</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>OP-KIOSK-AGX</p>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Verified · 100% Offline</p>
          </div>
        </div>
      </div>

      {/* Assigned Exams */}
      <section style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Assigned exams</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
              {exams.length} item{exams.length !== 1 ? "s" : ""} on your safety record. Complete before the due date.
            </p>
          </div>
          {exams.length > 0 && (
            <span style={{ background: "rgba(37,99,235,0.08)", color: "#1d4ed8", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 500 }}>
              {exams.length} pending
            </span>
          )}
        </div>

        {exams.length === 0 ? (
          <div style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "var(--card-radius)", padding: 40, textAlign: "center", boxShadow: "var(--shadow-card)" }}>
            <p style={{ color: "var(--muted)" }}>You have no pending exams. Great work! 🎉</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {exams.map((exam, i) => (
              <motion.div
                key={exam.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--card-radius)",
                  padding: 20,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--raised)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
                    <iconify-icon icon={`lucide:${EXAM_ICONS[i % EXAM_ICONS.length]}`} style={{ fontSize: 20, color: "var(--ink)" }} />
                  </div>
                  <span style={{ background: "var(--raised)", color: "var(--muted)", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 500 }}>Not started</span>
                </div>

                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 4, lineHeight: 1.4 }}>{exam.title}</h3>
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>{exam.topics[0]}</p>

                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "var(--muted)" }}>Questions</span>
                    <span style={{ fontWeight: 500, color: "var(--ink)" }}>{exam.totalQuestions}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>Type</span>
                    <span style={{ fontWeight: 500, color: "var(--ink)" }}>AI Monitored</span>
                  </div>
                </div>

                <button
                  style={{
                    display: "flex",
                    height: 48,
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "var(--shadow-btn)",
                    fontFamily: "var(--font-sans)",
                  }}
                  onClick={() => onStartExam(exam.id)}
                >
                  <iconify-icon icon="lucide:play" style={{ fontSize: 16 }} />
                  Start exam
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* My Certificates */}
      <section>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>My certificates</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>{certs.length} qualification{certs.length !== 1 ? "s" : ""} on file.</p>
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "var(--muted)", cursor: "pointer" }}>
            View all <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 14 }} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {certs.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>No certificates earned yet.</p>
          ) : (
            certs.map(cert => (
              <div key={cert.id} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--card-radius)", padding: 20, boxShadow: "var(--shadow-card)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--raised)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
                    <iconify-icon icon="lucide:award" style={{ fontSize: 20, color: "var(--ink)" }} />
                  </div>
                  <span style={{ background: "rgba(22,163,74,0.08)", color: "#15803d", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 500 }}>Valid</span>
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 16, lineHeight: 1.4 }}>{cert.title}</h3>
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "var(--muted)" }}>Issued</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>{new Date(cert.issueDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
