"""
question_usage_history.py
Tracks which question variants have been presented to each employee,
enabling the no-repeat-across-attempts requirement (Req #8).
"""
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class QuestionUsageHistory(Base, TimestampMixin, UUIDMixin):
    """
    Records every question variant presented to an employee during an exam.
    Used to exclude previously-seen questions when assembling new exams for
    recertification or retakes.
    """
    __tablename__ = "question_usage_history"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("question_bank.id", ondelete="CASCADE"), index=True, nullable=False
    )
    exam_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.utcnow(),
        nullable=False,
    )

    employee: Mapped["User"] = relationship("User")
    question_variant: Mapped["QuestionVariant"] = relationship("QuestionVariant")
    exam_session: Mapped["ExamSession"] = relationship("ExamSession")

    __table_args__ = (
        # Composite index for fast "what questions has this employee seen?" lookups
        Index("ix_quh_employee_variant", "employee_id", "question_variant_id"),
    )
