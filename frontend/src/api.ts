// ─────────────────────────────────────────────────────────────────────────────
// AegisGraph AI — Typed API Client
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "http://localhost:8000/api";

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

export interface RuleRecord {
  id: string;
  text: string;
  sub_category: string;
  risk_score: number;
  cognitive_level: string;
  estimated_response_time: number;
  revision_version: string;
}

export interface AssessmentManifestItem {
  rule_id: string;
  question_variant_id: string;
}

export interface AssessmentResponse {
  status: string;
  manifest: AssessmentManifestItem[];
  missing_questions_for_rules?: string[];
  message?: string;
  assessment_id?: string;
}

export interface RuleIngest {
  id: string;
  section: string;
  sub_category: string;
  rule: string;
  risk_score?: number;
  cognitive_level?: string;
  estimated_response_time?: number;
  revision_version?: string;
}

export interface BatchIngestRequest {
  rules: RuleIngest[];
  clear_existing?: boolean;
}

export interface BatchIngestResponse {
  ingested_count: number;
  cleared: boolean;
  duration_ms: number;
}

export interface DifficultyWeights {
  high_risk_ratio: number;
  routine_ratio: number;
}

export interface ConstraintRequest {
  constraints: Record<string, number>;
  difficulty_weights?: DifficultyWeights;
}

export interface SectionMetrics {
  name: string;
  rule_count: number;
  avg_risk_score: number;
}

export interface AnalyticsSummary {
  total_manuals: number;
  total_rules: number;
  total_sections: number;
  total_subcategories: number;
  question_bank_counts: Record<string, number>;
  section_metrics: SectionMetrics[];
  last_inference_latency_ms: number | null;
  last_query_latency_ms: number | null;
  latency_history: number[];
}

// ---------------------------------------------------------------------------
// Typed Error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Retry-capable fetch utility
// ---------------------------------------------------------------------------

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelayMs = 800
): Promise<T> {
  let lastError: Error = new Error("Request failed");

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const token = localStorage.getItem("aegis_token");
      const headers = new Headers(options.headers || {});
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      
      const res = await fetch(url, { ...options, headers });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        let message = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body);
          if (parsed.detail) message = parsed.detail;
        } catch {}
        
        // 4xx = don't retry
        if (res.status >= 400 && res.status < 500) {
          throw new ApiError(message, res.status);
        }
        throw new ApiError(message, res.status);
      }

      if (res.status === 204) {
        return undefined as any as T;
      }
      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof ApiError) {
        lastError = err;
        if (err.status >= 400 && err.status < 500) throw err;
      } else if (err instanceof TypeError && err.message === "Failed to fetch") {
        lastError = new Error("Backend server is unreachable. Please ensure it is running.");
      } else {
        lastError = err instanceof Error ? err : new Error("Unknown error");
      }

      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/** POST /api/assessment/generate */
export async function generateAssessment(
  constraints: Record<string, number>,
  difficultyWeights?: DifficultyWeights
): Promise<AssessmentResponse> {
  const payload: ConstraintRequest = { constraints };
  if (difficultyWeights) payload.difficulty_weights = difficultyWeights;

  return fetchWithRetry<AssessmentResponse>(`${BASE}/assessment/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getAssessments(): Promise<any[]> {
  return fetchWithRetry<any[]>(`${BASE}/assessment/assessments`);
}

export async function getAllAssignedExams(): Promise<any[]> {
  return fetchWithRetry<any[]>(`${BASE}/assessment/all-assigned-exams`);
}

export async function deleteAssignedExam(examId: string): Promise<void> {
  return fetchWithRetry<void>(`${BASE}/assessment/exam/${examId}`, { method: "DELETE" });
}

export async function resetAssignedExam(examId: string): Promise<void> {
  return fetchWithRetry<void>(`${BASE}/assessment/all-assigned-exams/${examId}/reset`, { method: "POST" });
}

export async function retakeExam(sessionId: string): Promise<{ status: string; new_session_id: string }> {
  return fetchWithRetry<{ status: string; new_session_id: string }>(`${BASE}/assessment/exam/${sessionId}/retake`, { method: "POST" });
}

export async function assembleExam(jobTitle: string, targetCount: number): Promise<any> {
  return fetchWithRetry<any>(`${BASE}/assessment/assemble`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_title: jobTitle, target_count: targetCount })
  });
}

export async function saveAssembledExam(name: string, manifest: any[]): Promise<any> {
  return fetchWithRetry<any>(`${BASE}/assessment/save-assembled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, manifest })
  });
}

export async function swapQuestion(ruleId: string, currentVariantId: string): Promise<any> {
  return fetchWithRetry<any>(`${BASE}/assessment/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rule_id: ruleId, current_variant_id: currentVariantId })
  });
}

export async function assignExam(
  assessmentId: string,
  employeeIds: string[],
  examKey?: string,
  revealScore?: boolean
): Promise<any> {
  return fetchWithRetry<any>(`${BASE}/assessment/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assessment_id: assessmentId,
      employee_ids: employeeIds,
      ...(examKey ? { exam_key: examKey } : {}),
      ...(revealScore !== undefined ? { reveal_score_to_user: revealScore } : {}),
    }),
  });
}

export async function getMyExams(): Promise<any[]> {
  return fetchWithRetry<any[]>(`${BASE}/assessment/my-exams`);
}

export async function getExam(examId: string): Promise<any> {
  return fetchWithRetry<any>(`${BASE}/assessment/exam/${examId}`);
}

export async function saveAnswer(
  examId: string,
  variantId: string,
  index: number,
  fillText?: string,
  selectedIndices?: number[]
): Promise<any> {
  return fetchWithRetry<any>(`${BASE}/assessment/exam/${examId}/answer`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question_variant_id: variantId,
      selected_option_index: index >= 0 ? index : null,
      selected_option_indices: selectedIndices ?? null,
      text_answer: fillText ?? null,
    }),
  });
}

export async function submitExam(examId: string, integrityScore: number): Promise<any> {
  return fetchWithRetry<any>(`${BASE}/assessment/exam/${examId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ integrity_score: integrityScore })
  });
}

export async function getMyCertificates(): Promise<any[]> {
  return fetchWithRetry<any[]>(`${BASE}/assessment/certificates`);
}

// ---------------------------------------------------------------------------
// Lockdown Flow API (Req #2, #5, #7)
// ---------------------------------------------------------------------------

/**
 * Dual-factor unlock: verifies employee PIN + supervisor Exam Key.
 * Returns true on success; throws/returns false on 401.
 */
export async function unlockExam(
  examId: string,
  employeeCode: string,
  examKey: string
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/assessment/exam/${examId}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_code: employeeCode, exam_key: examKey }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface LockdownAnomalyResult {
  logged: boolean;
  escalated: boolean;
  total_events: number;
  cumulative_duration_s: number;
}

/**
 * Log a lockdown anomaly event (fullscreen exit, focus blur, tab hidden, screenshare stopped/changed).
 */
export async function logLockdownAnomaly(
  examId: string,
  anomalyType: string,
  durationS: number
): Promise<LockdownAnomalyResult | null> {
  try {
    return await fetchWithRetry<LockdownAnomalyResult>(
      `${BASE}/assessment/exam/${examId}/lockdown-anomaly`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anomaly_type: anomalyType,
          duration_s: durationS,
          timestamp: new Date().toISOString(),
        }),
      }
    );
  } catch {
    return null;
  }
}

export interface AuditTimelineEvent {
  source: "mediapipe" | "lockdown";
  type: string;
  ts: string | null;
  duration_s: number | null;
  detail: Record<string, any>;
}

export interface AuditTimeline {
  exam_session_id: string;
  employee_name: string | null;
  assessment_name: string | null;
  status: string;
  score: number | null;
  lockdown_escalated: boolean;
  timeline: AuditTimelineEvent[];
}

/**
 * Fetch the combined MediaPipe + lockdown audit timeline for a given exam session.
 */
export async function getAuditTimeline(examId: string): Promise<AuditTimeline> {
  return fetchWithRetry<AuditTimeline>(
    `${BASE}/assessment/exam/${examId}/audit-timeline`,
    { method: "GET" }
  );
}

/** POST /api/ingest/batch */
export async function batchIngest(
  request: BatchIngestRequest
): Promise<BatchIngestResponse> {
  return fetchWithRetry<BatchIngestResponse>(`${BASE}/ingest/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

/** GET /api/analytics/summary */
export async function fetchAnalytics(): Promise<AnalyticsSummary> {
  return fetchWithRetry<AnalyticsSummary>(`${BASE}/analytics/summary`, {
    method: "GET",
  });
}

/** GET /health */
export async function checkHealth(): Promise<{ status: string; engine: string }> {
  const res = await fetch("http://localhost:8000/health");
  if (!res.ok) throw new ApiError("Backend unreachable", res.status);
  return res.json();
}

// ---------------------------------------------------------------------------
// Question Bank — Review Interface Types & API
// ---------------------------------------------------------------------------

export interface QuestionVariant {
  id: string;
  rule_id: string;
  question_text: string;
  options: string[];
  correct_option_index: number;
  bloom_level: string;
  confidence: number;
  review_status: string;
  manualTitle?: string;
  sectionName?: string;
  subcategoryName?: string;
  rule_text?: string;
  rule_code?: string;
}

/** GET /api/questions */
export async function getQuestions(): Promise<QuestionVariant[]> {
  return fetchWithRetry<QuestionVariant[]>(`${BASE}/questions/`, { method: "GET" });
}

/** PUT /api/questions/{id} */
export async function updateQuestion(id: string, data: Partial<QuestionVariant>): Promise<QuestionVariant> {
  return fetchWithRetry<QuestionVariant>(`${BASE}/questions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/** POST /api/questions/generate/{rule_id} */
export async function generateQuestionVariants(ruleId: string, count: number = 3, questionType: string = "multiple_choice"): Promise<{message: string, rule_id: string}> {
  return fetchWithRetry<{message: string, rule_id: string}>(`${BASE}/questions/generate/${ruleId}?count=${count}&question_type=${questionType}`, {
    method: "POST"
  });
}

/** POST /api/questions/bulk-generate (SSE) */
export async function bulkGenerateQuestions(
  onMessage: (msg: any) => void,
  manualId?: string,
  sectionName?: string,
  questionType: string = "multiple_choice"
): Promise<void> {
  const url = new URL(`${window.location.origin}/api/v1/questions/bulk-generate`);
  if (manualId) url.searchParams.append("manual_id", manualId);
  if (sectionName) url.searchParams.append("section_name", sectionName);
  url.searchParams.append("question_type", questionType);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Accept": "text/event-stream"
    }
  });

  if (!response.ok) {
    throw new Error(`Bulk generate failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No readable stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          onMessage(data);
        } catch (e) {
          console.error("Failed to parse SSE data", line);
        }
      }
    }
  }
}


// ---------------------------------------------------------------------------
// Auth & Onboarding Mock API (LocalStorage)
// ---------------------------------------------------------------------------

export interface CompanyRegistrationData {
  companyName: string;
  industryType: string;
  address: string;
  adminName: string;
  adminEmail: string;
  adminPassword?: string;
}

export interface CompanyRecord extends CompanyRegistrationData {
  companyCode: string;
}


export async function registerCompany(data: CompanyRegistrationData): Promise<{ companyCode: string }> {
  const res = await fetch(`${BASE}/v1/companies/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Registration failed");
  }
  
  const result = await res.json();
  return { companyCode: result.companyCode };
}

export async function loginAdmin(email: string, pass: string): Promise<boolean> {
  try {
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", pass);

    const res = await fetch(`${BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.role === "OPERATOR") {
        return false; // Workers cannot login here
      }
      localStorage.setItem("aegis_token", data.access_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function loginEmployee(empId: string, pin: string): Promise<boolean> {
  try {
    const formData = new URLSearchParams();
    formData.append("username", empId);
    formData.append("password", pin);

    const res = await fetch(`${BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.role !== "OPERATOR") {
        return false;
      }
      localStorage.setItem("aegis_token", data.access_token);
      // Store employee_code for the unlock re-auth step (Req #2)
      if (data.employee_code) {
        localStorage.setItem("aegis_employee_code", data.employee_code);
      } else {
        // Fallback: use the empId as code (backend may return it differently)
        localStorage.setItem("aegis_employee_code", empId);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  try {
    const res = await fetchWithRetry<any>(`${BASE}/v1/users/verify-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    return res.status === "success";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Departments & Employees Mock API (LocalStorage)
// ---------------------------------------------------------------------------

export interface Department {
  id: string;
  name: string;
  code: string;
  employeeCount: number;
}

export interface Employee {
  id: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  designation: string;
  pin: string;
  status: "Active" | "Inactive";
  lastCertified: string | null;
  face_embedding_stored?: boolean;
}

export async function getDepartments(): Promise<Department[]> {
  await new Promise(r => setTimeout(r, 300));
  const existingStr = localStorage.getItem("aegis_departments") || "[]";
  let deps: Department[] = JSON.parse(existingStr);
  
  try {
    const employees = await getEmployees();
    const counts: Record<string, number> = {};
    const names: Record<string, string> = {};
    for (const emp of employees) {
      counts[emp.departmentCode] = (counts[emp.departmentCode] || 0) + 1;
      names[emp.departmentCode] = emp.departmentName;
    }
    
    // Auto-hydrate missing departments from backend employee data
    for (const code of Object.keys(counts)) {
      if (!deps.find(d => d.code === code)) {
        deps.push({
          id: crypto.randomUUID(),
          name: names[code] || "Unknown Department",
          code,
          employeeCount: 0
        });
      }
    }

    // Deduplicate by name (keeping the one with employees)
    const uniqueDepsMap = new Map<string, Department>();
    for (const d of deps) {
      const existing = uniqueDepsMap.get(d.name);
      const currentCount = counts[d.code] || 0;
      const existingCount = existing ? (counts[existing.code] || 0) : 0;
      
      if (!existing || currentCount > existingCount) {
        uniqueDepsMap.set(d.name, d);
      }
    }
    deps = Array.from(uniqueDepsMap.values());

    // Update counts
    deps = deps.map(dep => ({
      ...dep,
      employeeCount: counts[dep.code] || 0
    }));
    
    localStorage.setItem("aegis_departments", JSON.stringify(deps));
  } catch (err) {
    console.error("Could not fetch employees to update department counts");
  }
  
  return deps;
}

export async function createDepartment(name: string, code: string): Promise<Department> {
  await new Promise(r => setTimeout(r, 400));
  const deps = await getDepartments();
  const newDep: Department = { id: crypto.randomUUID(), name, code, employeeCount: 0 };
  deps.push(newDep);
  localStorage.setItem("aegis_departments", JSON.stringify(deps));
  return newDep;
}

export async function getEmployees(): Promise<Employee[]> {
  return fetchWithRetry<Employee[]>(`${BASE}/v1/users/`, { method: "GET" });
}

export async function createEmployee(
  name: string,
  departmentCode: string,
  departmentName: string,
  designation: string
): Promise<Employee> {
  return fetchWithRetry<Employee>(`${BASE}/v1/users/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, departmentCode, departmentName, designation })
  });
}

export async function updateEmployeePin(empId: string, newPin: string): Promise<void> {
  return fetchWithRetry<void>(`${BASE}/v1/users/${empId}/pin`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_pin: newPin })
  });
}

export async function deleteEmployee(empId: string): Promise<void> {
  return fetchWithRetry<void>(`${BASE}/v1/users/${empId}`, {
    method: "DELETE"
  });
}

export async function storeFaceEmbedding(employeeCode: string, embedding: number[]): Promise<void> {
  return fetchWithRetry<void>(`${BASE}/v1/users/${employeeCode}/face-embedding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embedding })
  });
}

export async function getFaceEmbedding(employeeCode: string): Promise<{ embedding: number[] }> {
  return fetchWithRetry<{ embedding: number[] }>(`${BASE}/v1/users/${employeeCode}/face-embedding`);
}

export interface ActivityEvent {
  id: string;
  type: "exam" | "manual" | "certificate" | "employee";
  description: string;
  timestamp: string; // ISO string
}

export async function getRecentActivity(): Promise<ActivityEvent[]> {
  return fetchWithRetry<ActivityEvent[]>(`${BASE}/v1/users/activity`, { method: "GET" });
}

export interface DashboardStats {
  companyName: string;
  totalEmployees: number;
  totalCertified: number;
  pendingExams: number;
  complianceRate: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const employees = await getEmployees();
  
  const companiesStr = localStorage.getItem("aegis_companies") || "[]";
  const companies = JSON.parse(companiesStr);
  let companyName = companies.length > 0 ? companies[0].companyName : "Meridian AutoComponents Pvt. Ltd.";
  
  try {
    const token = localStorage.getItem("aegis_token");
    if (token) {
      const res = await fetch(`${BASE}/v1/auth/me`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.company_name) {
          companyName = data.company_name;
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch user me data", err);
  }
  
  const totalEmployees = employees.length;
  
  let totalCertified = 0;
  try {
    const certs = await getAdminCertificates();
    const uniqueCertified = new Set(certs.filter(c => c.status !== "Revoked").map(c => c.employeeId));
    totalCertified = uniqueCertified.size;
  } catch (err) {
    console.error("Failed to fetch certificates for dashboard stats", err);
  }
  
  const pendingExams = Math.max(0, totalEmployees - totalCertified);
  const complianceRate = totalEmployees > 0 ? Math.round((totalCertified / totalEmployees) * 100) : 0;
  
  return {
    companyName,
    totalEmployees,
    totalCertified,
    pendingExams,
    complianceRate
  };
}

// ---------------------------------------------------------------------------
// Employee Exam Kiosk Mock API
// ---------------------------------------------------------------------------

export interface AssignedExam {
  id: string;
  title: string;
  topics: string[];
  totalQuestions: number;
}

export interface Certificate {
  id: string;
  title: string;
  issueDate: string;
}

export interface ExamQuestion {
  id: string;
  stem: string;
  options: string[];
}

export async function getEmployeeExams(_empId?: string): Promise<AssignedExam[]> {
  await new Promise(r => setTimeout(r, 300));
  return [
    {
      id: "EXAM-101",
      title: "LOTO (Lockout/Tagout) Certification",
      topics: ["Energy Isolation", "Tag Placement", "Restoration"],
      totalQuestions: 5
    }
  ];
}

export async function getEmployeeCertificates(_empId?: string): Promise<Certificate[]> {
  await new Promise(r => setTimeout(r, 300));
  return [
    {
      id: "CERT-8890",
      title: "Hazard Communication Standard",
      issueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString() // 30 days ago
    }
  ];
}

export async function getExamQuestions(_examId: string): Promise<ExamQuestion[]> {
  await new Promise(r => setTimeout(r, 400));
  return [
    {
      id: "q1",
      stem: "What is the primary purpose of Lockout/Tagout (LOTO)?",
      options: [
        "To prevent unauthorized personnel from entering the facility",
        "To ensure hazardous energy is isolated before maintenance",
        "To record the time maintenance started",
        "To keep machinery running efficiently"
      ]
    },
    {
      id: "q2",
      stem: "Who is authorized to remove a lock and tag?",
      options: [
        "Any supervisor on duty",
        "The maintenance manager only",
        "Only the person who applied them",
        "The next shift operator"
      ]
    },
    {
      id: "q3",
      stem: "Before beginning work on a locked-out machine, what must be done?",
      options: [
        "Verify isolation by attempting to start the machine",
        "Call the manufacturer",
        "Take a photo of the tag",
        "Log the time in the main register"
      ]
    },
    {
      id: "q4",
      stem: "Which of the following is NOT an acceptable energy isolation device?",
      options: [
        "A manually operated electrical circuit breaker",
        "A push button or selector switch",
        "A disconnect switch",
        "A line valve"
      ]
    },
    {
      id: "q5",
      stem: "When multiple people are working on the same equipment, how should it be locked out?",
      options: [
        "The supervisor places one master lock",
        "Each person applies their own personal lock",
        "The first person places a lock, the rest just sign a log",
        "Locks are not needed if someone is always watching"
      ]
    }
  ];
}



// ---------------------------------------------------------------------------
// Admin Certificates & Public Verification Mock API
// ---------------------------------------------------------------------------

export interface AdminCertificate {
  id: string;
  employeeName: string;
  employeeId: string;
  score: number | null;
  issueDate: string;
  expiryDate: string;
  status: "Valid" | "Expiring Soon" | "Expired" | "Revoked";
  isImported?: boolean;
  pdfUrl?: string;
}

export interface VerificationResult {
  isValid: boolean;
  message?: string;
  certificate?: {
    id: string;
    employeeName: string;
    employeeId?: string;
    company: string;
    assessmentName?: string;
    score: number | null;
    issueDate: string;
    signature?: string;
  };
}

export async function getAdminCertificates(): Promise<AdminCertificate[]> {
  return fetchWithRetry<AdminCertificate[]>(`${BASE}/v1/certificates/`, {
    method: "GET"
  });
}

export async function analyzeCertificate(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("file", file);
  return fetchWithRetry<any>(`${BASE}/v1/certificates/analyze`, {
    method: "POST",
    body: formData
  });
}

export async function importCertificate(employeeId: string, score: number | null, expiryDate: string): Promise<any> {
  const formData = new FormData();
  formData.append("employee_id", employeeId);
  if (score !== null) {
    formData.append("score", score.toString());
  }
  formData.append("expiry_date", expiryDate);
  return fetchWithRetry<any>(`${BASE}/v1/certificates/import`, {
    method: "POST",
    body: formData
  });
}

export async function updateCertificate(certId: string, score: number, expiryDate: string): Promise<void> {
  return fetchWithRetry<void>(`${BASE}/v1/certificates/${certId}`, {
    method: "PUT",
    body: JSON.stringify({ score, expiry_date: expiryDate }),
    headers: { "Content-Type": "application/json" }
  });
}

export async function revokeCertificate(certId: string): Promise<void> {
  return fetchWithRetry<void>(`${BASE}/v1/certificates/${certId}`, {
    method: "DELETE"
  });
}

export async function verifyCertificate(certId: string): Promise<VerificationResult> {
  try {
    const res = await fetch(`${BASE}/v1/certificates/verify/${certId}`);
    if (!res.ok) {
      if (res.status === 404) {
        return { isValid: false, message: "Certificate not found or revoked." };
      }
      return { isValid: false, message: "Verification failed due to server error." };
    }
    const data = await res.json();
    return {
      isValid: true,
      message: "Certificate verified successfully",
      certificate: {
        id: certId,
        employeeName: data.employee_name,
        employeeId: data.employee_id || "Unknown",
        company: data.company,
        assessmentName: data.assessment_name,
        score: data.score,
        issueDate: data.issue_date,
        signature: data.signature
      }
    };
  } catch (err: any) {
    return { isValid: false, message: err.message };
  }
}



// ---------------------------------------------------------------------------
// Hierarchy & Rules API
// ---------------------------------------------------------------------------

export interface RuleResponse {
  id: string;
  rule_code: string;
  text: string;
  source_text: string;
  risk_score: number;
  cognitive_level: string;
  confidence: number;
  review_status: string;
  page_number?: number;
  reference_images?: string[];
  approved_questions_count: number;
}

export interface FilteredBlockResponse {
  id: string;
  manual_id: string;
  source_text: string;
  page_number?: number;
  reason: string;
  promoted_to_rule_id?: string;
}

export interface SubCategoryResponse {
  id: string;
  name: string;
  rules: RuleResponse[];
  active_rules_count: number;
}

export interface SectionResponse {
  id: string;
  name: string;
  order_index: number;
  subcategories: SubCategoryResponse[];
}

export interface ManualResponse {
  id: string;
  title: string;
  version: string;
  sections: SectionResponse[];
}

export interface HierarchyTreeResponse {
  company_id: string;
  manuals: ManualResponse[];
}

export async function getHierarchyTree(): Promise<HierarchyTreeResponse> {
  return fetchWithRetry<HierarchyTreeResponse>(`${BASE}/v1/hierarchy/tree`, {
    method: "GET"
  });
}

export async function updateRule(ruleId: string, data: { text?: string; risk_score?: number; review_status?: string }): Promise<RuleResponse> {
  return fetchWithRetry<RuleResponse>(`${BASE}/v1/hierarchy/rules/${ruleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function getFilteredBlocks(manualId: string): Promise<FilteredBlockResponse[]> {
  return fetchWithRetry<FilteredBlockResponse[]>(`${BASE}/v1/hierarchy/manuals/${manualId}/filtered-blocks`, {
    method: "GET"
  });
}

export async function promoteFilteredBlock(blockId: string): Promise<{ status: string; rule_id: string }> {
  return fetchWithRetry<{ status: string; rule_id: string }>(`${BASE}/v1/hierarchy/filtered-blocks/${blockId}/promote`, {
    method: "POST"
  });
}

export async function getPendingAttempts(): Promise<any[]> {
  return fetchWithRetry<any[]>(`${BASE}/audit/attempts`);
}

export async function issueCertificate(attemptId: string): Promise<any> {
  return fetchWithRetry<any>(`${BASE}/audit/attempts/${attemptId}/issue-certificate`, { method: "POST" });
}

