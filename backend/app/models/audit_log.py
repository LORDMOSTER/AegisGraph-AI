import uuid
from datetime import datetime, timezone

from sqlalchemy import String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, UUIDMixin


class ComplianceAuditLog(Base, UUIDMixin):
    __tablename__ = "audit_logs"

    # Strictly append-only, no update timestamps allowed.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), index=True, nullable=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    company: Mapped["Company"] = relationship(back_populates="audit_logs")
