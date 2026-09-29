"""
grounding_check.py
Extended quality gates run on every generated question before it is saved.

Checks implemented:
  1. verify_grounding          – no hallucinated numbers / units (original)
  2. verify_option_length_bias – correct option not >50% longer than avg distractor (original, tightened)
  3. verify_distractor_distinctiveness – no two options >85% similar (Req #3)
  4. verify_specificity_check  – question / correct-answer quotes ≥1 concrete noun
                                 or value from the rule text (Req #2)
"""
import re
import unicodedata
from typing import Set, Any


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


# ---------------------------------------------------------------------------
# 1. Number / unit grounding (unchanged API, tightened)
# ---------------------------------------------------------------------------

def extract_numbers_and_units(text: str) -> Set[str]:
    entities: set = set()
    number_pattern = r"\b\d+(?:\.\d+)?(?:/\d+)?\b"
    entities.update(re.findall(number_pattern, text))
    unit_pattern = (
        r"(?i)\b(?:PSI|kg|mg|mm|cm|km|RPM|Volts|Hz|"
        r"hrs|hours|minutes|seconds)\b"
        r"|(?<!\w)\d+\s*(?:g|m|V|A)\b"  # only match single-letter units when adjacent to a number
        r"|°[CF]"
    )
    entities.update(u.lower() for u in re.findall(unit_pattern, text))
    return entities


def verify_grounding(source_rule: str, generated_variant: Any) -> bool:
    """Returns False if the variant contains hallucinated numbers/units."""
    source_entities = extract_numbers_and_units(source_rule)
    q_text = _text(generated_variant, "question_text") or _text(generated_variant, "stem")
    opts = _opts(generated_variant)
    correct = _text(generated_variant, "correct_answer")
    combined = q_text + " " + correct + " " + " ".join(opts)
    generated_entities = extract_numbers_and_units(combined)
    hallucinated = generated_entities - source_entities
    return len(hallucinated) == 0


# ---------------------------------------------------------------------------
# 2. Option-length bias (tightened threshold 1.3 → 1.5 to match Req #4's 50%)
# ---------------------------------------------------------------------------

def verify_option_length_bias(generated_variant: Any) -> tuple[bool, str | None]:
    """
    Returns (passed: bool, flag_note: str | None).
    Fails if correct option is >150% of avg distractor length (Req #4).
    """
    q_type = _text(generated_variant, "question_type") or "MCQ"
    if q_type not in ("MCQ", "multiple_choice"):
        return True, None

    options = _opts(generated_variant)
    correct_idx = getattr(generated_variant, "correct_option_index", None)
    if correct_idx is None and isinstance(generated_variant, dict):
        correct_idx = generated_variant.get("correct_option_index", 0)
    correct_idx = correct_idx or 0

    if not options or len(options) < 2 or correct_idx >= len(options):
        return True, None

    correct_len = len(options[correct_idx])
    distractor_lens = [len(opt) for i, opt in enumerate(options) if i != correct_idx]
    if not distractor_lens:
        return True, None

    avg_d = sum(distractor_lens) / len(distractor_lens)
    if avg_d > 0 and correct_len > 1.5 * avg_d:
        return False, "bias_flag: correct option is >150% of avg distractor length"
    return True, None


# ---------------------------------------------------------------------------
# 3. Distractor distinctiveness (Req #3)
# ---------------------------------------------------------------------------

def _token_overlap_ratio(a: str, b: str) -> float:
    """
    Combined similarity: character-level SequenceMatcher ratio averaged with
    token Jaccard.  This catches both 'near-reword' and 'near-copy' situations.
    """
    import difflib
    char_ratio = difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()
    ta = set(_norm(a).split())
    tb = set(_norm(b).split())
    if ta | tb:
        jaccard = len(ta & tb) / len(ta | tb)
    else:
        jaccard = 1.0
    return max(char_ratio, jaccard)


def verify_distractor_distinctiveness(generated_variant: Any, threshold: float = 0.85) -> bool:
    """
    Returns False if ANY two options share ≥threshold token-overlap similarity.
    Rejects near-duplicate options (Req #3).
    """
    options = _opts(generated_variant)
    if not options or len(options) < 2:
        return True

    for i in range(len(options)):
        for j in range(i + 1, len(options)):
            sim = _token_overlap_ratio(options[i], options[j])
            if sim >= threshold:
                return False
    return True


# ---------------------------------------------------------------------------
# 4. Specificity / concreteness check (Req #2)
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
    """Return lowercase non-stopword word-tokens from text."""
    return {w for w in _norm(text).split() if w not in _STOPWORDS and len(w) > 2}


def verify_specificity(source_rule: str, generated_variant: Any) -> bool:
    """
    Checks that at least ONE content token from the rule text appears
    verbatim in the question stem OR in the correct answer.  This ensures
    the question references something concrete from the rule (Req #2).
    """
    rule_tokens = _content_tokens(source_rule)
    q_text = _text(generated_variant, "question_text") or _text(generated_variant, "stem")
    correct = _text(generated_variant, "correct_answer")
    question_tokens = _content_tokens(q_text + " " + correct)
    shared = rule_tokens & question_tokens
    return len(shared) >= 1


# ---------------------------------------------------------------------------
# Public convenience: run ALL checks, return (passed, confidence, notes)
# ---------------------------------------------------------------------------

def run_all_checks(
    source_rule: str,
    generated_variant: Any,
) -> tuple[bool, float, list[str]]:
    """
    Runs all quality gates in sequence.  Returns:
      passed    – True only if hard-fail checks (grounding, distinctiveness) pass
      confidence – float 0-1 (reduced for soft warnings)
      notes     – list of human-readable flag strings
    """
    notes: list[str] = []
    confidence = 1.0
    hard_fail = False

    # 1. Grounding
    if not verify_grounding(source_rule, generated_variant):
        notes.append("grounding_flag: hallucinated numeric entities")
        hard_fail = True

    # 2. Option length bias (soft warning, reduces confidence)
    bias_ok, bias_note = verify_option_length_bias(generated_variant)
    if not bias_ok:
        notes.append(bias_note or "bias_flag: length bias detected")
        confidence -= 0.2

    # 3. Distractor distinctiveness (hard reject)
    if not verify_distractor_distinctiveness(generated_variant):
        notes.append("distinctiveness_flag: two options are ≥85% similar")
        hard_fail = True

    # 4. Specificity (soft warning, reduces confidence)
    if not verify_specificity(source_rule, generated_variant):
        notes.append("specificity_flag: question does not quote any concrete fact from rule")
        confidence -= 0.15

    confidence = max(0.0, confidence)
    passed = not hard_fail
    return passed, confidence, notes
