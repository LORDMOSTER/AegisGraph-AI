"""
generator.py
Generates ONE question at a time against the local Ollama model (never batched).

Key changes vs original:
  - One-at-a-time generation (Req: CPU-bound local LLM)
  - Strengthened prompt that requires quoting a concrete fact from the rule (Req #2)
  - Within-batch deduplication: pass previously_generated_stems to suppress repeats (Req #9)
  - Count guarantee via fill-until-N loop at the call-site (see assessment_assembler.py)
  - Returns list[dict] with normalized question_text / options / correct_answer /
    correct_option_index / question_type / bloom_level / blank_answer_variants
  - FILL_IN_BLANK generation support (Req #5)
"""
import json
import logging
import asyncio
import unicodedata
import re
from typing import Any

import ollama
from pydantic import ValidationError

from app.schemas.llm_schemas import RuleExtractionResponse, QuestionVariant
from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
BASE_DELAY = 1.0


class LLMExtractionError(Exception):
    """Raised when the LLM fails to return valid structured output after retries."""
    pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _norm_fill_blank(text: str) -> str:
    """Normalise a fill-in-blank answer for comparison: lower, strip punct, trim."""
    text = unicodedata.normalize("NFKD", text).lower()
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def grade_fill_in_blank(
    student_answer: str,
    correct_answer: str,
    variants: list[str] | None,
    fuzzy_max_distance: int = 1,
) -> bool:
    """
    Auto-grade a FILL_IN_BLANK response (Req #5).
    Normalises both sides, then checks exact match or edit-distance ≤ fuzzy_max_distance.
    """
    norm_student = _norm_fill_blank(student_answer)
    accepted = [_norm_fill_blank(correct_answer)]
    if variants:
        accepted.extend(_norm_fill_blank(v) for v in variants)

    for acc in accepted:
        if norm_student == acc:
            return True
        # Only apply fuzzy for short non-numeric strings (avoids "600" matching "500")
        is_numeric = re.match(r"^\d+(\.\d+)?\s*\w*$", acc) is not None
        if not is_numeric and abs(len(norm_student) - len(acc)) <= fuzzy_max_distance:
            if _levenshtein(norm_student, acc) <= fuzzy_max_distance:
                return True
    return False


def _levenshtein(a: str, b: str) -> int:
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for ch_a in a:
        curr = [prev[0] + 1]
        for j, ch_b in enumerate(b):
            curr.append(min(prev[j] + (ch_a != ch_b), curr[-1] + 1, prev[j + 1] + 1))
        prev = curr
    return prev[-1]


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

_MCQ_SYSTEM = """You are a deterministic industrial-safety assessor producing EXACTLY ONE \
multiple-choice question from the provided safety rule.

MANDATORY REQUIREMENTS:
1. The question MUST quote or paraphrase at least ONE specific noun, numeric threshold, \
component name, or procedural step that appears VERBATIM in the source rule text.
2. Do NOT invent, infer, or introduce any value not explicitly stated in the rule.
3. Produce exactly 4 distinct answer options (A–D).
4. No two options may be near-identical (token-similarity < 85%).
5. The correct option must not be dramatically longer than the distractors.

Return ONLY a valid JSON object with keys:
  stem        : string   (the question)
  question_type: "MCQ"
  options      : [string, string, string, string]
  correct_answer: string (must exactly match one option)
  bloom_level  : string (Remember | Understand | Apply | Analyze | Evaluate)
"""

_FITB_SYSTEM = """You are a deterministic industrial-safety assessor producing EXACTLY ONE \
fill-in-the-blank question from the provided safety rule.

MANDATORY REQUIREMENTS:
1. Take a KEY sentence from the rule, remove one critical fact (number, unit, component name, \
procedure step) and replace it with _____.
2. Provide the primary correct answer and 2–3 acceptable phrasings as blank_answer_variants.
3. Do NOT invent values not in the rule.

Return ONLY a valid JSON object with keys:
  stem                 : string (sentence with _____ in it)
  question_type        : "FILL_IN_BLANK"
  correct_answer       : string (the missing fact, primary phrasing)
  blank_answer_variants: [string, ...]  (2–3 acceptable alternatives, including abbreviations)
  bloom_level          : string (Remember | Understand | Apply | Analyze | Evaluate)
"""

_TF_SYSTEM = """You are a deterministic industrial-safety assessor producing EXACTLY ONE \
True/False question from the provided safety rule.

MANDATORY REQUIREMENTS:
1. The statement MUST reference a concrete, verifiable claim directly from the rule text.
2. The answer must be unambiguously True or False based solely on the rule.

Return ONLY a valid JSON object with keys:
  stem          : string
  question_type : "TRUE_FALSE"
  options       : ["True", "False"]
  correct_answer: "True" or "False"
  bloom_level   : string
"""


def _avoid_instruction(previously_generated_stems: list[str]) -> str:
    """Builds a deduplication suffix for the user prompt (Req #9)."""
    if not previously_generated_stems:
        return ""
    bullets = "\n".join(f"  - {s[:120]}" for s in previously_generated_stems[-8:])
    return (
        f"\n\nAVOID repeating the same underlying fact as these already-generated questions:\n"
        f"{bullets}\nGenerate a question about a DIFFERENT aspect of the rule."
    )


# ---------------------------------------------------------------------------
# Core single-question generator
# ---------------------------------------------------------------------------

async def _generate_single(
    rule_text: str,
    question_type: str,  # "MCQ" | "FILL_IN_BLANK" | "TRUE_FALSE"
    previously_generated_stems: list[str],
) -> dict:
    """
    Generates exactly one question of the requested type.
    Returns a normalised dict:
      question_text, question_type, options, correct_answer,
      correct_option_index, bloom_level, blank_answer_variants
    Raises LLMExtractionError after MAX_ATTEMPTS failures.
    """
    qt = question_type.upper()
    if qt == "MCQ":
        system_prompt = _MCQ_SYSTEM
    elif qt == "FILL_IN_BLANK":
        system_prompt = _FITB_SYSTEM
    else:
        system_prompt = _TF_SYSTEM

    avoid_note = _avoid_instruction(previously_generated_stems)
    user_msg = f"Source Safety Rule:\n{rule_text}{avoid_note}"

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            client = ollama.AsyncClient()
            response = await client.chat(
                model=settings.ollama_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                options={"temperature": 0.0},
            )
            raw = response.message.content
            data = json.loads(raw)

            # Normalise into a flat dict
            result: dict[str, Any] = {
                "question_text": data.get("stem", ""),
                "question_type": qt,
                "options": data.get("options"),
                "correct_answer": data.get("correct_answer", ""),
                "correct_option_index": None,
                "bloom_level": data.get("bloom_level", "Understand"),
                "blank_answer_variants": data.get("blank_answer_variants"),
            }

            # Post-process MCQ: resolve correct_option_index
            if qt == "MCQ":
                opts = result["options"]
                if not opts or len(opts) != 4:
                    raise ValueError(f"MCQ must have exactly 4 options, got {len(opts) if opts else 0}")
                ca = result["correct_answer"]
                if ca not in opts:
                    raise ValueError(f"correct_answer '{ca}' is not in options {opts}")
                result["correct_option_index"] = opts.index(ca)

            # Post-process TRUE_FALSE: normalise
            elif qt == "TRUE_FALSE":
                result["options"] = ["True", "False"]
                ca = str(result["correct_answer"]).strip().lower()
                result["correct_answer"] = "True" if ca in ("true", "1", "yes") else "False"
                result["correct_option_index"] = 0 if result["correct_answer"] == "True" else 1

            return result

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning("Generation attempt %d/%d failed for %s: %s", attempt, MAX_ATTEMPTS, qt, e)
            if attempt == MAX_ATTEMPTS:
                raise LLMExtractionError(f"Failed after {MAX_ATTEMPTS} attempts: {e}") from e
            await asyncio.sleep(BASE_DELAY * (2 ** (attempt - 1)))

        except Exception as e:
            logger.error("Ollama error on attempt %d: %s", attempt, e)
            if attempt == MAX_ATTEMPTS:
                raise LLMExtractionError(f"Ollama generation failed: {e}") from e
            await asyncio.sleep(BASE_DELAY * (2 ** (attempt - 1)))


# ---------------------------------------------------------------------------
# Public API – called from question_bank endpoint and assessment_assembler
# ---------------------------------------------------------------------------

async def generate_question_variants(
    rule_text: str,
    risk_score: int = 5,
    cognitive_level: str = "Understand",
    count: int = 3,
    question_type: str = "multiple_choice",
    previously_generated_stems: list[str] | None = None,
) -> list[dict]:
    """
    Generate `count` question variants for the given rule text.
    Questions are generated ONE AT A TIME (never batched) per Req design intent.

    question_type:
      - "multiple_choice"  → MCQ only
      - "fill_in_blank"    → FILL_IN_BLANK only
      - "all"              → cycles through MCQ, FILL_IN_BLANK, TRUE_FALSE

    Returns list of normalised dicts (may be fewer than `count` if the LLM
    consistently fails — the caller is responsible for fill-until-N loops).
    """
    stems_seen: list[str] = list(previously_generated_stems or [])
    results: list[dict] = []

    # Map external type string → internal enum token
    qt_map = {
        "multiple_choice": "MCQ",
        "mcq": "MCQ",
        "fill_in_blank": "FILL_IN_BLANK",
        "fitb": "FILL_IN_BLANK",
        "true_false": "TRUE_FALSE",
        "all": None,  # cycle
    }
    cycle_types = ["MCQ", "FILL_IN_BLANK", "TRUE_FALSE"]
    resolved_qt = qt_map.get(question_type.lower(), "MCQ")

    for i in range(count):
        qt = resolved_qt if resolved_qt else cycle_types[i % 3]
        try:
            item = await _generate_single(rule_text, qt, stems_seen)
            item["confidence"] = 1.0
            item["risk_score"] = risk_score
            item["cognitive_level"] = cognitive_level
            results.append(item)
            stems_seen.append(item["question_text"][:200])
        except LLMExtractionError as e:
            logger.error("Skipping question %d for rule (LLM failed): %s", i + 1, e)
            # Do not append – caller will detect shortfall and try another rule

    return results
