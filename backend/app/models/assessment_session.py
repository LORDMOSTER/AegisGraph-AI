"""
assessment_session.py
Extended to carry per-exam configurable marking settings (Req #10):
  - marks_per_question:   int  (default 1 — flat mark per question)
  - use_weighted_marks:   bool (toggle: sum of risk_score instead of flat marks)
  - pass_mark_pct:        float (pass threshold as a percentage, default 80.0)
  - pass_mark_abs:        int | None (absolute mark count threshold, optional override)
"""
import uuid
from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from datetime import datetime
from app.db.base_class import Base, TimestampMixin, UUIDMixin


class Assessment(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "assessments"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    manifest: Mapped[list] = mapped_column(JSONB, nullable=False)
    total_question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    section_breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Req #10 – per-exam configurable marking
    marks_per_question: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    use_weighted_marks: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pass_mark_pct: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)
    pass_mark_abs: Mapped[int | None] = mapped_column(Integer, nullable=True)

    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reveal_score_to_user: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    role_template_used: Mapped[str | None] = mapped_column(String(255), nullable=True)

    company: Mapped["Company"] = relationship(back_populates="assessments")
    exam_sessions: Mapped[list["ExamSession"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )
