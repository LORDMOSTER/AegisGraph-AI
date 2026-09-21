import enum
import uuid
from typing import Optional, Any

from sqlalchemy import String, Text, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class QuestionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class QuestionBank(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "question_bank"

    rule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rules.id", ondelete="CASCADE"), index=True, nullable=False)
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[Any] = mapped_column(JSONB, nullable=False)
    correct_answer: Mapped[str] = mapped_column(String(8), nullable=False)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bloom_level: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[QuestionStatus] = mapped_column(SQLEnum(QuestionStatus, name="questionstatus_enum"), default=QuestionStatus.DRAFT, index=True, nullable=False)
    grounding_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reviewer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    rule: Mapped["Rule"] = relationship("Rule", back_populates="questions")
