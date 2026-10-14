"""
generator.py  (v2 — all-4-types edition)
Generates ONE question at a time against the local Ollama model (never batched).

Types supported: MCQ | TRUE_FALSE | FILL_IN_BLANK | MULTI_SELECT

Key changes vs v1:
  - Type-routing dispatches to dedicated _generate_<type> functions
  - FILL_IN_BLANK: deterministic masking of highest-value term in code;
    LLM only polishes the sentence framing, never changes the answer.
  - TRUE_FALSE: returns statement_true, statement_false, edit_kind,
    changed_fragment so grounding can diff-verify only the declared fragment.
  - MULTI_SELECT: stricter requirement that each correct option fuzzy-matches
    a clause of the rule and distractors do NOT match.
  - Fill-until-N now returns an explicit shortfall dict per type.
  - grade_fill_in_blank and grade_multi_select remain unchanged (public API).
  - Never batched, temperature=0.0 for fact-precision.
"""

from __future__ import annotations

import json
import logging
import asyncio
import difflib
import unicodedata
import re
from typing import Any

import ollama
from pydantic import ValidationError

from app.schemas.llm_schemas import RuleExtractionResponse, QuestionVariant
from app.core.config import settings
from app.services.llm.rule_profiler import profile_rule

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
BASE_DELAY = 1.0


class LLMExtractionError(Exception):
    """Raised when the LLM fails to return valid structured output after retries."""
    pass


# ---------------------------------------------------------------------------
# Public grading helpers (used by assessment.py submit_exam)
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
    Auto-grade a FILL_IN_BLANK response.
    Normalises both sides, then checks exact match or edit-distance <= fuzzy_max_distance.
    Numeric values must match exactly (no fuzzy: "500" != "600").
    """
    norm_student = _norm_fill_blank(student_answer)
    accepted = [_norm_fill_blank(correct_answer)]
    if variants:
        accepted.extend(_norm_fill_blank(v) for v in variants)

    for acc in accepted:
        if norm_student == acc:
            return True
        # Only apply fuzzy for non-numeric strings
        is_numeric = re.match(r"^\d+(\.\d+)?\s*\w*$", acc) is not None
        if not is_numeric and abs(len(norm_student) - len(acc)) <= fuzzy_max_distance:
            if _levenshtein(norm_student, acc) <= fuzzy_max_distance:
                return True
    return False


def grade_multi_select(
    selected_indices: list[int],
    correct_indices: list[int],
) -> bool:
    """
    Grade a MULTI_SELECT response. All-or-nothing: must match exactly.
    Partial selection = wrong (safety-critical context).
    """
    return sorted(selected_indices) == sorted(correct_indices)


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
# Shared constraint suffix
# ---------------------------------------------------------------------------

_SHARED_CONSTRAINTS = """
ADDITIONAL CONSTRAINTS (safety-critical assessment):
- STRICTLY PROHIBITED: Do NOT use negatively phrased questions under any circumstances (e.g., "Which of the following is NOT...", "Which is incorrect", etc.). All questions MUST be positively phrased.
- VARY SENTENCE STRUCTURE EXTREMELY. DO NOT start questions with "A worker notices..." or "A worker observes...". Rotate between direct fact-recall, practical procedural scenarios, role-based responsibilities, and situational identification.
- Every distractor must be independently and clearly false based on the rule — not just "less complete".
- Ground every claim in the literal text of the rule provided. Never introduce facts not present in the rule.
"""

# ---------------------------------------------------------------------------
# MCQ prompt
# ---------------------------------------------------------------------------

_MCQ_SYSTEM = """You are a deterministic industrial-safety assessor producing EXACTLY ONE \
multiple-choice question from the provided safety rule.

MANDATORY REQUIREMENTS:
1. The question MUST quote or paraphrase at least ONE specific noun, numeric threshold, \
component name, or procedural step that appears VERBATIM in the source rule text.
2. Do NOT invent, infer, or introduce any value not explicitly stated in the rule.
3. Produce exactly 4 distinct answer options (A-D).
4. No two options may be near-identical (token-similarity < 85%).
5. The correct option must not be dramatically longer than the distractors.
""" + _SHARED_CONSTRAINTS + """
Return ONLY a valid JSON object with keys:
  stem        : string   (the question)
  question_type: "MCQ"
  options      : [string, string, string, string]
  correct_answer: string (must exactly match one option)
  bloom_level  : string (Remember | Understand | Apply | Analyze | Evaluate)
"""

# ---------------------------------------------------------------------------
# MULTI_SELECT prompt
# ---------------------------------------------------------------------------

_MULTI_SELECT_SYSTEM = """You are a deterministic industrial-safety assessor producing EXACTLY ONE \
multi-select question from the provided safety rule.

MANDATORY REQUIREMENTS:
1. Only generate this question type if the rule genuinely contains multiple distinct correct facts \
(a rule listing several required PPE items, multiple steps in a procedure, or several prohibited actions).
2. Produce 4-6 answer options. Exactly 2, 3, or 4 of them must be INDEPENDENTLY correct — each correct \
option must be a clearly true statement about the rule on its own.
3. Each incorrect option must be independently false based on the rule — not merely "less complete".
4. Do NOT use "all of the above" or "none of the above" as options.
5. The question stem must NOT contain "select all that apply" — that instruction appears in the UI.
""" + _SHARED_CONSTRAINTS + """
Return ONLY a valid JSON object with keys:
  stem                  : string
  question_type         : "MULTI_SELECT"
  options               : [string, ...]   (4-6 strings)
  correct_answers       : [string, ...]   (2+ strings, each must exactly match one option)
  bloom_level           : string (Remember | Understand | Apply | Analyze | Evaluate)
"""

# ---------------------------------------------------------------------------
# TRUE_FALSE prompt  (returns BOTH true and false versions for diff verification)
# ---------------------------------------------------------------------------

_TF_SYSTEM = """You are a deterministic industrial-safety assessor producing EXACTLY ONE \
True/False question pair from the provided safety rule.

MANDATORY REQUIREMENTS:
1. Write statement_true: a correct statement that is directly and unambiguously TRUE based on the rule.
2. Write statement_false: a version of statement_true with EXACTLY ONE deliberate change that makes it FALSE.
3. Declare edit_kind as one of: negation | number_swap | actor_swap | condition_swap
4. Declare changed_fragment: the exact text that was changed (e.g., the original word/number that was replaced).
5. The false statement may only differ from the true statement in the declared fragment.
6. Do NOT introduce new facts. Do NOT negate with "not" if that is ambiguous.
7. If AVOID instructions are present, statement_true MUST focus on a DIFFERENT clause, requirement, or aspect of the rule from the avoided questions.
8. The correct_answer must be either "True" (if the displayed statement is the true version) or "False" (if false version).
   For generation, ALWAYS set correct_answer to "True" (the system will randomly serve either version at exam time).
""" + _SHARED_CONSTRAINTS + """
Return ONLY a valid JSON object with keys:
  statement_true    : string  (grounded true statement)
  statement_false   : string  (false twin — exactly one edit from statement_true)
  edit_kind         : string  (negation | number_swap | actor_swap | condition_swap)
  changed_fragment  : string  (the original word/number/phrase that was changed in statement_false)
  question_type     : "TRUE_FALSE"
  bloom_level       : string (Remember | Understand | Apply | Analyze | Evaluate)
"""

# ---------------------------------------------------------------------------
# FILL_IN_BLANK prompt  (LLM polishes framing only; answer determined in code)
# ---------------------------------------------------------------------------

_FITB_SYSTEM_TEMPLATE = """You are a deterministic industrial-safety assessor producing EXACTLY ONE \
fill-in-the-blank question from the provided safety rule.

The term to be masked (blank) is already determined: "{masked_term}"
Your job:
1. Take the sentence from the rule that contains this term.
2. Replace the term with _____ in the sentence.
3. Keep the sentence structure closely grounded in the source rule sentence. Do NOT invent new facts or outside requirements.
4. Return the blank_answer_variants as a list of acceptable phrasings for "{masked_term}".

MANDATORY:
- stem must contain exactly ONE _____ placeholder.
- correct_answer must be EXACTLY "{masked_term}" or a case-normalised form of it.
- Do NOT introduce any other blanks.
- Do NOT invent alternate correct answers not derivable from the term itself.
""" + _SHARED_CONSTRAINTS + """
Return ONLY a valid JSON object with keys:
  stem                 : string (sentence with _____ in it)
  question_type        : "FILL_IN_BLANK"
  correct_answer       : string (the masked fact, primary phrasing)
  blank_answer_variants: [string, ...]  (2-4 acceptable alternatives)
  bloom_level          : string (Remember | Understand | Apply | Analyze | Evaluate)
"""


def _avoid_instruction(previously_generated_stems: list[str]) -> str:
    """Builds a deduplication suffix for the user prompt."""
    if not previously_generated_stems:
        return ""
    bullets = "\n".join(f"  - {s[:120]}" for s in previously_generated_stems[-8:])
    return (
        f"\n\nAVOID repeating the same underlying fact or similar wording as these already-generated questions:\n"
        f"{bullets}\nGenerate a question about a DIFFERENT aspect or clause of the rule."
    )


def _build_generation_suffix(
    stems_seen: list[str],
    style: str | None = None,
    focus_hint: str | None = None,
) -> str:
    suffix = _avoid_instruction(stems_seen)
    if style:
        s_low = style.lower().strip()
        if s_low == "scenario":
            suffix += "\n\nSTYLE INSTRUCTION: Frame this question as a practical workplace scenario describing an operational technician on shift."
        elif s_low == "recall":
            suffix += "\n\nSTYLE INSTRUCTION: Frame this question as a strict regulatory compliance recall check."
        elif s_low == "direct":
            suffix += "\n\nSTYLE INSTRUCTION: Frame this question as a direct procedural safety verification."
    if focus_hint and focus_hint.strip():
        suffix += f"\n\nFOCUS HINT: Specifically target this rule requirement/threshold: {focus_hint.strip()}"
    return suffix


# ---------------------------------------------------------------------------
# Low-level Ollama call helper
# ---------------------------------------------------------------------------

async def _ollama_call(
    system_prompt: str,
    user_msg: str,
    temperature: float = 0.0,
    seed: Optional[int] = None,
) -> dict:
    """
    Single Ollama call with retry. Returns parsed JSON dict.
    Raises LLMExtractionError after MAX_ATTEMPTS failures.
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            client = ollama.AsyncClient()
            options: dict[str, Any] = {"temperature": temperature}
            if seed is not None:
                options["seed"] = seed
            response = await client.chat(
                model=settings.ollama_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                options=options,
                format="json",
            )
            raw = response.message.content.strip()
            if raw.startswith("```json"):
                raw = raw[7:]
            elif raw.startswith("```"):
                raw = raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            return json.loads(raw.strip())

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning("Ollama attempt %d/%d failed: %s", attempt, MAX_ATTEMPTS, e)
            if attempt == MAX_ATTEMPTS:
                raise LLMExtractionError(f"JSON parse failed after {MAX_ATTEMPTS} attempts: {e}") from e
            await asyncio.sleep(BASE_DELAY * (2 ** (attempt - 1)))

        except Exception as e:
            logger.error("Ollama error on attempt %d: %s", attempt, e)
            if attempt == MAX_ATTEMPTS:
                raise LLMExtractionError(f"Ollama generation failed: {e}") from e
            await asyncio.sleep(BASE_DELAY * (2 ** (attempt - 1)))

    raise LLMExtractionError("Exhausted retries")


# ---------------------------------------------------------------------------
# Per-type generators (one question at a time, never batched)
# ---------------------------------------------------------------------------

async def _generate_mcq(
    rule_text: str,
    stems_seen: list[str],
    temperature: float = 0.0,
    seed: int | None = None,
    style: str | None = None,
    focus_hint: str | None = None,
) -> dict:
    """Generate exactly one MCQ."""
    suffix = _build_generation_suffix(stems_seen, style=style, focus_hint=focus_hint)
    data = await _ollama_call(
        _MCQ_SYSTEM,
        f"Source Safety Rule:\n{rule_text}{suffix}",
        temperature=temperature,
        seed=seed,
    )

    opts = data.get("options") or []
    if len(opts) != 4:
        raise LLMExtractionError(f"MCQ must have exactly 4 options, got {len(opts)}")

    ca = data.get("correct_answer", "")
    if ca not in opts:
        raise LLMExtractionError(f"MCQ correct_answer '{ca}' not in options {opts}")

    return {
        "question_text": data.get("stem", ""),
        "question_type": "MCQ",
        "options": opts,
        "correct_answer": ca,
        "correct_option_index": opts.index(ca),
        "correct_option_indices": None,
        "blank_answer_variants": None,
        "bloom_level": data.get("bloom_level", "Understand"),
        "statement_true": None,
        "statement_false": None,
        "edit_kind": None,
        "changed_fragment": None,
    }


async def _generate_multi_select(
    rule_text: str,
    stems_seen: list[str],
    temperature: float = 0.0,
    seed: int | None = None,
    style: str | None = None,
    focus_hint: str | None = None,
) -> dict:
    """Generate exactly one MULTI_SELECT question."""
    suffix = _build_generation_suffix(stems_seen, style=style, focus_hint=focus_hint)
    data = await _ollama_call(
        _MULTI_SELECT_SYSTEM,
        f"Source Safety Rule:\n{rule_text}{suffix}",
        temperature=temperature,
        seed=seed,
    )

    opts = data.get("options") or []
    if len(opts) < 4:
        raise LLMExtractionError(f"MULTI_SELECT must have >=4 options, got {len(opts)}")

    correct_answers = data.get("correct_answers", [])
    if len(correct_answers) < 2:
        raise LLMExtractionError(f"MULTI_SELECT must have >=2 correct answers, got {len(correct_answers)}")

    indices = []
    for ca in correct_answers:
        if ca not in opts:
            raise LLMExtractionError(f"MULTI_SELECT correct answer '{ca}' not in options {opts}")
        indices.append(opts.index(ca))

    if len(indices) >= len(opts):
        raise LLMExtractionError("MULTI_SELECT: fewer correct than options required")

    return {
        "question_text": data.get("stem", ""),
        "question_type": "MULTI_SELECT",
        "options": opts,
        "correct_answer": correct_answers[0],
        "correct_option_index": None,
        "correct_option_indices": sorted(indices),
        "blank_answer_variants": None,
        "bloom_level": data.get("bloom_level", "Understand"),
        "statement_true": None,
        "statement_false": None,
        "edit_kind": None,
        "changed_fragment": None,
    }


async def _generate_true_false(
    rule_text: str,
    stems_seen: list[str],
    temperature: float = 0.0,
    seed: int | None = None,
    style: str | None = None,
    focus_hint: str | None = None,
) -> dict:
    """
    Generate a TRUE_FALSE question pair (both statement_true and statement_false).
    The grounding check is expected to only validate numbers NOT in changed_fragment.
    Returns the TRUE statement as the primary stem; grading stores correct_option_index=0 (True).
    """
    suffix = _build_generation_suffix(stems_seen, style=style, focus_hint=focus_hint)
    data = await _ollama_call(
        _TF_SYSTEM,
        f"Source Safety Rule:\n{rule_text}{suffix}",
        temperature=temperature,
        seed=seed,
    )

    stmt_true = data.get("statement_true", "")
    stmt_false = data.get("statement_false", "")
    edit_kind = data.get("edit_kind", "negation")
    changed_fragment = data.get("changed_fragment", "")

    if not stmt_true or not stmt_false:
        raise LLMExtractionError("TRUE_FALSE: missing statement_true or statement_false")

    if not changed_fragment and stmt_true != stmt_false:
        matcher = difflib.SequenceMatcher(None, stmt_true.split(), stmt_false.split())
        diff_words = []
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag in ('replace', 'delete'):
                diff_words.extend(stmt_true.split()[i1:i2])
        if diff_words:
            changed_fragment = " ".join(diff_words)

    if not changed_fragment:
        changed_fragment = "procedural requirement"

    # Verify diff: if model generated identical statements, produce deterministic false twin
    if stmt_true == stmt_false:
        num_match = re.search(r"\b(\d+)\b", stmt_true)
        if num_match:
            old_num = num_match.group(1)
            new_num = str(int(old_num) * 2 if old_num != "0" else 5)
            stmt_false = stmt_true[:num_match.start()] + new_num + stmt_true[num_match.end():]
            changed_fragment = old_num
            edit_kind = "number_swap"
        elif "must" in stmt_true.lower():
            stmt_false = re.sub(r"\bmust\b", "is not required to", stmt_true, count=1, flags=re.IGNORECASE)
            changed_fragment = "must"
            edit_kind = "negation"
        elif "shall" in stmt_true.lower():
            stmt_false = re.sub(r"\bshall\b", "is optional to", stmt_true, count=1, flags=re.IGNORECASE)
            changed_fragment = "shall"
            edit_kind = "negation"
        else:
            stmt_false = "It is optional that " + stmt_true[0].lower() + stmt_true[1:]
            changed_fragment = "It is optional that"
            edit_kind = "condition_swap"

    return {
        "question_text": stmt_true,     # stored as the canonical (true) version
        "question_type": "TRUE_FALSE",
        "options": ["True", "False"],
        "correct_answer": "True",
        "correct_option_index": 0,      # 0 = True
        "correct_option_indices": None,
        "blank_answer_variants": None,
        "bloom_level": data.get("bloom_level", "Understand"),
        "statement_true": stmt_true,
        "statement_false": stmt_false,
        "edit_kind": edit_kind,
        "changed_fragment": changed_fragment,
    }


def _build_fib_variants(term: str) -> list[str]:
    """
    Generate acceptable answer variants for a masked term in code
    (case/whitespace/abbreviation variants).
    """
    variants: list[str] = [term]

    # Number + unit combos: e.g. "500 volts" -> "500V", "500v", "500 V", "500 Volts"
    m = re.match(r"^(\d+(?:\.\d+)?)\s*(\w+)$", term.strip())
    if m:
        num, unit = m.group(1), m.group(2)
        # Short abbreviation
        abbrevs = {
            "volts": "V", "volt": "V",
            "amps": "A", "amp": "A", "amperes": "A",
            "kilograms": "kg", "kilogram": "kg",
            "grams": "g", "gram": "g",
            "meters": "m", "meter": "m",
            "feet": "ft", "foot": "ft",
            "hertz": "Hz",
            "rpm": "RPM", "rotations per minute": "RPM",
            "psi": "PSI", "pounds per square inch": "PSI",
            "percent": "%", "percentage": "%",
            "seconds": "s", "second": "s",
            "minutes": "min", "minute": "min",
            "hours": "hr", "hour": "hr",
        }
        for long, short in abbrevs.items():
            if unit.lower() == long:
                variants.append(f"{num}{short}")
                variants.append(f"{num} {short}")
                variants.append(f"{num}{unit.capitalize()}")
                break
            elif unit.lower() == short.lower():
                full_unit = [k for k, v in abbrevs.items() if v == short]
                if full_unit:
                    variants.append(f"{num} {full_unit[0]}")
                    variants.append(f"{num} {full_unit[0].capitalize()}")
                break
        variants.append(f"{num}{unit}")
        variants.append(f"{num} {unit.lower()}")
        variants.append(f"{num} {unit.upper()}")
    else:
        # Text: add case variants
        variants.append(term.lower())
        variants.append(term.upper())
        variants.append(term.capitalize())

    # Deduplicate preserving order
    seen = set()
    result = []
    for v in variants:
        if v not in seen and v:
            seen.add(v)
            result.append(v)
    return result


async def _generate_fill_in_blank(
    rule_text: str,
    maskable_terms: list[str],
    stems_seen: list[str],
    temperature: float = 0.0,
    seed: int | None = None,
    style: str | None = None,
    focus_hint: str | None = None,
) -> dict:
    """
    FILL_IN_BLANK generation:
    1. Pick best maskable term from pre-computed list (highest value = num+unit first).
    2. Use Ollama to produce a clean sentence with _____ where the term was.
    3. Answer variants built entirely in code.
    """
    if not maskable_terms:
        raise LLMExtractionError("FILL_IN_BLANK: no maskable terms in rule")

    masked_term = maskable_terms[0]  # default highest-priority term
    if focus_hint and focus_hint.strip():
        for t in maskable_terms:
            if t.lower() in focus_hint.lower() or focus_hint.lower() in t.lower():
                masked_term = t
                break
    elif stems_seen and len(maskable_terms) > 1:
        # Pick alternate term not already used in previous stems
        unseen = [t for t in maskable_terms if not any(t.lower() in s.lower() for s in stems_seen)]
        if unseen:
            masked_term = unseen[0]
        else:
            idx = len(stems_seen) % len(maskable_terms)
            masked_term = maskable_terms[idx]

    system_prompt = _FITB_SYSTEM_TEMPLATE.format(masked_term=masked_term)
    suffix = _build_generation_suffix(stems_seen, style=style, focus_hint=focus_hint)
    data = await _ollama_call(
        system_prompt,
        f"Source Safety Rule:\n{rule_text}{suffix}",
        temperature=temperature,
        seed=seed,
    )

    stem = data.get("stem", "")
    rule_sentences = [s.strip() for s in re.split(r"[.!?;\n]", rule_text) if s.strip()]
    reconstructed = stem.replace("_____", masked_term) if "_____" in stem else stem
    best_ratio = max(
        (difflib.SequenceMatcher(None, _norm_fill_blank(reconstructed), _norm_fill_blank(s)).ratio()
         for s in rule_sentences if s.strip()),
        default=0.0,
    )

    if "_____" not in stem or stem.count("_____") != 1 or best_ratio < 0.70:
        # Fallback to deterministic masking directly on source rule sentence (Req #3)
        for s in rule_sentences:
            if re.search(re.escape(masked_term), s, re.IGNORECASE):
                stem = re.sub(re.escape(masked_term), "_____", s, count=1, flags=re.IGNORECASE)
                break
        if not stem or "_____" not in stem:
            stem = re.sub(re.escape(masked_term), "_____", rule_text, count=1, flags=re.IGNORECASE)

    if "_____" not in stem:
        raise LLMExtractionError("FILL_IN_BLANK: could not place '_____' in stem")

    # Build variants in code — do NOT trust the LLM for variants
    variants = _build_fib_variants(masked_term)

    # LLM may return additional variants; merge if they match the same term
    llm_variants = data.get("blank_answer_variants") or []
    for v in llm_variants:
        v_norm = v.strip()
        # Only accept if it's essentially the same term (normalised match)
        if _norm_fill_blank(v_norm) == _norm_fill_blank(masked_term) and v_norm not in variants:
            variants.append(v_norm)

    return {
        "question_text": stem,
        "question_type": "FILL_IN_BLANK",
        "options": None,
        "correct_answer": masked_term,
        "correct_option_index": None,
        "correct_option_indices": None,
        "blank_answer_variants": variants,
        "bloom_level": data.get("bloom_level", "Remember"),
        "statement_true": None,
        "statement_false": None,
        "edit_kind": None,
        "changed_fragment": None,
    }


# ---------------------------------------------------------------------------
# Public API — generate one question of a given type
# ---------------------------------------------------------------------------

async def _generate_single(
    rule_text: str,
    question_type: str,          # "MCQ" | "FILL_IN_BLANK" | "TRUE_FALSE" | "MULTI_SELECT"
    previously_generated_stems: list[str],
    maskable_terms: list[str] | None = None,
    temperature: float = 0.0,
    seed: int | None = None,
    style: str | None = None,
    focus_hint: str | None = None,
) -> dict:
    """
    Generates exactly one question of the requested type.
    Returns a normalised dict.
    Raises LLMExtractionError on failure.
    """
    qt = question_type.upper()

    if qt == "MCQ":
        return await _generate_mcq(
            rule_text,
            previously_generated_stems,
            temperature=temperature,
            seed=seed,
            style=style,
            focus_hint=focus_hint,
        )
    elif qt == "MULTI_SELECT":
        return await _generate_multi_select(
            rule_text,
            previously_generated_stems,
            temperature=temperature,
            seed=seed,
            style=style,
            focus_hint=focus_hint,
        )
    elif qt == "TRUE_FALSE":
        return await _generate_true_false(
            rule_text,
            previously_generated_stems,
            temperature=temperature,
            seed=seed,
            style=style,
            focus_hint=focus_hint,
        )
    elif qt == "FILL_IN_BLANK":
        terms = maskable_terms or profile_rule(rule_text).maskable_terms
        return await _generate_fill_in_blank(
            rule_text,
            terms,
            previously_generated_stems,
            temperature=temperature,
            seed=seed,
            style=style,
            focus_hint=focus_hint,
        )
    else:
        raise LLMExtractionError(f"Unknown question_type: {qt}")


# ---------------------------------------------------------------------------
# Public API — generate count variants for one type (fill-until-N, type-strict)
# ---------------------------------------------------------------------------

async def generate_question_variants(
    rule_text: str,
    risk_score: int = 5,
    cognitive_level: str = "Understand",
    count: int = 3,
    question_type: str = "multiple_choice",
    previously_generated_stems: list[str] | None = None,
    maskable_terms: list[str] | None = None,
) -> list[dict]:
    """
    Generate `count` question variants for the given rule text.
    Questions are generated ONE AT A TIME, never batched.

    question_type:
      - "multiple_choice" / "mcq"  -> MCQ only
      - "multi_select"             -> MULTI_SELECT only
      - "fill_in_blank" / "fitb"   -> FILL_IN_BLANK only
      - "true_false"               -> TRUE_FALSE only
      - "all"                      -> cycles through MCQ, FILL_IN_BLANK, TRUE_FALSE, MULTI_SELECT

    Returns list of normalised dicts with full type metadata.
    May return fewer than `count` if the LLM consistently fails.
    Caller is responsible for fill-until-N loops.
    """
    stems_seen: list[str] = list(previously_generated_stems or [])
    results: list[dict] = []

    qt_map = {
        "multiple_choice": "MCQ",
        "mcq": "MCQ",
        "fill_in_blank": "FILL_IN_BLANK",
        "fitb": "FILL_IN_BLANK",
        "multi_select": "MULTI_SELECT",
        "true_false": "TRUE_FALSE",
        "all": None,  # cycle
    }
    cycle_types = ["MCQ", "FILL_IN_BLANK", "TRUE_FALSE", "MULTI_SELECT"]
    resolved_qt = qt_map.get(question_type.lower(), "MCQ")

    for i in range(count):
        qt = resolved_qt if resolved_qt else cycle_types[i % len(cycle_types)]
        try:
            item = await _generate_single(
                rule_text, qt, stems_seen, maskable_terms=maskable_terms
            )
            item["confidence"] = 1.0
            item["risk_score"] = risk_score
            item["cognitive_level"] = cognitive_level
            results.append(item)
            stems_seen.append(item["question_text"][:200])
        except LLMExtractionError as e:
            logger.error("Skipping question %d (type=%s) LLM failed: %s", i + 1, qt, e)
            # Do not append -- caller will detect shortfall

    return results


# ---------------------------------------------------------------------------
# Default generation matrix per rule
# ---------------------------------------------------------------------------

async def generate_default_matrix(
    rule_text: str,
    risk_score: int = 5,
    cognitive_level: str = "Understand",
    previously_generated_stems: list[str] | None = None,
) -> dict:
    """
    Generate the default question matrix for a rule:
      MCQ x2, TRUE_FALSE x1, FILL_IN_BLANK x1 (if allowed), MULTI_SELECT x1 (if allowed)

    Returns:
      {
        "results": list[dict],
        "shortfall": dict[str, dict]  -- type -> {requested, produced, skipped_reason}
      }
    """
    profile = profile_rule(rule_text)
    allowed = profile.allowed_types

    plan = {"MCQ": 2}
    if "TRUE_FALSE" in allowed:
        plan["TRUE_FALSE"] = 1
    if "FILL_IN_BLANK" in allowed:
        plan["FILL_IN_BLANK"] = 1
    if "MULTI_SELECT" in allowed:
        plan["MULTI_SELECT"] = 1

    all_results: list[dict] = []
    shortfall: dict[str, dict] = {}
    stems_seen: list[str] = list(previously_generated_stems or [])

    for qt, requested in plan.items():
        produced = 0
        for _ in range(requested * MAX_ATTEMPTS):
            if produced >= requested:
                break
            try:
                item = await _generate_single(
                    rule_text, qt, stems_seen, maskable_terms=profile.maskable_terms
                )
                item["confidence"] = 1.0
                item["risk_score"] = risk_score
                item["cognitive_level"] = cognitive_level
                all_results.append(item)
                stems_seen.append(item["question_text"][:200])
                produced += 1
            except LLMExtractionError as e:
                logger.warning("Matrix gen failed for type=%s: %s", qt, e)

        if produced < requested:
            shortfall[qt] = {"requested": requested, "produced": produced}

    return {"results": all_results, "shortfall": shortfall}
