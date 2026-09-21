# AegisGraph AI: Enterprise Architecture & Project Overview

AegisGraph AI is a mission-critical, 100% offline Edge-AI Assessment Engine built for the **Tata Technologies InnoVent** competition. It is designed to generate highly accurate, dynamically constrained safety assessments for heavy industrial environments. 

By combining a **Neo4j Knowledge Graph** with **Local Edge Inference (Llama-3)** and the proprietary **DCWGT (Dynamic Cognitive-Weighted Graph Traversal)** algorithm, AegisGraph guarantees deterministic accuracy while completely eliminating data privacy risks.

---

## 1. High-Level Architecture

The system is built on a decoupled, modern enterprise stack separated into three primary tiers:

1. **Frontend Presentation Layer**: React 18, Vite, TypeScript, Framer Motion.
2. **Backend API & Logic Layer**: Python 3.11, FastAPI, Pydantic v2.
3. **Data & AI Layer**: Neo4j (Graph Database), Ollama (Local LLM Inference), LangChain.

> [!IMPORTANT]
> **Zero-Trust & 100% Offline**: The entire ecosystem, including the Large Language Model, runs locally on CPU (`num_gpu=0`). No data ever leaves the host machine, ensuring absolute compliance with strict enterprise data privacy requirements.

---

## 2. Core Innovation: DCWGT v2 Algorithm
*Dynamic Cognitive-Weighted Graph Traversal*

Traditional Retrieval-Augmented Generation (RAG) relies on vector embeddings, which are statistical and prone to hallucination. AegisGraph AI replaces vector search with **DCWGT**, a deterministic mathematical filter.

### How it Works:
1. **Constraint Ingestion**: The user requests a specific mathematical distribution (e.g., 2 Emergency Protocol rules, 3 Maintenance rules).
2. **Weighted Priority Filtering**: The algorithm applies a `DifficultyProfile` (e.g., High-Risk Weight 60%, Routine Weight 40%). It sorts the rules inside the Neo4j database based on their `risk_score` (1-10).
3. **Recursive Sibling Fallback**: If a section lacks enough rules to satisfy the user's numeric constraint, the algorithm dynamically traverses the graph to find structurally similar "sibling" categories to borrow rules from, ensuring the exact requested question count is always met without failing.
4. **Absolute Truth Locking**: The algorithm extracts these mathematically verified rules from the graph and securely locks them into a strictly typed tuple. 

---

## 3. The Data Engine: Neo4j Knowledge Graph

AegisGraph does not use standard relational databases. It utilizes Neo4j (Bolt protocol, Port 7687) to map relationships between safety domains.

- **Schema Hierarchy**: `Rule` → belongs to → `SubCategory` → belongs to → `Section`.
- **Rich Metadata**: Every rule node contains advanced attributes:
  - `risk_score`: Severity of the hazard (1.0 to 10.0).
  - `cognitive_level`: Bloom's Taxonomy categorization (Remember, Understand, Apply, Analyze, Evaluate, Create).
  - `estimated_response_time`: Seconds required to safely execute the protocol.
  - `revision_version`: Tracking compliance updates.
- **Batch Ingestion Pipeline**: The `/api/ingest/batch` endpoint allows thousands of rules to be dragged and dropped into the UI, clearing old data, committing new nodes via transactional `MERGE` statements, and automatically rebuilding graph indices.

---

## 4. The Inference Engine: Local Edge AI (Llama-3)

Once the DCWGT algorithm locks in the factual rules, they are passed to the AI layer via **LangChain**.

- **Prompt Engineering**: The rules are serialized into a highly structured system prompt. The prompt forces the LLM to act as an "Expert Industrial Safety Assessor."
- **Strict Bounding**: The LLM is explicitly instructed to generate multiple-choice questions *only* from the provided graph data. It is forbidden from using outside knowledge.
- **Answer Key Generation**: The prompt commands the LLM to provide a secure Answer Key at the bottom of the output for grading purposes.
- **Latency Profiling**: In-memory metrics track the exact millisecond latency of both the Graph Traversal and the LLM Inference, reporting this back to the frontend in real-time.

---

## 5. Backend Infrastructure (FastAPI)

The backend is built with enterprise-grade Python using object-oriented principles.

- **`app/api/`**: Contains the API Routers (`ingest.py`, `assessment.py`, `analytics.py`).
- **`app/models/schemas.py`**: Utilizes **Pydantic v2** for strict data validation. It ensures every piece of data entering or leaving the API conforms to exact specifications.
- **`app/services/`**:
  - `GraphService`: Handles Neo4j connection pooling, Cypher queries, and the DCWGT algorithm.
  - `AIService`: Manages the LangChain Ollama connection and prompt serialization.
- **`app/core/metrics.py`**: A thread-safe, in-memory latency tracker that feeds the frontend Analytics Dashboard.

---

## 6. Frontend Presentation (React + Framer Motion)

The frontend is an ultra-modern, motion-heavy Single Page Application designed around a custom **Void-Industrial** aesthetic.

### Aesthetic Design System
- **Colors**: Deep charcoal void backgrounds (`#07070e`) contrasted with neon functional accents: Emerald (Verified/Safe), Amber (Warning/Offline), Cyan (Active/Graph), and Red (High-Risk/Error).
- **Typography**: `Inter` for clean legibility and `JetBrains Mono` for terminal/data readouts.
- **Micro-animations**: Powered by Framer Motion to provide high-end, tactile feedback (pulsing dots, sliding tabs, glowing buttons).

### Key UI Components
1. **Analytics Dashboard**: Real-time telemetry showing total rules, section distributions via animated bar charts, and a dynamic inference latency sparkline.
2. **Ingestion Terminal**: A drag-and-drop zone that parses JSON files and visualizes the Neo4j graph commitment process line-by-line in a hacker-style terminal.
3. **Constraint Dashboard (Wizard)**: A 2-step animated wizard allowing the user to dial in exact question counts per section, and adjust the mathematical weight of high-risk vs. routine questions.
4. **Assessment Renderer**: A dual-pane layout. The left pane shows the strictly verified Neo4j rules (with color-coded risk badges). The right pane dynamically renders the AI's markdown output, featuring a collapsible, secure Answer Key drawer.

---

## 7. Enterprise Readiness (Tata Technologies Alignment)

AegisGraph AI is designed to win. It checks every box for enterprise software:
- **Modularity**: Code is strictly separated by concern (Services, Models, API, Components).
- **Robustness**: Advanced error handling (exponential backoff retry loops on the frontend, HTTP exception mapping on the backend).
- **Scalability**: While running locally for the prototype, the FastAPI + Neo4j stack is instantly ready to be containerized with Docker and deployed to a massive Kubernetes cluster.
- **Data Security**: In an industrial setting (like an automotive plant or aerospace manufacturer), proprietary safety protocols cannot be leaked to public models like ChatGPT. AegisGraph solves this entirely.

---

## Quick Start (Local Deployment)

### Prerequisites
- Python 3.11+
- Node.js 18+
- Neo4j Desktop (Running locally on `bolt://localhost:7687`)
- Ollama (Running locally with `llama3` pulled)

### 1. Setup Backend
```bash
# Clone the repository
git clone https://github.com/LORDMOSTER/AegisGraph-AI.git
cd AegisGraph-AI

# Configure environment variables
# Create a .env file in the root directory:
# NEO4J_URI=bolt://localhost:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=your_password_here

# Install dependencies and run
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:5173` to access the AegisGraph AI Dashboard. Drop the included `safety_data_v2.json` into the Ingest Terminal to initialize the Knowledge Graph!
