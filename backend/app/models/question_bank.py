"""
question_bank.py  (model)
Extended to carry:
  - difficulty field (easy / medium / hard)
  - blank_answer_variants JSONB column for FILL_IN_BLANK questions
"""
import enum
import uuid
from typing import Optional, Any, List

from sqlalchemy import String, Text, Boolean, ForeignKey, Integer, Float, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class QuestionType(str, enum.Enum):
    MCQ = "MCQ"
    FILL_IN_BLANK = "FILL_IN_BLANK"
    TRUE_FALSE = "TRUE_FALSE"


class DifficultyLevel(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class QuestionVariant(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "question_bank"

    rule_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rules.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(
        String(32), default=QuestionType.MCQ, nullable=False
    )

    # MCQ / TRUE_FALSE: list of option strings
    options: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    correct_option_index: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Shared correct-answer string (MCQ uses options[correct_option_index];
    # FILL_IN_BLANK stores the primary correct phrase here)
    correct_answer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # FILL_IN_BLANK only: acceptable alternative phrasings, e.g. ["500V","500 volts"]
    blank_answer_variants: Mapped[Any | None] = mapped_column(JSONB, nullable=True)

    bloom_level: Mapped[str] = mapped_column(String(32), nullable=False)

    # Req #6 – difficulty derived from cognitive_level + risk_score at generation time
    difficulty: Mapped[str] = mapped_column(
        String(16), nullable=False, default=DifficultyLevel.MEDIUM.value
    )

    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    review_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    grounding_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    rule: Mapped["Rule"] = relationship("Rule", back_populates="questions")
