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


class QuestionVariant(BaseModel):
    stem: str = Field(..., description="The question text.")
    question_type: QuestionType = Field(..., description="The type of the question: MCQ, TRUE_FALSE, or FILL_IN_BLANK.")
    options: Optional[List[str]] = Field(None, description="For MCQ, exactly 4 items. For TRUE_FALSE, ['True', 'False']. For FILL_IN_BLANK, can be null or contain acceptable synonyms.")
    correct_answer: str = Field(..., description="The exact string of the correct option or missing word/phrase.")
    bloom_level: str = Field(..., description="Categorized as Remember, Understand, Apply, Analyze, or Evaluate.")


class RuleExtractionResponse(BaseModel):
    variants: List[QuestionVariant] = Field(
        ...,
        min_length=3,
        max_length=3,
        description="A list containing exactly 1 MCQ, 1 True/False, and 1 Fill-in-the-Blank question based strictly on the source rule."
    )
