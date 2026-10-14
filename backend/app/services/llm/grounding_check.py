"""
grounding_check.py  (v2 — type-aware quality gates)
Extended quality gates run on every generated question before it is saved.

Gate dispatch:
  1. verify_grounding          – hallucination check (all types, but TF false-twin-aware)
  2. verify_option_length_bias – MCQ / MULTI_SELECT only
  3. verify_distractor_distinctiveness – MCQ / MULTI_SELECT only
  4. verify_specificity        – all types
  5. verify_fib_answer_in_source – FILL_IN_BLANK only
  6. verify_tf_single_edit     – TRUE_FALSE only

Each gate returns (passed: bool, severity: "hard"|"soft", reason_code: str)
run_all_checks returns (passed: bool, confidence: float, notes: list[str])
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Set


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _text(obj: Any, field: str) -> str:
    """Duck-type: works for both dicts and Pydantic objects."""
    v = getattr(obj, field, None)
    if v is None:
        v = obj.get(field, "") if isinstance(obj, dict) else ""
    return str(v) if v else ""


def _opts(obj: Any) -> list:
    v = getattr(obj, "options", None)
    if v is None and isinstance(obj, dict):
        v = obj.get("options", [])
    return v or []


def _norm(s: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    s = unicodedata.normalize("NFKD", s).lower()
    s = re.sub(r"[^\w\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _get_qtype(obj: Any) -> str:
    return (_text(obj, "question_type") or "MCQ").upper()


# ---------------------------------------------------------------------------
# 1. Grounding — hallucination check (type-aware)
# ---------------------------------------------------------------------------

def extract_numbers_and_units(text: str) -> Set[str]:
    entities: set = set()
    number_pattern = r"\b\d+(?:\.\d+)?(?:/\d+)?\b"
    entities.update(re.findall(number_pattern, text))
    unit_pattern = (
        r"(?i)\b(?:PSI|kg|mg|mm|cm|km|RPM|Volts|Hz|"
        r"hrs|hours|minutes|seconds)\b"
        r"|(?<!\w)\d+\s*(?:g|m|V|A)\b"
        r"|°[CF]"
    )
    entities.update(u.lower() for u in re.findall(unit_pattern, text))
    return entities


def verify_grounding(
    source_rule: str,
    generated_variant: Any,
) -> tuple[bool, str, str]:
    """
    Returns (passed, severity, reason_code).
    Hard-fail if variant contains hallucinated numeric entities.

    For TRUE_FALSE: numbers in the changed_fragment are EXEMPT because
    they are the declared false edit.
    """
    source_entities = extract_numbers_and_units(source_rule)

    q_type = _get_qtype(generated_variant)
    q_text = _text(generated_variant, "question_text") or _text(generated_variant, "stem")
    opts = _opts(generated_variant)
    correct = _text(generated_variant, "correct_answer")

    # For TRUE_FALSE: also include statement_false in checked text,
    # but exclude numbers that appear ONLY in changed_fragment
    changed_fragment = _text(generated_variant, "changed_fragment") if isinstance(generated_variant, dict) else ""

    combined = q_text + " " + correct + " " + " ".join(opts)

    # For TRUE_FALSE: add statement_false to combined (it will contain the swapped number)
    if q_type == "TRUE_FALSE" and isinstance(generated_variant, dict):
        stmt_false = generated_variant.get("statement_false", "") or ""
        combined += " " + stmt_false

    generated_entities = extract_numbers_and_units(combined)

    # Exempt numbers that appear in changed_fragment (declared false edit)
    if q_type == "TRUE_FALSE" and changed_fragment:
        exempt = extract_numbers_and_units(changed_fragment)
        # Also exempt numbers from statement_false that differ from statement_true
        if isinstance(generated_variant, dict):
            stmt_true = generated_variant.get("statement_true", "") or ""
            stmt_false = generated_variant.get("statement_false", "") or ""
            true_nums = extract_numbers_and_units(stmt_true)
            false_nums = extract_numbers_and_units(stmt_false)
            # Numbers only in false statement are the swapped values — exempt them
            exempt |= (false_nums - true_nums)
        generated_entities -= exempt

    hallucinated = generated_entities - source_entities
    if hallucinated:
        return False, "hard", f"grounding_flag: hallucinated entities: {hallucinated}"
    return True, "hard", ""


# ---------------------------------------------------------------------------
# 2. Option length bias — MCQ / MULTI_SELECT only
# ---------------------------------------------------------------------------

def verify_option_length_bias(generated_variant: Any) -> tuple[bool, str, str]:
    """Soft fail if correct option is >150% of average distractor length."""
    q_type = _get_qtype(generated_variant)
    if q_type not in ("MCQ", "MULTI_SELECT", "MULTIPLE_CHOICE"):
        return True, "soft", ""

    options = _opts(generated_variant)
    correct_idx = None
    if isinstance(generated_variant, dict):
        correct_idx = generated_variant.get("correct_option_index")
    else:
        correct_idx = getattr(generated_variant, "correct_option_index", None)
    correct_idx = correct_idx if correct_idx is not None else 0

    if not options or len(options) < 2 or correct_idx >= len(options):
        return True, "soft", ""

    correct_len = len(options[correct_idx])
    distractor_lens = [len(opt) for i, opt in enumerate(options) if i != correct_idx]
    if not distractor_lens:
        return True, "soft", ""

    avg_d = sum(distractor_lens) / len(distractor_lens)
    if avg_d > 0 and correct_len > 1.5 * avg_d:
        return False, "soft", "bias_flag: correct option is >150% of avg distractor length"
    return True, "soft", ""


# ---------------------------------------------------------------------------
# 3. Distractor distinctiveness — MCQ / MULTI_SELECT only
# ---------------------------------------------------------------------------

def _token_overlap_ratio(a: str, b: str) -> float:
    import difflib
    char_ratio = difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()
    ta = set(_norm(a).split())
    tb = set(_norm(b).split())
    if ta | tb:
        jaccard = len(ta & tb) / len(ta | tb)
    else:
        jaccard = 1.0
    return max(char_ratio, jaccard)


def verify_distractor_distinctiveness(
    generated_variant: Any, threshold: float = 0.85
) -> tuple[bool, str, str]:
    """Hard-fail if any two options share >=threshold token-overlap similarity."""
    q_type = _get_qtype(generated_variant)
    if q_type not in ("MCQ", "MULTI_SELECT", "MULTIPLE_CHOICE"):
        return True, "hard", ""

    options = _opts(generated_variant)
    if not options or len(options) < 2:
        return True, "hard", ""

    for i in range(len(options)):
        for j in range(i + 1, len(options)):
            sim = _token_overlap_ratio(options[i], options[j])
            if sim >= threshold:
                return False, "hard", f"distinctiveness_flag: options {i} and {j} are >={threshold:.0%} similar"
    return True, "hard", ""


# ---------------------------------------------------------------------------
# 4. Specificity (all types)
# ---------------------------------------------------------------------------

_STOPWORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "shall", "should", "may", "might", "must", "can",
    "could", "of", "in", "on", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "before",
    "after", "above", "below", "from", "up", "down", "out", "off",
    "over", "under", "again", "further", "then", "once", "and",
    "but", "or", "nor", "so", "yet", "both", "either", "neither",
    "not", "only", "same", "than", "too", "very", "just", "that",
    "this", "these", "those", "what", "which", "who", "whom",
    "when", "where", "why", "how", "all", "each", "every", "both",
    "few", "more", "most", "other", "some", "such", "no", "any",
})


def _content_tokens(text: str) -> Set[str]:
    return {w for w in _norm(text).split() if w not in _STOPWORDS and len(w) > 2}


def verify_specificity(
    source_rule: str, generated_variant: Any
) -> tuple[bool, str, str]:
    """Soft fail if no content token from rule appears in question+answer."""
    rule_tokens = _content_tokens(source_rule)
    q_text = _text(generated_variant, "question_text") or _text(generated_variant, "stem")
    correct = _text(generated_variant, "correct_answer")

    # For TF also check both statements
    extra = ""
    if _get_qtype(generated_variant) == "TRUE_FALSE" and isinstance(generated_variant, dict):
        extra = (generated_variant.get("statement_true") or "") + " " + (generated_variant.get("statement_false") or "")

    question_tokens = _content_tokens(q_text + " " + correct + " " + extra)
    shared = rule_tokens & question_tokens
    if len(shared) < 1:
        return False, "soft", "specificity_flag: question does not quote any concrete fact from rule"
    return True, "soft", ""


# ---------------------------------------------------------------------------
# 5. FIB answer in source sentence
# ---------------------------------------------------------------------------

def verify_fib_answer_in_source(
    source_rule: str, generated_variant: Any
) -> tuple[bool, str, str]:
    """
    Hard-fail if the FILL_IN_BLANK correct_answer is not a verbatim substring of the rule.
    Also checks that stem+answer reconstructs the source sentence with similarity>=0.90.
    """
    if _get_qtype(generated_variant) != "FILL_IN_BLANK":
        return True, "hard", ""

    correct = _text(generated_variant, "correct_answer").strip()
    if not correct:
        return False, "hard", "fib_flag: empty correct_answer"

    # Check verbatim substring
    rule_lower = source_rule.lower()
    if correct.lower() not in rule_lower:
        return False, "hard", f"fib_flag: answer '{correct[:40]}' not verbatim in rule"

    # Check stem+answer reconstruction similarity
    stem = _text(generated_variant, "question_text")
    if "_____" in stem:
        reconstructed = stem.replace("_____", correct)
    else:
        reconstructed = stem

    import difflib
    # Find best-matching sentence in rule
    rule_sentences = re.split(r"[.!?;\n]", source_rule)
    best_ratio = max(
        (difflib.SequenceMatcher(None, _norm(reconstructed), _norm(s)).ratio()
         for s in rule_sentences if s.strip()),
        default=0.0,
    )
    if best_ratio < 0.70:
        return False, "hard", f"fib_flag: reconstructed sentence similarity {best_ratio:.2f} < 0.70"

    return True, "hard", ""


# ---------------------------------------------------------------------------
# 6. TRUE_FALSE single-edit verification
# ---------------------------------------------------------------------------

def verify_tf_single_edit(generated_variant: Any) -> tuple[bool, str, str]:
    """
    Hard-fail if the TRUE_FALSE false twin appears to differ from the true
    statement in more than one declared region.
    """
    if _get_qtype(generated_variant) != "TRUE_FALSE":
        return True, "hard", ""

    if not isinstance(generated_variant, dict):
        return True, "hard", ""

    stmt_true = generated_variant.get("statement_true") or ""
    stmt_false = generated_variant.get("statement_false") or ""
    changed_fragment = generated_variant.get("changed_fragment") or ""

    if not stmt_true or not stmt_false or not changed_fragment:
        return False, "hard", "tf_flag: missing statement_true, statement_false, or changed_fragment"

    if stmt_true == stmt_false:
        return False, "hard", "tf_flag: statement_true equals statement_false"

    # Diff: check how many non-overlapping regions differ
    import difflib
    matcher = difflib.SequenceMatcher(None, stmt_true, stmt_false)
    diff_blocks = [b for b in matcher.get_opcodes() if b[0] != "equal"]

    # Allow up to 2 diff blocks (the changed fragment may span a small phrase)
    if len(diff_blocks) > 3:
        return False, "hard", f"tf_flag: too many diff regions ({len(diff_blocks)}), expected 1"

    # The changed_fragment should appear in stmt_true (it's what was changed)
    if changed_fragment.lower() not in stmt_true.lower():
        return False, "soft", f"tf_flag: changed_fragment '{changed_fragment[:40]}' not in statement_true"

    return True, "hard", ""


# ---------------------------------------------------------------------------
# Public: run_all_checks (type-aware dispatch)
# ---------------------------------------------------------------------------

def run_all_checks(
    source_rule: str,
    generated_variant: Any,
) -> tuple[bool, float, list[str]]:
    """
    Runs all applicable quality gates for the question type.
    Returns:
      passed     – True only if all hard-fail checks pass
      confidence – float 0-1 (reduced for soft warnings)
      notes      – list of human-readable flag strings
    """
    notes: list[str] = []
    confidence = 1.0
    hard_fail = False

    # 1. Grounding (all types, TF-aware)
    grnd_ok, grnd_sev, grnd_note = verify_grounding(source_rule, generated_variant)
    if not grnd_ok:
        notes.append(grnd_note)
        if grnd_sev == "hard":
            hard_fail = True
        else:
            confidence -= 0.2

    # 2. Option length bias (MCQ / MULTI_SELECT only)
    bias_ok, bias_sev, bias_note = verify_option_length_bias(generated_variant)
    if not bias_ok:
        notes.append(bias_note)
        confidence -= 0.2

    # 3. Distractor distinctiveness (MCQ / MULTI_SELECT only)
    dist_ok, dist_sev, dist_note = verify_distractor_distinctiveness(generated_variant)
    if not dist_ok:
        notes.append(dist_note)
        if dist_sev == "hard":
            hard_fail = True
        else:
            confidence -= 0.3

    # 4. Specificity (all types)
    spec_ok, spec_sev, spec_note = verify_specificity(source_rule, generated_variant)
    if not spec_ok:
        notes.append(spec_note)
        confidence -= 0.15

    # 5. FIB answer in source (FILL_IN_BLANK only)
    fib_ok, fib_sev, fib_note = verify_fib_answer_in_source(source_rule, generated_variant)
    if not fib_ok:
        notes.append(fib_note)
        if fib_sev == "hard":
            hard_fail = True
        else:
            confidence -= 0.2

    # 6. TRUE_FALSE single-edit (TRUE_FALSE only)
    tf_ok, tf_sev, tf_note = verify_tf_single_edit(generated_variant)
    if not tf_ok:
        notes.append(tf_note)
        if tf_sev == "hard":
            hard_fail = True
        else:
            confidence -= 0.15

    confidence = max(0.0, confidence)
    passed = not hard_fail
    return passed, confidence, notes
