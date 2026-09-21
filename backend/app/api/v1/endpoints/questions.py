import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.schemas.question_bank import QuestionCreate, QuestionUpdate, QuestionStatusUpdate, QuestionResponse
from app.models.question_bank import QuestionBank, QuestionStatus
from app.api.deps import get_db_session, get_current_active_user
from app.models.user import User

router = APIRouter()

@router.get("/rule/{rule_id}", response_model=list[QuestionResponse])
async def get_questions_by_rule(
    rule_id: uuid.UUID,
    status_filter: QuestionStatus = None,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Fetches all question variants for a rule (filterable by status)."""
    stmt = select(QuestionBank).where(QuestionBank.rule_id == rule_id)
    if status_filter:
        stmt = stmt.where(QuestionBank.status == status_filter)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/rule/{rule_id}", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    rule_id: uuid.UUID,
    question_in: QuestionCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Adds a manual question variant directly to the bank."""
    options = [opt.model_dump() for opt in question_in.options]
    question = QuestionBank(
        rule_id=rule_id,
        stem=question_in.stem,
        options=options,
        correct_answer=question_in.correct_answer,
        explanation=question_in.explanation,
        bloom_level=question_in.bloom_level,
        status=QuestionStatus.DRAFT,
        grounding_verified=question_in.grounding_verified
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question

@router.put("/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: uuid.UUID,
    question_in: QuestionUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Allows safety admins to correct typos, adjust options, or change explanations before approval."""
    question = await db.get(QuestionBank, question_id)
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
        
    update_data = question_in.model_dump(exclude_unset=True)
    if "options" in update_data and update_data["options"] is not None:
        update_data["options"] = [opt for opt in update_data["options"]]
        
    for field, value in update_data.items():
        setattr(question, field, value)
        
    await db.commit()
    await db.refresh(question)
    return question

@router.patch("/{question_id}/status", response_model=QuestionResponse)
async def update_question_status(
    question_id: uuid.UUID,
    status_in: QuestionStatusUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Updates question state (APPROVED or REJECTED) with mandatory reviewer notes if rejected."""
    question = await db.get(QuestionBank, question_id)
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
        
    if status_in.status == QuestionStatus.REJECTED and not status_in.reviewer_notes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, 
            detail="Reviewer notes are mandatory when rejecting a question."
        )
        
    question.status = status_in.status
    if status_in.reviewer_notes:
        question.reviewer_notes = status_in.reviewer_notes
        
    await db.commit()
    await db.refresh(question)
    return question

@router.get("/pending-review", response_model=list[QuestionResponse])
async def get_pending_questions(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Returns a paginated queue of DRAFT questions awaiting human sign-off across sections."""
    stmt = (
        select(QuestionBank)
        .where(QuestionBank.status == QuestionStatus.DRAFT)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
