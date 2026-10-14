"""
config_validation.py

Pure functions for Exam Builder configuration validation and rounding:
  - Largest-remainder rounding from percentages to integer counts
  - Presets (Balanced 30/40/30, Company standard, All Medium)
  - Section-level mix validation (sum(type_mix) = sum(difficulty_mix) = count >= 1)
  - Draft validation for locking (blocking errors vs warnings)
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from app.schemas.exam_builder import PRESET_DIFFICULTY_PERCENTAGES, PresetName


class ConfigValidationError(ValueError):
    """Raised when configuration validation fails with field-level detail."""
    def __init__(self, field: str, message: str, errors: Optional[List[Dict[str, Any]]] = None):
        super().__init__(message)
        self.field = field
        self.message = message
        self.errors = errors or [{"field": field, "message": message}]


def round_percentages_to_counts(mix: Dict[str, float], total_count: int) -> Dict[str, int]:
    """
    Converts a dictionary of percentages/weights to exact integer counts
    using the Largest Remainder Method (Hare-Niemeyer).
    Guarantees:
      - sum(result.values()) == total_count
      - all result.values() >= 0
    """
    if total_count < 1:
        raise ConfigValidationError("question_count", "total_count must be at least 1")

    total_weight = sum(mix.values())
    if total_weight <= 0:
        raise ConfigValidationError("mix", "Sum of mix weights/percentages must be greater than 0")

    # Proportional quotas
    exact_shares = {k: (v / total_weight) * total_count for k, v in mix.items()}
    floored = {k: math.floor(v) for k, v in exact_shares.items()}
    remainders = {k: exact_shares[k] - floored[k] for k, v in exact_shares.items()}

    allocated = sum(floored.values())
    shortfall = total_count - allocated

    # Distribute surplus to keys with largest remainders
    # Stable deterministic tie-breaker using key name
    sorted_keys = sorted(mix.keys(), key=lambda k: (remainders[k], k), reverse=True)
    for i in range(shortfall):
        k = sorted_keys[i % len(sorted_keys)]
        floored[k] += 1

    return floored


def get_preset_difficulty_mix(preset_name: str, count: int) -> Dict[str, int]:
    """Resolves a preset difficulty mix into exact integer counts."""
    p_name = preset_name.lower().strip()
    if p_name not in PRESET_DIFFICULTY_PERCENTAGES:
        # Match fuzzy names
        if "balanced" in p_name:
            p_name = PresetName.BALANCED_30_40_30
        elif "company" in p_name or "standard" in p_name:
            p_name = PresetName.COMPANY_STANDARD
        elif "medium" in p_name:
            p_name = PresetName.ALL_MEDIUM
        else:
            raise ConfigValidationError(
                "preset",
                f"Unknown preset '{preset_name}'. Allowed: {list(PRESET_DIFFICULTY_PERCENTAGES.keys())}"
            )
    return round_percentages_to_counts(PRESET_DIFFICULTY_PERCENTAGES[p_name], count)


def validate_and_normalize_mix(
    mix: Dict[str, Any],
    expected_count: Optional[int],
    field_name: str,
) -> Tuple[Dict[str, int], int]:
    """
    Validates a mix dictionary (type_mix or difficulty_mix).
    - If all values are non-negative integers summing to > 0 and expected_count is None:
      uses sum as count.
    - If expected_count is provided and values look like percentages (sum ~ 100 or float):
      applies largest-remainder rounding to match expected_count.
    - If expected_count is provided and integer sum != expected_count:
      if values sum to 100 or are fractional, rounds to expected_count;
      otherwise raises ConfigValidationError.
    """
    if not mix:
        raise ConfigValidationError(field_name, f"{field_name} cannot be empty")

    # Check for negative values
    for k, v in mix.items():
        if v is None or v < 0:
            raise ConfigValidationError(f"{field_name}.{k}", f"Value for '{k}' must be non-negative")

    is_all_ints = all(isinstance(v, int) for v in mix.values())
    int_sum = sum(int(v) for v in mix.values())

    if expected_count is None:
        if not is_all_ints:
            raise ConfigValidationError(
                field_name,
                f"Float percentages provided in {field_name} but question_count was not specified."
            )
        if int_sum < 1:
            raise ConfigValidationError(field_name, f"Sum of {field_name} must be at least 1")
        return {str(k): int(v) for k, v in mix.items()}, int_sum

    # expected_count is given
    if expected_count < 1:
        raise ConfigValidationError("question_count", "question_count must be at least 1")

    # If integers match expected_count exactly
    if is_all_ints and int_sum == expected_count:
        return {str(k): int(v) for k, v in mix.items()}, expected_count

    # Otherwise, treat as weights/percentages and round by largest remainder
    rounded = round_percentages_to_counts({str(k): float(v) for k, v in mix.items()}, expected_count)
    return rounded, expected_count


def validate_section_config(
    type_mix: Dict[str, Any],
    difficulty_mix: Dict[str, Any],
    question_count: Optional[int] = None,
    preset: Optional[str] = None,
) -> Tuple[Dict[str, int], int, Dict[str, int]]:
    """
    Validates section type and difficulty mixes.
    Returns (normalized_type_mix, count, normalized_difficulty_mix).
    Raises ConfigValidationError with field-level details on error.
    """
    errors: List[Dict[str, Any]] = []

    # If preset is supplied, resolve difficulty mix from preset
    resolved_diff_mix = difficulty_mix
    if preset:
        # Determine count first
        if question_count is not None:
            resolved_diff_mix = get_preset_difficulty_mix(preset, question_count)
        elif type_mix and all(isinstance(v, int) for v in type_mix.values()):
            q_cnt = sum(type_mix.values())
            if q_cnt > 0:
                resolved_diff_mix = get_preset_difficulty_mix(preset, q_cnt)

    # 1. Validate type_mix
    try:
        norm_type_mix, count = validate_and_normalize_mix(type_mix, question_count, "type_mix")
    except ConfigValidationError as e:
        errors.extend(e.errors)
        norm_type_mix, count = {}, 0

    # 2. Validate difficulty_mix against determined count
    if count > 0:
        try:
            norm_diff_mix, _ = validate_and_normalize_mix(resolved_diff_mix, count, "difficulty_mix")
        except ConfigValidationError as e:
            errors.extend(e.errors)
            norm_diff_mix = {}
    else:
        norm_diff_mix = {}

    if errors:
        raise ConfigValidationError("section_config", "Invalid section configuration", errors)

    # Ensure recognized question types
    valid_types = {"MCQ", "TRUE_FALSE", "FILL_IN_BLANK", "MULTI_SELECT"}
    for qt in norm_type_mix:
        if qt not in valid_types:
            errors.append({
                "field": f"type_mix.{qt}",
                "message": f"Unknown question type '{qt}'. Allowed: {sorted(valid_types)}"
            })

    # Ensure recognized difficulties
    valid_diffs = {"easy", "medium", "hard"}
    for d in norm_diff_mix:
        if d not in valid_diffs:
            errors.append({
                "field": f"difficulty_mix.{d}",
                "message": f"Unknown difficulty level '{d}'. Allowed: {sorted(valid_diffs)}"
            })

    # Final check: sum(type_mix) == sum(difficulty_mix) == count
    if sum(norm_type_mix.values()) != count or sum(norm_diff_mix.values()) != count:
        errors.append({
            "field": "mix_totals",
            "message": f"Mix totals mismatch: sum(type_mix)={sum(norm_type_mix.values())}, sum(diff_mix)={sum(norm_diff_mix.values())}, count={count}"
        })

    if errors:
        raise ConfigValidationError("section_config", "Invalid section configuration", errors)

    return norm_type_mix, count, norm_diff_mix


def validate_draft_content(draft: Any) -> Tuple[bool, List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Validates a complete draft before locking.
    Returns: (is_valid, errors, warnings)
    - Errors block lock (status 422).
    - Warnings do not block lock.
    """
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    sections = getattr(draft, "sections", [])
    if not sections:
        errors.append({
            "level": "error",
            "field": "sections",
            "message": "Draft must contain at least one section before locking."
        })
        return False, errors, warnings

    total_questions = 0

    for sec_idx, sec in enumerate(sections):
        sec_id = getattr(sec, "id", None)
        sec_title = getattr(sec, "title", f"Section {sec_idx+1}")
        questions = getattr(sec, "questions", [])

        if not questions:
            errors.append({
                "level": "error",
                "field": f"sections[{sec_idx}].questions",
                "section_id": sec_id,
                "message": f"Section '{sec_title}' has no questions."
            })
            continue

        total_questions += len(questions)

        # Check section count vs question count
        configured_count = sum(getattr(sec, "type_mix", {}).values()) if getattr(sec, "type_mix", None) else len(questions)
        if configured_count != len(questions):
            warnings.append({
                "level": "warning",
                "field": f"sections[{sec_idx}].question_count",
                "section_id": sec_id,
                "message": (
                    f"Section '{sec_title}' has {len(questions)} actual questions, "
                    f"differing from configured count {configured_count}. Counts will be updated."
                )
            })

        for q_idx, q in enumerate(questions):
            q_id = getattr(q, "id", None)
            q_type = getattr(q, "question_type", "")
            payload = getattr(q, "payload", {}) or {}
            stem = getattr(q, "stem", "")
            marks = getattr(q, "marks", 1.0)
            rule_id = getattr(q, "rule_id", None)
            origin = getattr(q, "origin", "")

            # Marks > 0
            if marks is None or marks <= 0:
                errors.append({
                    "level": "error",
                    "field": f"questions[{q_idx}].marks",
                    "section_id": sec_id,
                    "question_id": q_id,
                    "message": f"Question {q_idx+1} marks must be greater than 0."
                })

            # Stem non-empty
            if not stem or not stem.strip():
                errors.append({
                    "level": "error",
                    "field": f"questions[{q_idx}].stem",
                    "section_id": sec_id,
                    "question_id": q_id,
                    "message": f"Question {q_idx+1} stem cannot be empty."
                })

            # Check grounding warning for manual questions
            if origin == "manual" and not rule_id:
                warnings.append({
                    "level": "warning",
                    "field": f"questions[{q_idx}].rule_id",
                    "section_id": sec_id,
                    "question_id": q_id,
                    "message": f"Question {q_idx+1} is manual with no rule link (not grounded)."
                })

            # Type-specific validation
            if q_type == "MCQ":
                options = payload.get("options", [])
                correct_idx = payload.get("correct_option_index")
                if not isinstance(options, list) or len(options) < 2 or len(options) > 6:
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.options",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": f"MCQ must have between 2 and 6 options (found {len(options) if isinstance(options, list) else 0})."
                    })
                elif any(not str(opt).strip() for opt in options):
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.options",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": f"MCQ options cannot be blank."
                    })
                elif len(set(str(opt).strip().lower() for opt in options)) != len(options):
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.options",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": f"MCQ options must be pairwise unique."
                    })

                if correct_idx is None or not isinstance(correct_idx, int) or correct_idx < 0 or (isinstance(options, list) and correct_idx >= len(options)):
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.correct_option_index",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": f"MCQ must have exactly 1 valid correct option index in range."
                    })

            elif q_type == "TRUE_FALSE":
                options = payload.get("options", [])
                correct_idx = payload.get("correct_option_index")
                if options != ["True", "False"] and set(options) != {"True", "False"}:
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.options",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": "TRUE_FALSE options must be ['True', 'False']."
                    })
                if correct_idx not in (0, 1):
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.correct_option_index",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": "TRUE_FALSE correct_option_index must be 0 (True) or 1 (False)."
                    })

            elif q_type == "FILL_IN_BLANK":
                if "___" not in stem:
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].stem",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": "FILL_IN_BLANK stem must contain exactly one '___' placeholder."
                    })
                elif stem.count("___") > 1:
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].stem",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": "FILL_IN_BLANK stem must contain only one blank."
                    })

                ans = payload.get("correct_answer") or payload.get("blank_answer")
                variants = payload.get("blank_answer_variants") or []
                if (not ans or not str(ans).strip()) and not variants:
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.correct_answer",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": "FILL_IN_BLANK must have at least one accepted answer."
                    })

            elif q_type == "MULTI_SELECT":
                options = payload.get("options", [])
                correct_indices = payload.get("correct_option_indices", [])
                if not isinstance(options, list) or len(options) < 3 or len(options) > 6:
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.options",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": f"MULTI_SELECT must have between 3 and 6 options (found {len(options) if isinstance(options, list) else 0})."
                    })
                elif any(not str(opt).strip() for opt in options):
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.options",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": "MULTI_SELECT options cannot be blank."
                    })
                elif len(set(str(opt).strip().lower() for opt in options)) != len(options):
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.options",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": "MULTI_SELECT options must be pairwise unique."
                    })

                if (
                    not isinstance(correct_indices, list)
                    or len(correct_indices) < 2
                    or (isinstance(options, list) and len(correct_indices) >= len(options))
                    or any(not isinstance(i, int) or i < 0 or (isinstance(options, list) and i >= len(options)) for i in correct_indices)
                ):
                    errors.append({
                        "level": "error",
                        "field": f"questions[{q_idx}].payload.correct_option_indices",
                        "section_id": sec_id,
                        "question_id": q_id,
                        "message": "MULTI_SELECT must have at least 2 correct indices and fewer than all options."
                    })
            else:
                errors.append({
                    "level": "error",
                    "field": f"questions[{q_idx}].question_type",
                    "section_id": sec_id,
                    "question_id": q_id,
                    "message": f"Unsupported question_type '{q_type}'."
                })

    is_valid = len(errors) == 0
    return is_valid, errors, warnings
