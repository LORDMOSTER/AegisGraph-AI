"""
exam_builder.py (schemas)

Pydantic v2 schemas for Exam Builder:
  - Drafts, Sections, Questions CRUD
  - Config mixes, validation results, presets
  - Feasibility planning responses
  - Generation job and event stream types
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Enums / Constants
# ---------------------------------------------------------------------------

DifficultyType = Literal["easy", "medium", "hard"]
QuestionTypeStr = Literal["MCQ", "TRUE_FALSE", "FILL_IN_BLANK", "MULTI_SELECT"]
ScoringModeStr = Literal["per_question_marks", "risk_weighted", "standard"]
DraftStatusStr = Literal["draft", "generating", "ready", "locked"]
QuestionOriginStr = Literal["bank", "ai", "manual", "edited"]
JobStatusStr = Literal["pending", "running", "completed", "failed", "cancelled"]


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------

class PresetName:
    BALANCED_30_40_30 = "balanced_30_40_30"
    COMPANY_STANDARD = "company_standard"
    ALL_MEDIUM = "all_medium"


PRESET_DIFFICULTY_PERCENTAGES: dict[str, dict[str, float]] = {
    PresetName.BALANCED_30_40_30: {"easy": 30.0, "medium": 40.0, "hard": 30.0},
    PresetName.COMPANY_STANDARD: {"easy": 20.0, "medium": 50.0, "hard": 30.0},  # 70% E+M, 80% M+H
    PresetName.ALL_MEDIUM: {"easy": 0.0, "medium": 100.0, "hard": 0.0},
}


# ---------------------------------------------------------------------------
# Validation & Issues
# ---------------------------------------------------------------------------

class ValidationIssue(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    level: Literal["error", "warning"]
    field: str
    message: str
    section_id: Optional[uuid.UUID] = None
    question_id: Optional[uuid.UUID] = None


class ValidationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    is_valid: bool
    errors: List[ValidationIssue] = Field(default_factory=list)
    warnings: List[ValidationIssue] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Question Revisions & Snapshots
# ---------------------------------------------------------------------------

class RevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    question_id: uuid.UUID
    snapshot: Dict[str, Any]
    created_at: datetime


# ---------------------------------------------------------------------------
# Question Schemas
# ---------------------------------------------------------------------------

class ExamQuestionBase(BaseModel):
    question_type: QuestionTypeStr
    difficulty: DifficultyType = "medium"
    marks: float = Field(default=1.0, gt=0)
    stem: str = Field(min_length=1)
    payload: Dict[str, Any] = Field(default_factory=dict)
    origin: QuestionOriginStr = "manual"
    source_variant_id: Optional[uuid.UUID] = None
    rule_id: Optional[uuid.UUID] = None
    is_locked: bool = False
    explanation: Optional[str] = None
    confidence: float = 1.0


class ExamQuestionCreate(ExamQuestionBase):
    order_index: Optional[int] = 0


class ExamQuestionUpdate(BaseModel):
    stem: Optional[str] = None
    difficulty: Optional[DifficultyType] = None
    marks: Optional[float] = Field(default=None, gt=0)
    payload: Optional[Dict[str, Any]] = None
    is_locked: Optional[bool] = None
    explanation: Optional[str] = None
    order_index: Optional[int] = None
    rule_id: Optional[uuid.UUID] = None


class ExamQuestionResponse(ExamQuestionBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    section_id: uuid.UUID
    order_index: int
    warnings: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Section Schemas
# ---------------------------------------------------------------------------

class ExamSectionBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    instructions: Optional[str] = None
    topic_filter: List[Any] = Field(default_factory=list)
    type_mix: Dict[str, Any] = Field(default_factory=dict)
    difficulty_mix: Dict[str, Any] = Field(default_factory=dict)
    marks_per_question: float = Field(default=1.0, gt=0)
    min_pass_percent: Optional[float] = Field(default=None, ge=0, le=100)
    shuffle_questions: bool = False
    shuffle_options: bool = False


class ExamSectionCreate(ExamSectionBase):
    order_index: Optional[int] = 0
    question_count: Optional[int] = None
    preset: Optional[str] = None


class ExamSectionUpdate(BaseModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    topic_filter: Optional[List[Any]] = None
    type_mix: Optional[Dict[str, Any]] = None
    difficulty_mix: Optional[Dict[str, Any]] = None
    marks_per_question: Optional[float] = Field(default=None, gt=0)
    min_pass_percent: Optional[float] = Field(default=None, ge=0, le=100)
    shuffle_questions: Optional[bool] = None
    shuffle_options: Optional[bool] = None
    order_index: Optional[int] = None
    preset: Optional[str] = None


class ExamSectionResponse(ExamSectionBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    draft_id: uuid.UUID
    order_index: int
    questions: List[ExamQuestionResponse] = Field(default_factory=list)
    question_count: int = 0
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Draft Schemas
# ---------------------------------------------------------------------------

class ExamDraftBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    target: Dict[str, Any] = Field(default_factory=dict)
    duration_minutes: Optional[int] = Field(default=60, ge=1)
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    scoring_mode: ScoringModeStr = "per_question_marks"
    pass_percent: float = Field(default=80.0, ge=0, le=100)
    reveal_score: bool = True

    @field_validator("scoring_mode", mode="before")
    @classmethod
    def normalize_scoring_mode(cls, v):
        if v == "standard":
            return "per_question_marks"
        return v


class ExamDraftCreate(ExamDraftBase):
    exam_key: Optional[str] = None


class ExamDraftUpdate(BaseModel):
    title: Optional[str] = None
    target: Optional[Dict[str, Any]] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1)
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    scoring_mode: Optional[ScoringModeStr] = None
    pass_percent: Optional[float] = Field(default=None, ge=0, le=100)
    reveal_score: Optional[bool] = None
    exam_key: Optional[str] = None

    @field_validator("scoring_mode", mode="before")
    @classmethod
    def normalize_update_scoring_mode(cls, v):
        if v == "standard":
            return "per_question_marks"
        return v


class ExamDraftResponse(ExamDraftBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    company_id: uuid.UUID
    created_by: uuid.UUID
    status: DraftStatusStr
    version: int
    locked_assessment_id: Optional[uuid.UUID] = None
    sections: List[ExamSectionResponse] = Field(default_factory=list)
    total_sections: int = 0
    total_questions: int = 0
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Reorder
# ---------------------------------------------------------------------------

class ReorderItem(BaseModel):
    id: uuid.UUID
    order_index: int


class ReorderRequest(BaseModel):
    items: List[ReorderItem]


# ---------------------------------------------------------------------------
# Feasibility & Planning Schemas
# ---------------------------------------------------------------------------

class FeasibilitySlotReport(BaseModel):
    question_type: str
    difficulty: str
    needed: int
    approved_in_bank: int
    needs_live_generation: int
    impossible: int
    suggested_fixes: List[str] = Field(default_factory=list)


class SectionFeasibilityReport(BaseModel):
    section_id: uuid.UUID
    section_title: str
    total_needed: int
    slots: List[FeasibilitySlotReport] = Field(default_factory=list)
    is_feasible: bool
    suggested_fixes: List[str] = Field(default_factory=list)


class DraftFeasibilityResponse(BaseModel):
    draft_id: uuid.UUID
    is_feasible: bool
    sections: List[SectionFeasibilityReport] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Generation Jobs
# ---------------------------------------------------------------------------

class GenerationJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    draft_id: uuid.UUID
    status: JobStatusStr
    progress: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Lock & Clone
# ---------------------------------------------------------------------------

class LockDraftResponse(BaseModel):
    status: str
    draft_id: uuid.UUID
    assessment_id: uuid.UUID
    version: int
    total_questions: int


class CloneDraftResponse(BaseModel):
    status: str
    original_draft_id: uuid.UUID
    new_draft_id: uuid.UUID
    new_version: int


# ---------------------------------------------------------------------------
# Regeneration & Swap Schemas
# ---------------------------------------------------------------------------

class RegenerateQuestionRequest(BaseModel):
    mode: Literal["same_rule", "other_rule"] = "same_rule"
    change_type: Optional[QuestionTypeStr] = None
    difficulty: Optional[DifficultyType] = None
    focus_hint: Optional[str] = None


class SwapQuestionRequest(BaseModel):
    variant_id: uuid.UUID


class AlternativeVariantResponse(BaseModel):
    id: str
    stem: str
    question_type: str
    difficulty: str
    options: Optional[List[Any]] = None
    is_same_rule: bool = False
    rule_id: Optional[str] = None
    correct_answer: Optional[str] = None

