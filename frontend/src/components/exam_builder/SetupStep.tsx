/**
 * SetupStep.tsx
 * Step 1: Target selection, Title, Timing & Scoring.
 * Template chooser removed. Exam key moved to Lock & Assign step.
 */

import React, { useState, useEffect } from "react";
import { Employee, Department, getEmployees, getDepartments } from "../../api";

interface SetupStepProps {
  setupData: {
    title: string;
    target: { type: "employee_id" | "role" | "department"; value: string; label?: string };
    duration_minutes: number;
    available_from: string;
    available_until: string;
    scoring_mode: "standard" | "per_question_marks" | "risk_weighted";
    pass_percent: number;
    reveal_score: boolean;
    exam_key: string;
  };
  onChange: (updates: Partial<SetupStepProps["setupData"]>) => void;
  onApplyTemplate?: (template: any) => void;
  initialEmployeeId?: string | null;
}

const STANDARD_ROLES = [
  "Line Operator",
  "Maintenance Technician",
  "High Voltage Specialist",
  "Safety Compliance Officer",
  "Chemical Handler",
  "Plant Supervisor",
  "Apprentice Electrician",
];

export const SetupStep: React.FC<SetupStepProps> = ({
  setupData,
  onChange,
  initialEmployeeId,
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoadingLookups(true);
    Promise.all([getEmployees(), getDepartments()])
      .then(([empList, deptList]) => {
        if (!isMounted) return;
        setEmployees(empList || []);
        setDepartments(deptList || []);

        // Pre-select employee if requested via prop and not already set
        if (initialEmployeeId && setupData.target.type === "employee_id" && !setupData.target.value) {
          const cleanInit = initialEmployeeId.trim();
          const match = empList.find((e) =>
            e.id.toLowerCase() === cleanInit.toLowerCase() ||
            e.id.replace(/-/g, " ").toLowerCase() === cleanInit.toLowerCase() ||
            e.id.toLowerCase() === cleanInit.replace(/\s+/g, "-").toLowerCase()
          );
          if (match) {
            onChange({
              target: {
                type: "employee_id",
                value: match.id,
                label: `${match.name} (${match.id})`,
              },
            });
          }
        }
      })
      .catch((err) => console.error("Could not load lookups", err))
      .finally(() => {
        if (isMounted) setLoadingLookups(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initialEmployeeId]);

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Title & Target Card */}
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cyan, #06b6d4)" }}>
            <iconify-icon icon="lucide:settings-2" style={{ fontSize: 16 }} />
          </span>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            General Information
          </h3>
        </div>

        {/* Title */}
        <div className="field-group">
          <label className="field-label">
            Exam Title <span style={{ color: "var(--rose, #f43f5e)" }}>*</span>
          </label>
          <input
            type="text"
            className="field-input"
            placeholder="e.g. Annual Plant High-Voltage & Chemical Safety Certification"
            value={setupData.title}
            onChange={(e) => onChange({ title: e.target.value })}
            style={{ fontSize: 15, fontWeight: 500 }}
            required
          />
        </div>

        {/* Target Audience */}
        <div className="field-group">
          <label className="field-label">
            Assign To <span style={{ color: "var(--rose, #f43f5e)" }}>*</span>
          </label>
          <p style={{ fontSize: 12, color: "var(--text-secondary, #94a3b8)", margin: "2px 0 10px" }}>
            Select who will receive this exam.
          </p>

          {/* Target Type Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["employee_id", "department", "role"] as const).map((tType) => (
              <button
                key={tType}
                type="button"
                onClick={() =>
                  onChange({
                    target: {
                      type: tType,
                      value: "",
                      label: "",
                    },
                  })
                }
                className={`btn ${setupData.target.type === tType ? "btn-primary" : "btn-ghost"}`}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: 13,
                  textTransform: "capitalize",
                  border: setupData.target.type === tType ? "none" : "1px solid var(--border-color, rgba(255,255,255,0.1))",
                }}
              >
                <iconify-icon
                  icon={
                    tType === "employee_id"
                      ? "lucide:user"
                      : tType === "department"
                      ? "lucide:building-2"
                      : "lucide:briefcase"
                  }
                  style={{ marginRight: 6 }}
                />
                {tType === "employee_id" ? "Single Employee" : tType === "department" ? "Department" : "Role"}
              </button>
            ))}
          </div>

          {/* Target Value Picker */}
          {setupData.target.type === "employee_id" && (
            <select
              className="field-select"
              value={setupData.target.value}
              onChange={(e) => {
                const val = e.target.value;
                const emp = employees.find((empItem) => empItem.id === val);
                onChange({
                  target: {
                    type: "employee_id",
                    value: val,
                    label: emp ? `${emp.name} (${emp.id})` : val,
                  },
                });
              }}
              disabled={loadingLookups}
            >
              <option value="">-- Select Employee --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.id}) • {e.designation || "Operator"} ({e.departmentCode || "Plant"})
                </option>
              ))}
            </select>
          )}

          {setupData.target.type === "department" && (
            <select
              className="field-select"
              value={setupData.target.value}
              onChange={(e) => {
                const val = e.target.value;
                const dept = departments.find((d) => d.code === val);
                onChange({
                  target: {
                    type: "department",
                    value: val,
                    label: dept ? `${dept.name} (${dept.code})` : val,
                  },
                });
              }}
              disabled={loadingLookups}
            >
              <option value="">-- Select Department --</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name} ({d.code}) • {d.employeeCount || 0} Employees
                </option>
              ))}
            </select>
          )}

          {setupData.target.type === "role" && (
            <select
              className="field-select"
              value={setupData.target.value}
              onChange={(e) => {
                const val = e.target.value;
                onChange({
                  target: {
                    type: "role",
                    value: val,
                    label: val,
                  },
                });
              }}
            >
              <option value="">-- Select Role --</option>
              {STANDARD_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}

          {/* Preview of selected target */}
          {setupData.target.value && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", fontSize: 13, color: "var(--emerald, #10b981)", display: "flex", alignItems: "center", gap: 6 }}>
              <iconify-icon icon="lucide:check-circle" style={{ fontSize: 15 }} />
              <span>
                Assigning to: <strong>{setupData.target.label || setupData.target.value}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Timing Card */}
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--amber, #f59e0b)" }}>
            <iconify-icon icon="lucide:clock" style={{ fontSize: 16 }} />
          </span>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Duration & Availability
          </h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <div className="field-group">
            <label className="field-label">Time Limit (Minutes)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={5}
                max={240}
                className="field-input"
                value={setupData.duration_minutes}
                onChange={(e) => onChange({ duration_minutes: Math.max(5, parseInt(e.target.value) || 30) })}
              />
              <span style={{ fontSize: 13, color: "var(--text-secondary, #94a3b8)", whiteSpace: "nowrap" }}>mins</span>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Available From (Optional)</label>
            <input
              type="datetime-local"
              className="field-input"
              value={setupData.available_from ? setupData.available_from.slice(0, 16) : ""}
              onChange={(e) => onChange({ available_from: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            />
          </div>

          <div className="field-group">
            <label className="field-label">Available Until (Optional)</label>
            <input
              type="datetime-local"
              className="field-input"
              value={setupData.available_until ? setupData.available_until.slice(0, 16) : ""}
              onChange={(e) => onChange({ available_until: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            />
          </div>
        </div>
      </div>

      {/* Scoring Card */}
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--emerald, #10b981)" }}>
            <iconify-icon icon="lucide:bar-chart-2" style={{ fontSize: 16 }} />
          </span>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Scoring
          </h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {/* Scoring Mode */}
          <div className="field-group">
            <label className="field-label">Scoring Mode</label>
            <div style={{ display: "flex", gap: 8 }}>
              <label
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border:
                    setupData.scoring_mode === "standard" || setupData.scoring_mode === "per_question_marks"
                      ? "1.5px solid var(--emerald)"
                      : "1px solid var(--border)",
                  background:
                    setupData.scoring_mode === "standard" || setupData.scoring_mode === "per_question_marks"
                      ? "rgba(22, 163, 74, 0.08)"
                      : "var(--surface)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="scoring_mode"
                  checked={setupData.scoring_mode === "standard" || setupData.scoring_mode === "per_question_marks"}
                  onChange={() => onChange({ scoring_mode: "standard" })}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Flat Marks</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Equal per-question points</div>
                </div>
              </label>

              <label
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border:
                    setupData.scoring_mode === "risk_weighted"
                      ? "1.5px solid var(--emerald)"
                      : "1px solid var(--border)",
                  background:
                    setupData.scoring_mode === "risk_weighted"
                      ? "rgba(22, 163, 74, 0.08)"
                      : "var(--surface)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="scoring_mode"
                  checked={setupData.scoring_mode === "risk_weighted"}
                  onChange={() => onChange({ scoring_mode: "risk_weighted" })}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Risk-Weighted</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Multiplied by rule risk score</div>
                </div>
              </label>
            </div>
          </div>

          {/* Pass Percentage */}
          <div className="field-group">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label className="field-label">Passing Threshold</label>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--emerald)" }}>
                {setupData.pass_percent}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={setupData.pass_percent}
              onChange={(e) => onChange({ pass_percent: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--emerald)" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)" }}>
              <span>50%</span>
              <span>80% (Recommended)</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Reveal Score Toggle */}
        <div
          className="field-group"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderRadius: 8,
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Reveal Score to Worker</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Show immediate percentage and pass/fail upon exam submission
            </div>
          </div>
          <input
            type="checkbox"
            checked={setupData.reveal_score}
            onChange={(e) => onChange({ reveal_score: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: "var(--emerald)", cursor: "pointer" }}
          />
        </div>
      </div>
    </div>
  );
};
