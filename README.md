# AegisGraph AI: Enterprise Architecture & Project Overview

AegisGraph AI is a mission-critical, 100% offline Edge-AI Assessment Engine built for the **Tata Technologies InnoVent** competition. It is designed to generate highly accurate, dynamically constrained safety assessments for heavy industrial environments. 

By combining a **Relational Knowledge Hierarchy (PostgreSQL)** with **Local Edge Inference (Ollama - Qwen2.5/Llama-3)** and the proprietary **DCWGT (Dynamic Cognitive-Weighted Graph Traversal)** algorithm, AegisGraph guarantees deterministic accuracy while completely eliminating data privacy risks.

---

## 1. High-Level Architecture

The system is built on a decoupled, modern enterprise stack separated into three primary tiers:

1. **Frontend Presentation Layer**: React 18, Vite, TypeScript, Tailwind CSS, Framer Motion.
2. **Backend API & Logic Layer**: Python 3.11, FastAPI, Pydantic v2.
3. **Data & AI Layer**: PostgreSQL (Relational Knowledge Base & App Data), SQLAlchemy 2.0 (Async ORM), Ollama (Local LLM Inference), LangChain.

> [!IMPORTANT]
> **Zero-Trust & 100% Offline**: The entire ecosystem, including the Large Language Model, runs entirely locally. No proprietary data ever leaves the host machine, ensuring absolute compliance with strict enterprise data privacy requirements.

---

## 2. Core Innovation: DCWGT v2 Algorithm
*Dynamic Cognitive-Weighted Graph Traversal (Relational Edition)*

Traditional Retrieval-Augmented Generation (RAG) relies on vector embeddings, which are statistical and prone to hallucination. AegisGraph AI replaces vector search with **DCWGT**, a deterministic mathematical filter.

### How it Works:
1. **Constraint Ingestion**: The admin requests a specific mathematical distribution (e.g., 5 General Safety questions, 2 Emergency Protocol questions).
2. **Hierarchical Filtering**: The algorithm uses highly-optimized asynchronous PostgreSQL queries via SQLAlchemy 2.0 to traverse the domain hierarchy (`Manual -> Section -> SubCategory -> Rule`).
3. **Usage Exclusion**: It actively filters out `QuestionVariant` records that the specific employee has already been assigned in previous `QuestionUsageHistory` records.
4. **Absolute Truth Locking**: The algorithm extracts mathematically verified rules from the SQL database and securely locks them into a strict dataset, which is passed directly to the LLM to ground the assessment generation.

---

## 3. The Data Engine: PostgreSQL + SQLAlchemy 2.0

AegisGraph V2 has fully migrated from Neo4j to an advanced, fully relational schema utilizing high-performance PostgreSQL.

### Hierarchical Knowledge Base
Instead of a separate graph database, PostgreSQL handles complex relationships via optimized joins and nested loading.
- **Schema Hierarchy**: `Company` → `Manual` → `Section` → `SubCategory` → `Rule` → `QuestionVariant`.
- **Rich Metadata**: Rules contain attributes like `risk_score` and `cognitive_level`. Questions inherit `bloom_level` and `difficulty`.

### Standard Application Data
PostgreSQL also handles standard transactional consistency for:
- User Management, Roles, and Authentication.
- Exam Sessions, Assessment Manifests, and Attempt Usage Histories.
- Generated Certificates and Audit Log Timelines.

---

## 4. The Inference Engine: Local Edge AI

Once the DCWGT algorithm locks in the factual rules, they are passed to the AI layer via **LangChain**.

- **Prompt Engineering**: The rules are serialized into highly structured system prompts. The AI acts as an "Expert Industrial Safety Assessor."
- **Live Generation Backfill**: If a rule lacks pre-approved questions, the LLM is invoked live to generate variants specifically grounded on that rule's text.
- **Strict Grounding Check**: The system includes a verification phase (`grounding_check.py`) to ensure the LLM generates content strictly based on the provided data, avoiding external hallucination.

---

## 5. End-to-End Evaluation & Certificate Pipeline

AegisGraph handles the entire lifecycle of employee assessment:
1. **Exam Conduction**: Employees unlock dynamically generated exams using a supervisor PIN and take them in a strictly monitored lockdown session.
2. **Automated Analytics & Grading**: The system instantly evaluates responses against the pre-approved exact answers (supporting MCQ, Multi-Select, and Fill-in-the-Blank regex matching).
3. **Certificate Generation**: Upon passing, an Ed25519 Cryptographically-signed PDF certificate is generated using ReportLab, branded, and permanently stored for compliance tracking.

---

## 6. Frontend Presentation (React + Framer Motion)

The frontend is an ultra-modern, motion-heavy Single Page Application designed around a custom **Void-Industrial** aesthetic.

### Key UI Components
1. **Analytics Dashboard & Audit Log**: Real-time telemetry tracking, including MediaPipe gaze anomalies and browser lockdown violations.
2. **Ingestion Terminal**: A UI to ingest new knowledge and visualize database commitments.
3. **Assessment Workflow**: End-to-end interface for admins to assign exams and for employees to execute them.
4. **Certificate Vault**: A searchable grid interface mapping issued PDF certificates to employees.

---

## Quick Start (Local Deployment)

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (Running locally on port `5432`)
- Ollama (Running locally with a model like Qwen2.5 or Llama-3 pulled)

### 1. Configure Environment Variables
Create a `.env` file in the root directory (refer to `.env.example`):
```env
# PostgreSQL Settings
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=aegisgraph_dev
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Local AI Inference
OLLAMA_MODEL="hf.co/bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M"
```

### 2. Start the Platform
The project includes convenient batch scripts for rapid startup:

**Backend:**
Run `start_backend.bat`. This automatically checks Python, installs `requirements.txt`, runs database migrations/startup hooks, and spins up the FastAPI server on `http://localhost:8000`.

**Frontend:**
Run `start_frontend.bat`. This automatically checks Node.js, runs `npm install`, and launches the Vite React app on `http://localhost:5173`.
