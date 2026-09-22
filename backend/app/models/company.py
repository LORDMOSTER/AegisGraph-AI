from typing import List

from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class Company(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "companies"

    company_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    users: Mapped[List["User"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    assessments: Mapped[List["Assessment"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    audit_logs: Mapped[List["ComplianceAuditLog"]] = relationship(back_populates="company")
