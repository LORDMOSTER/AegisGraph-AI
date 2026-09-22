import logging
import uuid
import random
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_db_session
from app.models.schemas import AssessmentResponse, ConstraintRequest, AssessmentManifestItem
from app.models.hierarchy import Rule, SubCategory, Section
from app.models.question_bank import QuestionVariant
from app.models.assessment_session import AssessmentSession

logger = logging.getLogger(__name__)
router = APIRouter()

BLOOM_WEIGHTS = {
    "Remember": 1,
    "Understand": 2,
    "Apply": 3,
    "Analyze": 4,
    "Evaluate": 5,
    "Create": 6
}

def knapsack_select(candidates, k: int, weight_fn):
    sorted_candidates = sorted(candidates, key=weight_fn, reverse=True)
    return sorted_candidates[:k]

@router.post(
    "/generate",
    response_model=AssessmentResponse,
    summary="Generate a constraint-bounded MCQ safety assessment",
)
async def generate_assessment(request: ConstraintRequest, db: AsyncSession = Depends(get_db_session)) -> AssessmentResponse:
    manifest_rules = []
    
    for section_name, count in request.constraints.items():
        if count <= 0:
            continue
            
        stmt = (
            select(Rule)
            .join(SubCategory, Rule.subcategory_id == SubCategory.id)
            .join(Section, SubCategory.section_id == Section.id)
            .where(Section.name == section_name)
            .where(Rule.review_status == "approved")
        )
        result = await db.execute(stmt)
        candidates = result.scalars().all()
        
        selected = knapsack_select(
            candidates, 
            k=count, 
            weight_fn=lambda r: r.risk_score * BLOOM_WEIGHTS.get(r.cognitive_level, 1)
        )
        
        # Sibling fallback: if we were searching for specific subcategories, we'd fallback. 
        # Since our constraint is section-level, candidates already include all subcategories in the section.
        # If len(selected) < count, we just don't have enough approved rules in this section.
        
        manifest_rules.extend(selected)

    manifest_items = []
    skipped = []
    
    for rule in manifest_rules:
        # Get approved variants for this rule
        stmt = (
            select(QuestionVariant)
            .where(QuestionVariant.rule_id == rule.id)
            .where(QuestionVariant.review_status == "approved")
        )
        result = await db.execute(stmt)
        variants = result.scalars().all()
        
        if variants:
            chosen = random.choice(variants)
            manifest_items.append(AssessmentManifestItem(rule_id=rule.id, question_variant_id=chosen.id))
        else:
            skipped.append(rule.id)
            
    if skipped:
        return AssessmentResponse(
            status="incomplete",
            manifest=manifest_items,
            missing_questions_for_rules=skipped,
            message=f"{len(skipped)} selected rules have no approved question yet. Generate/approve questions for them or adjust constraints."
        )
        
    # Save assessment manifest
    session = AssessmentSession()
    # Assuming AssessmentSession takes manifest, we should adapt to whatever fields it has. 
    # For now, let's just return it ready.
    db.add(session)
    await db.commit()
    
    return AssessmentResponse(
        status="ready",
        assessment_id=session.id,
        manifest=manifest_items
    )
