from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.api import assessment, ingest, analytics, question_bank
from app.core.config import settings
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(
    title=settings.app_name,
    description=(
        "AegisGraph AI — Mission-critical, 100% offline assessment engine. "
        "PostgreSQL knowledge base · DCWGT v2 traversal · Local Llama-3 edge inference."
    ),
    version=settings.api_version,
)

uploads_dir = os.path.join(os.getcwd(), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assessment.router, prefix="/api/assessment", tags=["Assessment"])
app.include_router(ingest.router,     prefix="/api/ingest",     tags=["Ingestion"])
app.include_router(analytics.router,  prefix="/api/analytics",  tags=["Analytics"])
app.include_router(question_bank.router, prefix="/api/questions", tags=["Question Bank"])

from app.api.v1.api import api_router as v1_router
app.include_router(v1_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    """Lightweight liveness probe."""
    return {"status": "operational", "engine": settings.app_name}
