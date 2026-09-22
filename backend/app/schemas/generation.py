from typing import List
from pydantic import BaseModel, Field


class QuestionVariantGen(BaseModel):
    """Pydantic schema representing a single multiple-choice question variant."""
    question_text: str = Field(..., description="The main question text (the stem).")
    options: List[str] = Field(..., min_length=2, max_length=4, description="List of possible answer options.")
    correct_option_index: int = Field(..., description="The exact integer index of the correct answer in the options list.")
