import enum
import uuid
from datetime import datetime

from sqlalchemy import String, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin

class ExamStatus(str, enum.Enum):
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    PENDING_REVIEW = "pending_supervisor_review"
    FAILED = "failed"

class ExamSession(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "exam_sessions"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    
    status: Mapped[ExamStatus] = mapped_column(default=ExamStatus.ASSIGNED, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    responses: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    assessment: Mapped["Assessment"] = relationship(back_populates="exam_sessions")
    employee: Mapped["User"] = relationship(back_populates="exam_sessions")
    certificates: Mapped[list["Certificate"]] = relationship(back_populates="exam_session", cascade="all, delete-orphan")
