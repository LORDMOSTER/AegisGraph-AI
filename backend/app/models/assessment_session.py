import enum
import uuid
from datetime import datetime

from sqlalchemy import String, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class SessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    CLOSED = "CLOSED"


class AssessmentSession(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "assessment_sessions"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_pin_hash: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    blueprint_manifest: Mapped[dict] = mapped_column(JSONB, nullable=False)
    pass_threshold_percentage: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)
    status: Mapped[SessionStatus] = mapped_column(default=SessionStatus.ACTIVE, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    company: Mapped["Company"] = relationship(back_populates="sessions")
    attempts: Mapped[list["TestAttempt"]] = relationship(back_populates="session", cascade="all, delete-orphan")
