import uuid
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

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

    company: Mapped["Company"] = relationship(back_populates="assessments")
    exam_sessions: Mapped[list["ExamSession"]] = relationship(back_populates="assessment", cascade="all, delete-orphan")
