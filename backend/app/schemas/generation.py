from typing import List
from pydantic import BaseModel, Field


class QuestionVariant(BaseModel):
    """Pydantic schema representing a single multiple-choice question variant."""
    stem: str = Field(
        ..., 
        description="The main question text (the stem)."
    )
    options: List[str] = Field(
        ..., 
        min_length=2,
        description="List of possible answer options."
    )
    correct_answer: str = Field(
        ..., 
        description="The exact text of the correct answer, which must match one of the options."
    )
    bloom_level: str = Field(
        ..., 
        description="Bloom's taxonomy level (e.g., Remember, Understand, Apply, Analyze, Evaluate, Create)."
    )


class RuleGenerationResponse(BaseModel):
    """Pydantic schema representing the complete LLM generation response for a rule."""
    variants: List[QuestionVariant] = Field(
        ..., 
        min_length=2, 
        max_length=4,
        description="A constrained list of 2 to 4 multiple-choice variants generated from the rule."
    )
