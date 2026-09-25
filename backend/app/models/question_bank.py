import enum
import uuid
from typing import Optional, Any

from sqlalchemy import String, Text, Boolean, ForeignKey, Integer, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class QuestionType(str, enum.Enum):
    MCQ = "MCQ"
    FILL_IN_BLANK = "FILL_IN_BLANK"
    TRUE_FALSE = "TRUE_FALSE"

class QuestionVariant(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "question_bank"

    rule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rules.id", ondelete="CASCADE"), index=True, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(String(32), default=QuestionType.MCQ, nullable=False)
    options: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    correct_option_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    correct_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    bloom_level: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    review_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    grounding_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    rule: Mapped["Rule"] = relationship("Rule", back_populates="questions")
