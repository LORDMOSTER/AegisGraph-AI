import uuid
from datetime import datetime

from sqlalchemy import String, ForeignKey, DateTime, Text, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin

class Certificate(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "certificates"

    exam_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_sessions.id", ondelete="CASCADE"), index=True, nullable=False, unique=True
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    qr_code_data: Mapped[str] = mapped_column(Text, nullable=False)
    signed_payload: Mapped[str] = mapped_column(Text, nullable=False)
    pdf_url: Mapped[str] = mapped_column(String(500), nullable=False)

    exam_session: Mapped["ExamSession"] = relationship(back_populates="certificates")
    employee: Mapped["User"] = relationship(back_populates="certificates")

class CertificateRecord(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "certificate_records"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exam_sessions.id", ondelete="SET NULL"), index=True, nullable=True
    )
    
    sci_score: Mapped[float] = mapped_column(Float, nullable=False)
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expiry_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_imported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    file_path_or_blob: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship()
    session: Mapped["ExamSession"] = relationship()
