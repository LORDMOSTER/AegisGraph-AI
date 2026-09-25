from enum import Enum
from typing import List

from pydantic import BaseModel, Field


class BloomLevel(str, Enum):
    REMEMBER = "remember"
    UNDERSTAND = "understand"
    APPLY = "apply"
    ANALYZE = "analyze"
    EVALUATE = "evaluate"
    CREATE = "create"


class QuestionVariant(BaseModel):
    stem: str = Field(..., description="The question text.")
    options: List[str] = Field(..., min_length=4, max_length=4, description="Exactly 4 multiple-choice options.")
    correct_answer: str = Field(..., description="The exact string of the correct option. Must perfectly match one of the items in the options array.")
    bloom_level: str = Field(..., description="Categorized as Remember, Understand, Apply, Analyze, or Evaluate.")


class RuleExtractionResponse(BaseModel):
    variants: List[QuestionVariant] = Field(
        ...,
        min_length=2,
        max_length=4,
        description="A list of 2 to 4 multiple-choice question variants based on the safety rule."
    )
