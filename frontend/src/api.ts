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
  options: RequestInit,
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
      lastError = err instanceof Error ? err : new Error("Unknown error");
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;

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
export async function generateQuestionVariants(ruleId: string, count: number = 3): Promise<{message: string, rule_id: string}> {
  return fetchWithRetry<{message: string, rule_id: string}>(`${BASE}/questions/generate/${ruleId}?count=${count}`, {
    method: "POST"
  });
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

function generateCompanyCode(companyName: string, existingCodes: Set<string>): string {
  const stopWords = new Set(["the", "inc", "llc", "corp", "corporation", "ltd", "and", "of", "co", "company"]);
  const words = companyName.split(/[\s,.-]+/).filter(w => !stopWords.has(w.toLowerCase()) && w.length > 0);
  const sigWords = words.slice(0, 3);
  let prefix = sigWords.map(w => w[0].toUpperCase()).join("");
  if (!prefix) prefix = "CMP";

  let num = 1;
  while (true) {
    const code = `${prefix}${num.toString().padStart(2, '0')}`;
    if (!existingCodes.has(code)) {
      return code;
    }
    num++;
  }
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
      localStorage.setItem("aegis_token", data.access_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function loginEmployee(empId: string, pin: string): Promise<boolean> {
  return loginAdmin(empId, pin);
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
}

export async function getDepartments(): Promise<Department[]> {
  await new Promise(r => setTimeout(r, 300));
  const existingStr = localStorage.getItem("aegis_departments") || "[]";
  let deps: Department[] = JSON.parse(existingStr);
  
  // Dynamically count actual employees from the backend
  try {
    const employees = await getEmployees();
    const counts: Record<string, number> = {};
    for (const emp of employees) {
      counts[emp.departmentCode] = (counts[emp.departmentCode] || 0) + 1;
    }
    deps = deps.map(dep => ({
      ...dep,
      employeeCount: counts[dep.code] || 0
    }));
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
  
  let companyName = "Acme Corp";
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
  // Mock certified count (e.g. 80% if there are employees)
  const totalCertified = Math.floor(totalEmployees * 0.8);
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

export async function submitExam(_examId: string, _answers: Record<string, string>): Promise<{ passed: boolean, score: number }> {
  await new Promise(r => setTimeout(r, 600));
  // Mock logic: anything submitted passes for the demo
  return { passed: true, score: 100 };
}

// ---------------------------------------------------------------------------
// Admin Certificates & Public Verification Mock API
// ---------------------------------------------------------------------------

export interface AdminCertificate {
  id: string;
  employeeName: string;
  employeeId: string;
  score: number;
  issueDate: string;
  expiryDate: string;
  status: "Valid" | "Expiring Soon" | "Revoked";
}

export interface VerificationResult {
  isValid: boolean;
  message: string;
  certificate?: {
    id: string;
    employeeName: string;
    employeeId: string;
    company: string;
    score: number;
    issueDate: string;
  };
}

export async function getAdminCertificates(): Promise<AdminCertificate[]> {
  await new Promise(r => setTimeout(r, 400));
  const existingStr = localStorage.getItem("aegis_admin_certs");
  
  if (existingStr) {
    return JSON.parse(existingStr);
  }
  
  // Seed with some mock data if empty
  const mockCerts: AdminCertificate[] = [
    {
      id: "CERT-8890",
      employeeName: "John Doe",
      employeeId: "TT01-MEC-0001",
      score: 96,
      issueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 335).toISOString(),
      status: "Valid"
    },
    {
      id: "CERT-8891",
      employeeName: "Jane Smith",
      employeeId: "TT01-MEC-0002",
      score: 82,
      issueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 350).toISOString(),
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString(),
      status: "Expiring Soon"
    },
    {
      id: "CERT-8892",
      employeeName: "Robert Hawkins",
      employeeId: "TT01-OPS-0004",
      score: 91,
      issueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 100).toISOString(),
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 265).toISOString(),
      status: "Revoked"
    }
  ];
  localStorage.setItem("aegis_admin_certs", JSON.stringify(mockCerts));
  return mockCerts;
}

export async function revokeCertificate(certId: string): Promise<void> {
  await new Promise(r => setTimeout(r, 300));
  const existingStr = localStorage.getItem("aegis_admin_certs") || "[]";
  const certs: AdminCertificate[] = JSON.parse(existingStr);
  
  const index = certs.findIndex(c => c.id === certId);
  if (index !== -1) {
    certs[index].status = "Revoked";
    localStorage.setItem("aegis_admin_certs", JSON.stringify(certs));
  }
}

export async function verifyCertificate(certId: string): Promise<VerificationResult> {
  await new Promise(r => setTimeout(r, 800)); // Simulate cryptographic verification delay
  
  // Mock logic: Any ID starting with 'CERT-' is valid if it hasn't been revoked.
  // We'll check local storage first.
  const existingStr = localStorage.getItem("aegis_admin_certs") || "[]";
  const certs: AdminCertificate[] = JSON.parse(existingStr);
  const localCert = certs.find(c => c.id === certId);
  
  if (localCert) {
    if (localCert.status === "Revoked") {
      return { isValid: false, message: "Certificate has been revoked by the issuing authority." };
    }
    
    // Fetch company name
    const companiesStr = localStorage.getItem("aegis_companies") || "[]";
    const companies: CompanyRecord[] = JSON.parse(companiesStr);
    const company = companies.length > 0 ? companies[0].companyName : "AegisGraph Demo Corp";
    
    return {
      isValid: true,
      message: "Signature Valid",
      certificate: {
        id: localCert.id,
        employeeName: localCert.employeeName,
        employeeId: localCert.employeeId,
        company,
        score: localCert.score,
        issueDate: localCert.issueDate
      }
    };
  }

  // Fallback for valid format but not in DB (e.g. testing)
  if (certId.toUpperCase().startsWith("CERT-")) {
    return {
      isValid: true,
      message: "Signature Valid",
      certificate: {
        id: certId,
        employeeName: "Unknown Employee",
        employeeId: "UNK-0001",
        company: "Unknown Company",
        score: 100,
        issueDate: new Date().toISOString()
      }
    };
  }

  return {
    isValid: false,
    message: "Ed25519 signature check failed. Certificate may be tampered with."
  };
}

export async function updateEmployeePin(id: string, newPin: string): Promise<void> {
  await fetchWithRetry(`${BASE}/v1/users/${id}/pin`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_pin: newPin })
  });
}

export async function deleteEmployee(id: string): Promise<void> {
  await fetchWithRetry(`${BASE}/v1/users/${id}`, {
    method: "DELETE"
  });
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
