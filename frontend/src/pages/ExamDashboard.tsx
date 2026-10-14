import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getMyExams, getAdminCertificates, requestRetake } from "../api";

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
  pdfUrl?: string;
}
interface Props {
  onStartExam: (examId: string) => void;
  userProfile?: any;
  onLogout?: () => void;
}

export function ExamDashboard({ onStartExam, userProfile, onLogout }: Props) {
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const handleViewPDF = async (url: string, certId: string) => {
    setDownloadingPdfId(certId);
    try {
      const token = localStorage.getItem("aegis_token");
      const host = window.location.hostname;
      const baseUrl = `http://${host}:8000`;
      const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      const res = await fetch(fullUrl, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load PDF");
      const blob = await res.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(pdfBlob);
      window.open(objectUrl, "_blank");
    } catch (e) {
      console.error(e);
      setToastError("Failed to fetch certificate PDF.");
      setTimeout(() => setToastError(null), 4000);
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    const [e, adminCerts] = await Promise.all([getMyExams(), getAdminCertificates().catch(() => [])]);
    
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

    // FIX FOR CREDENTIALS LOGIC: Map all admin certs for this specific user.
    const uid = String(userProfile?.id || "").toLowerCase();
    const ucode = String(userProfile?.employee_code || "").toLowerCase();
    const userCerts = adminCerts.filter(cert => {
      const cid = String(cert.employeeId || "").toLowerCase();
      const cUid = String((cert as any).userId || "").toLowerCase();
      return (cid && (cid === uid || cid === ucode)) || (cUid && cUid === uid);
    });

    setCerts(userCerts.map(cert => ({
      id: cert.id,
      title: (cert as any).assessmentName || (cert as any).title || "Safety Competency Certification",
      issueDate: cert.issueDate,
      pdfUrl: cert.pdfUrl
    })));
    
    setLoading(false);
    
    if (parsedExams.some(ex => ex.status === "assigned" || ex.status === "in_progress")) {
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);
    }
  };

  useEffect(() => {
    load();
  }, [userProfile?.id, userProfile?.employee_code]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="spinner border-t-gray-900 w-8 h-8 mx-auto mb-4" />
        <p className="text-gray-500 font-medium text-sm tracking-wide">INITIALIZING TERMINAL...</p>
      </div>
    );
  }

  const pendingExams = exams.filter(e => e.status === "assigned" || e.status === "in_progress");
  const completedExams = exams.filter(e => e.status !== "assigned" && e.status !== "in_progress");
  const pendingCount = pendingExams.length;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-12">
      
      {/* TOP NAVBAR / HEADER */}
      <div className="bg-white border-b border-gray-200 p-6 lg:px-10 lg:py-8 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs text-blue-700 font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                Terminal Mode
              </span>
              <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                AegisGraph Secure Network
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
              {userProfile?.full_name || "Operator"}
            </h1>
            <p className="text-sm text-gray-500 font-mono tracking-tight">SYSTEM ACCESS GRANTED. AWAITING COMPLIANCE CHECKS.</p>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="bg-[#d93025] hover:bg-[#b0261d] text-white transition-colors rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2 border border-[#941b12] shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-3px_4px_rgba(0,0,0,0.2),0_3px_6px_rgba(0,0,0,0.15)]"
            >
              <iconify-icon icon="lucide:log-out" />
              Log out
            </button>
          )}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 mt-8 px-6">
        
        {/* LEFT COLUMN: THE SMART BADGE */}
        <div className="w-full md:w-80 shrink-0">
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
            
            {/* Top Section - Photo & Header */}
            <div className="p-8 flex flex-col items-center bg-gray-50/50">
              <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-sm border border-gray-200 bg-white mb-5 relative">
                {userProfile?.photo ? (
                  <img 
                    src={userProfile.photo} 
                    alt={`${userProfile?.full_name || "Operator"} verified profile photo`} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <iconify-icon icon="lucide:user" className="text-5xl" />
                  </div>
                )}
              </div>
              <h2 className="text-xl font-bold text-gray-900 text-center tracking-tight">
                {userProfile?.full_name || "Operator"}
              </h2>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1 text-center">
                {userProfile?.designation || "OPERATOR"}
              </p>
            </div>

            {/* Bottom Section - Secure Readout */}
            <div className="bg-gray-900 text-white p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Worker ID</span>
                <span className="font-mono text-lg text-cyan-400 tracking-wider">
                  {userProfile?.employee_code || "OP-KIOSK-AGX"}
                </span>
              </div>
              
              <div className="flex items-center gap-3 bg-emerald-400/10 rounded-xl p-3 border border-emerald-400/20">
                <iconify-icon icon="lucide:shield-check" className="text-emerald-400 text-xl" />
                <div className="flex flex-col">
                  <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Verified Secure</span>
                  <span className="text-[10px] text-gray-400 font-mono">ACTIVE CREDENTIALS</span>
                </div>
              </div>
            </div>
            
          </div>
        </div>

        {/* RIGHT COLUMN: Dash Content */}
        <div className="flex-1 flex flex-col gap-8">
          
          {/* Active Assessment (Stands ALONE if assigned) */}
          <div className="flex flex-col gap-4">
            <div className="flex items-end justify-between">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Active Safety Assessment</h2>
              {pendingCount > 0 ? (
                <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" /> Ready For Attempt
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <iconify-icon icon="lucide:check-circle" /> Up to Date
                </span>
              )}
            </div>
            
            {pendingExams.length > 0 ? (
              // STAND ALONE ACTIVE EXAM CARD
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="border-2 border-blue-500 bg-gradient-to-br from-blue-50/40 via-white to-blue-50/20 rounded-2xl p-6 relative shadow-md"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                      <iconify-icon icon="lucide:shield-alert" className="text-2xl" />
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-100/70 border border-blue-200 px-2.5 py-0.5 rounded-full inline-block mb-1">
                        Assigned Examination
                      </span>
                      <h3 className="text-2xl font-bold text-gray-900 leading-tight">{pendingExams[0].title}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-100 border border-amber-300 text-amber-800 rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <iconify-icon icon="lucide:video" /> AI Proctoring Enforced
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-5">
                  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Question Count</span>
                    <span className="text-base font-bold text-gray-900 font-mono">{pendingExams[0].totalQuestions} Questions</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Monitoring Requirements</span>
                    <span className="text-xs font-semibold text-emerald-700">Camera + Screen Share</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Assigned Date</span>
                    <span className="text-xs font-medium text-gray-700">{new Date(pendingExams[0].assignedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm uppercase tracking-wider py-4 rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg shadow-blue-500/25"
                  onClick={() => onStartExam(pendingExams[0].id)}
                >
                  <iconify-icon icon="lucide:play-circle" className="text-xl" />
                  Begin Proctored Examination
                </button>
              </motion.div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center shadow-sm">
                <iconify-icon icon="lucide:check-circle" className="w-14 h-14 text-emerald-500 mb-4" style={{ fontSize: '56px' }} />
                <h3 className="text-xl font-bold text-gray-900">System Compliant</h3>
                <p className="text-gray-500 mt-2 font-medium">No pending assessments awaiting completion.</p>
              </div>
            )}
          </div>

          {/* Previous Exam History (if any) */}
          {completedExams.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <iconify-icon icon="lucide:history" className="text-gray-400" />
                Examination Records & History
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {completedExams.map((ex) => {
                  const isPassed = ex.status === "completed";
                  const isFailed = ex.status === "failed";
                  const isRetakeRequested = ex.status === "retake_requested";

                  return (
                    <div key={ex.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-bold text-gray-900 text-sm leading-tight pr-2">{ex.title}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                          isPassed ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          isFailed ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-gray-50 text-gray-700 border-gray-200"
                        }`}>
                          {ex.status.replace("_", " ")}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 my-2">
                        <span>{ex.totalQuestions} Questions</span>
                        {ex.score !== null && ex.revealScoreToUser && (
                          <span className={`font-mono font-bold ${isPassed ? "text-emerald-700" : "text-red-700"}`}>
                            Score: {ex.score.toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {(!isPassed && isFailed && !isRetakeRequested) && (
                        <button
                          className="mt-2 w-full bg-white hover:bg-amber-50 border border-amber-300 text-amber-700 font-bold text-[11px] uppercase tracking-wider py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                          onClick={async () => {
                            try {
                              await requestRetake(ex.id);
                              load();
                            } catch (e) {
                              setToastError("Failed to request a new attempt");
                              setTimeout(() => setToastError(null), 4000);
                            }
                          }}
                        >
                          <iconify-icon icon="lucide:rotate-cw" /> Request Retake
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Credentials Section — Shows ALL earned certificates */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">My Credentials & Certificates</h2>
              {certs.length > 0 && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  {certs.length} Active Certificate{certs.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            
            {certs.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center shadow-sm">
                <iconify-icon icon="lucide:award" className="w-14 h-14 text-gray-400 mb-4" style={{ fontSize: '56px' }} />
                <h3 className="text-xl font-bold text-gray-900">No Credentials Found</h3>
                <p className="text-gray-500 mt-2 font-medium">Complete an assessment to earn certification.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {certs.map((cert) => (
                  <div key={cert.id} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm hover:shadow-md transition-all gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 shrink-0">
                        <iconify-icon icon="lucide:award" className="w-7 h-7 text-emerald-600" style={{ fontSize: '28px' }} />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-gray-900">{cert.title}</h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>
                            Issued {new Date(cert.issueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-gray-300" />
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <iconify-icon icon="lucide:check-circle" className="text-xs" /> Cryptographically Verified
                          </span>
                        </div>
                      </div>
                    </div>
                    {cert.pdfUrl ? (
                      <button 
                        onClick={() => handleViewPDF(cert.pdfUrl!, cert.id)}
                        disabled={downloadingPdfId === cert.id}
                        className="w-full sm:w-auto px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors border border-gray-700 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait shrink-0"
                      >
                        <iconify-icon icon="lucide:file-text" />
                        {downloadingPdfId === cert.id ? "Loading..." : "View / Download PDF"}
                      </button>
                    ) : (
                      <button disabled className="w-full sm:w-auto px-5 py-2.5 bg-gray-300 text-gray-500 rounded-lg text-sm font-semibold cursor-not-allowed shrink-0">
                        No PDF
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-8 right-8 bg-gray-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 z-50 border border-gray-800"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <iconify-icon icon="lucide:bell-ring" className="text-lg" />
            </div>
            <span className="font-bold text-sm tracking-wide">
              {pendingCount} PENDING TASK{pendingCount !== 1 ? 'S' : ''} DETECTED
            </span>
          </motion.div>
        )}

        {toastError && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-8 right-8 bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 z-50"
          >
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white">
              <iconify-icon icon="lucide:alert-circle" className="text-lg" />
            </div>
            <span className="font-bold text-sm tracking-wide">{toastError}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
