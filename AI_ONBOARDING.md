# AegisGraph AI - Project Onboarding & Structure Guide

Welcome to the AegisGraph AI codebase. This document is designed to rapidly onboard AI coding assistants (like Claude) by providing a high-level overview of the architecture, directory structure, and key files to analyze when modifying or extending the system.

## 🏗️ High-Level Architecture

AegisGraph AI is a platform for industrial safety certification. It consists of:
1.  **Frontend**: A React application using Vite, TypeScript, and Framer Motion for animations. It features distinct interfaces for Admins (Dashboard, Rules, Certificates, etc.) and Employees (Taking assessments).
2.  **Backend**: A FastAPI (Python) server utilizing SQLAlchemy (async) for database operations, Pydantic for validation, and integrations with AI tools (Gemini/CrewAI) for generating assessments and extracting data from uploaded manuals.
3.  **Database**: Typically SQLite/PostgreSQL, managed via SQLAlchemy ORM.

---

## 📂 Project Structure

```text
AegisGraph-AI-main/
│
├── backend/                  # FastAPI Python Backend
│   ├── app/
│   │   ├── api/              # Route definitions
│   │   │   ├── v1/endpoints/ # Grouped API endpoints (auth, users, certificates, hierarchy)
│   │   │   └── assessment.py # Core exam generation and grading logic
│   │   ├── core/             # Configuration (settings.py), security (security.py), and DB setup
│   │   ├── models/           # SQLAlchemy ORM Models (DB schema)
│   │   ├── schemas/          # Pydantic schemas (Request/Response validation)
│   │   ├── services/         # Business logic & integrations
│   │   │   ├── certificate.py# PDF generation (ReportLab) & QR code signing (Ed25519)
│   │   │   └── ...           # AI Agent integrations (CrewAI/Langchain)
│   │   └── main.py           # FastAPI application entry point
│   ├── requirements.txt      # Python dependencies
│   └── test_*.py             # Test scripts
│
├── frontend/                 # React + TypeScript Frontend
│   ├── src/
│   │   ├── api.ts            # Centralized API client (fetch wrappers) and all TS Interfaces
│   │   ├── App.tsx           # Main application routing and shell (Admin/Employee layouts)
│   │   ├── components/       # Reusable UI components (AnalyticsDashboard, ConstraintDashboard, etc.)
│   │   ├── pages/            # Page-level components (Certificates.tsx, VerifyCertificate.tsx, etc.)
│   │   ├── index.css         # Global CSS, CSS variables (Design System tokens)
│   │   └── main.tsx          # React DOM entry point
│   ├── package.json          # Node dependencies
│   └── vite.config.ts        # Vite configuration
│
└── README.md                 # General project information
```

---

## 🔍 Key Modules & Code Files to Analyze

To quickly understand how the system operates, prioritize reading the following files based on the task:

### 1. API & Data Flow (Frontend to Backend)
*   **`frontend/src/api.ts`**
    *   **Why analyze it?** It contains the entire frontend API contract. Every TypeScript interface (e.g., `VerificationResult`, `AdminCertificate`) and API wrapper function is located here. If you modify a backend endpoint's response, you *must* update the interfaces here.
*   **`backend/app/api/v1/api.py`**
    *   **Why analyze it?** Shows how the FastAPI routers are mounted and prefixed (e.g., `/api/v1/certificates`).

### 2. Certificates & Cryptographic Verification
*   **`backend/app/services/certificate.py`**
    *   **Why analyze it?** Contains the logic for generating physical PDF certificates using `reportlab`, generating QR codes, and cryptographically signing the payload using Ed25519 (`nacl.signing.SigningKey`).
*   **`backend/app/api/v1/endpoints/certificates.py`**
    *   **Why analyze it?** Contains the endpoints for retrieving certificates, handling AI analysis of uploaded PDFs, and the critical `GET /verify/{cert_id}` endpoint used for the QR code verification workflow.
*   **`frontend/src/pages/Certificates.tsx`** & **`frontend/src/pages/VerifyCertificate.tsx`**
    *   **Why analyze it?** `Certificates.tsx` is the Admin vault for managing certificates. `VerifyCertificate.tsx` is the public-facing verification page that mobile devices hit when scanning a QR code.

### 3. Assessment & Exam Logic
*   **`backend/app/api/assessment.py`**
    *   **Why analyze it?** Handles the core logic for submitting exam answers, calculating the SCI score, updating exam status, and automatically triggering the `generate_certificate` service when an employee passes.
*   **`frontend/src/components/AssessmentRenderer.tsx`** (or similar)
    *   **Why analyze it?** Handles the dynamic rendering of AI-generated safety questions for the employees.

### 4. Database Schema
*   **`backend/app/models/*.py`** (Specifically `certificate.py`, `user.py`, and `hierarchy.py`)
    *   **Why analyze it?** Understand the relationships between Users, Companies, ExamSessions, and Certificates. Note the difference between `Certificate` (native) and `CertificateRecord` (imported legacy certificates).

### 5. UI / UX Design System
*   **`frontend/src/index.css`**
    *   **Why analyze it?** The project avoids Tailwind in favor of vanilla CSS variables (`var(--accent)`, `var(--text-primary)`, `var(--surface)`). To maintain aesthetic consistency, always use these established CSS variables for colors, spacing, and typography.
*   **`frontend/src/App.tsx`**
    *   **Why analyze it?** Contains the global layout, sidebar navigation, and theme toggling (Dark/Light mode).

---

## 🛠️ Development Guidelines for AI

1.  **Strict Typing:** Always keep `frontend/src/api.ts` strictly synchronized with Pydantic schemas in `backend/app/schemas/`.
2.  **Aesthetic Consistency:** When creating new UI components, reference existing files (like `Employees.tsx` or `Certificates.tsx`) to match `h1` styling, padding, and Framer Motion animation configurations.
3.  **Offline Capability:** The system is designed to work in air-gapped or local network environments. Avoid adding external CDN dependencies (fonts, icons) unless strictly necessary. Verify URLs use relative paths or configurable `BASE` URLs instead of hardcoded external domains.
