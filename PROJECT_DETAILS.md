# AegisGraph AI — Complete Project Documentation & Technical Architecture

> **DCWGT Industrial Safety Engine & Workforce Governance Platform**  
> *Version: 2.0.0 Production Architecture Documentation*

---

## 1. Executive Overview & Mission Statement

**AegisGraph AI** (operating under the **DCWGT Industrial Safety Engine** framework) is an enterprise-grade industrial safety compliance, knowledge structuring, and workforce assessment platform. In high-risk industrial environments—such as heavy manufacturing, chemical processing, mining, and metal fabrication—equipment operating manuals, standard operating procedures (SOPs), and OSHA regulations are often dense, static PDF documents that remain unread or poorly enforced.

AegisGraph AI bridges the gap between static technical documentation and operational safety by providing:
1. **Automated Digital Ingestion & Semantic Decomposition**: High-performance digital extraction of PDF manuals into hierarchical knowledge trees (Manual $\rightarrow$ Section $\rightarrow$ SubCategory $\rightarrow$ Rule).
2. **Dual-Engine Rule Structuring**: Local Large Language Model (Ollama) inference coupled with a deterministic technical safety heuristic parser that extracts, categorizes, risk-scores, and verifies safety mandates with zero data leakage.
3. **Cognitive Question Generation Engine**: Automated generation of four psychometrically sound question formats (Multiple Choice, True/False, Multiple Select, and Fill-in-the-Blank) classified under Bloom's Taxonomy (*Remember, Understand, Apply, Analyze, Evaluate, Create*).
4. **Role- & Risk-Weighted Exam Assembler**: Dynamic exam blueprinting with configurable slot distributions (Core SOPs, Critical Emergency Protocols, High-Risk Equipment Guards) mapped to plant departments and designations.
5. **Proctored Examination & Biometric Identity Verification**: Real-time webcam face-verification via client-side neural networks (`face-api.js`), fullscreen lockouts, anomaly clip recording, and anti-tamper mechanisms.
6. **Cryptographic Certificate Issuance & Public Verification**: Generation of digitally signed ReportLab certificate PDFs with unique verification hashes and QR codes verifiable by external auditors without authentication.
7. **Multi-Tenant Plant Administration & Immutable Audit Trail**: Full tenant data isolation (`company_id`), granular Role-Based Access Control (Super Admin, Plant Admin, Operator), and append-only audit logging.

---

## 2. Complete Project Directory Structure

```
AegisGraph-AI-main/
│
├── .env.example                               # Environment template for PostgreSQL and API secrets
├── .gitignore                                 # Git ignore directives for Python, Node, uploads, and keys
├── AI_ONBOARDING.md                           # Architecture onboarding briefing for AI agents & engineers
├── README.md                                  # Repository overview and quickstart instructions
├── dcwgt_algorithm.py                         # Standalone mathematical implementation of DCWGT algorithm
├── project_details.md                         # Comprehensive architecture and file-by-file documentation
├── skills-lock.json                           # Agent skills configuration lock
├── start_backend.bat                          # One-click Windows launch script for FastAPI backend
├── start_frontend.bat                         # One-click Windows launch script for Vite React frontend
│
├── .agents/                                   # Antigravity Agent skills and rules
│   └── skills/
│       ├── brandkit/                          # Visual identity & brand assets design guidelines
│       ├── design-taste-frontend/             # Editorial design aesthetics guidelines
│       ├── design-taste-frontend-v1/          # Legacy v1 design guidelines
│       ├── full-output-enforcement/           # Strict output completeness directive
│       ├── gpt-taste/                         # GSAP and typography aesthetics
│       ├── high-end-visual-design/            # Agency-grade visual tokens
│       ├── image-to-code/                     # Design asset replication instructions
│       ├── imagegen-frontend-mobile/          # Mobile mockups image generator
│       ├── imagegen-frontend-web/             # Web landing page image generator
│       ├── industrial-brutalist-ui/           # Industrial design system reference
│       ├── minimalist-ui/                     # Clean typography & bento grid reference
│       ├── redesign-existing-projects/        # Refactoring guidelines
│       └── stitch-design-taste/               # Semantic design system tokens
│
├── aegisgraph/                                # Standalone static HTML UI reference prototypes
│   ├── 01-admin-dashboard-analytics.html      # Prototype: Admin analytics dashboard
│   ├── 02-manuals-ingestion-terminal.html     # Prototype: Manual ingestion terminal
│   ├── 03-exam-session-full-screen.html       # Prototype: Fullscreen operator exam kiosk
│   ├── 04-employee-kiosk-hub.html             # Prototype: Operator kiosk landing
│   ├── 05-public-qr-verification.html         # Prototype: Public certificate verification
│   └── README.md                              # Guide to prototype assets
│
├── backend/                                   # FastAPI Python Backend
│   ├── generate_sql.py                        # Standalone script to emit PostgreSQL DDL statements
│   ├── requirements.txt                       # Python dependency manifest
│   ├── seed_data.py                           # Multi-tenant plant and employee seeding script
│   │
│   ├── app/                                   # Main Application Package
│   │   ├── __init__.py                        # Package init
│   │   ├── main.py                            # FastAPI application entrypoint, CORS, router mounting
│   │   │
│   │   ├── api/                               # API Route Controllers
│   │   │   ├── __init__.py
│   │   │   ├── analytics.py                   # Plant analytics & compliance metrics endpoint
│   │   │   ├── assessment.py                  # Operator exam sessions, answers, and scoring
│   │   │   ├── deps.py                        # Dependency injection (DB session, auth user, role check)
│   │   │   ├── exam_builder.py                # Exam configurations, slots, templates, assignment
│   │   │   ├── ingest.py                      # PDF manual upload & SSE streaming pipeline
│   │   │   ├── question_bank.py               # Question items, variants, review, and generation
│   │   │   └── v1/                            # API Version 1 Namespace
│   │   │       ├── api.py                     # Aggregated V1 API router
│   │   │       └── endpoints/                 # Resource Endpoints
│   │   │           ├── audit.py               # Immutable audit log queries & filtering
│   │   │           ├── auth.py                # User login, registration, JWT issuance, /me profile
│   │   │           ├── certificates.py        # Certificate retrieval, PDF download, public verify
│   │   │           ├── companies.py           # Company tenant management & plant settings
│   │   │           ├── hierarchy.py           # Manuals, sections, subcategories, rules, filtered blocks
│   │   │           ├── questions.py           # Direct question bank endpoints
│   │   │           └── users.py               # Employee roster, face embeddings, photos, roles
│   │   │
│   │   ├── core/                              # Infrastructure & Platform Config
│   │   │   ├── __init__.py
│   │   │   ├── config.py                      # Pydantic BaseSettings, database URIs, Ollama configs
│   │   │   ├── logging.py                     # Structured logging configuration
│   │   │   ├── metrics.py                     # Execution timing & performance monitoring metrics
│   │   │   ├── role_templates.py              # Default safety slot templates by industrial role
│   │   │   └── security.py                    # Password hashing (bcrypt), JWT creation & decode
│   │   │
│   │   ├── db/                                # Database Layer
│   │   │   ├── base_class.py                  # SQLAlchemy declarative base, UUID & Timestamp mixins
│   │   │   └── session.py                     # Async engine & async sessionmaker (asyncpg)
│   │   │
│   │   ├── migrations/                        # Database migration scripts
│   │   │   ├── __init__.py
│   │   │   └── migrate_legacy_assessments.py  # Migrates legacy assessment data to V2 schema
│   │   │
│   │   ├── models/                            # SQLAlchemy ORM Relational Entities
│   │   │   ├── __init__.py                    # Model registry export
│   │   │   ├── assessment_session.py          # AssessmentSession & AssessmentAnswer entities
│   │   │   ├── audit_log.py                   # AuditLog entity for compliance event tracking
│   │   │   ├── certificate.py                 # Certificate entity with verification hashes
│   │   │   ├── company.py                     # Company multi-tenant parent entity
│   │   │   ├── exam_builder.py                # ExamConfig, ExamConfigSlot, ExamAssignment entities
│   │   │   ├── hierarchy.py                   # Manual, Section, SubCategory, Rule, FilteredBlock
│   │   │   ├── question_bank.py               # QuestionBankItem, QuestionVariant entities
│   │   │   ├── question_usage_history.py      # Question frequency & employee cooldown tracking
│   │   │   ├── schemas.py                     # Internal DB helper models
│   │   │   ├── test_attempt.py                # Historical raw attempt records
│   │   │   └── user.py                        # User entity (employees, admins, roles, face embeddings)
│   │   │
│   │   ├── schemas/                           # Pydantic Request/Response DTO Schemas
│   │   │   ├── company.py                     # Company registration & update payloads
│   │   │   ├── exam_builder.py                # Exam builder blueprints, slots, assign requests
│   │   │   ├── generation.py                  # Question generation parameters & slot schemas
│   │   │   ├── hierarchy.py                   # Manuals, rules, filtered blocks DTOs
│   │   │   ├── llm_schemas.py                 # LLM input/output validation contracts
│   │   │   └── question_bank.py               # Question item responses, filters, variant schemas
│   │   │
│   │   ├── scripts/                           # Internal verification scripts
│   │   │   └── smoke_generate.py              # CLI smoke-test script for local Ollama generation
│   │   │
│   │   └── services/                          # Business Logic & AI Engines
│   │       ├── __init__.py
│   │       ├── ai_service.py                  # General AI inference service wrapper
│   │       ├── assessment_assembler.py        # Assembles balanced assessment question sets
│   │       ├── certificate.py                 # ReportLab PDF rendering & SHA-256 hash generation
│   │       ├── hierarchy_service.py           # Hierarchy tree building & filtered block management
│   │       │
│   │       ├── exam_builder/                  # Exam Configuration & Assignment Engine
│   │       │   ├── config_validation.py       # Validates exam slot constraints & rule availability
│   │       │   ├── generator_job.py           # Background question generation orchestrator
│   │       │   ├── grading.py                 # Strict question grading & score calculation
│   │       │   ├── planner.py                 # Exam slot allocation & question bank resolution
│   │       │   └── regenerate_ladder.py       # Fallback regeneration pipeline for question slots
│   │       │
│   │       ├── ingestion/                     # Document Processing Pipeline
│   │       │   └── pdf_parser.py              # PyMuPDF block extractor, TOC filter, image extractor
│   │       │
│   │       └── llm/                           # Local Ollama AI Processing
│   │           ├── generator.py               # Specialized generator for 4 question types
│   │           ├── grounding_check.py         # Anti-hallucination source text grounding checker
│   │           ├── rule_extractor.py          # LLM rule extractor + deterministic safety heuristic
│   │           └── rule_profiler.py           # Risk score (1-10) and Bloom's taxonomy profiler
│   │
│   ├── certs/                                # Temporary local certificate output storage
│   │   └── test.pdf
│   ├── config/
│   │   └── postgresql.conf.embedded           # Embedded database configuration reference
│   ├── reports/
│   │   └── artifacts/                         # Migration and benchmark SQL artifacts
│   │       ├── P0_HIERARCHY_QUESTIONBANK_MIGRATION.sql
│   │       └── P1_SCHEMA_MIGRATION_V2.sql
│   ├── scripts/                               # Maintenance & Operations Scripts
│   │   ├── reset_db.py                        # Complete database teardown and recreation script
│   │   ├── seed_certs.py                      # Seeds historical operator certificates
│   │   └── setup_neo4j_schema.py              # Optional graph database schema initializer
│   ├── static/                                # Publicly served static files
│   │   ├── certificates/                      # Generated certificate PDF documents
│   │   └── logos/                             # Uploaded company logo assets
│   └── tests/                                 # Test Suite
│       ├── conftest.py                        # Pytest async DB fixtures & mocks
│       ├── test_all_four_types.py             # Unit tests for MCQ, TF, MS, and FillBlank generation
│       ├── test_exam_builder.py               # Unit tests for exam blueprinting and slotting
│       ├── test_question_pipeline.py          # Integration tests for rule-to-question pipeline
│       ├── test_regenerate_ladder.py          # Unit tests for question regeneration fallback
│       ├── test_regenerate_reproduce.py       # Edge-case question regeneration reproduction
│       ├── test_section_aware_exam.py         # Tests section-balanced exam question generation
│       ├── integration/
│       │   ├── test_employee_gen.py           # End-to-end employee exam assignment tests
│       │   └── test_multitenancy_isolation.py # Tenant boundary & data leak validation tests
│       ├── performance/
│       │   └── benchmark_db_memory.py         # Database memory & connection pool benchmarks
│       └── unit/
│           └── test_relational_models.py      # SQLAlchemy model schema integrity tests
│
├── frontend/                                  # React + Vite Frontend
│   ├── .env.example                           # Frontend environment variables template
│   ├── index.html                             # Single-page application HTML entrypoint
│   ├── package.json                           # Frontend dependencies and npm scripts
│   ├── package-lock.json                      # NPM package lockfile
│   ├── postcss.config.js                      # PostCSS pipeline configuration
│   ├── tailwind.config.js                     # Tailwind configuration (reference tokens)
│   ├── tsconfig.json                          # TypeScript compiler configuration
│   ├── tsconfig.node.json                     # Node environment TypeScript configuration
│   ├── vite.config.ts                         # Vite bundler configuration & proxy setup
│   │
│   ├── public/                                # Public Static Assets
│   │   ├── apple-touch-icon.png               # iOS home screen bookmark icon
│   │   ├── bg-dark.webp                       # High-resolution dark mode background
│   │   ├── bg-light.webp                      # High-resolution light mode background
│   │   ├── face-api.min.js                    # Pre-compiled face-api neural net library
│   │   ├── favicon.svg                        # Vector favicon
│   │   ├── logo-new.webp                      # AegisGraph shield & graph brand mark
│   │   ├── robots.txt                         # Search crawler directives
│   │   ├── sitemap.xml                        # SEO XML sitemap
│   │   ├── social-preview.png                 # OpenGraph social share image
│   │   └── models/                            # Quantized neural net weights for face-api
│   │       ├── face_landmark_68_tiny_model*   # 68-point facial landmark detector
│   │       ├── face_recognition_model*        # 128-dimensional facial embedding descriptor
│   │       └── tiny_face_detector_model*      # Real-time lightweight face detector
│   │
│   ├── src/                                   # Frontend Source Code
│   │   ├── App.tsx                            # Root application component with routing & auth guards
│   │   ├── api.ts                             # Comprehensive Axios/Fetch API client & contracts
│   │   ├── iconify.d.ts                       # Iconify TypeScript typings
│   │   ├── index.css                          # Vanilla CSS design system, themes, and animations
│   │   ├── main.tsx                           # React DOM mount point & global providers
│   │   │
│   │   ├── components/                        # Reusable UI Components
│   │   │   ├── AnalyticsDashboard.tsx         # Plant compliance metrics & risk visualizer
│   │   │   ├── AssessmentRenderer.tsx         # Interactive question runner for active exams
│   │   │   ├── AuthLayout.tsx                 # Split-screen editorial authentication container
│   │   │   ├── BrandAssets.tsx                # Brand logo & monogram SVG components
│   │   │   ├── ConstraintDashboard.tsx        # Exam slot constraint validator display
│   │   │   ├── CookieConsent.tsx              # GDPR-compliant cookie banner
│   │   │   ├── EmployeeShell.tsx              # Kiosk shell for operator exam sessions
│   │   │   ├── ExamUnlockScreen.tsx           # Biometric webcam unlock step before exam launch
│   │   │   ├── ExecutionPanel.tsx             # Exam submission & progress tracker
│   │   │   ├── FaceVerification.tsx           # Webcam face verification component
│   │   │   ├── IngestionTerminal.tsx          # Real-time streaming terminal for PDF manual ingest
│   │   │   ├── PixelSwap.tsx                  # Interactive micro-animation component
│   │   │   ├── SpecularButton.tsx             # Agency-grade tactile specular button component
│   │   │   ├── ThemeToggle.tsx                # Dark / Light mode toggle switch
│   │   │   ├── ThemeTransitionOverlay.tsx     # Smooth curtain transition between themes
│   │   │   ├── WebcamCapture.tsx              # Generic webcam snapshot & canvas stream capturer
│   │   │   │
│   │   │   ├── assessments/
│   │   │   │   └── AssignExamModal.tsx        # Multi-employee role-based exam assignment modal
│   │   │   │
│   │   │   ├── exam_builder/                  # Exam Configuration & Visual Builder Suite
│   │   │   │   ├── AIGenerateSlotModal.tsx    # Live Ollama question generator modal
│   │   │   │   ├── BuilderCanvas.tsx          # Multi-step wizard canvas for exam setup
│   │   │   │   ├── GenerateStep.tsx           # Question slot generation & regeneration step
│   │   │   │   ├── LockAndAssignStep.tsx      # Final blueprint lock and workforce assignment step
│   │   │   │   ├── QuestionBankModal.tsx      # Modal to attach pre-existing question bank items
│   │   │   │   ├── QuestionEditorCard.tsx     # Inline editor card for single question variants
│   │   │   │   ├── SetupStep.tsx              # Step 1: Exam title, passing score, time limits
│   │   │   │   ├── StructureStep.tsx          # Step 2: Slot configuration & role template selection
│   │   │   │   ├── WorkerPreviewDrawer.tsx    # Slide-over previewing assigned workforce members
│   │   │   │   └── templates.ts               # Standard pre-built exam structures per industrial role
│   │   │   │
│   │   │   └── review/
│   │   │       └── QuestionReviewer.tsx       # Plant Admin question bank verification & approval card
│   │   │
│   │   ├── context/                           # React State Contexts
│   │   │   └── IngestionContext.tsx           # Global state for manual uploads, SSE logs, & progress
│   │   │
│   │   ├── hooks/                             # Custom React Hooks
│   │   │   ├── useAnomalyClipRecorder.ts      # Captures webcam video buffer on exam anomaly detection
│   │   │   └── useMetaTags.ts                 # Dynamic document title & OpenGraph meta tag manager
│   │   │
│   │   ├── pages/                             # Route Page Views
│   │   │   ├── AdminExams.tsx                 # Plant Admin exam configuration catalog & actions
│   │   │   ├── AuditLog.tsx                   # Enterprise compliance audit log viewer with filters
│   │   │   ├── Certificates.tsx               # Issued certificate repository & PDF downloads
│   │   │   ├── Departments.tsx                # Department & machine line configuration view
│   │   │   ├── Employees.tsx                  # Employee roster, face registration, and credentialing
│   │   │   ├── ExamBuilder.tsx                # 4-step interactive exam blueprinting workspace
│   │   │   ├── ExamDashboard.tsx              # Operator kiosk hub showing pending & completed exams
│   │   │   ├── ExamSession.tsx                # Proctored, fullscreen operator examination experience
│   │   │   ├── Login.tsx                      # Dual-role authentication screen (Plant Admin / Operator)
│   │   │   ├── NotFound.tsx                   # 404 error page with industrial aesthetic
│   │   │   ├── PrivacyPolicy.tsx              # Enterprise privacy policy view
│   │   │   ├── QuestionBank.tsx               # Searchable, filterable question repository & manager
│   │   │   ├── RegisterCompany.tsx            # Self-service company & plant onboarding workflow
│   │   │   ├── Rules.tsx                      # Safety manual hierarchy tree & rule browser
│   │   │   ├── Settings.tsx                   # Plant preferences, threshold controls, & brand settings
│   │   │   ├── TermsAndConditions.tsx         # Platform legal terms and safety disclaimers
│   │   │   └── VerifyCertificate.tsx          # Public QR-scan certificate authenticity verification
│   │   │
│   │   ├── utils/                             # Client Utilities
│   │   │   └── analytics.ts                   # Client-side metrics formatting & chart helpers
│   │   │
│   │   └── tests/
│   │       └── regenerate_ui_flow.test.ts     # Client-side UI flow verification tests
│   │
│   ├── Pdf/                                   # Sample Industrial PDF Safety Manuals
│   │   ├── Konark/
│   │   │   └── t999_user_manual.pdf
│   │   └── Meridian/
│   │       ├── english_lathe_interactive_manual_print_version_2023.pdf
│   │       ├── Operator training.01.pdf
│   │       └── OSHA3120.pdf
│   │
│   └── Pics/                                  # Graphic Assets, Logos, and Sample Operator Photos
│       ├── Logo.png
│       └── Profile pics/                      # Sample face photos for operator identity registration
│
├── reports/                                   # Architectural Audit & Benchmark Reports
│   └── artifacts/
│       ├── P1_DB_MEMORY_BENCHMARK.csv         # Database connection pool benchmark data
│       └── P1_TENANT_ISOLATION_AUDIT.json     # Multi-tenancy leak verification audit report
│
└── scripts/                                   # System Maintenance & Optimization Utilities
    ├── compress_images.py                     # Image asset compression script
    ├── fix_tokens.py                          # Design token normalization script
    ├── fix_ts_errors.py                       # Automated TypeScript typing correction helper
    ├── generate_social_assets.py              # Generates OpenGraph and Twitter card preview images
    ├── optimize_audit_log.py                  # Audit log query optimizer
    ├── optimize_rules.py                      # Rule indexing optimizer
    ├── optimize_rules_page.py                 # Rules page rendering optimizer
    ├── setup_llm.sh                           # Shell script to pull required Ollama models
    ├── update_alt_tags.py                     # Accessibility image alt-tag injector
    ├── update_app_404.py                      # Route handler updater
    ├── update_app_lazy.py                     # Code-splitting & lazy import optimizer
    ├── update_css_tokens.py                   # CSS custom property token updater
    ├── update_login_admin_first.py            # Login workflow updater
    ├── upgrade_login.py                       # Upgrades login screen styling
    └── upgrade_register.py                    # Upgrades registration screen styling
```

---

## 3. Technology Stack & Architectural Decisions

### 3.1 Backend Architecture
- **Language**: Python 3.14.
- **Framework**: **FastAPI** — Chosen for high-throughput asynchronous execution, native OpenAPI schema generation, and built-in support for Server-Sent Events (`StreamingResponse`).
- **Database Engine**: **PostgreSQL** accessed via **SQLAlchemy 2.0 (Async)** and **asyncpg**.
  - Connection pooling with `pool_size=10`, `max_overflow=20`, and `pool_recycle=1800` ensures robust concurrency during high-load plant shifts.
  - Multi-tenant architecture guarantees company data isolation via `company_id` foreign keys indexed across all primary tables.
- **Document Processing**: **PyMuPDF (`fitz`)** for blazingly fast digital text decomposition, bounding-box geometry extraction, and image extraction without external OCR overhead.
- **Local AI Inference Engine**: **Ollama** running locally on the plant edge or on-premise server.
  - Primary Model: `hf.co/bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M` (Fast, high-fidelity technical instruction following).
  - Secondary/Fallback Model: `phi3:mini` and deterministic heuristic parsing.
  - 100% On-Premise / Zero Data Leakage: Industrial proprietary manuals and worker data never leave the company's local network.
- **Certificate Engine**: **ReportLab** for generating cryptographically signed vector PDF documents with embedded QR codes and anti-counterfeiting visual hashes.

### 3.2 Frontend Architecture
- **Framework**: **React 18** bootstrapped with **Vite 5**.
- **Language**: **TypeScript 5.x** with strict type contracts synchronized with FastAPI Pydantic schemas.
- **Styling Architecture**: **Tailwind-free Vanilla CSS Design System** (`frontend/src/index.css`).
  - Implements an editorial dark/light industrial design system.
  - Calibrated color palettes: Void/Canvas surfaces, Violet/Emerald/Crimson accents, tactile borders, glassmorphic panels, and zero cheap AI-gradient patterns.
- **Biometric Neural Network**: **face-api.js** running client-side in the browser via WebGL/WebWorker.
  - Detects faces, aligns 68-point landmarks, and extracts 128-dimensional Euclidean face descriptor vectors.
  - Computes cosine distance against stored employee biometric vectors before unlocking exam sessions.
- **Animation & Micro-interactions**: **Framer Motion** for state-driven physics animations, modal overlays, progress bars, and tactile button states.

---

## 4. File-by-File Breakdown: Code Contents, Purpose, & Rationale

### 4.1 Root Level Files

#### `dcwgt_algorithm.py`
- **Contents**: Pure Python implementation of the **Dynamic Compliance Weighted Graph Traversal (DCWGT)** algorithm.
- **Purpose**: Calculates mathematical compliance risk vectors across industrial plant subcategories.
- **Rationale**: When assessing an operator, questions should not be chosen uniformly at random. DCWGT computes a weighted traversal through the safety knowledge graph based on:
  1. The risk score of the rule ($1 \le r \le 10$).
  2. The employee’s historical failure rate on that specific subcategory.
  3. The time decay since the employee was last certified.
  This ensures operator exams dynamically challenge the worker on their specific areas of vulnerability.

#### `start_backend.bat` & `start_frontend.bat`
- **Contents**: Windows batch scripts that check Python/Node runtime environments, install dependencies, and launch development/production servers.
- **Purpose**: Allows non-technical plant managers or local technicians to start the entire AegisGraph stack with a single double-click.
- **Rationale**: Industrial control room terminals frequently run Windows. Having pre-flight environment checks eliminates setup friction.

#### `AI_ONBOARDING.md`
- **Contents**: Complete system contract documentation, architectural constraints, API endpoints summary, and database schema mappings.
- **Purpose**: Serves as the single source of truth for engineering agents and developers onboarding to the codebase.

---

### 4.2 Backend Layer (`backend/app/`)

#### 4.2.1 Core Infrastructure (`backend/app/core/`)

- **`config.py`**:
  - *Contents*: `Settings` class inheriting from Pydantic `BaseSettings`. Contains database credentials, JWT secret keys, token expiration windows (24h), and Ollama model configuration (`settings.ollama_model`).
  - *Rationale*: Centralizes configuration management with environment variable override support (`.env`), ensuring secrets are never hardcoded.
- **`security.py`**:
  - *Contents*: Password hashing using Passlib with `bcrypt`, password verification, and JWT creation/decoding using `PyJWT` with `HS256`.
  - *Rationale*: Secures enterprise credentials against rainbow table attacks and issues stateless bearer tokens for API authorization.
- **`role_templates.py`**:
  - *Contents*: Predefined standard exam structures per industrial role (e.g., CNC Machinist, Overhead Crane Operator, Material Handler, Chemical Operator).
  - *Rationale*: Allows plant admins to create complete, legally compliant safety exams in seconds using industry-standard blueprints.
- **`metrics.py`**:
  - *Contents*: Custom timer contexts and Prometheus-compatible latency metrics tracking execution times of LLM generation, PDF ingestion, and database queries.
- **`logging.py`**:
  - *Contents*: Standardized logging configuration setting up structured formatters and log rotation.

#### 4.2.2 Database Layer (`backend/app/db/`)

- **`base_class.py`**:
  - *Contents*: Declarative base class `Base`, along with reusable SQLAlchemy mixins:
    - `UUIDMixin`: Generates primary key UUIDs (`id = uuid.uuid4`).
    - `TimestampMixin`: Automatically stamps `created_at` and `updated_at` timestamps using PostgreSQL `now()`.
  - *Rationale*: Prevents code duplication across 12+ database models and standardizes primary keys on UUIDs (preventing sequential ID enumeration attacks).
- **`session.py`**:
  - *Contents*: Initializes `create_async_engine` with `asyncpg` and configures `async_session_factory` using SQLAlchemy's `async_sessionmaker`.
  - *Rationale*: Provides non-blocking database transactions essential for handling simultaneous exam submissions and large document streaming.

#### 4.2.3 Relational Models (`backend/app/models/`)

- **`hierarchy.py`**:
  - *Entities*: `Manual`, `Section`, `SubCategory`, `Rule`, `FilteredBlock`.
  - *Role*: Models the core safety knowledge tree. A `Manual` has multiple `Section`s; a `Section` has `SubCategory`s; a `SubCategory` has `Rule`s.
  - *Features*:
    - `Rule.risk_score`: Integer constraint $1 \le x \le 10$.
    - `Rule.cognitive_level`: Bloom's taxonomy category (*Remember, Understand, Apply, Analyze, Evaluate, Create*).
    - `Rule.rule_code`: Systematic identifier formatted as `{SECTION_PREFIX}-{SEQ:03D}` (e.g., `OPER-001`, `ELEC-012`).
    - `FilteredBlock`: Stores text blocks rejected during ingestion (e.g., Table of Contents, copyright, or informational non-rules) so auditors can see exactly what text was excluded and why.
- **`question_bank.py`**:
  - *Entities*: `QuestionBankItem`, `QuestionVariant`, `QuestionAuditLog`.
  - *Role*: Represents the repository of safety assessment questions.
  - *Features*:
    - A `QuestionBankItem` links to a specific `Rule` and can maintain multiple `QuestionVariant`s (MCQ, True/False, Multiple Select, Fill Blank).
    - Tracks approval status (`draft`, `approved`, `rejected`), difficulty level, and review audit trail.
- **`exam_builder.py`**:
  - *Entities*: `ExamConfig`, `ExamConfigSlot`, `ExamAssignment`, `ExamAssignmentSlot`.
  - *Role*: The blueprinting system for assessments.
  - *Features*:
    - `ExamConfig`: Defines exam title, passing score percentage (default 80%), time limit in minutes, and allowed retries.
    - `ExamConfigSlot`: Defines a requirement slot (e.g., "Must draw 1 Apply-level question from SubCategory X with risk $\ge 7$").
    - `ExamAssignment`: Binds an exam blueprint to an employee with assignment status (`pending`, `in_progress`, `completed`, `expired`).
- **`assessment_session.py`**:
  - *Entities*: `AssessmentSession`, `AssessmentAnswer`.
  - *Role*: Runtime execution model of an operator taking an exam.
  - *Features*:
    - Records start time, completion time, final percentage score, pass/fail status, and face verification confidence score.
    - `AssessmentAnswer`: Records the exact selected answer, whether it was correct, time spent answering, and points earned.
- **`certificate.py`**:
  - *Entities*: `Certificate`.
  - *Role*: Formal credential issued upon passing an assessment session.
  - *Features*: Stores certificate number, employee reference, expiry date, verification hash (SHA-256), and path to the generated PDF.
- **`user.py`**:
  - *Entities*: `User`, `RoleEnum` (`SUPER_ADMIN`, `PLANT_ADMIN`, `OPERATOR`).
  - *Features*: Stores employee code, full name, department code, hashed password, 128-dimensional biometric face embedding (JSON array), and base64 employee photo.
- **`company.py`**:
  - *Entities*: `Company`.
  - *Role*: Represents the plant or enterprise tenant. Ensures strict tenant separation across all manuals, employees, and exams.
- **`audit_log.py`**:
  - *Entities*: `AuditLog`.
  - *Role*: Append-only compliance log recording critical actions (`MANUAL_UPLOAD`, `RULE_EDIT`, `EXAM_ASSIGN`, `EXAM_PASS`, `CERTIFICATE_ISSUED`).

#### 4.2.4 API Route Handlers (`backend/app/api/`)

- **`ingest.py`**:
  - *Route*: `POST /api/ingest/pdf`
  - *Implementation*: Receives uploaded PDF manual files, checks for duplicates, stores the source PDF in `uploads/`, and opens a Server-Sent Events (SSE) `StreamingResponse`.
  - *Pipeline*:
    1. Spawns `extract_blocks_stream` producer in an asynchronous background queue.
    2. Streams progress updates (`Parsed page X/Y...`) to the client.
    3. Feeds valid blocks to `extract_structured_rule`.
    4. Automatically generates unique rule codes (`OPER-001`, `OPER-002`) and persists sections, subcategories, and rules to the database.
    5. Yields real-time events so the user terminal stays live and responsive.
- **`exam_builder.py`**:
  - *Routes*:
    - `GET /api/v1/exam-builder/configs`: Lists plant exam configurations.
    - `POST /api/v1/exam-builder/configs`: Creates new exam blueprint.
    - `POST /api/v1/exam-builder/configs/{id}/slots`: Configures risk/category slots.
    - `POST /api/v1/exam-builder/configs/{id}/generate-questions`: Dispatches Ollama generation to fill empty blueprint slots.
    - `POST /api/v1/exam-builder/configs/{id}/lock-and-assign`: Locks blueprint and issues exam assignments to designated workers.
- **`assessment.py`**:
  - *Routes*:
    - `POST /api/assessment/start`: Validates employee assignment, checks face verification match, and initializes `AssessmentSession`.
    - `POST /api/assessment/submit`: Grades submitted answers, calculates score percentage, determines pass/fail status, logs audit event, and automatically triggers certificate generation if passed.
- **`question_bank.py`**:
  - *Routes*:
    - `GET /api/question-bank/items`: Filterable search across items by section, cognitive level, and status.
    - `POST /api/question-bank/generate-for-rule`: On-demand question generation for a selected rule.
    - `PATCH /api/question-bank/variants/{id}/approve`: Plant admin approval action.
- **`analytics.py`**:
  - *Route*: `GET /api/analytics/summary`
  - *Implementation*: Computes plant-wide safety KPIs: total certified operators, active compliance rate, average exam score, and high-risk category coverage.
- **`v1/endpoints/certificates.py`**:
  - *Routes*:
    - `GET /api/v1/certificates/`: Lists all certificates issued in the plant.
    - `GET /api/v1/certificates/{id}/download`: Streams ReportLab PDF certificate.
    - `GET /api/v1/certificates/verify/{hash}`: Public, unauthenticated endpoint allowing auditors or regulatory bodies to verify certificate authenticity via QR code scan.
- **`v1/endpoints/users.py`**:
  - *Routes*: Manages workforce directory, photo uploads, biometric vector enrollment, and role permissions.

#### 4.2.5 Services & AI Logic (`backend/app/services/`)

- **`ingestion/pdf_parser.py`**:
  - *Implementation*: Uses PyMuPDF (`fitz`) to inspect digital text layout, detect font scale hierarchies, calculate median font sizes, filter Table of Contents leaders (`.... 12`), and segment text into bite-sized blocks ($\le 1200$ characters).
  - *Image Handling*: Inspects bounding-box intersections with images, extracting and caching reference diagrams on disk to link them directly to extracted rules.
- **`llm/rule_extractor.py`**:
  - *Implementation*: The safety extraction pipeline.
  - *Architecture*:
    - Primary Engine: Async Ollama client calling `settings.ollama_model` with a 25-second timeout and strict JSON schema enforcement.
    - Secondary Engine: Deterministic Safety Heuristic Parser. If the LLM times out on CPU, experiences token repetition, or encounters an error, the heuristic parser regex-scans the text for technical imperatives (`shall`, `must`, `ensure`, `do not`, `lockout`, `tagout`, `inspect`), classifies the section, assigns risk scores, and returns clean rules in 1 millisecond.
    - **Result**: Document ingestion never stalls or loses rules.
- **`llm/generator.py`**:
  - *Implementation*: Question generator targeting Ollama.
  - *Specialization*: Contains specialized prompts for 4 distinct question types:
    1. **Multiple Choice (MCQ)**: Scenario-based question with 1 correct answer and 3 plausible industrial distractors.
    2. **True / False**: Safety assertion testing nuanced understanding of operational boundaries.
    3. **Multiple Select**: Complex hazard scenario requiring selection of all applicable safety precautions.
    4. **Fill in the Blank**: Exact technical recall of safety parameters (e.g., clearance distances, shutoff thresholds).
- **`llm/grounding_check.py`**:
  - *Implementation*: Verifies that generated questions are strictly grounded in the source text manual.
  - *Mechanism*: Extracts numerical quantities, units of measure, and technical terms from both source text and generated question. If the generated question invents numbers not present in the manual, it flags the question as hallucinated and drops its confidence score.
- **`certificate.py`**:
  - *Implementation*: ReportLab PDF generator that renders an industrial compliance certificate containing company logo, employee photo, operator credentials, issue/expiry dates, QR code, and SHA-256 verification hash.

---

### 4.3 Frontend Layer (`frontend/src/`)

#### 4.3.1 Application Shell & Routing (`frontend/src/`)

- **`App.tsx`**:
  - *Role*: Top-level React router configuration.
  - *Guards*:
    - Admin Routes (`/rules`, `/question-bank`, `/exam-builder`, `/employees`, `/certificates`, `/audit-log`, `/settings`): Protected by `AdminRoute` checking for `PLANT_ADMIN` or `SUPER_ADMIN` token role.
    - Operator Routes (`/kiosk`, `/exam/:assignmentId`): Protected by `OperatorRoute`.
    - Public Routes (`/login`, `/register`, `/verify/:hash`, `/terms`, `/privacy`).
- **`api.ts`**:
  - *Role*: Strongly typed TypeScript HTTP client interfacing with the FastAPI backend.
  - *Features*: Automatic JWT header injection (`Authorization: Bearer <token>`), unified error handling, and complete interface contracts for all DTOs.
- **`index.css`**:
  - *Role*: The platform's complete design system (1,000+ lines of custom CSS).
  - *Design Aesthetics*: Editorial dark-mode industrial typography, calibrated surface variables (`--void-0` through `--void-3`), crisp borders, neon indicator accents (emerald for passed, crimson for high-risk, amber for warning), and hardware-accelerated animations.

#### 4.3.2 Context & Global State (`frontend/src/context/`)

- **`IngestionContext.tsx`**:
  - *Role*: Manages PDF upload state, active streaming reader, log terminal output, live page/rule progress counters, and stored manual lists.
  - *Implementation*: Reads `ReadableStream` from `POST /api/ingest/pdf`, parses Server-Sent Event buffers (`data: {...}`), and dispatches state updates to UI terminal components.

#### 4.3.3 Exam Builder Suite (`frontend/src/components/exam_builder/`)

- **`BuilderCanvas.tsx`**:
  - *Role*: The 4-step wizard container guiding the admin from initial concept to live workforce deployment:
    - Step 1: **Setup** (`SetupStep.tsx`) — Title, department, passing score (default 80%), time limit.
    - Step 2: **Structure** (`StructureStep.tsx`) — Blueprint slot configuration. Admins can select pre-built role templates (`templates.ts`) or create custom rule slots.
    - Step 3: **Generate** (`GenerateStep.tsx`) — Inspects question bank coverage, displays question cards (`QuestionEditorCard.tsx`), and triggers on-demand AI generation (`AIGenerateSlotModal.tsx`) for missing slots.
    - Step 4: **Lock & Assign** (`LockAndAssignStep.tsx`) — Freezes the blueprint into an immutable version and dispatches assignments to plant workers.
- **`WorkerPreviewDrawer.tsx`**:
  - *Role*: Slide-over panel previewing all employees matching the selected department/role, showing their certification status and face enrollment state.

#### 4.3.4 Examination & Biometrics (`frontend/src/components/`)

- **`ExamUnlockScreen.tsx` & `FaceVerification.tsx`**:
  - *Role*: Pre-exam biometric security gate.
  - *Mechanism*: Activates operator webcam, runs `face-api.js` client-side neural network, extracts the live face descriptor, and sends it to `/api/assessment/start` to verify against the employee's registered embedding. Only a positive biometric match unlocks the examination session.
- **`AssessmentRenderer.tsx`**:
  - *Role*: The active examination interface.
  - *Features*: Fullscreen enforcement, countdown timer, question navigation pagination, instant answer state retention, and accessible keyboard input.
- **`IngestionTerminal.tsx`**:
  - *Role*: Terminal window rendering real-time streaming output during manual ingestion. Displays raw event logs, animated progress bars, and stored manual tables with deletion and download actions.

#### 4.3.5 Page Views (`frontend/src/pages/`)

- **`Rules.tsx`**: Interactive tree browser displaying manuals, sections, subcategories, active safety rules, and filtered non-rule blocks.
- **`QuestionBank.tsx`**: Central question management screen. Allows searching questions by rule code, cognitive level, and type, with review/approval controls.
- **`ExamBuilder.tsx` & `AdminExams.tsx`**: Complete exam management hub for drafting, reviewing, and launching plant examinations.
- **`ExamSession.tsx`**: Dedicated proctored exam experience for industrial operators.
- **`Certificates.tsx` & `VerifyCertificate.tsx`**:
  - `Certificates.tsx`: Admin repository of all issued plant certificates with instant PDF preview and download.
  - `VerifyCertificate.tsx`: Public certificate verification portal displaying operator name, plant name, certificate ID, and verification status from a mobile QR scan.
- **`AuditLog.tsx`**: Enterprise compliance audit browser with time-range filtering, severity indicators, and exportable compliance records.
- **`Employees.tsx`**: Workforce management screen with integrated webcam photo capture and automatic face-embedding extraction during employee registration.

---

## 5. End-to-End Data Lifecycle Walkthrough

```
[ Industrial PDF Manual ]
           │
           ▼
[ PyMuPDF Parser ] ─── Filter Noise / TOC ───▶ [ FilteredBlock (Audit Log) ]
           │
           ▼ (Clean Content Blocks)
[ Dual-Engine Rule Extractor ]
   ├── Engine A: Local Ollama (Qwen2.5-3B / Phi-3) [25s Timeout]
   └── Engine B: Technical Safety Heuristic Parser [1ms Fallback]
           │
           ▼
[ Knowledge Tree Persisted ] ─── (Manual -> Section -> SubCategory -> Rule)
           │
           ▼
[ Question Generator Engine ] ─── (MCQ, True/False, Multi-Select, Fill-Blank)
           │
           ▼
[ Question Bank Repository ] ─── Plant Admin Review & Approval
           │
           ▼
[ Exam Builder Blueprint ] ─── Role Templates & Risk-Weighted Slots
           │
           ▼
[ Exam Assignment Issued ] ─── Target Plant Employees
           │
           ▼
[ Kiosk Biometric Check ] ─── Webcam Neural Net Face Match (face-api.js)
           │
           ▼
[ Proctored Exam Session ] ─── Fullscreen Kiosk Testing & Anomaly Watch
           │
           ▼
[ Automated Grading Engine ]
           ├── Score < 80% ──▶ Failed: Recorded in Audit Log & Assignment Reset
           └── Score ≥ 80% ──▶ Passed:
                                   ├── Immutable Audit Log Entry
                                   ├── Cryptographic Hash Generated (SHA-256)
                                   ├── Vector PDF Certificate Rendered (ReportLab)
                                   └── Public QR Code Verification Enabled
```

---

## 6. How to Run the Project Locally

### Prerequisites
1. **Python 3.11+** (Python 3.14 recommended).
2. **Node.js 18+** & **npm**.
3. **PostgreSQL** running locally on port `5432` with database `aegisgraph_dev`.
4. **Ollama** running locally on port `11434` with model installed:
   ```bash
   ollama pull hf.co/bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M
   # or
   ollama pull phi3:mini
   ```

### Starting the Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be accessible at: `http://localhost:8000/docs`

### Starting the Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend Web Application will be accessible at: `http://localhost:5173`

---

## 7. Summary of Safety & Security Guarantees

1. **Zero Cloud Leaks**: Technical safety manuals, blueprints, employee photos, and exam results remain on the local plant network.
2. **Deterministic Fallbacks**: PDF ingestion and rule extraction operate with 100% reliability even if local AI services experience CPU load or delays.
3. **Tamper-Evident Certification**: Every issued certificate possesses a SHA-256 verification hash recorded in the database, preventing forged training certificates.
4. **Multi-Tenant Isolation**: Tenant boundaries are enforced at the database query level, guaranteeing that different companies or plant divisions cannot inspect each other's manuals, questions, or employee rosters.
