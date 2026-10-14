"""
exam_builder.py (API router)

FastAPI endpoints for Exam Builder:
  - Drafts CRUD (create, read, update, delete, list)
  - Sections CRUD (create, update, delete, reorder) with config validation
  - Questions CRUD (create manual, update, delete, duplicate, move, reorder, pin, undo, save-to-bank)
  - Validation (blocking errors vs warnings)
  - Planning (/plan feasibility analysis)
  - Background generation (/generate, /events SSE, /cancel)
  - Locking (/lock creates immutable Assessment)
  - Cloning (/clone clones locked draft to new version)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import hashlib
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db_session
from app.db.session import async_session_factory
from app.models.assessment_session import Assessment
from app.models.exam_builder import (
    ExamDraft,
    ExamDraftStatus,
    ExamQuestion,
    ExamQuestionRevision,
    ExamSection,
    GenerationJob,
    GenerationJobStatus,
    QuestionOrigin,
)
from app.models.question_bank import QuestionVariant
from app.models.test_attempt import ExamSession, ExamStatus
from app.models.user import User
from app.schemas.exam_builder import (
    AlternativeVariantResponse,
    CloneDraftResponse,
    DraftFeasibilityResponse,
    ExamDraftCreate,
    ExamDraftResponse,
    ExamDraftUpdate,
    ExamQuestionCreate,
    ExamQuestionResponse,
    ExamQuestionUpdate,
    ExamSectionCreate,
    ExamSectionResponse,
    ExamSectionUpdate,
    GenerationJobResponse,
    LockDraftResponse,
    RegenerateQuestionRequest,
    ReorderRequest,
    SwapQuestionRequest,
    ValidationIssue,
    ValidationResponse,
)
from app.services.exam_builder.config_validation import (
    ConfigValidationError,
    validate_draft_content,
    validate_section_config,
)
from app.services.exam_builder.generator_job import (
    broadcast_event,
    cancel_job,
    execute_generation_job,
    execute_section_regeneration_job,
    stream_job_events,
)
from app.services.exam_builder.planner import (
    build_draft_feasibility_report,
)
from app.services.exam_builder.regenerate_ladder import (
    get_question_alternatives,
    regenerate_question_ladder,
    swap_question_with_variant,
)

router = APIRouter(tags=["exam-builder"])


# ---------------------------------------------------------------------------
# Helper: Fetch and verify draft ownership
# ---------------------------------------------------------------------------

async def _get_draft_or_404(
    draft_id: uuid.UUID,
    db: AsyncSession,
    company_id: Optional[uuid.UUID] = None,
    must_be_editable: bool = False,
) -> ExamDraft:
    stmt = (
        select(ExamDraft)
        .where(ExamDraft.id == draft_id)
        .options(
            selectinload(ExamDraft.sections).selectinload(ExamSection.questions)
        )
    )
    if company_id:
        stmt = stmt.where(ExamDraft.company_id == company_id)
    res = await db.execute(stmt)
    draft = res.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Exam draft not found")

    if must_be_editable and draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(
            status_code=400,
            detail="Exam draft is locked and immutable. Clone to a new version to edit.",
        )
    return draft


# ---------------------------------------------------------------------------
# 1. Drafts CRUD
# ---------------------------------------------------------------------------

@router.post("/exam-drafts", response_model=ExamDraftResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    draft_in: ExamDraftCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamDraft:
    key_hash = None
    if draft_in.exam_key:
        pepper = "aegis-lockdown-v1"
        key_hash = hashlib.sha256(f"{pepper}:{draft_in.exam_key.upper()}".encode()).hexdigest()

    draft = ExamDraft(
        company_id=current_user.company_id,
        created_by=current_user.id,
        title=draft_in.title,
        target=draft_in.target,
        duration_minutes=draft_in.duration_minutes,
        available_from=draft_in.available_from,
        available_until=draft_in.available_until,
        scoring_mode=draft_in.scoring_mode,
        pass_percent=draft_in.pass_percent,
        reveal_score=draft_in.reveal_score,
        exam_key_hash=key_hash,
        status=ExamDraftStatus.DRAFT.value,
        version=1,
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return await _get_draft_or_404(draft.id, db)


@router.get("/exam-drafts", response_model=List[ExamDraftResponse])
async def list_drafts(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> List[ExamDraft]:
    stmt = (
        select(ExamDraft)
        .where(ExamDraft.company_id == current_user.company_id)
        .options(selectinload(ExamDraft.sections).selectinload(ExamSection.questions))
        .order_by(ExamDraft.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(ExamDraft.status == status_filter)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get("/exam-drafts/{draft_id}", response_model=ExamDraftResponse)
async def get_draft(
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamDraft:
    return await _get_draft_or_404(draft_id, db, company_id=current_user.company_id)


@router.put("/exam-drafts/{draft_id}", response_model=ExamDraftResponse)
async def update_draft(
    draft_id: uuid.UUID,
    draft_in: ExamDraftUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamDraft:
    draft = await _get_draft_or_404(
        draft_id, db, company_id=current_user.company_id, must_be_editable=True
    )
    if draft_in.title is not None:
        draft.title = draft_in.title
    if draft_in.target is not None:
        draft.target = draft_in.target
    if draft_in.duration_minutes is not None:
        draft.duration_minutes = draft_in.duration_minutes
    if draft_in.available_from is not None:
        draft.available_from = draft_in.available_from
    if draft_in.available_until is not None:
        draft.available_until = draft_in.available_until
    if draft_in.scoring_mode is not None:
        draft.scoring_mode = draft_in.scoring_mode
    if draft_in.pass_percent is not None:
        draft.pass_percent = draft_in.pass_percent
    if draft_in.reveal_score is not None:
        draft.reveal_score = draft_in.reveal_score
    if draft_in.exam_key is not None:
        pepper = "aegis-lockdown-v1"
        draft.exam_key_hash = hashlib.sha256(f"{pepper}:{draft_in.exam_key.upper()}".encode()).hexdigest()

    await db.commit()
    return await _get_draft_or_404(draft_id, db)


@router.delete("/exam-drafts/{draft_id}")
async def delete_draft(
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    draft = await _get_draft_or_404(draft_id, db, company_id=current_user.company_id)
    await db.delete(draft)
    await db.commit()
    return {"status": "deleted", "id": str(draft_id)}


# ---------------------------------------------------------------------------
# 2. Sections CRUD
# ---------------------------------------------------------------------------

@router.post("/exam-drafts/{draft_id}/sections", response_model=ExamSectionResponse)
async def create_section(
    draft_id: uuid.UUID,
    sec_in: ExamSectionCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamSection:
    draft = await _get_draft_or_404(
        draft_id, db, company_id=current_user.company_id, must_be_editable=True
    )

    try:
        norm_type_mix, count, norm_diff_mix = validate_section_config(
            sec_in.type_mix,
            sec_in.difficulty_mix,
            question_count=sec_in.question_count,
            preset=sec_in.preset,
        )
    except ConfigValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": e.message, "errors": e.errors},
        )

    # Determine order index
    next_order = len(draft.sections) if draft.sections else 0
    if sec_in.order_index is not None and sec_in.order_index > 0:
        next_order = sec_in.order_index

    section = ExamSection(
        draft_id=draft.id,
        order_index=next_order,
        title=sec_in.title,
        instructions=sec_in.instructions,
        topic_filter=sec_in.topic_filter,
        type_mix=norm_type_mix,
        difficulty_mix=norm_diff_mix,
        marks_per_question=sec_in.marks_per_question,
        min_pass_percent=sec_in.min_pass_percent,
        shuffle_questions=sec_in.shuffle_questions,
        shuffle_options=sec_in.shuffle_options,
    )
    db.add(section)
    await db.commit()
    await db.refresh(section)

    stmt = select(ExamSection).where(ExamSection.id == section.id).options(selectinload(ExamSection.questions))
    res = await db.execute(stmt)
    return res.scalar_one()


@router.put("/exam-sections/{section_id}", response_model=ExamSectionResponse)
async def update_section(
    section_id: uuid.UUID,
    sec_in: ExamSectionUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamSection:
    stmt = (
        select(ExamSection)
        .where(ExamSection.id == section_id)
        .options(selectinload(ExamSection.draft), selectinload(ExamSection.questions))
    )
    res = await db.execute(stmt)
    section = res.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Exam section not found")

    if section.draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(status_code=400, detail="Cannot edit section in locked draft")

    # If mix or preset is updated, validate
    new_type_mix = sec_in.type_mix if sec_in.type_mix is not None else section.type_mix
    new_diff_mix = sec_in.difficulty_mix if sec_in.difficulty_mix is not None else section.difficulty_mix

    if sec_in.type_mix is not None or sec_in.difficulty_mix is not None or sec_in.preset is not None:
        try:
            norm_type_mix, count, norm_diff_mix = validate_section_config(
                new_type_mix,
                new_diff_mix,
                preset=sec_in.preset,
            )
            section.type_mix = norm_type_mix
            section.difficulty_mix = norm_diff_mix
        except ConfigValidationError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": e.message, "errors": e.errors},
            )

    if sec_in.title is not None:
        section.title = sec_in.title
    if sec_in.instructions is not None:
        section.instructions = sec_in.instructions
    if sec_in.topic_filter is not None:
        section.topic_filter = sec_in.topic_filter
    if sec_in.marks_per_question is not None:
        section.marks_per_question = sec_in.marks_per_question
    if sec_in.min_pass_percent is not None:
        section.min_pass_percent = sec_in.min_pass_percent
    if sec_in.shuffle_questions is not None:
        section.shuffle_questions = sec_in.shuffle_questions
    if sec_in.shuffle_options is not None:
        section.shuffle_options = sec_in.shuffle_options
    if sec_in.order_index is not None:
        section.order_index = sec_in.order_index

    await db.commit()
    await db.refresh(section)
    return section


@router.delete("/exam-sections/{section_id}")
async def delete_section(
    section_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    stmt = select(ExamSection).where(ExamSection.id == section_id).options(selectinload(ExamSection.draft))
    res = await db.execute(stmt)
    section = res.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Exam section not found")
    if section.draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(status_code=400, detail="Cannot delete section from locked draft")

    await db.delete(section)
    await db.commit()
    return {"status": "deleted", "id": str(section_id)}


@router.post("/exam-drafts/{draft_id}/sections/reorder")
async def reorder_sections(
    draft_id: uuid.UUID,
    reorder_in: ReorderRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    draft = await _get_draft_or_404(draft_id, db, must_be_editable=True)
    sec_map = {s.id: s for s in draft.sections}
    for item in reorder_in.items:
        if item.id in sec_map:
            sec_map[item.id].order_index = item.order_index
    await db.commit()
    return {"status": "reordered"}


# ---------------------------------------------------------------------------
# 3. Questions CRUD
# ---------------------------------------------------------------------------

@router.post("/exam-sections/{section_id}/questions", response_model=ExamQuestionResponse)
async def create_question(
    section_id: uuid.UUID,
    q_in: ExamQuestionCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamQuestion:
    stmt = (
        select(ExamSection)
        .where(ExamSection.id == section_id)
        .options(selectinload(ExamSection.draft), selectinload(ExamSection.questions))
    )
    res = await db.execute(stmt)
    section = res.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Exam section not found")
    if section.draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(status_code=400, detail="Cannot add question to locked draft")

    next_order = len(section.questions) if section.questions else 0
    if q_in.order_index is not None and q_in.order_index > 0:
        next_order = q_in.order_index

    question = ExamQuestion(
        section_id=section_id,
        order_index=next_order,
        question_type=q_in.question_type,
        difficulty=q_in.difficulty,
        marks=q_in.marks if q_in.marks is not None else section.marks_per_question,
        stem=q_in.stem,
        payload=q_in.payload,
        origin=QuestionOrigin.MANUAL.value,
        rule_id=q_in.rule_id,
        is_locked=q_in.is_locked,
        explanation=q_in.explanation,
        confidence=q_in.confidence,
        warnings=[],
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


@router.put("/exam-questions/{question_id}", response_model=ExamQuestionResponse)
async def update_question(
    question_id: uuid.UUID,
    q_in: ExamQuestionUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamQuestion:
    stmt = (
        select(ExamQuestion)
        .where(ExamQuestion.id == question_id)
        .options(selectinload(ExamQuestion.section).selectinload(ExamSection.draft))
    )
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")
    if question.section.draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(status_code=400, detail="Cannot edit question in locked draft")

    # Record snapshot in revisions for undo
    snapshot = {
        "stem": question.stem,
        "difficulty": question.difficulty,
        "marks": question.marks,
        "payload": dict(question.payload),
        "explanation": question.explanation,
        "origin": question.origin,
    }
    rev = ExamQuestionRevision(question_id=question.id, snapshot=snapshot)
    db.add(rev)

    # Apply updates
    if q_in.stem is not None:
        question.stem = q_in.stem
    if q_in.difficulty is not None:
        question.difficulty = q_in.difficulty
    if q_in.marks is not None:
        question.marks = q_in.marks
    if q_in.payload is not None:
        question.payload = q_in.payload
    if q_in.is_locked is not None:
        question.is_locked = q_in.is_locked
    if q_in.explanation is not None:
        question.explanation = q_in.explanation
    if q_in.order_index is not None:
        question.order_index = q_in.order_index
    if q_in.rule_id is not None:
        question.rule_id = q_in.rule_id

    question.origin = QuestionOrigin.EDITED.value
    await db.commit()
    await db.refresh(question)
    return question


@router.delete("/exam-questions/{question_id}")
async def delete_question(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    stmt = (
        select(ExamQuestion)
        .where(ExamQuestion.id == question_id)
        .options(selectinload(ExamQuestion.section).selectinload(ExamSection.draft))
    )
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")
    if question.section.draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(status_code=400, detail="Cannot delete question from locked draft")

    await db.delete(question)
    await db.commit()
    return {"status": "deleted", "id": str(question_id)}


@router.post("/exam-questions/{question_id}/pin")
async def toggle_pin_question(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    stmt = select(ExamQuestion).where(ExamQuestion.id == question_id)
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")

    question.is_locked = not question.is_locked
    await db.commit()
    return {"id": str(question.id), "is_locked": question.is_locked}


@router.post("/exam-questions/{question_id}/duplicate", response_model=ExamQuestionResponse)
async def duplicate_question(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamQuestion:
    stmt = (
        select(ExamQuestion)
        .where(ExamQuestion.id == question_id)
        .options(selectinload(ExamQuestion.section).selectinload(ExamSection.draft))
    )
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")
    if question.section.draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(status_code=400, detail="Cannot duplicate into locked draft")

    clone_q = ExamQuestion(
        section_id=question.section_id,
        order_index=question.order_index + 1,
        question_type=question.question_type,
        difficulty=question.difficulty,
        marks=question.marks,
        stem=f"{question.stem} (Copy)",
        payload=dict(question.payload),
        origin=QuestionOrigin.MANUAL.value,
        rule_id=question.rule_id,
        is_locked=False,
        explanation=question.explanation,
        confidence=question.confidence,
        warnings=[],
    )
    db.add(clone_q)
    await db.commit()
    await db.refresh(clone_q)
    return clone_q


@router.post("/exam-questions/{question_id}/move")
async def move_question(
    question_id: uuid.UUID,
    target_section_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    stmt = select(ExamQuestion).where(ExamQuestion.id == question_id)
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")

    t_stmt = select(ExamSection).where(ExamSection.id == target_section_id)
    t_res = await db.execute(t_stmt)
    t_sec = t_res.scalar_one_or_none()
    if not t_sec:
        raise HTTPException(status_code=404, detail="Target section not found")

    question.section_id = target_section_id
    await db.commit()
    return {"status": "moved", "new_section_id": str(target_section_id)}


@router.post("/exam-sections/{section_id}/questions/reorder")
async def reorder_questions(
    section_id: uuid.UUID,
    reorder_in: ReorderRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    q_stmt = select(ExamQuestion).where(ExamQuestion.section_id == section_id)
    res = await db.execute(q_stmt)
    questions = {q.id: q for q in res.scalars().all()}
    for item in reorder_in.items:
        if item.id in questions:
            questions[item.id].order_index = item.order_index
    await db.commit()
    return {"status": "reordered"}


@router.post("/exam-questions/{question_id}/undo", response_model=ExamQuestionResponse)
async def undo_question_edit(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamQuestion:
    stmt = (
        select(ExamQuestion)
        .where(ExamQuestion.id == question_id)
        .options(selectinload(ExamQuestion.revisions))
    )
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")

    if not question.revisions:
        raise HTTPException(status_code=400, detail="No revision history to undo")

    latest_rev = question.revisions[0]
    snap = latest_rev.snapshot

    question.stem = snap.get("stem", question.stem)
    question.difficulty = snap.get("difficulty", question.difficulty)
    question.marks = snap.get("marks", question.marks)
    question.payload = snap.get("payload", question.payload)
    question.explanation = snap.get("explanation", question.explanation)
    question.origin = snap.get("origin", question.origin)

    await db.delete(latest_rev)
    await db.commit()
    await db.refresh(question)
    return question


@router.post("/exam-questions/{question_id}/save-to-bank")
async def save_question_to_bank(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    stmt = select(ExamQuestion).where(ExamQuestion.id == question_id)
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")

    if not question.rule_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot save question to bank without a linked rule_id",
        )

    # Create pending QuestionVariant
    payload = question.payload or {}
    variant = QuestionVariant(
        rule_id=question.rule_id,
        question_text=question.stem,
        question_type=question.question_type,
        options=payload.get("options"),
        correct_option_index=payload.get("correct_option_index"),
        correct_option_indices=payload.get("correct_option_indices"),
        correct_answer=payload.get("correct_answer"),
        blank_answer_variants=payload.get("blank_answer_variants"),
        statement_true=payload.get("statement_true"),
        statement_false=payload.get("statement_false"),
        difficulty=question.difficulty,
        bloom_level="Understand",
        confidence=question.confidence,
        review_status="pending",
        grounding_verified=True,
        reviewer_notes=f"Created from Exam Builder draft question {question.id}",
    )
    db.add(variant)
    await db.commit()
    await db.refresh(variant)

    question.source_variant_id = variant.id
    await db.commit()
    return {"status": "saved_to_bank", "variant_id": str(variant.id), "review_status": "pending"}


# ---------------------------------------------------------------------------
# 4. Validation & Planning
# ---------------------------------------------------------------------------

@router.post("/exam-drafts/{draft_id}/validate", response_model=ValidationResponse)
async def validate_draft(
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ValidationResponse:
    draft = await _get_draft_or_404(draft_id, db)
    is_valid, errors, warnings = validate_draft_content(draft)

    err_objs = [
        ValidationIssue(
            level="error",
            field=e.get("field", ""),
            message=e.get("message", ""),
            section_id=e.get("section_id"),
            question_id=e.get("question_id"),
        )
        for e in errors
    ]
    warn_objs = [
        ValidationIssue(
            level="warning",
            field=w.get("field", ""),
            message=w.get("message", ""),
            section_id=w.get("section_id"),
            question_id=w.get("question_id"),
        )
        for w in warnings
    ]
    return ValidationResponse(is_valid=is_valid, errors=err_objs, warnings=warn_objs)


@router.post("/exam-drafts/{draft_id}/plan", response_model=DraftFeasibilityResponse)
async def plan_draft(
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> DraftFeasibilityResponse:
    draft = await _get_draft_or_404(draft_id, db)
    target_emp_id = None
    target_data = draft.target or {}
    if target_data.get("type") == "employee_id":
        try:
            target_emp_id = uuid.UUID(target_data.get("value"))
        except (ValueError, TypeError):
            pass

    return await build_draft_feasibility_report(db, draft, employee_id=target_emp_id)


# ---------------------------------------------------------------------------
# 5. Generation Job & SSE
# ---------------------------------------------------------------------------

@router.post("/exam-drafts/{draft_id}/generate", response_model=GenerationJobResponse)
async def generate_draft_questions(
    draft_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> GenerationJob:
    draft = await _get_draft_or_404(draft_id, db, must_be_editable=True)

    if not draft.sections:
        raise HTTPException(status_code=400, detail="Cannot generate questions for draft with no sections")

    target_emp_id = None
    target_data = draft.target or {}
    if target_data.get("type") == "employee_id":
        try:
            target_emp_id = uuid.UUID(target_data.get("value"))
        except (ValueError, TypeError):
            pass

    # Create job record
    job = GenerationJob(
        draft_id=draft.id,
        status=GenerationJobStatus.PENDING.value,
        progress={"total_slots": 0, "completed_slots": 0, "events": []},
    )
    db.add(job)
    draft.status = ExamDraftStatus.GENERATING.value
    await db.commit()
    await db.refresh(job)

    # Launch background worker
    background_tasks.add_task(
        execute_generation_job,
        job.id,
        async_session_factory,
        target_emp_id,
    )
    return job


@router.get("/generation-jobs/{job_id}/events")
async def get_job_events_stream(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    stmt = select(GenerationJob).where(GenerationJob.id == job_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Generation job not found")

    return StreamingResponse(
        stream_job_events(job_id, async_session_factory),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generation-jobs/{job_id}/cancel")
async def cancel_generation_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    stmt = select(GenerationJob).where(GenerationJob.id == job_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Generation job not found")

    cancel_job(job_id)
    job.status = GenerationJobStatus.CANCELLED.value
    await db.commit()
    return {"status": "cancellation_requested", "job_id": str(job_id)}


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobResponse)
async def get_job_status(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> GenerationJob:
    stmt = select(GenerationJob).where(GenerationJob.id == job_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Generation job not found")
    return job


# ---------------------------------------------------------------------------
# 6. Locking & Cloning
# ---------------------------------------------------------------------------

@router.post("/exam-drafts/{draft_id}/lock", response_model=LockDraftResponse)
async def lock_draft(
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> LockDraftResponse:
    draft = await _get_draft_or_404(draft_id, db, must_be_editable=True)

    # 1. Validate content
    is_valid, errors, _ = validate_draft_content(draft)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Draft has validation errors blocking lock", "errors": errors},
        )

    # 2. Build immutable snapshot into Assessment
    manifest = []
    section_breakdown = {}
    total_q_count = 0

    for sec in draft.sections:
        sec_id_str = str(sec.id)
        section_breakdown[sec_id_str] = {
            "title": sec.title,
            "instructions": sec.instructions or "",
            "order_index": sec.order_index,
            "min_pass_percent": sec.min_pass_percent,
            "marks_per_question": sec.marks_per_question,
            "question_count": len(sec.questions),
            "shuffle_questions": getattr(sec, "shuffle_questions", False),
            "shuffle_options": getattr(sec, "shuffle_options", False),
        }

        for q in sec.questions:
            total_q_count += 1
            manifest.append({
                "id": str(q.id),
                "section_id": sec_id_str,
                "section_title": sec.title,
                "order_index": q.order_index,
                "question_type": q.question_type,
                "difficulty": q.difficulty,
                "marks": q.marks,
                "stem": q.stem,
                "question_text": q.stem,
                "payload": dict(q.payload),
                "options": q.payload.get("options"),
                "correct_option_index": q.payload.get("correct_option_index"),
                "correct_option_indices": q.payload.get("correct_option_indices"),
                "correct_answer": q.payload.get("correct_answer"),
                "blank_answer_variants": q.payload.get("blank_answer_variants"),
                "statement_true": q.payload.get("statement_true"),
                "statement_false": q.payload.get("statement_false"),
                "explanation": q.explanation,
                "rule_id": str(q.rule_id) if q.rule_id else None,
                "question_variant_id": str(q.source_variant_id) if q.source_variant_id else str(q.id),
                "min_pass_percent": sec.min_pass_percent,
            })

    assessment = Assessment(
        company_id=draft.company_id,
        name=draft.title,
        manifest=manifest,
        total_question_count=total_q_count,
        section_breakdown=section_breakdown,
        marks_per_question=int(draft.sections[0].marks_per_question) if draft.sections else 1,
        use_weighted_marks=(draft.scoring_mode == "risk_weighted"),
        pass_mark_pct=draft.pass_percent,
        valid_from=draft.available_from,
        valid_to=draft.available_until,
        reveal_score_to_user=draft.reveal_score,
        role_template_used=f"draft:{draft.id}:v{draft.version}",
        duration_mins=draft.duration_minutes,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    draft.status = ExamDraftStatus.LOCKED.value
    draft.locked_assessment_id = assessment.id
    await db.commit()

    return LockDraftResponse(
        status="locked",
        draft_id=draft.id,
        assessment_id=assessment.id,
        version=draft.version,
        total_questions=total_q_count,
    )


@router.post("/exam-drafts/{draft_id}/clone", response_model=CloneDraftResponse)
async def clone_draft(
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> CloneDraftResponse:
    draft = await _get_draft_or_404(draft_id, db)

    # Create new draft with incremented version
    new_version = draft.version + 1
    new_draft = ExamDraft(
        company_id=draft.company_id,
        created_by=current_user.id,
        title=f"{draft.title} (v{new_version})",
        target=dict(draft.target),
        duration_minutes=draft.duration_minutes,
        available_from=draft.available_from,
        available_until=draft.available_until,
        scoring_mode=draft.scoring_mode,
        pass_percent=draft.pass_percent,
        reveal_score=draft.reveal_score,
        exam_key_hash=draft.exam_key_hash,
        status=ExamDraftStatus.DRAFT.value,
        version=new_version,
    )
    db.add(new_draft)
    await db.commit()
    await db.refresh(new_draft)

    # Deep clone sections and questions
    for sec in draft.sections:
        new_sec = ExamSection(
            draft_id=new_draft.id,
            order_index=sec.order_index,
            title=sec.title,
            instructions=sec.instructions,
            topic_filter=list(sec.topic_filter),
            type_mix=dict(sec.type_mix),
            difficulty_mix=dict(sec.difficulty_mix),
            marks_per_question=sec.marks_per_question,
            min_pass_percent=sec.min_pass_percent,
            shuffle_questions=sec.shuffle_questions,
            shuffle_options=sec.shuffle_options,
        )
        db.add(new_sec)
        await db.commit()
        await db.refresh(new_sec)

        for q in sec.questions:
            new_q = ExamQuestion(
                section_id=new_sec.id,
                order_index=q.order_index,
                question_type=q.question_type,
                difficulty=q.difficulty,
                marks=q.marks,
                stem=q.stem,
                payload=dict(q.payload),
                origin=q.origin,
                source_variant_id=q.source_variant_id,
                rule_id=q.rule_id,
                is_locked=q.is_locked,
                explanation=q.explanation,
                confidence=q.confidence,
                warnings=list(q.warnings),
            )
            db.add(new_q)
        await db.commit()

    return CloneDraftResponse(
        status="cloned",
        original_draft_id=draft.id,
        new_draft_id=new_draft.id,
        new_version=new_version,
    )


class AssignDraftRequest(BaseModel):
    employee_ids: Optional[List[str]] = None
    exam_key: Optional[str] = None


@router.post("/exam-drafts/{draft_id}/assign")
async def assign_draft(
    draft_id: uuid.UUID,
    req: AssignDraftRequest = AssignDraftRequest(),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    draft = await _get_draft_or_404(draft_id, db, company_id=current_user.company_id)

    # 1. Lock if not yet locked
    assessment_id = draft.locked_assessment_id
    if not assessment_id:
        lock_res = await lock_draft(draft_id, db, current_user)
        assessment_id = lock_res.assessment_id

    # 2. Determine target user UUIDs
    user_ids_to_assign: set[uuid.UUID] = set()

    def _is_uuid_str(val: Any) -> bool:
        try:
            uuid.UUID(str(val))
            return True
        except (ValueError, TypeError):
            return False

    if req.employee_ids:
        raw_ids = [str(x).strip() for x in req.employee_ids if str(x).strip()]
        uuid_candidates = [uuid.UUID(x) for x in raw_ids if _is_uuid_str(x)]
        stmt = select(User).where(
            User.company_id == current_user.company_id,
            (User.employee_code.in_(raw_ids)) | (User.id.in_(uuid_candidates) if uuid_candidates else False),
        )
        res = await db.execute(stmt)
        for u in res.scalars().all():
            user_ids_to_assign.add(u.id)
    else:
        target = draft.target or {}
        ttype = target.get("type")
        tval = target.get("value")
        if ttype == "employee_id" and tval:
            tval_str = str(tval).strip()
            if _is_uuid_str(tval_str):
                # Direct UUID lookup
                user_ids_to_assign.add(uuid.UUID(tval_str))
            else:
                # Lookup by employee_code
                stmt = select(User).where(
                    User.company_id == current_user.company_id,
                    User.employee_code == tval_str,
                )
                res = await db.execute(stmt)
                for u in res.scalars().all():
                    user_ids_to_assign.add(u.id)
        elif ttype == "department" and tval:
            stmt = select(User).where(
                User.company_id == current_user.company_id,
                User.department_code == str(tval),
            )
            res = await db.execute(stmt)
            for u in res.scalars().all():
                user_ids_to_assign.add(u.id)
        elif ttype == "role" and tval:
            stmt = select(User).where(
                User.company_id == current_user.company_id,
                User.role == str(tval),
            )
            res = await db.execute(stmt)
            for u in res.scalars().all():
                user_ids_to_assign.add(u.id)
            # Fallback: also match by designation if role field empty
            if not user_ids_to_assign:
                stmt = select(User).where(
                    User.company_id == current_user.company_id,
                    User.designation == str(tval),
                )
                res = await db.execute(stmt)
                for u in res.scalars().all():
                    user_ids_to_assign.add(u.id)


    # If no target matched, raise error instead of assigning to all users
    if not user_ids_to_assign:
        target = draft.target or {}
        ttype = target.get("type", "unknown")
        tval = target.get("value", "")
        raise HTTPException(
            status_code=400,
            detail=f"No matching users found for target ({ttype}: {tval}). Please select a valid employee, department, or role."
        )

    # 3. Create ExamSession records (skip users who already have an active session)
    existing_stmt = select(ExamSession.employee_id).where(
        ExamSession.assessment_id == assessment_id,
        ExamSession.status.in_([ExamStatus.ASSIGNED]),
    )
    existing_res = await db.execute(existing_stmt)
    already_assigned = {row[0] for row in existing_res.all()}

    sessions = []
    key_hash = draft.exam_key_hash
    if req.exam_key:
        pepper = "aegis-lockdown-v1"
        key_hash = hashlib.sha256(f"{pepper}:{req.exam_key.upper()}".encode()).hexdigest()

    for uid in user_ids_to_assign:
        if uid in already_assigned:
            continue
        session = ExamSession(
            assessment_id=assessment_id,
            employee_id=uid,
            status=ExamStatus.ASSIGNED,
            assigned_at=datetime.now(timezone.utc),
            responses={},
            exam_key_hash=key_hash,
            lockdown_anomalies=[],
            lockdown_escalated=False,
        )
        db.add(session)
        sessions.append(session)

    await db.commit()
    return {
        "status": "assigned",
        "draft_id": str(draft.id),
        "assessment_id": str(assessment_id),
        "sessions_created": len(sessions),
        "assigned_count": len(sessions),
    }


# ---------------------------------------------------------------------------
# 7. Single-Question Regeneration, Alternatives & Swap
# ---------------------------------------------------------------------------

@router.post(
    "/exam-drafts/{draft_id}/questions/{question_id}/regenerate",
    response_model=ExamQuestionResponse,
)
@router.post(
    "/exam-questions/{question_id}/regenerate",
    response_model=ExamQuestionResponse,
)
@router.post(
    "/questions/{question_id}/regenerate",
    response_model=ExamQuestionResponse,
)
async def regenerate_question(
    question_id: uuid.UUID,
    draft_id: Optional[uuid.UUID] = None,
    req: RegenerateQuestionRequest = RegenerateQuestionRequest(),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamQuestion:
    stmt = (
        select(ExamQuestion)
        .where(ExamQuestion.id == question_id)
        .options(
            selectinload(ExamQuestion.section)
            .selectinload(ExamSection.draft)
            .selectinload(ExamDraft.sections)
            .selectinload(ExamSection.questions)
        )
    )
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")

    draft = question.section.draft
    return await regenerate_question_ladder(
        db,
        draft,
        question,
        mode=req.mode,
        change_type=req.change_type,
        difficulty=req.difficulty,
        focus_hint=req.focus_hint,
    )


@router.get(
    "/exam-drafts/{draft_id}/questions/{question_id}/alternatives",
    response_model=List[AlternativeVariantResponse],
)
@router.get(
    "/exam-questions/{question_id}/alternatives",
    response_model=List[AlternativeVariantResponse],
)
@router.get(
    "/questions/{question_id}/alternatives",
    response_model=List[AlternativeVariantResponse],
)
async def get_alternatives(
    question_id: uuid.UUID,
    draft_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    stmt = (
        select(ExamQuestion)
        .where(ExamQuestion.id == question_id)
        .options(
            selectinload(ExamQuestion.section)
            .selectinload(ExamSection.draft)
            .selectinload(ExamDraft.sections)
            .selectinload(ExamSection.questions)
        )
    )
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")

    draft = question.section.draft
    return await get_question_alternatives(db, draft, question)


@router.post(
    "/exam-drafts/{draft_id}/questions/{question_id}/swap",
    response_model=ExamQuestionResponse,
)
@router.post(
    "/exam-questions/{question_id}/swap",
    response_model=ExamQuestionResponse,
)
@router.post(
    "/questions/{question_id}/swap",
    response_model=ExamQuestionResponse,
)
async def swap_question(
    question_id: uuid.UUID,
    req: SwapQuestionRequest,
    draft_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamQuestion:
    stmt = (
        select(ExamQuestion)
        .where(ExamQuestion.id == question_id)
        .options(selectinload(ExamQuestion.section).selectinload(ExamSection.draft))
    )
    res = await db.execute(stmt)
    question = res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Exam question not found")

    draft = question.section.draft
    return await swap_question_with_variant(db, draft, question, req.variant_id)


@router.post("/exam-drafts/{draft_id}/questions/{question_id}/undo", response_model=ExamQuestionResponse)
@router.post("/questions/{question_id}/undo", response_model=ExamQuestionResponse)
async def undo_draft_question(
    question_id: uuid.UUID,
    draft_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> ExamQuestion:
    return await undo_question_edit(question_id, db, current_user)


@router.post("/exam-drafts/{draft_id}/sections/{section_id}/regenerate")
@router.post("/sections/{section_id}/regenerate")
async def regenerate_section_questions(
    section_id: uuid.UUID,
    draft_id: Optional[uuid.UUID] = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Regenerates every unpinned question of the section one at a time over the SSE job channel.
    Skips pinned questions.
    """
    sec_stmt = (
        select(ExamSection)
        .where(ExamSection.id == section_id)
        .options(selectinload(ExamSection.questions), selectinload(ExamSection.draft))
    )
    if draft_id:
        sec_stmt = sec_stmt.where(ExamSection.draft_id == draft_id)
    sec_res = await db.execute(sec_stmt)
    sec = sec_res.scalar_one_or_none()
    if not sec:
        raise HTTPException(status_code=404, detail="Section not found")

    draft = sec.draft
    if draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(
            status_code=400,
            detail="Exam draft is locked and immutable.",
        )
    unpinned = [q for q in sec.questions if not q.is_locked]

    job = GenerationJob(
        draft_id=draft.id,
        status=GenerationJobStatus.PENDING.value,
        progress={
            "section_id": str(section_id),
            "total_slots": len(unpinned),
            "completed_slots": 0,
            "events": [],
        },
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(
        execute_section_regeneration_job,
        job.id,
        draft.id,
        section_id,
        async_session_factory,
    )

    return {
        "status": "pending",
        "job_id": str(job.id),
        "section_id": str(section_id),
        "total_unpinned": len(unpinned),
        "skipped_pinned": len(sec.questions) - len(unpinned),
    }

