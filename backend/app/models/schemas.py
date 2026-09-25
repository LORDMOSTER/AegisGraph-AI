import uuid
from enum import Enum
from typing import Optional, List, Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class CognitiveLevel(str, Enum):
    remember   = "Remember"
    understand = "Understand"
    apply      = "Apply"
    analyze    = "Analyze"
    evaluate   = "Evaluate"
    create     = "Create"


# ---------------------------------------------------------------------------
# Ingestion schemas
# ---------------------------------------------------------------------------

class RuleIngest(BaseModel):
    """A single rule record for batch ingestion into the knowledge graph."""

    id: str
    section: str
    sub_category: str
    rule: str
    risk_score: float = Field(default=5.0, ge=1.0, le=10.0, description="1 = low, 10 = critical")
    cognitive_level: CognitiveLevel = CognitiveLevel.understand
    estimated_response_time: int = Field(default=60, description="Expected answer time in seconds")
    revision_version: str = Field(default="1.0", description="Document revision tag")


class BatchIngestRequest(BaseModel):
    """Payload for POST /api/ingest/batch."""

    rules: list[RuleIngest] = Field(..., min_length=1)
    clear_existing: bool = Field(
        default=True,
        description="If true, wipes the graph before ingesting. Safe for testing.",
    )


class BatchIngestResponse(BaseModel):
    """Result of a completed batch ingestion."""

    ingested_count: int
    cleared: bool
    duration_ms: float


# ---------------------------------------------------------------------------
# Assessment schemas
# ---------------------------------------------------------------------------

class DifficultyWeights(BaseModel):
    """Optional difficulty profile for balancing assessment composition."""

    high_risk_ratio: float = Field(default=0.6, ge=0.0, le=1.0)
    routine_ratio: float = Field(default=0.4, ge=0.0, le=1.0)


class ConstraintRequest(BaseModel):
    """
    Accepted by POST /api/assessment/generate.

    Example:
        {
            "constraints": {"Emergency Protocol": 2, "Routine Check": 2},
            "difficulty_weights": {"high_risk_ratio": 0.7, "routine_ratio": 0.3}
        }
    """

    constraints: dict[str, int] = Field(
        ...,
        description="Section name → question count.",
        examples=[{"Emergency Protocol": 2, "Routine Check": 2}],
    )
    difficulty_weights: Optional[DifficultyWeights] = None


class RuleRecord(BaseModel):
    """An enriched rule node returned by the DCWGT engine."""

    id: str
    text: str
    sub_category: str
    risk_score: float = 5.0
    cognitive_level: str = "Understand"
    estimated_response_time: int = 60
    revision_version: str = "1.0"


class AssessmentManifestItem(BaseModel):
    rule_id: uuid.UUID
    question_variant_id: uuid.UUID

class AssessmentResponse(BaseModel):
    status: str
    manifest: list[AssessmentManifestItem]
    missing_questions_for_rules: Optional[list[uuid.UUID]] = None
    message: Optional[str] = None
    assessment_id: Optional[uuid.UUID] = None
    rules: Optional[list[dict]] = None
    assessment: Optional[str] = None
    query_duration_ms: Optional[float] = 0.0
    inference_latency_ms: Optional[float] = 0.0


# ---------------------------------------------------------------------------
# Question Bank schemas
# ---------------------------------------------------------------------------

class QuestionVariantResponse(BaseModel):
    id: uuid.UUID
    rule_id: uuid.UUID
    question_text: str
    options: list[str]
    correct_option_index: int
    bloom_level: str
    confidence: float
    review_status: str

    class Config:
        from_attributes = True

class QuestionVariantUpdate(BaseModel):
    question_text: Optional[str] = None
    options: Optional[list[str]] = None
    correct_option_index: Optional[int] = None
    review_status: Optional[str] = None

class FlatQuestionVariantResponse(QuestionVariantResponse):
    manualTitle: str
    sectionName: str
    subcategoryName: str
    rule_text: str
    rule_code: str


# ---------------------------------------------------------------------------
# Analytics schemas
# ---------------------------------------------------------------------------

class SectionMetrics(BaseModel):
    """Per-section stats for the analytics dashboard."""

    name: str
    rule_count: int
    avg_risk_score: float


class AnalyticsSummary(BaseModel):
    """Response for GET /api/analytics/summary."""

    total_manuals: int = 0
    total_rules: int
    total_sections: int
    total_subcategories: int
    question_bank_counts: dict[str, int] = {}
    section_metrics: list[SectionMetrics]
    last_inference_latency_ms: Optional[float]
    last_query_latency_ms: Optional[float]
    latency_history: list[float]
