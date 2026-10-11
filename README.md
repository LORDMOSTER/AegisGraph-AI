# AegisGraph AI: Enterprise Architecture & Project Overview

AegisGraph AI is a mission-critical, 100% offline Edge-AI Assessment Engine built for the **Tata Technologies InnoVent** competition. It is designed to generate highly accurate, dynamically constrained safety assessments for heavy industrial environments. 

By combining a **Neo4j Knowledge Graph** with **Local Edge Inference (Ollama - Qwen2.5/Llama-3)** and the proprietary **DCWGT (Dynamic Cognitive-Weighted Graph Traversal)** algorithm, AegisGraph guarantees deterministic accuracy while completely eliminating data privacy risks.

---

## 1. High-Level Architecture

The system is built on a decoupled, modern enterprise stack separated into three primary tiers:

1. **Frontend Presentation Layer**: React 18, Vite, TypeScript, Tailwind CSS, Framer Motion.
2. **Backend API & Logic Layer**: Python 3.11, FastAPI, Pydantic v2.
3. **Data & AI Layer**: Neo4j (Knowledge Graph), PostgreSQL (Relational Data), Ollama (Local LLM Inference), LangChain.

> [!IMPORTANT]
> **Zero-Trust & 100% Offline**: The entire ecosystem, including the Large Language Model, runs entirely locally. No proprietary data ever leaves the host machine, ensuring absolute compliance with strict enterprise data privacy requirements.

---

## 2. Core Innovation: DCWGT v2 Algorithm
*Dynamic Cognitive-Weighted Graph Traversal*

Traditional Retrieval-Augmented Generation (RAG) relies on vector embeddings, which are statistical and prone to hallucination. AegisGraph AI replaces vector search with **DCWGT**, a deterministic mathematical filter.

### How it Works:
1. **Constraint Ingestion**: The user requests a specific mathematical distribution (e.g., 2 Emergency Protocol rules, 3 Maintenance rules).
2. **Graph Filtering**: The algorithm traverses the Neo4j database using strict constraints and sorts rules based on hierarchical relations (e.g., `Rule -> SubCategory -> Section`).
3. **Cognitive Weighting**: Can weight rules by cognitive difficulty to adapt the assessment.
4. **Absolute Truth Locking**: The algorithm extracts these mathematically verified rules from the graph and securely locks them into a strict dataset, which is passed directly to the LLM to ground the assessment generation.

---

## 3. The Data Engine: Neo4j + PostgreSQL

AegisGraph utilizes a dual-database approach to handle different data paradigms optimally.

### Neo4j (Knowledge Graph)
Maps relationships between safety domains for accurate RAG.
- **Schema Hierarchy**: `Rule` → belongs to → `SubCategory` → belongs to → `Section`.
- **Rich Metadata**: Rules contain attributes like `risk_score` and `cognitive_level`.
- **Strict Constraints**: Unique constraints on `company_code` and `rule_id`, with optimized indexing for fast retrieval.

### PostgreSQL (Relational Data)
Handles standard application data, ensuring data integrity and transactional consistency for:
- User Management & Authentication.
- Exam Sessions, Assessment Attempts, and Usage Histories.
- Generated Certificates and Audit Logs.

---

## 4. The Inference Engine: Local Edge AI

Once the DCWGT algorithm locks in the factual rules, they are passed to the AI layer via **LangChain**.

- **Prompt Engineering**: The rules are serialized into highly structured system prompts. The AI acts as an "Expert Industrial Safety Assessor."
- **Strict Grounding Check**: The system includes a verification phase (`grounding_check.py`) to ensure the LLM generates content strictly based on the provided graph data, avoiding external hallucination.
- **Answer Key Generation**: The LLM securely generates answer keys alongside the dynamically created multiple-choice questions.

---


## 5. End-to-End Evaluation & Certificate Pipeline

AegisGraph handles the entire lifecycle of employee assessment:
1. **Exam Conduction**: Employees take dynamically generated exams securely in a lockdown mode.
2. **Automated Analytics & Grading**: The system instantly evaluates responses against the LLM's generated answer key.
3. **Certificate Generation**: Upon passing, a dynamically generated PDF certificate is awarded, parsed, and permanently stored for auditing and compliance tracking.

---

## 6. Frontend Presentation (React + Framer Motion)

The frontend is an ultra-modern, motion-heavy Single Page Application designed around a custom **Void-Industrial** aesthetic.

### Aesthetic Design System
- **Colors**: Deep charcoal void backgrounds contrasted with neon functional accents: Emerald (Verified/Safe), Amber (Warning/Offline), Cyan (Active/Graph), and Red (High-Risk/Error).
- **Typography**: Clean legibility paired with terminal/data readouts for a sophisticated technical feel.
- **Micro-animations**: Powered by Framer Motion to provide high-end, tactile feedback.

### Key UI Components
1. **Analytics Dashboard & Audit Log**: Real-time telemetry, telemetry tracking, and session monitoring.
2. **Ingestion Terminal**: A UI to ingest new knowledge and visualize Neo4j graph commitment.
3. **Assessment Workflow**: End-to-end interface for assigning and conducting exams in secure sessions.
4. **Certificate Vault**: A searchable grid interface mapping issued PDF certificates to employees.

---

## Quick Start (Local Deployment)

### Prerequisites
- Python 3.11+
- Node.js 18+
- Neo4j Desktop (Running locally on `bolt://localhost:7687`)
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

# Neo4j Settings
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_neo4j_password

# Local AI Inference
OLLAMA_MODEL="hf.co/bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M"
```

### 2. Database Initialization
Ensure your local Neo4j and PostgreSQL servers are active, then run:
```bash
cd backend
python scripts/setup_neo4j_schema.py
```

### 3. Start the Platform
The project includes convenient batch scripts for rapid startup:

**Backend:**
Run `start_backend.bat`. This automatically checks Python, installs `requirements.txt`, and spins up the FastAPI server on `http://localhost:8000`.

**Frontend:**
Run `start_frontend.bat`. This automatically checks Node.js, runs `npm install`, and launches the Vite React app on `http://localhost:5173`.
