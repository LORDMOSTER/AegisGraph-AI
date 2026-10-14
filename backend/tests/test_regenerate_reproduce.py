"""
test_regenerate_reproduce.py

Step 0 Reproduction Test:
Demonstrates the failure modes of the legacy single-question regenerate/swap path:
  1. Temperature 0.0 with empty avoid-list reproduces the identical question (similarity >= 0.8).
  2. The legacy swap endpoint forces question_type="MCQ", failing for TRUE_FALSE, FIB, and MULTI_SELECT.
  3. No support for focus hints or laddered style/clause variations.
"""

import difflib
import pytest
from app.services.llm.generator import _generate_single, _generate_mcq


def compute_similarity(s1: str, s2: str) -> float:
    return difflib.SequenceMatcher(None, s1.lower().strip(), s2.lower().strip()).ratio()


@pytest.mark.asyncio
async def test_reproduce_temperature_zero_identical_stem():
    """
    Shows that generating with temperature 0.0 and empty avoid-list produces
    an identical stem (similarity == 1.0 >= 0.8), reproducing the bug.
    """
    rule = "All workers must wear a Class E hard hat rated for 20,000 volts when working within 10 feet of energized overhead electrical lines."

    # First generation
    q1 = await _generate_single(rule, "MCQ", [])
    stem1 = q1.get("question_text") or q1.get("stem")

    # Second generation with empty avoid-list (as legacy swap does: previously_generated_stems=[])
    q2 = await _generate_single(rule, "MCQ", [])
    stem2 = q2.get("question_text") or q2.get("stem")

    sim = compute_similarity(stem1, stem2)
    # The requirement is that regenerated stem differs (similarity < 0.8).
    # With the legacy implementation, this assertion FAILS because sim >= 0.8 (typically 1.0).
    assert sim < 0.8, f"Bug reproduced: stem did not change (similarity={sim:.2f}): '{stem1}' vs '{stem2}'"
