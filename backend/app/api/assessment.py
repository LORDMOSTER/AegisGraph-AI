import logging
from fastapi import APIRouter, HTTPException, status
from app.models.schemas import AssessmentResponse, ConstraintRequest

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post(
    "/generate",
    response_model=AssessmentResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    summary="[DEPRECATED] Generate a constraint-bounded MCQ safety assessment",
)
def generate_assessment(request: ConstraintRequest) -> AssessmentResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Neo4j inference has been decommissioned as part of Phase 0.",
    )
