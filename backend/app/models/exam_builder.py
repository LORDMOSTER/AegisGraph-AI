"""
exam_builder.py (models)

Data models for the Exam Builder system:
  - ExamDraft: Draft container for multi-section exams (status: draft | generating | ready | locked)
  - ExamSection: Ordered sections with independent type/difficulty mixes, topic filters, and marks
  - ExamQuestion: Questions belonging to sections with full payloads, origin, and locking (pinning)
  - ExamQuestionRevision: Revision history for undo operations on questions
  - GenerationJob: Background generation job state and progress tracking
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class ExamDraftStatus(str, enum.Enum):
    DRAFT = "draft"
    GENERATING = "generating"
    READY = "ready"
    LOCKED = "locked"


class ScoringMode(str, enum.Enum):
    PER_QUESTION_MARKS = "per_question_marks"
    RISK_WEIGHTED = "risk_weighted"


class QuestionOrigin(str, enum.Enum):
    BANK = "bank"
    AI = "ai"
    MANUAL = "manual"
    EDITED = "edited"


class GenerationJobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExamDraft(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "exam_drafts"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # Target can be {"type": "role"|"department"|"employee_id", "value": "..."}
    target: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, default=60, nullable=True)
    available_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scoring_mode: Mapped[str] = mapped_column(
        String(32), default=ScoringMode.PER_QUESTION_MARKS.value, nullable=False
    )
    pass_percent: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)
    reveal_score: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    exam_key_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), default=ExamDraftStatus.DRAFT.value, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Immutable snapshot reference once locked
    locked_assessment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assessments.id", ondelete="SET NULL"), index=True, nullable=True
    )

    company: Mapped["Company"] = relationship("Company")
    creator: Mapped["User"] = relationship("User")
    locked_assessment: Mapped[Optional["Assessment"]] = relationship("Assessment")

    sections: Mapped[List["ExamSection"]] = relationship(
        "ExamSection",
        back_populates="draft",
        cascade="all, delete-orphan",
        order_by="ExamSection.order_index",
    )
    generation_jobs: Mapped[List["GenerationJob"]] = relationship(
        "GenerationJob",
        back_populates="draft",
        cascade="all, delete-orphan",
        order_by="GenerationJob.created_at.desc()",
    )


class ExamSection(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "exam_sections"

    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_drafts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    topic_filter: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    type_mix: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    difficulty_mix: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    marks_per_question: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    min_pass_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shuffle_options: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    draft: Mapped["ExamDraft"] = relationship("ExamDraft", back_populates="sections")
    questions: Mapped[List["ExamQuestion"]] = relationship(
        "ExamQuestion",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="ExamQuestion.order_index",
    )


class ExamQuestion(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "exam_questions"

    section_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_sections.id", ondelete="CASCADE"), index=True, nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    question_type: Mapped[str] = mapped_column(String(32), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    marks: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=QuestionOrigin.AI.value
    )
    source_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("question_bank.id", ondelete="SET NULL"), index=True, nullable=True
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rules.id", ondelete="SET NULL"), index=True, nullable=True
    )
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    warnings: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    section: Mapped["ExamSection"] = relationship("ExamSection", back_populates="questions")
    source_variant: Mapped[Optional["QuestionVariant"]] = relationship("QuestionVariant")
    rule: Mapped[Optional["Rule"]] = relationship("Rule")
    revisions: Mapped[List["ExamQuestionRevision"]] = relationship(
        "ExamQuestionRevision",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="ExamQuestionRevision.created_at.desc()",
    )


class ExamQuestionRevision(Base, UUIDMixin):
    __tablename__ = "exam_question_revisions"

    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    question: Mapped["ExamQuestion"] = relationship("ExamQuestion", back_populates="revisions")


class GenerationJob(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "generation_jobs"

    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_drafts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default=GenerationJobStatus.PENDING.value, nullable=False
    )
    progress: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    draft: Mapped["ExamDraft"] = relationship("ExamDraft", back_populates="generation_jobs")
