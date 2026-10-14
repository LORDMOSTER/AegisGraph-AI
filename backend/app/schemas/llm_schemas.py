"""
llm_schemas.py
Pydantic schemas for LLM request/response contracts.

Extended to support:
- FILL_IN_BLANK question type with blank_answer_variants
- difficulty field derived from cognitive_level + risk_score
"""
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class BloomLevel(str, Enum):
    REMEMBER = "remember"
    UNDERSTAND = "understand"
    APPLY = "apply"
    ANALYZE = "analyze"
    EVALUATE = "evaluate"
    CREATE = "create"


class QuestionType(str, Enum):
    MCQ = "MCQ"
    FILL_IN_BLANK = "FILL_IN_BLANK"
    TRUE_FALSE = "TRUE_FALSE"
    MULTI_SELECT = "MULTI_SELECT"


class DifficultyLevel(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


def derive_difficulty(cognitive_level: str, risk_score: int) -> DifficultyLevel:
    """
    Derives a 3-tier difficulty from Bloom's taxonomy level + rule risk_score.

    Rules (per Req #6):
      - Remember/Understand + risk_score <= 4  => easy
      - Apply + risk_score 5-7               => medium
      - Analyze/Evaluate/Create + risk_score >= 7 => hard
      - Mixed boundary cases => medium (safe default)
    """
    cog = cognitive_level.lower() if cognitive_level else ""
    score = risk_score or 5

    if cog in ("remember", "understand") and score <= 4:
        return DifficultyLevel.EASY
    if cog in ("analyze", "evaluate", "create") and score >= 7:
        return DifficultyLevel.HARD
    # Apply at any score, or remember/understand at medium scores => medium
    return DifficultyLevel.MEDIUM


class QuestionVariant(BaseModel):
    stem: str = Field(..., description="The question text / sentence with blank.")
    question_type: QuestionType = Field(
        ..., description="MCQ, TRUE_FALSE, FILL_IN_BLANK, or MULTI_SELECT."
    )
    options: Optional[List[str]] = Field(
        None,
        description=(
            "For MCQ: exactly 4 items. "
            "For TRUE_FALSE: ['True', 'False']. "
            "For FILL_IN_BLANK: null or omitted. "
            "For MULTI_SELECT: 4 to 6 items."
        ),
    )
    correct_option_index: Optional[int] = Field(
        None,
        description="Index of correct option for MCQ / TRUE_FALSE.",
    )
    correct_option_indices: Optional[List[int]] = Field(
        None,
        description="List of correct option indices for MULTI_SELECT.",
    )
    correct_answer: Optional[str] = Field(
        None,
        description=(
            "Exact correct option string for MCQ/TRUE_FALSE, "
            "or the primary correct phrase for FILL_IN_BLANK."
        ),
    )
    blank_answer_variants: Optional[List[str]] = Field(
        None,
        description=(
            "FILL_IN_BLANK only. Acceptable alternative phrasings "
            "e.g. ['500 volts', '500V', '500v']. "
            "correct_answer is always included implicitly."
        ),
    )
    statement_true: Optional[str] = None
    statement_false: Optional[str] = None
    edit_kind: Optional[str] = None
    changed_fragment: Optional[str] = None
    bloom_level: str = Field(
        ..., description="Remember, Understand, Apply, Analyze, or Evaluate."
    )


class RuleExtractionResponse(BaseModel):
    variants: List[QuestionVariant] = Field(
        ...,
        min_length=3,
        max_length=3,
        description=(
            "Exactly 1 MCQ, 1 TRUE_FALSE, and 1 FILL_IN_BLANK "
            "question based strictly on the source rule."
        ),
    )
