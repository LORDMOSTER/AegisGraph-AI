import logging
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.api.deps import get_db_session
from app.models.schemas import AnalyticsSummary
from app.models.hierarchy import Manual, Section, Rule
from app.models.question_bank import QuestionBank

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get(
    "/summary",
    response_model=AnalyticsSummary,
    status_code=status.HTTP_200_OK,
    summary="Live analytics summary from the PostgreSQL knowledge base",
)
async def get_analytics_summary(db: AsyncSession = Depends(get_db_session)) -> AnalyticsSummary:
    # Get total active counts
    total_manuals = await db.scalar(select(func.count(Manual.id)))
    total_sections = await db.scalar(select(func.count(Section.id)))
    total_rules = await db.scalar(select(func.count(Rule.id)).where(Rule.is_active == True))
    
    # Get question variants grouped by status
    qb_counts = await db.execute(
        select(QuestionBank.status, func.count(QuestionBank.id))
        .group_by(QuestionBank.status)
    )
    
    question_bank_counts = {}
    for row in qb_counts.all():
        # Depending on how the ENUM is parsed, row[0] might be the enum member or a string
        status_key = row[0].value if hasattr(row[0], "value") else str(row[0])
        question_bank_counts[status_key] = row[1]
    
    # Get section metrics (rule count and avg risk score per section)
    from app.models.hierarchy import SubCategory
    section_metrics_res = await db.execute(
        select(
            Section.name,
            func.count(Rule.id).label("rule_count"),
            func.coalesce(func.avg(Rule.risk_score), 0.0).label("avg_risk_score")
        )
        .join(SubCategory, SubCategory.section_id == Section.id)
        .join(Rule, Rule.subcategory_id == SubCategory.id)
        .where(Rule.is_active == True)
        .group_by(Section.id)
    )
    
    section_metrics = [
        {
            "name": row.name,
            "rule_count": row.rule_count,
            "avg_risk_score": float(row.avg_risk_score)
        }
        for row in section_metrics_res.all()
    ]
    
    return AnalyticsSummary(
        total_manuals=total_manuals or 0,
        total_sections=total_sections or 0,
        total_rules=total_rules or 0,
        total_subcategories=0,
        question_bank_counts=question_bank_counts,
        section_metrics=section_metrics,
        last_inference_latency_ms=None,
        last_query_latency_ms=None,
        latency_history=[]
    )
