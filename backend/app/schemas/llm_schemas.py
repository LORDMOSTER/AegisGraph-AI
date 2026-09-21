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
    options: List[str] = Field(..., min_length=2, description="List of possible answers. Must include the correct answer.")
    correct_answer: str = Field(..., description="The exact text of the correct answer, must match one of the options.")
    bloom_level: BloomLevel = Field(..., description="The Bloom's Taxonomy level of the question.")
    grounding_verified: bool = Field(default=True, description="Flag indicating if the question passed the anti-hallucination firewall.")


class RuleExtractionResponse(BaseModel):
    variants: List[QuestionVariant] = Field(
        ...,
        min_length=2,
        max_length=4,
        description="A list of 2 to 4 multiple-choice question variants based on the safety rule."
    )
