import uuid
from datetime import datetime

from sqlalchemy import String, ForeignKey, DateTime, Text
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
