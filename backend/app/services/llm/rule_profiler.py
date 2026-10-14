"""
rule_profiler.py
Analyses a Rule object and returns a RuleProfile that determines which
question types are eligible for that rule.

Eligibility matrix (all columns apply independently):
  MCQ          — always allowed
  TRUE_FALSE   — allowed if rule contains a mandate/prohibition OR a numeric threshold
  FILL_IN_BLANK— allowed if at least one maskable term found
  MULTI_SELECT — allowed if rule is compound (>=2 independent requirements)

profile_rule() is deterministic: no LLM calls, pure regex + heuristics.
Results may be cached by callers using rule.id as key.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Numeric threshold: integer or float optionally followed by a unit
_NUM_UNIT_RE = re.compile(
    r"""
    \b
    (\d+(?:\.\d+)?)          # number
    \s*
    (
        PSI|psi|
        kg|mg|g\b|
        mm|cm|km|m\b|
        RPM|rpm|
        [Vv]olts?|V\b|
        [Aa]mps?|A\b|
        Hz|
        [Kk][Ww]|[Ww]\b|
        hrs?|hours?|minutes?|seconds?|s\b|
        [Cc]ycles?|
        dB|
        \%|
        °[CF]|
        [Ll]bs?|
        [Ff]eet|ft\b|
        [Ii]nches?|in\b
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)

# Standalone numerics (no unit) — for FIB masking
_NUM_RE = re.compile(r"\b\d+(?:\.\d+)?\b")

# Mandate/prohibition language
_MANDATE_RE = re.compile(
    r"\b(must|shall|required|mandatory|prohibited|forbidden|not allowed|"
    r"never|always|do not|cannot|may not|ensure|require|comply)\b",
    re.IGNORECASE,
)

# Compound rule markers: lists, semicolons, "and" connecting clauses,
# "including", or enumerated requirements.
_COMPOUND_MARKERS = [
    re.compile(r"\(\d+\)"),                                    # (1) (2) inline lists
    re.compile(r"(?:^|\n)\s*[\d]+[\.\)]", re.MULTILINE),       # numbered list
    re.compile(r";\s*"),                                       # semicolons
    re.compile(r"\band\b.{10,}\band\b", re.IGNORECASE),        # two "and" joins (compound)
    re.compile(r"\binclud(?:es|ing)\b", re.IGNORECASE),
    re.compile(r"\b(?:first|second|third|then|finally)\b", re.IGNORECASE),
    re.compile(r":\s*\n?\s*[-•*]", re.MULTILINE),              # colon then bullets
]

# Key safety noun phrases worth masking
_NOUN_RE = re.compile(
    r"\b(lockout|tagout|LOTO|PPE|OSHA|ISO|interlock|"
    r"confined space|permit|respirator|harness|grounding|bonding|"
    r"insulation|circuit breaker|transformer|relay|fuse|conductor)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------

@dataclass
class RuleProfile:
    has_numeric_threshold: bool = False
    has_unit: bool = False
    is_compound: bool = False
    is_mandate_or_prohibition: bool = False
    maskable_terms: List[str] = field(default_factory=list)
    allowed_types: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "has_numeric_threshold": self.has_numeric_threshold,
            "has_unit": self.has_unit,
            "is_compound": self.is_compound,
            "is_mandate_or_prohibition": self.is_mandate_or_prohibition,
            "maskable_terms": self.maskable_terms,
            "allowed_types": self.allowed_types,
        }


# ---------------------------------------------------------------------------
# Core profiler
# ---------------------------------------------------------------------------

def profile_rule(rule_text: str) -> RuleProfile:
    """
    Analyse rule_text and return a RuleProfile.
    Pure function — no I/O.
    """
    text = rule_text or ""
    profile = RuleProfile()

    # --- Numeric / unit detection ---
    num_unit_matches = _NUM_UNIT_RE.findall(text)
    profile.has_unit = len(num_unit_matches) > 0
    profile.has_numeric_threshold = bool(_NUM_RE.search(text))

    # --- Mandate / prohibition ---
    profile.is_mandate_or_prohibition = bool(_MANDATE_RE.search(text))

    # --- Compound rule ---
    compound_hits = sum(1 for pat in _COMPOUND_MARKERS if pat.search(text))
    has_list_items = len(re.findall(r"\(\d+\)", text)) >= 2 or len(re.findall(r"(?:^|\n)\s*[\d]+[\.\)]", text)) >= 2
    has_semicolons = text.count(";") >= 2
    profile.is_compound = compound_hits >= 1 or has_list_items or has_semicolons

    # --- Maskable terms ---
    maskable: List[str] = []
    # Prefer number+unit combos (most precise)
    for num, unit in num_unit_matches:
        exact_match = re.search(rf"\b{re.escape(num)}\s*{re.escape(unit)}", text)
        term = exact_match.group(0) if exact_match else (f"{num}{unit}" if unit == "%" else f"{num} {unit}".strip())
        if term not in maskable:
            maskable.append(term)
    # Then standalone numerics
    if not maskable:
        for m in _NUM_RE.finditer(text):
            n = m.group()
            if n not in maskable:
                maskable.append(n)
    # Then key nouns
    for m in _NOUN_RE.finditer(text):
        n = m.group()
        if n.lower() not in [x.lower() for x in maskable]:
            maskable.append(n)

    profile.maskable_terms = maskable[:6]  # cap at 6

    # --- Allowed types ---
    allowed = ["MCQ"]  # always
    if profile.is_mandate_or_prohibition or profile.has_numeric_threshold:
        allowed.append("TRUE_FALSE")
    if profile.maskable_terms:
        allowed.append("FILL_IN_BLANK")
    if profile.is_compound:
        allowed.append("MULTI_SELECT")

    profile.allowed_types = allowed
    return profile
