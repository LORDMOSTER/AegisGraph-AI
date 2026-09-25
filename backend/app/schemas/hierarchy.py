import uuid
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ManualCreate(BaseModel):
    title: str = Field(..., max_length=255)
    version: str = Field(default="1.0", max_length=32)

class RuleResponse(BaseModel):
    id: uuid.UUID
    rule_code: str
    text: str
    source_text: str
    risk_score: int
    cognitive_level: str
    response_time_sec: int
    is_active: bool
    confidence: float
    review_status: str
    page_number: Optional[int] = None
    reference_images: Optional[List[str]] = None
    approved_questions_count: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)

class RuleUpdate(BaseModel):
    text: Optional[str] = None
    risk_score: Optional[int] = None
    review_status: Optional[str] = None

class FilteredBlockResponse(BaseModel):
    id: uuid.UUID
    manual_id: uuid.UUID
    source_text: str
    page_number: Optional[int] = None
    reason: str
    promoted_to_rule_id: Optional[uuid.UUID] = None
    
    model_config = ConfigDict(from_attributes=True)

class SubCategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: Optional[str] = None
    rules: List[RuleResponse] = []
    active_rules_count: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)

class SectionResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: Optional[str] = None
    order_index: int
    subcategories: List[SubCategoryResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

class ManualResponse(BaseModel):
    id: uuid.UUID
    title: str
    version: str
    sections: List[SectionResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

class HierarchyTreeResponse(BaseModel):
    company_id: uuid.UUID
    manuals: List[ManualResponse] = []
