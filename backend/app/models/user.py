import enum
import uuid

from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class RoleEnum(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    PLANT_ADMIN = "PLANT_ADMIN"
    OPERATOR = "OPERATOR"


class User(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("company_id", "employee_code", name="uix_company_employee"),
        UniqueConstraint("company_id", "department_code", "sequence_number", name="uix_company_dept_seq"),
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    employee_code: Mapped[str] = mapped_column(String(64), nullable=False)
    sequence_number: Mapped[int | None] = mapped_column(nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    department_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleEnum] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["Company"] = relationship(back_populates="users")
    attempts: Mapped[list["TestAttempt"]] = relationship(back_populates="user")
