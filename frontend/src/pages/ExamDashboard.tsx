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
              background: "var(--ink)",
              color: "var(--surface)",
              padding: "16px 24px",
              borderRadius: 12,
              boxShadow: "var(--shadow-card)",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontWeight: 600,
            }}
          >
            <div style={{ background: "var(--surface)", color: "var(--ink)", borderRadius: "50%", width: 32, height: 32, display: "grid", placeItems: "center" }}>
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
        style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 48 }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 999, padding: "4px 10px", fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", display: "inline-block", boxShadow: "0 0 8px #3b82f6" }} />
              Kiosk mode
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Employee Portal</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.01em" }}>
            Welcome back, {userProfile?.full_name || "Operator"}
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)" }}>Complete your assigned safety certifications to maintain compliance.</p>
        </div>

        {/* User Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "16px 24px", boxShadow: "var(--shadow-card)" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--raised)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 24, flexShrink: 0, overflow: "hidden" }}>
            {userProfile?.photo ? (
              <img src={userProfile.photo} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <iconify-icon icon="lucide:user" style={{ color: "var(--ink)" }} />
            )}
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 4 }}>{userProfile?.designation || "Operator"} ID</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em" }}>{userProfile?.employee_code || "OP-KIOSK-AGX"}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
              <iconify-icon icon="lucide:shield-check" style={{ color: "#16a34a", fontSize: 14 }} />
              <p style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Verified · 100% Offline</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 40 }}>
        
        {/* Assigned Exams */}
        <section>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>Safety Assessments</h2>
              <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
                {Object.keys(groupedExams).length} assessment track{Object.keys(groupedExams).length !== 1 ? "s" : ""} on your record.
              </p>
            </div>
            {pendingCount > 0 && (
              <span style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <iconify-icon icon="lucide:alert-circle" /> {pendingCount} Action Required
              </span>
            )}
          </div>

          {Object.keys(groupedExams).length === 0 ? (
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: 60, textAlign: "center", border: "1px dashed var(--line)", boxShadow: "var(--shadow-card)" }}>
              <div style={{ width: 64, height: 64, background: "rgba(22, 163, 74, 0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <iconify-icon icon="lucide:check-circle" style={{ fontSize: 32, color: "#16a34a" }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>All caught up!</h3>
              <p style={{ color: "var(--muted)" }}>You have no pending exams. Great work maintaining safety compliance.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
              {Object.entries(groupedExams).map(([title, sessions], i) => {
                const attemptNumber = sessions.length;
                const latestSession = sessions[sessions.length - 1];
                
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
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      background: "var(--surface)",
                      borderRadius: "var(--card-radius)",
                      padding: 24,
                      position: "relative",
                      overflow: "hidden",
                      border: isPending ? "1px solid #3b82f6" : "1px solid var(--line)",
                      boxShadow: isPending ? "0 8px 32px rgba(59, 130, 246, 0.15)" : "var(--shadow-card)",
                    }}
                  >
                    {isPending && (
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "#3b82f6" }} />
                    )}
                    
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: isPending ? "rgba(59,130,246,0.1)" : "var(--raised)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
                        <iconify-icon icon={`lucide:${EXAM_ICONS[i % EXAM_ICONS.length]}`} style={{ fontSize: 20, color: isPending ? "#3b82f6" : "var(--ink)" }} />
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{ 
                          background: isPassed ? "rgba(22, 163, 74, 0.1)" : isFailed ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)", 
                          color: isPassed ? "#16a34a" : isFailed ? "#ef4444" : "#3b82f6", 
                          borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" 
                        }}>
                          {latestSession.status.replace("_", " ")}
                        </span>
                        {(latestSession.score !== null && latestSession.revealScoreToUser) && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: isPassed ? "#16a34a" : "#ef4444" }}>
                            Score: {latestSession.score.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 8, lineHeight: 1.3 }}>{title}</h3>
                    
                    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                      <span style={{ background: "var(--background)", color: "var(--muted)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, border: "1px solid var(--line)" }}>
                        {latestSession.topics[0]}
                      </span>
                      <span style={{ background: "var(--background)", color: "var(--muted)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, border: "1px solid var(--line)" }}>
                        AI Monitored
                      </span>
                    </div>

                    <div style={{ background: "var(--raised)", borderRadius: 8, padding: "12px 16px", marginBottom: 24, border: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                        <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}><iconify-icon icon="lucide:hash" /> Attempt Number</span>
                        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{attemptNumber}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}><iconify-icon icon="lucide:help-circle" /> Questions</span>
                        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{latestSession.totalQuestions}</span>
                      </div>
                    </div>

                    {isPending ? (
                      <button
                        className="btn btn-primary"
                        style={{
                          width: "100%",
                          fontSize: 14,
                          fontWeight: 600,
                          marginTop: "auto",
                          padding: "12px",
                          borderRadius: 8,
                          justifyContent: "center"
                        }}
                        onClick={() => onStartExam(latestSession.id)}
                      >
                        <iconify-icon icon="lucide:play-circle" style={{ fontSize: 18 }} />
                        Begin Attempt {attemptNumber}
                      </button>
                    ) : (!isPending && (isFailed || isPassed) && !isRetakeRequested) ? (
                      <button
                        className="btn btn-outline"
                        style={{
                          width: "100%",
                          fontSize: 14,
                          fontWeight: 600,
                          marginTop: "auto",
                          padding: "12px",
                          borderRadius: 8,
                          justifyContent: "center",
                          color: "#d97706",
                          borderColor: "#d97706"
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
                        className="btn btn-ghost"
                        style={{
                          width: "100%",
                          fontSize: 14,
                          fontWeight: 600,
                          marginTop: "auto",
                          padding: "12px",
                          borderRadius: 8,
                          justifyContent: "center",
                          cursor: "not-allowed",
                          background: "var(--raised)"
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
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>My Credentials</h2>
              <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>{certs.length} qualification{certs.length !== 1 ? "s" : ""} on file.</p>
            </div>
            <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 13, borderRadius: 999 }}>
              View all <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 16 }} />
            </button>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {certs.length === 0 ? (
              <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "24px", color: "var(--muted)", fontSize: 14, display: "flex", alignItems: "center", gap: 12 }}>
                <iconify-icon icon="lucide:info" style={{ fontSize: 20 }} />
                No credentials earned yet. Complete an assessment to earn your first certificate.
              </div>
            ) : (
              certs.map((cert, i) => (
                <motion.div 
                  key={cert.id} 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  style={{ background: "var(--surface)", borderRadius: 12, padding: 20, border: "1px solid rgba(22, 163, 74, 0.2)", position: "relative", overflow: "hidden", boxShadow: "var(--shadow-card)" }}
                >
                  <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 120, background: "linear-gradient(90deg, transparent, rgba(22, 163, 74, 0.05))", pointerEvents: "none" }} />
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(22, 163, 74, 0.1)", border: "1px solid rgba(22, 163, 74, 0.2)", display: "grid", placeItems: "center" }}>
                      <iconify-icon icon="lucide:award" style={{ fontSize: 20, color: "#16a34a" }} />
                    </div>
                    <span style={{ background: "rgba(22, 163, 74, 0.1)", color: "#16a34a", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Verified</span>
                  </div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 16, lineHeight: 1.4 }}>{cert.title}</h3>
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, alignItems: "center" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 500 }}>Issue Date</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontWeight: 600, background: "var(--background)", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)" }}>
                        {new Date(cert.issueDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </section>
      </div>

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
              background: "#ef4444",
              color: "white",
              padding: "16px 24px",
              borderRadius: "12px",
              boxShadow: "0 12px 24px rgba(239, 68, 68, 0.25)",
              zIndex: 1001,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontWeight: 600,
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
