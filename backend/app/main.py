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

static_dir = os.path.join(os.getcwd(), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

cert_dir = os.path.join(os.getcwd(), "certs")
os.makedirs(cert_dir, exist_ok=True)
app.mount("/certs", StaticFiles(directory=cert_dir), name="certs")


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_and_https_middleware(request, call_next):
    # Enforce HTTPS redirect if force_https is enabled and request is insecure
    if settings.force_https and request.url.scheme == "http" and request.url.hostname not in ("localhost", "127.0.0.1"):
        from starlette.responses import RedirectResponse
        https_url = str(request.url).replace("http://", "https://", 1)
        return RedirectResponse(url=https_url, status_code=301)
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

app.include_router(assessment.router, prefix="/api/assessment", tags=["Assessment"])
app.include_router(ingest.router,     prefix="/api/ingest",     tags=["Ingestion"])
app.include_router(analytics.router,  prefix="/api/analytics",  tags=["Analytics"])
app.include_router(question_bank.router, prefix="/api/questions", tags=["Question Bank"])

from app.api.v1.api import api_router as v1_router
from app.api.v1.endpoints import audit

app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(v1_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    """Lightweight liveness probe."""
    return {"status": "operational", "engine": settings.app_name}
