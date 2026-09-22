import enum
import uuid
from typing import Optional, Any

from sqlalchemy import String, Text, Boolean, ForeignKey, Integer, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class QuestionVariant(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "question_bank"

    rule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rules.id", ondelete="CASCADE"), index=True, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[Any] = mapped_column(JSONB, nullable=False)
    correct_option_index: Mapped[int] = mapped_column(Integer, nullable=False)
    bloom_level: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    review_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")

    rule: Mapped["Rule"] = relationship("Rule", back_populates="questions")
