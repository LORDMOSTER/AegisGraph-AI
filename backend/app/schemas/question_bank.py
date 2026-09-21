import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.models.question_bank import QuestionStatus

class QuestionOptionSchema(BaseModel):
    id: str
    text: str

class QuestionCreate(BaseModel):
    stem: str
    options: List[QuestionOptionSchema]
    correct_answer: str = Field(..., max_length=8)
    explanation: Optional[str] = None
    bloom_level: str = Field(..., max_length=32)
    grounding_verified: bool = False

class QuestionUpdate(BaseModel):
    stem: Optional[str] = None
    options: Optional[List[QuestionOptionSchema]] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None
    bloom_level: Optional[str] = None

class QuestionStatusUpdate(BaseModel):
    status: QuestionStatus
    reviewer_notes: Optional[str] = None

class QuestionResponse(BaseModel):
    id: uuid.UUID
    rule_id: uuid.UUID
    stem: str
    options: List[QuestionOptionSchema]
    correct_answer: str
    explanation: Optional[str] = None
    bloom_level: str
    status: QuestionStatus
    grounding_verified: bool
    reviewer_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
