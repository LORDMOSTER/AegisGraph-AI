import uuid
from typing import List, Optional

from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, Index, CheckConstraint, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class Manual(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "manuals"

    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(32), default="1.0", nullable=False)
    file_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    company: Mapped["Company"] = relationship("Company")
    sections: Mapped[List["Section"]] = relationship("Section", back_populates="manual", cascade="all, delete-orphan")
    filtered_blocks: Mapped[List["FilteredBlock"]] = relationship("FilteredBlock", back_populates="manual", cascade="all, delete-orphan")


class Section(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "sections"

    manual_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("manuals.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    manual: Mapped["Manual"] = relationship("Manual", back_populates="sections")
    subcategories: Mapped[List["SubCategory"]] = relationship("SubCategory", back_populates="section", cascade="all, delete-orphan")


class SubCategory(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "subcategories"

    section_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    section: Mapped["Section"] = relationship("Section", back_populates="subcategories")
    rules: Mapped[List["Rule"]] = relationship("Rule", back_populates="subcategory", cascade="all, delete-orphan")


class Rule(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "rules"

    subcategory_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subcategories.id", ondelete="CASCADE"), index=True, nullable=False)
    rule_code: Mapped[str] = mapped_column(String(64), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, CheckConstraint("risk_score >= 1 AND risk_score <= 10"), nullable=False)
    cognitive_level: Mapped[str] = mapped_column(String(32), nullable=False)
    response_time_sec: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    review_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    subcategory: Mapped["SubCategory"] = relationship("SubCategory", back_populates="rules")
    questions: Mapped[List["QuestionVariant"]] = relationship("QuestionVariant", back_populates="rule", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_rules_subcat_active", "subcategory_id", "is_active"),
        Index("ix_rules_risk_cog", "risk_score", "cognitive_level"),
    )

class FilteredBlock(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "filtered_blocks"

    manual_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("manuals.id", ondelete="CASCADE"), index=True, nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    promoted_to_rule_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("rules.id", ondelete="SET NULL"), nullable=True)

    manual: Mapped["Manual"] = relationship("Manual", back_populates="filtered_blocks")
