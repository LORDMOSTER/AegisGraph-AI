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
from app.models.assessment_session import Assessment
from app.models.user import User
from app.api.deps import get_current_active_user

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
async def generate_assessment(
    request: ConstraintRequest, 
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
) -> AssessmentResponse:
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
    
    rules_out = []
    assessment_md = "## Generated Assessment\n\n"
    answer_key_md = "\n\n## Answer Key\n\n"
    question_idx = 1
    
    import time
    start_time = time.time()
    
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
            
            rules_out.append({
                "id": str(rule.id),
                "text": rule.text,
                "sub_category": rule.sub_category,
                "risk_score": rule.risk_score,
                "cognitive_level": rule.cognitive_level,
                "estimated_response_time": rule.estimated_response_time,
                "revision_version": rule.revision_version,
            })
            
            assessment_md += f"**Q{question_idx}. {chosen.question_text}**\n\n"
            for j, opt in enumerate(chosen.options):
                assessment_md += f"- {chr(65+j)}) {opt}\n"
            assessment_md += "\n"
            
            answer_key_md += f"**Q{question_idx}**: {chr(65+chosen.correct_option_index)} (Rule: {str(rule.id)[:8]})\n"
            question_idx += 1
            
        else:
            skipped.append(rule.id)
            
    query_time_ms = (time.time() - start_time) * 1000
            
    if not manifest_items:
        return AssessmentResponse(
            status="incomplete",
            manifest=[],
            missing_questions_for_rules=skipped,
            message=f"No approved questions were found for the requested constraints. Please approve some rules and questions in the Question Bank first."
        )
        
    if skipped:
        return AssessmentResponse(
            status="incomplete",
            manifest=manifest_items,
            missing_questions_for_rules=skipped,
            message=f"{len(skipped)} selected rules have no approved question yet. Generate/approve questions for them or adjust constraints."
        )
        
    # Save assessment manifest
    assessment = Assessment(
        company_id=current_user.company_id,
        name=f"Assessment Template - {len(manifest_items)} Qs",
        manifest=[item.model_dump() for item in manifest_items],
        total_question_count=len(manifest_items),
        section_breakdown=request.constraints
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    
    return AssessmentResponse(
        status="ready",
        assessment_id=assessment.id,
        manifest=manifest_items,
        rules=rules_out,
        assessment=assessment_md + answer_key_md,
        query_duration_ms=query_time_ms,
        inference_latency_ms=0.0
    )

from app.models.test_attempt import ExamSession, ExamStatus
from app.models.certificate import Certificate
from app.models.company import Company
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import selectinload
from app.services.certificate import generate_certificate

class AssignRequest(BaseModel):
    assessment_id: uuid.UUID
    employee_ids: list[uuid.UUID]

@router.post("/assign", summary="Assign an exam to employees")
async def assign_exam(
    request: AssignRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    sessions = []
    for emp_id in request.employee_ids:
        session = ExamSession(
            assessment_id=request.assessment_id,
            employee_id=emp_id,
            status=ExamStatus.ASSIGNED,
            assigned_at=datetime.utcnow(),
            responses={}
        )
        db.add(session)
        sessions.append(session)
    await db.commit()
    return {"status": "success", "assigned_count": len(sessions)}

@router.get("/assessments", summary="Get all templates")
async def get_all_assessments(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(Assessment).where(Assessment.company_id == current_user.company_id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/my-exams", summary="Get assigned exams for employee")
async def get_my_exams(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = (
        select(ExamSession)
        .options(selectinload(ExamSession.assessment))
        .where(ExamSession.employee_id == current_user.id)
    )
    result = await db.execute(stmt)
    exams = result.scalars().all()
    
    return [{
        "exam_session_id": e.id,
        "assessment_name": e.assessment.name,
        "status": e.status,
        "assigned_at": e.assigned_at,
        "score": e.score,
        "total_questions": e.assessment.total_question_count
    } for e in exams]

@router.get("/exam/{exam_id}", summary="Get exam details")
async def get_exam(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).options(selectinload(ExamSession.assessment)).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.status == ExamStatus.ASSIGNED:
        exam.status = ExamStatus.IN_PROGRESS
        exam.started_at = datetime.utcnow()
        await db.commit()

    questions = []
    for item in exam.assessment.manifest:
        var_id = uuid.UUID(item['question_variant_id'])
        v_stmt = select(QuestionVariant).where(QuestionVariant.id == var_id)
        v_res = await db.execute(v_stmt)
        variant = v_res.scalar_one_or_none()
        if variant:
            questions.append({
                "id": str(variant.id),
                "rule_id": str(variant.rule_id),
                "question_text": variant.question_text,
                "options": variant.options,
                # Intentionally omitting correct_option_index
            })

    return {
        "exam_session_id": exam.id,
        "assessment_name": exam.assessment.name,
        "status": exam.status,
        "responses": exam.responses,
        "questions": questions
    }

class AnswerRequest(BaseModel):
    question_variant_id: str
    selected_option_index: int

@router.put("/exam/{exam_id}/answer", summary="Save single answer")
async def save_answer(
    exam_id: uuid.UUID,
    request: AnswerRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404)
        
    new_responses = dict(exam.responses)
    new_responses[request.question_variant_id] = request.selected_option_index
    exam.responses = new_responses
    
    await db.commit()
    return {"status": "saved"}

class SubmitRequest(BaseModel):
    integrity_score: float

@router.post("/exam/{exam_id}/submit", summary="Submit exam")
async def submit_exam(
    exam_id: uuid.UUID,
    request: SubmitRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).options(selectinload(ExamSession.assessment)).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    exam = result.scalar_one_or_none()
    
    if not exam:
        raise HTTPException(status_code=404)
        
    total_weighted_score = 0.0
    total_weight = 0.0
    
    for item in exam.assessment.manifest:
        var_id = uuid.UUID(item['question_variant_id'])
        rule_id = uuid.UUID(item['rule_id'])
        
        v_stmt = select(QuestionVariant).where(QuestionVariant.id == var_id)
        v_res = await db.execute(v_stmt)
        variant = v_res.scalar_one()
        
        r_stmt = select(Rule).where(Rule.id == rule_id)
        r_res = await db.execute(r_stmt)
        rule = r_res.scalar_one()
        
        weight = rule.risk_score
        total_weight += weight
        
        user_answer = exam.responses.get(str(var_id))
        if user_answer == variant.correct_option_index:
            total_weighted_score += weight
            
    sci_score = (total_weighted_score / total_weight * 100) if total_weight > 0 else 0
    
    exam.score = sci_score
    exam.completed_at = datetime.utcnow()
    
    c_stmt = select(Company).where(Company.id == current_user.company_id)
    c_res = await db.execute(c_stmt)
    company = c_res.scalar_one()
    
    if request.integrity_score < 70.0:
        exam.status = ExamStatus.PENDING_REVIEW
    elif sci_score >= 80.0: 
        exam.status = ExamStatus.COMPLETED
        qr, sig, pdf_url = generate_certificate(
            exam_session_id=exam.id,
            employee_id=current_user.id,
            full_name=current_user.full_name or current_user.employee_code,
            score=sci_score,
            company_name=company.name
        )
        cert = Certificate(
            exam_session_id=exam.id,
            employee_id=current_user.id,
            issued_at=datetime.utcnow(),
            qr_code_data=qr,
            signed_payload=sig,
            pdf_url=pdf_url
        )
        db.add(cert)
    else:
        exam.status = ExamStatus.FAILED

    await db.commit()
    return {"status": exam.status, "score": sci_score}

@router.get("/certificates", summary="Get my certificates")
async def get_my_certificates(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(Certificate).options(selectinload(Certificate.exam_session).selectinload(ExamSession.assessment)).where(Certificate.employee_id == current_user.id)
    result = await db.execute(stmt)
    certs = result.scalars().all()
    
    return [{
        "id": c.id,
        "issued_at": c.issued_at,
        "pdf_url": c.pdf_url,
        "assessment_name": c.exam_session.assessment.name,
        "score": c.exam_session.score
    } for c in certs]
