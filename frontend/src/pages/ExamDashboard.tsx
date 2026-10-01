import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getMyExams, getMyCertificates, requestRetake } from "../api";

export interface AssignedExam {
  id: string;
  title: string;
  topics: string[];
  totalQuestions: number;
  status: string;
  score: number | null;
  revealScoreToUser: boolean;
  assignedAt: string;
}

export interface Certificate {
  id: string;
  title: string;
  issueDate: string;
}
interface Props {
  onStartExam: (examId: string) => void;
  userProfile?: any;
}

const EXAM_ICONS: string[] = ["shield-alert", "lock", "hard-hat", "flame", "zap"];

export function ExamDashboard({ onStartExam, userProfile }: Props) {
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [e, c] = await Promise.all([getMyExams(), getMyCertificates()]);
    
    const parsedExams = e.map(exam => ({
      id: exam.exam_session_id,
      title: exam.assessment_name,
      topics: ["General Safety"],
      totalQuestions: exam.total_questions,
      status: exam.status,
      score: exam.score,
      revealScoreToUser: exam.reveal_score_to_user ?? false,
      assignedAt: exam.assigned_at
    })).sort((a, b) => new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime());

    setExams(parsedExams);
    setCerts(c.map(cert => ({
      id: cert.id,
      title: cert.assessment_name + " Certificate",
      issueDate: cert.issued_at
    })));
    setLoading(false);
    
    if (parsedExams.some(ex => ex.status === "assigned" || ex.status === "in_progress")) {
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px", width: 32, height: 32, borderTopColor: "var(--accent)" }} />
        <p style={{ color: "var(--muted)", fontSize: 15, fontWeight: 500 }}>Initializing your workspace...</p>
      </div>
    );
  }

  // Group exams by title to determine attempt count
  const groupedExams: Record<string, AssignedExam[]> = {};
  exams.forEach(ex => {
    if (!groupedExams[ex.title]) groupedExams[ex.title] = [];
    groupedExams[ex.title].push(ex);
  });

  const pendingCount = exams.filter(e => e.status === "assigned" || e.status === "in_progress").length;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 32px", position: "relative", minHeight: "100vh" }}>
      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            style={{
              position: "fixed",
              bottom: 32,
              right: 32,
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "white",
              padding: "16px 24px",
              borderRadius: "12px",
              boxShadow: "0 12px 24px rgba(37, 99, 235, 0.25)",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontWeight: 600,
              border: "1px solid rgba(255,255,255,0.1)"
            }}
          >
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "50%", width: 32, height: 32, display: "grid", placeItems: "center" }}>
              <iconify-icon icon="lucide:bell-ring" style={{ fontSize: 18 }} />
            </div>
            You have {pendingCount} pending task{pendingCount !== 1 ? 's' : ''} to complete!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 56 }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 999, padding: "4px 12px", fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", display: "inline-block", boxShadow: "0 0 8px #3b82f6" }} />
              Kiosk mode
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Employee Portal</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em" }}>
            Welcome back, {userProfile?.full_name || "Operator"}
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-secondary)" }}>Complete your assigned safety certifications to maintain compliance.</p>
        </div>

        {/* Premium ID strip */}
        <div className="glass-panel" style={{ display: "flex", alignItems: "center", gap: 20, borderRadius: 16, padding: "16px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid var(--border-subtle)", background: "var(--surface-raised)" }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg, #1e293b, #0f172a)", border: "1px solid rgba(255,255,255,0.05)", display: "grid", placeItems: "center", fontSize: 28, flexShrink: 0, boxShadow: "inset 0 2px 10px rgba(255,255,255,0.05)", overflow: "hidden" }}>
            {userProfile?.photo ? (
              <img src={userProfile.photo} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "👷"
            )}
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 4 }}>{userProfile?.designation || "Operator"} ID</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em", textShadow: "0 2px 10px rgba(255,255,255,0.1)" }}>{userProfile?.employee_code || "OP-KIOSK-AGX"}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
              <iconify-icon icon="lucide:shield-check" style={{ color: "#10b981", fontSize: 14 }} />
              <p style={{ fontSize: 11, color: "var(--emerald)", fontWeight: 500 }}>Verified · 100% Offline</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Assigned Exams */}
      <section style={{ marginBottom: 64 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Safety Assessments</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>
              {Object.keys(groupedExams).length} assessment track{Object.keys(groupedExams).length !== 1 ? "s" : ""} on your record.
            </p>
          </div>
          {pendingCount > 0 && (
            <span style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <iconify-icon icon="lucide:alert-circle" /> {pendingCount} Action Required
            </span>
          )}
        </div>

        {Object.keys(groupedExams).length === 0 ? (
          <div className="glass-panel" style={{ borderRadius: 16, padding: 60, textAlign: "center", border: "1px dashed var(--border-subtle)" }}>
            <div style={{ width: 64, height: 64, background: "rgba(16, 185, 129, 0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <iconify-icon icon="lucide:check-circle" style={{ fontSize: 32, color: "#10b981" }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>All caught up!</h3>
            <p style={{ color: "var(--muted)" }}>You have no pending exams. Great work maintaining safety compliance.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
            {Object.entries(groupedExams).map(([title, sessions], i) => {
              const attemptNumber = sessions.length;
              const latestSession = sessions[sessions.length - 1]; // Because we sorted by assignedAt
              
              const isPending = latestSession.status === "assigned" || latestSession.status === "in_progress";
              const isPassed = latestSession.status === "completed";
              const isFailed = latestSession.status === "failed";
              const isRetakeRequested = latestSession.status === "retake_requested";
              
              return (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                  className="glass-panel"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 16,
                    padding: 24,
                    position: "relative",
                    overflow: "hidden",
                    border: isPending ? "1px solid rgba(59, 130, 246, 0.4)" : "1px solid var(--border-subtle)",
                    boxShadow: isPending ? "0 8px 32px rgba(59, 130, 246, 0.1)" : "var(--shadow-card)",
                  }}
                >
                  {isPending && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, #3b82f6, #60a5fa)" }} />
                  )}
                  
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
                      <iconify-icon icon={`lucide:${EXAM_ICONS[i % EXAM_ICONS.length]}`} style={{ fontSize: 24, color: isPending ? "#3b82f6" : "var(--ink)" }} />
                    </div>
                    
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span style={{ 
                        background: isPassed ? "rgba(16, 185, 129, 0.1)" : isFailed ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)", 
                        color: isPassed ? "#10b981" : isFailed ? "#ef4444" : "#3b82f6", 
                        border: `1px solid ${isPassed ? 'rgba(16, 185, 129, 0.2)' : isFailed ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                        borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" 
                      }}>
                        {latestSession.status.replace("_", " ")}
                      </span>
                      {(latestSession.score !== null && latestSession.revealScoreToUser) && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: isPassed ? "#10b981" : "#ef4444" }}>
                          Score: {latestSession.score.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 8, lineHeight: 1.3 }}>{title}</h3>
                  
                  <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                    <span style={{ background: "var(--surface-highlight)", color: "var(--text-secondary)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border-muted)" }}>
                      {latestSession.topics[0]}
                    </span>
                    <span style={{ background: "var(--surface-highlight)", color: "var(--text-secondary)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border-muted)" }}>
                      AI Monitored
                    </span>
                  </div>

                  <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 24, border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                      <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}><iconify-icon icon="lucide:hash" /> Attempt Number</span>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{attemptNumber}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                      <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}><iconify-icon icon="lucide:help-circle" /> Questions</span>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{latestSession.totalQuestions}</span>
                    </div>
                  </div>

                  {isPending ? (
                    <button
                      className="btn btn-primary"
                      style={{
                        height: 52,
                        width: "100%",
                        fontSize: 15,
                        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                        boxShadow: "0 8px 16px rgba(37, 99, 235, 0.2)",
                        marginTop: "auto"
                      }}
                      onClick={() => onStartExam(latestSession.id)}
                    >
                      <iconify-icon icon="lucide:play-circle" style={{ fontSize: 18 }} />
                      Begin Attempt {attemptNumber}
                    </button>
                  ) : (!isPending && (isFailed || isPassed) && !isRetakeRequested) ? (
                    <button
                      className="btn btn-primary"
                      style={{
                        height: 52,
                        width: "100%",
                        fontSize: 15,
                        background: "linear-gradient(135deg, #f59e0b, #d97706)",
                        boxShadow: "0 8px 16px rgba(245, 158, 11, 0.2)",
                        marginTop: "auto",
                        border: "none",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 600
                      }}
                      onClick={async () => {
                        try {
                          await requestRetake(latestSession.id);
                          load();
                        } catch (e) {
                          setToastError("Failed to request a new attempt");
                          setTimeout(() => setToastError(null), 4000);
                        }
                      }}
                    >
                      <iconify-icon icon="lucide:rotate-cw" style={{ fontSize: 18 }} />
                      Request Retake
                    </button>
                  ) : (
                    <button
                      disabled
                      style={{
                        height: 52,
                        width: "100%",
                        background: "var(--surface-raised)",
                        color: "var(--muted)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 8,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "not-allowed",
                        marginTop: "auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8
                      }}
                    >
                      <iconify-icon icon={isRetakeRequested ? "lucide:clock" : "lucide:lock"} style={{ fontSize: 18 }} />
                      {isRetakeRequested ? "Retake Requested" : "No Pending Assessment"}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* My Certificates */}
      <section>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>My Credentials</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>{certs.length} qualification{certs.length !== 1 ? "s" : ""} on file.</p>
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border-subtle)", background: "var(--surface)", borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "var(--ink)", cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.background = 'var(--surface-raised)'} onMouseOut={e => e.currentTarget.style.background = 'var(--surface)'}>
            View all <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 16 }} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {certs.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 14, padding: "20px 0" }}>No credentials earned yet. Complete an assessment to earn your first certificate.</p>
          ) : (
            certs.map((cert, i) => (
              <motion.div 
                key={cert.id} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-panel"
                style={{ borderRadius: 12, padding: 20, border: "1px solid rgba(16, 185, 129, 0.2)", position: "relative", overflow: "hidden" }}
              >
                <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 120, background: "linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.05))", pointerEvents: "none" }} />
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", display: "grid", placeItems: "center" }}>
                    <iconify-icon icon="lucide:award" style={{ fontSize: 22, color: "#10b981" }} />
                  </div>
                  <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: "1px solid rgba(16, 185, 129, 0.3)" }}>Verified Active</span>
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 16, lineHeight: 1.4 }}>{cert.title}</h3>
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, alignItems: "center" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 500 }}>Issue Date</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontWeight: 600, background: "var(--surface-raised)", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border-muted)" }}>
                      {new Date(cert.issueDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </section>

      <AnimatePresence>
        {toastError && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            style={{
              position: "fixed",
              bottom: 32,
              right: 32,
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "white",
              padding: "16px 24px",
              borderRadius: "12px",
              boxShadow: "0 12px 24px rgba(220, 38, 38, 0.25)",
              zIndex: 1001,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontWeight: 600,
              border: "1px solid rgba(255,255,255,0.1)"
            }}
          >
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "50%", width: 32, height: 32, display: "grid", placeItems: "center" }}>
              <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 18 }} />
            </div>
            {toastError}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
