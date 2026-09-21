import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AnalyticsSummary,
  fetchAnalytics,
  DashboardStats,
  getDashboardStats,
  ActivityEvent,
  getRecentActivity
} from "../api";
import { Tab } from "../App";

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0 },
};

const container = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05 } },
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  iconColor: string;
  iconBg: string;
}

function StatCard({ label, value, icon, iconColor, iconBg }: StatCardProps) {
  return (
    <motion.div variants={cardVariants} style={{ background: "var(--surface)", borderRadius: "var(--card-radius)", padding: 20, boxShadow: "var(--shadow-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", letterSpacing: "0.02em" }}>{label}</p>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: iconBg, border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
          <iconify-icon icon={`lucide:${icon}`} style={{ fontSize: 16, color: iconColor }} />
        </div>
      </div>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: "var(--ink)", lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
      </p>
    </motion.div>
  );
}

interface Props {
  backendOnline: boolean;
  setActiveTab: (tab: Tab) => void;
}

export function AnalyticsDashboard({ backendOnline, setActiveTab }: Props) {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mockStats, mockActivity] = await Promise.all([
        getDashboardStats(),
        getRecentActivity()
      ]);
      setStats(mockStats);
      setActivity(mockActivity);

      if (backendOnline) {
        const summary = await fetchAnalytics();
        setData(summary);
      }
    } catch {
      setError("Cannot reach backend. Some analytics may be unavailable.");
    } finally {
      setLoading(false);
    }
  }, [backendOnline]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const totalManuals = data?.total_manuals ?? 0;
  const totalEmployees = stats?.totalEmployees ?? 0;

  // Empty State Check
  if (!loading && totalManuals === 0 && totalEmployees === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 20 }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ width: "100%", maxWidth: 540, background: "var(--surface)", borderRadius: "var(--card-radius)", padding: 40, boxShadow: "var(--shadow-card)" }}
        >
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--raised)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <iconify-icon icon="lucide:rocket" style={{ fontSize: 24, color: "var(--ink)" }} />
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.01em" }}>
              Welcome to AegisGraph
            </h2>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
              Let's get your industrial safety environment set up. Complete these steps to start generating assessments.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button 
              style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", background: "var(--surface)", border: "none", borderRadius: 12, padding: 16, textAlign: "left", cursor: "pointer", transition: "all 0.2s", boxShadow: "var(--shadow-card)" }}
              onMouseOver={e => e.currentTarget.style.borderColor = "var(--accent)"}
              onMouseOut={e => e.currentTarget.style.borderColor = "var(--line)"}
              onClick={() => setActiveTab("manuals")}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: totalManuals > 0 ? "rgba(22,163,74,0.1)" : "var(--raised)", display: "grid", placeItems: "center", color: totalManuals > 0 ? "#15803d" : "var(--muted)", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                {totalManuals > 0 ? <iconify-icon icon="lucide:check" style={{ fontSize: 16 }} /> : "1"}
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--ink)", fontSize: 15, marginBottom: 2 }}>Upload safety manual</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Add PDF or Markdown procedures.</div>
              </div>
            </button>

            <button 
              style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", background: "var(--surface)", border: "none", borderRadius: 12, padding: 16, textAlign: "left", cursor: "pointer", transition: "all 0.2s", boxShadow: "var(--shadow-card)" }}
              onMouseOver={e => e.currentTarget.style.borderColor = "var(--accent)"}
              onMouseOut={e => e.currentTarget.style.borderColor = "var(--line)"}
              onClick={() => setActiveTab("employees")}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: totalEmployees > 0 ? "rgba(22,163,74,0.1)" : "var(--raised)", display: "grid", placeItems: "center", color: totalEmployees > 0 ? "#15803d" : "var(--muted)", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                {totalEmployees > 0 ? <iconify-icon icon="lucide:check" style={{ fontSize: 16 }} /> : "2"}
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--ink)", fontSize: 15, marginBottom: 2 }}>Add employees</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Create departments and worker credentials.</div>
              </div>
            </button>

            <button 
              style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", background: "var(--surface)", border: "none", borderRadius: 12, padding: 16, textAlign: "left", cursor: "pointer", transition: "all 0.2s", boxShadow: "var(--shadow-card)" }}
              onMouseOver={e => e.currentTarget.style.borderColor = "var(--accent)"}
              onMouseOut={e => e.currentTarget.style.borderColor = "var(--line)"}
              onClick={() => setActiveTab("assessments")}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--raised)", display: "grid", placeItems: "center", color: "var(--muted)", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                3
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--ink)", fontSize: 15, marginBottom: 2 }}>Generate assessment</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Create AI exams based on manuals.</div>
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const maxCount = data ? Math.max(...data.section_metrics.map((s) => s.rule_count), 1) : 1;
  const avgRisk = data && data.section_metrics.length > 0
    ? data.section_metrics.reduce((acc, s) => acc + s.avg_risk_score, 0) / data.section_metrics.length
    : 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--ink)", marginBottom: 4, letterSpacing: "-0.01em" }}>
            Analytics dashboard
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Overview of enterprise safety compliance and risk.</p>
        </div>
        <button 
          style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "var(--ink)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
          onClick={load} disabled={loading}
        >
          {loading ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <iconify-icon icon="lucide:refresh-cw" style={{ fontSize: 14 }} />}
          Refresh
        </button>
      </div>

      {error && !backendOnline && (
        <div style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <iconify-icon icon="lucide:alert-circle" style={{ fontSize: 18, color: "#b45309" }} />
          <p style={{ color: "#b45309", fontSize: 13, fontWeight: 500 }}>Backend offline. Displaying local data only.</p>
        </div>
      )}

      {/* Top Row: Summary Stats */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 24 }}
      >
        <motion.div variants={cardVariants} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--card-radius)", padding: 20, boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--raised)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <iconify-icon icon="lucide:building-2" style={{ fontSize: 24, color: "var(--ink)" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Company Profile</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {stats?.companyName || "Loading..."}
            </p>
          </div>
        </motion.div>

        <StatCard
          label="Total Employees"
          value={stats?.totalEmployees ?? "—"}
          icon="users"
          iconColor="#1d4ed8"
          iconBg="rgba(37,99,235,0.08)"
        />
        <StatCard
          label="Total Certified"
          value={stats?.totalCertified ?? "—"}
          icon="graduation-cap"
          iconColor="#15803d"
          iconBg="rgba(22,163,74,0.08)"
        />
        <StatCard
          label="Compliance Rate"
          value={stats ? `${stats.complianceRate}%` : "—"}
          icon="trending-up"
          iconColor="#6d28d9"
          iconBg="rgba(109,40,217,0.08)"
        />
      </motion.div>

      {/* Middle Row: Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Bar chart */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--card-radius)", padding: 24, boxShadow: "var(--shadow-card)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 24 }}>Rule distribution by section</h3>
          {!data || data.section_metrics.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              No rule data available. Upload manuals to generate graphs.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.section_metrics.map((s, i) => {
                const colors = ["#2563eb", "#0d9488", "#d97706", "#6d28d9"];
                const color = colors[i % colors.length];
                const pct = Math.round((s.rule_count / maxCount) * 100);
                return (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{s.name}</span>
                      <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{s.rule_count} rules</span>
                    </div>
                    <div style={{ height: 6, background: "var(--raised)", borderRadius: 3, overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, delay: i * 0.1 }}
                        style={{ height: "100%", background: color, borderRadius: 3 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Avg Risk Score Indicator */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--card-radius)", padding: 24, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 32, alignSelf: "flex-start" }}>Average risk score</h3>
          
          <div style={{ position: "relative", width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
              <circle cx="70" cy="70" r="62" fill="none" stroke="var(--raised)" strokeWidth="12" />
              <circle 
                cx="70" cy="70" r="62" 
                fill="none" 
                stroke={avgRisk > 7 ? "#dc2626" : avgRisk > 4 ? "#d97706" : "#16a34a"} 
                strokeWidth="12" 
                strokeDasharray={2 * Math.PI * 62}
                strokeDashoffset={2 * Math.PI * 62 * (1 - avgRisk / 10)}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s ease-out" }}
              />
            </svg>
            <div style={{ textAlign: "center", zIndex: 1 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>
                {avgRisk.toFixed(1)}
              </span>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>
                out of 10
              </div>
            </div>
          </div>
          
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 32, textAlign: "center", lineHeight: 1.5 }}>
            Aggregated from extracted safety protocols in the knowledge graph.
          </p>
        </div>
      </div>

      {/* Bottom Row: Recent Activity */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--card-radius)", padding: 24, boxShadow: "var(--shadow-card)" }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 20 }}>Recent activity</h3>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {activity.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              No recent activity.
            </div>
          ) : (
            activity.map((event, idx) => {
              let icon = "file-text";
              let color = "var(--muted)";
              let bg = "var(--raised)";
              
              if (event.type === "employee") { icon = "user"; color = "#1d4ed8"; bg = "rgba(37,99,235,0.08)"; }
              if (event.type === "manual") { icon = "book-open"; color = "#d97706"; bg = "rgba(217,119,6,0.08)"; }
              if (event.type === "certificate") { icon = "award"; color = "#15803d"; bg = "rgba(22,163,74,0.08)"; }
              if (event.type === "exam") { icon = "check-square"; color = "#6d28d9"; bg = "rgba(109,40,217,0.08)"; }

              const eventDate = new Date(event.timestamp);
              const today = new Date();
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);

              let dateStr = "";
              if (eventDate.toDateString() === today.toDateString()) {
                dateStr = "Today";
              } else if (eventDate.toDateString() === yesterday.toDateString()) {
                dateStr = "Yesterday";
              } else {
                dateStr = eventDate.toLocaleDateString("en-GB", { day: '2-digit', month: '2-digit', year: '2-digit' });
              }
              const timeStr = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const formattedTime = `${dateStr}, ${timeStr}`;
              
              return (
                <div key={event.id} style={{ 
                  display: "flex", alignItems: "center", gap: 16, padding: "16px 0", 
                  borderBottom: idx === activity.length - 1 ? "none" : "1px solid var(--line)"
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <iconify-icon icon={`lucide:${icon}`} style={{ fontSize: 16, color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: 0 }}>{event.description}</p>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                    {formattedTime}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
