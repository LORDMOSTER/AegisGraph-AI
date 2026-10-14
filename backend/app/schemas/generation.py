"""
generation.py
Pydantic v2 discriminated union schemas for question generation.
Strict validation per question type:
  - MCQ: 4 options, exactly one correct, options pairwise distinct.
  - TRUE_FALSE: fixed ['True', 'False'], statement_true, statement_false,
    edit_kind (negation | number_swap | actor_swap | condition_swap), changed_fragment.
  - FILL_IN_BLANK: stem with exactly one _____, correct_answer, blank_answer_variants >= 1, match_mode.
  - MULTI_SELECT: 4-6 options, 2-4 correct, correct_option_indices sorted & unique, fewer correct than total.
"""

from __future__ import annotations

from typing import Annotated, List, Literal, Optional, Union
from pydantic import BaseModel, Field, model_validator


class MCQVariant(BaseModel):
    question_type: Literal["MCQ"] = "MCQ"
    stem: str = Field(..., description="Question stem text")
    options: List[str] = Field(..., min_length=4, max_length=4, description="Exactly 4 distinct options")
    correct_option_index: int = Field(..., ge=0, le=3, description="Index 0..3 of the correct option")
    correct_answer: str = Field(..., description="Text of correct option")
    bloom_level: str = "Understand"
    confidence: float = 1.0

    @model_validator(mode="after")
    def validate_mcq(self) -> MCQVariant:
        if len(self.options) != 4:
            raise ValueError(f"MCQ requires exactly 4 options, got {len(self.options)}")
        normalized = [opt.strip().lower() for opt in self.options]
        if len(set(normalized)) != 4:
            raise ValueError("MCQ options must be pairwise distinct")
        if not (0 <= self.correct_option_index < len(self.options)):
            raise ValueError(f"correct_option_index {self.correct_option_index} out of range [0..3]")
        return self


class TrueFalseVariant(BaseModel):
    question_type: Literal["TRUE_FALSE"] = "TRUE_FALSE"
    stem: str = Field(..., description="Served statement text")
    options: List[str] = Field(default_factory=lambda: ["True", "False"])
    correct_option_index: int = Field(..., ge=0, le=1, description="0 for True, 1 for False")
    correct_answer: str = Field(..., description="'True' or 'False'")
    statement_true: str = Field(..., description="Grounded truthful statement from rule")
    statement_false: str = Field(..., description="Perturbed false twin statement")
    edit_kind: Literal["negation", "number_swap", "actor_swap", "condition_swap"] = Field(
        ..., description="Type of perturbation applied"
    )
    changed_fragment: str = Field(..., description="The specific fragment that was altered")
    bloom_level: str = "Understand"
    confidence: float = 1.0

    @model_validator(mode="after")
    def validate_tf(self) -> TrueFalseVariant:
        if self.options != ["True", "False"]:
            raise ValueError("TRUE_FALSE options must be exactly ['True', 'False']")
        if self.correct_option_index not in (0, 1):
            raise ValueError("correct_option_index must be 0 (True) or 1 (False)")
        if self.correct_answer not in ("True", "False"):
            raise ValueError("correct_answer must be 'True' or 'False'")
        if not self.statement_true or not self.statement_false or not self.changed_fragment:
            raise ValueError("statement_true, statement_false, and changed_fragment must all be non-empty")
        return self


class FillInBlankVariant(BaseModel):
    question_type: Literal["FILL_IN_BLANK"] = "FILL_IN_BLANK"
    stem: str = Field(..., description="Sentence with exactly one '_____'")
    correct_answer: str = Field(..., description="Primary correct phrase that fits in the blank")
    blank_answer_variants: List[str] = Field(..., min_length=1, description="Acceptable variants list")
    match_mode: Literal["exact", "fuzzy", "numeric"] = "exact"
    options: Optional[List[str]] = None
    correct_option_index: Optional[int] = None
    bloom_level: str = "Remember"
    confidence: float = 1.0

    @model_validator(mode="after")
    def validate_fib(self) -> FillInBlankVariant:
        if "_____" not in self.stem:
            raise ValueError("FILL_IN_BLANK stem must contain exactly one blank '_____'")
        if self.stem.count("_____") != 1:
            raise ValueError("FILL_IN_BLANK stem must contain exactly ONE blank '_____'")
        if not self.blank_answer_variants or len(self.blank_answer_variants) < 1:
            raise ValueError("blank_answer_variants must have at least 1 variant")
        if not self.correct_answer.strip():
            raise ValueError("correct_answer cannot be empty")
        return self


class MultiSelectVariant(BaseModel):
    question_type: Literal["MULTI_SELECT"] = "MULTI_SELECT"
    stem: str = Field(..., description="Stem prompt asking for multiple requirements")
    options: List[str] = Field(..., min_length=4, max_length=6, description="4 to 6 options")
    correct_option_indices: List[int] = Field(
        ..., min_length=2, max_length=4, description="Sorted list of correct option indices"
    )
    correct_answer: Optional[str] = None
    bloom_level: str = "Analyze"
    confidence: float = 1.0

    @model_validator(mode="after")
    def validate_multi_select(self) -> MultiSelectVariant:
        if len(self.options) < 4 or len(self.options) > 6:
            raise ValueError(f"MULTI_SELECT requires 4 to 6 options, got {len(self.options)}")
        if len(self.correct_option_indices) < 2 or len(self.correct_option_indices) > 4:
            raise ValueError(
                f"MULTI_SELECT requires 2 to 4 correct options, got {len(self.correct_option_indices)}"
            )
        if len(self.correct_option_indices) >= len(self.options):
            raise ValueError("MULTI_SELECT must have fewer correct options than total options")
        if self.correct_option_indices != sorted(list(set(self.correct_option_indices))):
            raise ValueError("correct_option_indices must be sorted and unique")
        for idx in self.correct_option_indices:
            if idx < 0 or idx >= len(self.options):
                raise ValueError(f"correct_option_index {idx} out of range [0..{len(self.options)-1}]")
        return self


QuestionVariantUnion = Annotated[
    Union[MCQVariant, TrueFalseVariant, FillInBlankVariant, MultiSelectVariant],
    Field(discriminator="question_type"),
]


# Backward-compatible alias
class QuestionVariantGen(BaseModel):
    """Pydantic schema representing a single question variant (legacy compatibility)."""
    question_text: str = Field(..., description="The main question text (the stem).")
    options: Optional[List[str]] = Field(None, description="List of possible answer options.")
    correct_option_index: Optional[int] = Field(None, description="The integer index of correct answer.")
    question_type: str = "MCQ"
