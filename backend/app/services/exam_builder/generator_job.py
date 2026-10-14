"""
generator_job.py

Background generation job service for Exam Builder:
  - Resumable background execution
  - SSE event streaming (slot_started, question_ready, slot_retry, slot_failed, section_done, job_done)
  - Delta generation (preserves pinned & edited questions, diffs slots against existing)
  - Bank hits are instant, live LLM calls serialized with concurrency lock
  - Clean cancellation support
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.models.exam_builder import (
    ExamDraft,
    ExamDraftStatus,
    ExamQuestion,
    ExamSection,
    GenerationJob,
    GenerationJobStatus,
    QuestionOrigin,
)
from app.models.question_bank import QuestionVariant
from app.services.exam_builder.planner import plan_section_slots, PlannedSlot
from app.services.llm.generator import _generate_single, LLMExtractionError
from app.services.llm.grounding_check import run_all_checks
from app.services.llm.rule_profiler import profile_rule

logger = logging.getLogger(__name__)

# In-memory pubsub for SSE events: job_id -> list of asyncio.Queue
_JOB_SUBSCRIBERS: Dict[uuid.UUID, List[asyncio.Queue]] = {}
# Concurrency lock: CPU-bound single LLM call at a time per job
_JOB_LLM_LOCK = asyncio.Lock()
# Cancellation registry: job_id -> bool
_JOB_CANCEL_FLAGS: Set[uuid.UUID] = set()


def subscribe_to_job_events(job_id: uuid.UUID) -> asyncio.Queue:
    """Subscribes an SSE listener to job events."""
    q: asyncio.Queue = asyncio.Queue()
    if job_id not in _JOB_SUBSCRIBERS:
        _JOB_SUBSCRIBERS[job_id] = []
    _JOB_SUBSCRIBERS[job_id].append(q)
    return q


def unsubscribe_from_job_events(job_id: uuid.UUID, q: asyncio.Queue) -> None:
    if job_id in _JOB_SUBSCRIBERS:
        try:
            _JOB_SUBSCRIBERS[job_id].remove(q)
        except ValueError:
            pass
        if not _JOB_SUBSCRIBERS[job_id]:
            del _JOB_SUBSCRIBERS[job_id]


async def broadcast_event(job_id: uuid.UUID, event_type: str, data: Dict[str, Any]) -> None:
    """Broadcasts an SSE event to all connected listeners for job_id."""
    payload = {"event": event_type, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
    subscribers = _JOB_SUBSCRIBERS.get(job_id, [])
    for q in subscribers:
        await q.put(payload)


def cancel_job(job_id: uuid.UUID) -> None:
    """Flags a running job for cancellation."""
    _JOB_CANCEL_FLAGS.add(job_id)


def is_job_cancelled(job_id: uuid.UUID) -> bool:
    return job_id in _JOB_CANCEL_FLAGS


# ---------------------------------------------------------------------------
# Core Generation Job Runner
# ---------------------------------------------------------------------------

async def execute_generation_job(
    job_id: uuid.UUID,
    session_factory: async_sessionmaker[AsyncSession],
    employee_id: Optional[uuid.UUID] = None,
) -> None:
    """
    Executes a generation job in the background:
      - Plans missing slots for each section (delta generation)
      - Sinks bank hits instantly
      - Generates live questions one at a time with LLM lock
      - Persists progress after every slot
      - Streams SSE events
    """
    async with session_factory() as db:
        stmt = select(GenerationJob).where(GenerationJob.id == job_id)
        res = await db.execute(stmt)
        job = res.scalar_one_or_none()
        if not job:
            logger.error(f"GenerationJob {job_id} not found")
            return

        draft_id = job.draft_id
        d_stmt = select(ExamDraft).where(ExamDraft.id == draft_id)
        d_res = await db.execute(d_stmt)
        draft = d_res.scalar_one_or_none()
        if not draft:
            job.status = GenerationJobStatus.FAILED.value
            job.error = "Associated draft not found"
            await db.commit()
            return

        # Initialize job progress state
        job.status = GenerationJobStatus.RUNNING.value
        draft.status = ExamDraftStatus.GENERATING.value
        progress_data = {
            "total_slots": 0,
            "completed_slots": 0,
            "failed_slots": 0,
            "events": [],
            "sections": {},
        }
        job.progress = progress_data
        await db.commit()

    used_rule_ids_in_exam: Set[uuid.UUID] = set()

    try:
        # Load sections and calculate total slots
        async with session_factory() as db:
            sec_stmt = (
                select(ExamSection)
                .where(ExamSection.draft_id == draft_id)
                .order_by(ExamSection.order_index)
            )
            sec_res = await db.execute(sec_stmt)
            sections = list(sec_res.scalars().all())

            # Count total planned slots across all sections
            total_slots = sum(sum((s.type_mix or {}).values()) for s in sections)
            progress_data["total_slots"] = total_slots

            # Persist initial total
            j_stmt = select(GenerationJob).where(GenerationJob.id == job_id)
            j_res = await db.execute(j_stmt)
            cur_job = j_res.scalar_one()
            cur_job.progress = progress_data
            await db.commit()

        # Process sections sequentially
        for sec in sections:
            if is_job_cancelled(job_id):
                break

            async with session_factory() as db:
                # Reload section with questions
                q_stmt = (
                    select(ExamQuestion)
                    .where(ExamQuestion.section_id == sec.id)
                    .order_by(ExamQuestion.order_index)
                )
                q_res = await db.execute(q_stmt)
                existing_questions = list(q_res.scalars().all())

                # Delta generation: separate pinned / edited from generated
                pinned_or_edited = [
                    q for q in existing_questions
                    if q.is_locked or q.origin in (QuestionOrigin.MANUAL.value, QuestionOrigin.EDITED.value)
                ]
                replaceable = [q for q in existing_questions if q not in pinned_or_edited]

                # Slots needed based on config
                target_slots = await plan_section_slots(
                    db,
                    sec,
                    employee_id=employee_id,
                    used_rule_ids_in_exam=used_rule_ids_in_exam,
                )

                # Match existing questions against target slots by (type, diff)
                slots_to_generate: List[PlannedSlot] = []
                unmatched_replaceable = list(replaceable)

                for slot in target_slots:
                    # Check if an existing question matches this slot
                    matched_q = None
                    for eq in unmatched_replaceable:
                        if eq.question_type == slot.question_type and eq.difficulty == slot.difficulty:
                            matched_q = eq
                            break
                    if matched_q:
                        unmatched_replaceable.remove(matched_q)
                        progress_data["completed_slots"] += 1
                    else:
                        slots_to_generate.append(slot)

                # Remove any leftover unmatched unpinned questions (if count was reduced)
                for excess_q in unmatched_replaceable:
                    await db.delete(excess_q)
                await db.commit()

            # Generate missing slots
            for slot_idx, slot in enumerate(slots_to_generate):
                if is_job_cancelled(job_id):
                    break

                event_data = {
                    "section_id": str(sec.id),
                    "section_title": sec.title,
                    "question_type": slot.question_type,
                    "difficulty": slot.difficulty,
                    "slot_index": progress_data["completed_slots"] + 1,
                    "total_slots": progress_data["total_slots"],
                }
                await broadcast_event(job_id, "slot_started", event_data)
                progress_data["events"].append({"event": "slot_started", "data": event_data})

                # Path A: Bank hit
                if slot.bank_variant_id:
                    async with session_factory() as db:
                        bv_stmt = select(QuestionVariant).where(QuestionVariant.id == slot.bank_variant_id)
                        bv_res = await db.execute(bv_stmt)
                        variant = bv_res.scalar_one_or_none()

                        if variant:
                            # Create ExamQuestion from bank variant
                            new_q = ExamQuestion(
                                section_id=sec.id,
                                order_index=progress_data["completed_slots"],
                                question_type=variant.question_type,
                                difficulty=variant.difficulty,
                                marks=sec.marks_per_question,
                                stem=variant.question_text,
                                payload={
                                    "options": variant.options,
                                    "correct_option_index": variant.correct_option_index,
                                    "correct_option_indices": variant.correct_option_indices,
                                    "correct_answer": variant.correct_answer,
                                    "blank_answer_variants": variant.blank_answer_variants,
                                    "statement_true": variant.statement_true,
                                    "statement_false": variant.statement_false,
                                },
                                origin=QuestionOrigin.BANK.value,
                                source_variant_id=variant.id,
                                rule_id=variant.rule_id,
                                is_locked=False,
                                confidence=variant.confidence,
                                warnings=[],
                            )
                            db.add(new_q)
                            await db.commit()
                            await db.refresh(new_q)

                            progress_data["completed_slots"] += 1
                            ready_data = {
                                "question_id": str(new_q.id),
                                "section_id": str(sec.id),
                                "question_type": new_q.question_type,
                                "stem": new_q.stem[:80],
                                "origin": "bank",
                            }
                            await broadcast_event(job_id, "question_ready", ready_data)
                            progress_data["events"].append({"event": "question_ready", "data": ready_data})
                            continue

                # Path B: Live generation with Ollama
                rule_text = slot.rule_text or ""
                if not rule_text and slot.rule_id:
                    async with session_factory() as db:
                        r_stmt = select(Rule).where(Rule.id == slot.rule_id)
                        r_res = await db.execute(r_stmt)
                        r = r_res.scalar_one_or_none()
                        if r:
                            rule_text = r.text

                if not rule_text:
                    # Slot impossible
                    progress_data["failed_slots"] += 1
                    fail_data = {
                        "section_id": str(sec.id),
                        "question_type": slot.question_type,
                        "difficulty": slot.difficulty,
                        "reason": "No eligible rule text available for generation",
                    }
                    await broadcast_event(job_id, "slot_failed", fail_data)
                    progress_data["events"].append({"event": "slot_failed", "data": fail_data})
                    continue

                # Generate live with LLM lock
                generated_success = False
                attempts = 0
                max_attempts = 3
                last_reason = "Unknown error"

                profile = profile_rule(rule_text)
                maskables = profile.maskable_terms

                while attempts < max_attempts and not generated_success:
                    attempts += 1
                    try:
                        async with _JOB_LLM_LOCK:
                            vd = await _generate_single(
                                rule_text,
                                slot.question_type,
                                [],
                                maskable_terms=maskables,
                            )

                        # Quality gates
                        passed, confidence, notes = run_all_checks(rule_text, vd)
                        if passed:
                            generated_success = True
                            # TRUE_FALSE target balancing
                            if slot.question_type == "TRUE_FALSE" and slot.tf_target_bool is not None:
                                st_true = vd.get("statement_true")
                                st_false = vd.get("statement_false")
                                if st_true and st_false:
                                    if slot.tf_target_bool is True:
                                        vd["question_text"] = st_true
                                        vd["correct_answer"] = "True"
                                        vd["correct_option_index"] = 0
                                    else:
                                        vd["question_text"] = st_false
                                        vd["correct_answer"] = "False"
                                        vd["correct_option_index"] = 1
                                    vd["options"] = ["True", "False"]

                            async with session_factory() as db:
                                new_q = ExamQuestion(
                                    section_id=sec.id,
                                    order_index=progress_data["completed_slots"],
                                    question_type=slot.question_type,
                                    difficulty=slot.difficulty,
                                    marks=sec.marks_per_question,
                                    stem=vd.get("question_text", ""),
                                    payload={
                                        "options": vd.get("options"),
                                        "correct_option_index": vd.get("correct_option_index"),
                                        "correct_option_indices": vd.get("correct_option_indices"),
                                        "correct_answer": vd.get("correct_answer"),
                                        "blank_answer_variants": vd.get("blank_answer_variants"),
                                        "statement_true": vd.get("statement_true"),
                                        "statement_false": vd.get("statement_false"),
                                    },
                                    origin=QuestionOrigin.AI.value,
                                    rule_id=slot.rule_id,
                                    is_locked=False,
                                    explanation=vd.get("explanation"),
                                    confidence=confidence,
                                    warnings=[{"note": n} for n in notes] if notes else [],
                                )
                                db.add(new_q)
                                await db.commit()
                                await db.refresh(new_q)

                                progress_data["completed_slots"] += 1
                                ready_data = {
                                    "question_id": str(new_q.id),
                                    "section_id": str(sec.id),
                                    "question_type": new_q.question_type,
                                    "stem": new_q.stem[:80],
                                    "origin": "ai",
                                }
                                await broadcast_event(job_id, "question_ready", ready_data)
                                progress_data["events"].append({"event": "question_ready", "data": ready_data})
                        else:
                            last_reason = f"Gate check rejected: {notes[:1]}"
                            retry_data = {
                                "section_id": str(sec.id),
                                "attempt": attempts,
                                "reason": last_reason,
                            }
                            await broadcast_event(job_id, "slot_retry", retry_data)
                            progress_data["events"].append({"event": "slot_retry", "data": retry_data})

                    except LLMExtractionError as e:
                        last_reason = f"LLM error: {str(e)[:60]}"
                    except Exception as e:
                        last_reason = f"Generation error: {str(e)[:60]}"

                if not generated_success:
                    progress_data["failed_slots"] += 1
                    fail_data = {
                        "section_id": str(sec.id),
                        "question_type": slot.question_type,
                        "difficulty": slot.difficulty,
                        "reason": last_reason,
                    }
                    await broadcast_event(job_id, "slot_failed", fail_data)
                    progress_data["events"].append({"event": "slot_failed", "data": fail_data})

            # Section completed
            sec_done_data = {"section_id": str(sec.id), "title": sec.title}
            await broadcast_event(job_id, "section_done", sec_done_data)
            progress_data["events"].append({"event": "section_done", "data": sec_done_data})

            # Checkpoint progress to DB
            async with session_factory() as db:
                j_stmt = select(GenerationJob).where(GenerationJob.id == job_id)
                j_res = await db.execute(j_stmt)
                cur_job = j_res.scalar_one()
                cur_job.progress = dict(progress_data)
                await db.commit()

        # Job complete
        async with session_factory() as db:
            j_stmt = select(GenerationJob).where(GenerationJob.id == job_id)
            j_res = await db.execute(j_stmt)
            cur_job = j_res.scalar_one()

            d_stmt = select(ExamDraft).where(ExamDraft.id == draft_id)
            d_res = await db.execute(d_stmt)
            cur_draft = d_res.scalar_one()

            if is_job_cancelled(job_id):
                cur_job.status = GenerationJobStatus.CANCELLED.value
                cur_draft.status = ExamDraftStatus.DRAFT.value
                _JOB_CANCEL_FLAGS.discard(job_id)
            elif progress_data["completed_slots"] == 0 and progress_data["total_slots"] > 0:
                cur_job.status = GenerationJobStatus.FAILED.value
                cur_draft.status = ExamDraftStatus.DRAFT.value
            else:
                cur_job.status = GenerationJobStatus.COMPLETED.value
                cur_draft.status = ExamDraftStatus.READY.value

            cur_job.progress = dict(progress_data)
            await db.commit()

        done_data = {
            "job_id": str(job_id),
            "status": cur_job.status,
            "completed": progress_data["completed_slots"],
            "total": progress_data["total_slots"],
        }
        await broadcast_event(job_id, "job_done", done_data)
        progress_data["events"].append({"event": "job_done", "data": done_data})

    except Exception as e:
        logger.exception(f"Unhandled error in generation job {job_id}: {e}")
        async with session_factory() as db:
            j_stmt = select(GenerationJob).where(GenerationJob.id == job_id)
            j_res = await db.execute(j_stmt)
            cur_job = j_res.scalar_one_or_none()
            if cur_job:
                cur_job.status = GenerationJobStatus.FAILED.value
                cur_job.error = str(e)
                await db.commit()


# ---------------------------------------------------------------------------
# SSE Generator
# ---------------------------------------------------------------------------

async def stream_job_events(
    job_id: uuid.UUID,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[str, None]:
    """
    SSE generator:
      - Reads existing events from job.progress for fast replay on reconnect/refresh
      - Subscribes to live queue and yields events as they occur
      - Ends stream when job is in a terminal state
    """
    queue = subscribe_to_job_events(job_id)

    # 1. Fetch persisted events to replay
    replayed_count = 0
    async with session_factory() as db:
        stmt = select(GenerationJob).where(GenerationJob.id == job_id)
        res = await db.execute(stmt)
        job = res.scalar_one_or_none()
        if job and job.progress:
            for ev in job.progress.get("events", []):
                yield f"event: {ev.get('event')}\ndata: {json.dumps(ev.get('data'))}\n\n"
                replayed_count += 1
            if job.status in (
                GenerationJobStatus.COMPLETED.value,
                GenerationJobStatus.FAILED.value,
                GenerationJobStatus.CANCELLED.value,
            ):
                unsubscribe_from_job_events(job_id, queue)
                return

    # 2. Stream live events
    try:
        while True:
            try:
                ev = await asyncio.wait_for(queue.get(), timeout=15.0)
                yield f"event: {ev.get('event')}\ndata: {json.dumps(ev.get('data'))}\n\n"
                if ev.get("event") == "job_done":
                    break
            except asyncio.TimeoutError:
                # SSE keep-alive ping
                yield ": ping\n\n"
                # Check DB status
                async with session_factory() as db:
                    s_stmt = select(GenerationJob.status).where(GenerationJob.id == job_id)
                    s_res = await db.execute(s_stmt)
                    st = s_res.scalar_one_or_none()
                    if st in (
                        GenerationJobStatus.COMPLETED.value,
                        GenerationJobStatus.FAILED.value,
                        GenerationJobStatus.CANCELLED.value,
                    ):
                        break
    finally:
        unsubscribe_from_job_events(job_id, queue)


async def execute_section_regeneration_job(
    job_id: uuid.UUID,
    draft_id: uuid.UUID,
    section_id: uuid.UUID,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """
    Regenerates every unpinned question of the section one at a time over the variation ladder,
    streaming progress over the SSE job channel.
    """
    from app.services.exam_builder.regenerate_ladder import regenerate_question_ladder

    progress_data: Dict[str, Any] = {
        "section_id": str(section_id),
        "total_slots": 0,
        "completed_slots": 0,
        "events": [],
    }

    try:
        async with session_factory() as db:
            j_stmt = select(GenerationJob).where(GenerationJob.id == job_id)
            j_res = await db.execute(j_stmt)
            job = j_res.scalar_one()
            job.status = GenerationJobStatus.RUNNING.value

            sec_stmt = (
                select(ExamSection)
                .where(ExamSection.id == section_id, ExamSection.draft_id == draft_id)
                .options(selectinload(ExamSection.questions))
            )
            sec_res = await db.execute(sec_stmt)
            sec = sec_res.scalar_one_or_none()
            if not sec:
                job.status = GenerationJobStatus.FAILED.value
                job.error = "Section not found"
                await db.commit()
                return

            unpinned_questions = [q for q in sec.questions if not q.is_locked]
            progress_data["total_slots"] = len(unpinned_questions)
            job.progress = progress_data
            await db.commit()

        for idx, q_item in enumerate(unpinned_questions):
            if is_job_cancelled(job_id):
                break

            async with _JOB_LLM_LOCK:
                async with session_factory() as db:
                    # Reload draft and question
                    d_stmt = (
                        select(ExamDraft)
                        .where(ExamDraft.id == draft_id)
                        .options(
                            selectinload(ExamDraft.sections).selectinload(ExamSection.questions)
                        )
                    )
                    d_res = await db.execute(d_stmt)
                    draft = d_res.scalar_one()

                    q_stmt = select(ExamQuestion).where(ExamQuestion.id == q_item.id)
                    q_res = await db.execute(q_stmt)
                    question = q_res.scalar_one()

                    ev_start = {
                        "question_id": str(question.id),
                        "section_id": str(section_id),
                        "slot_index": idx + 1,
                        "total_slots": len(unpinned_questions),
                        "stem": question.stem,
                    }
                    await broadcast_event(job_id, "slot_started", ev_start)
                    progress_data["events"].append({"event": "slot_started", "data": ev_start})

                    try:
                        updated_q = await regenerate_question_ladder(
                            db, draft, question, mode="same_rule"
                        )
                        progress_data["completed_slots"] += 1
                        ev_ready = {
                            "question_id": str(updated_q.id),
                            "section_id": str(section_id),
                            "stem": updated_q.stem,
                            "question_type": updated_q.question_type,
                            "difficulty": updated_q.difficulty,
                            "marks": updated_q.marks,
                            "payload": updated_q.payload,
                            "slot_index": idx + 1,
                        }
                        await broadcast_event(job_id, "question_ready", ev_ready)
                        progress_data["events"].append({"event": "question_ready", "data": ev_ready})
                    except Exception as e:
                        logger.warning(f"Failed to regenerate question {question.id} in section {section_id}: {e}")
                        ev_err = {
                            "question_id": str(question.id),
                            "section_id": str(section_id),
                            "error": str(e),
                        }
                        await broadcast_event(job_id, "slot_failed", ev_err)
                        progress_data["events"].append({"event": "slot_failed", "data": ev_err})

                    # Update job progress in DB
                    j_stmt = select(GenerationJob).where(GenerationJob.id == job_id)
                    j_res = await db.execute(j_stmt)
                    cur_j = j_res.scalar_one()
                    cur_j.progress = progress_data
                    await db.commit()

        async with session_factory() as db:
            j_stmt = select(GenerationJob).where(GenerationJob.id == job_id)
            j_res = await db.execute(j_stmt)
            cur_j = j_res.scalar_one()
            cur_j.status = GenerationJobStatus.COMPLETED.value
            await db.commit()

        await broadcast_event(job_id, "section_done", {"section_id": str(section_id)})
        await broadcast_event(job_id, "job_done", {"status": "completed"})

    except Exception as exc:
        logger.exception(f"Section regeneration job {job_id} failed: {exc}")
        async with session_factory() as db:
            j_stmt = select(GenerationJob).where(GenerationJob.id == job_id)
            j_res = await db.execute(j_stmt)
            cur_j = j_res.scalar_one_or_none()
            if cur_j:
                cur_j.status = GenerationJobStatus.FAILED.value
                cur_j.error = str(exc)
                await db.commit()
        await broadcast_event(job_id, "job_failed", {"error": str(exc)})

