"""
test_all_four_types.py
Pytest suite testing the end-to-end multi-type question generation pipeline:
  - 6 sample rule fixtures (numeric, compound, prohibition, plain, etc.)
  - Per type (MCQ, TRUE_FALSE, FILL_IN_BLANK, MULTI_SELECT):
    - At least 1 positive gate case
    - At least 2 negative gate cases (e.g., TF two-fragment edit, FIB not in source, MS duplicate distractors)
  - Pydantic v2 discriminated union schema validation
  - Mocked-LLM integration test proving all four types reach the bank
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.schemas.generation import (
    MCQVariant,
    TrueFalseVariant,
    FillInBlankVariant,
    MultiSelectVariant,
    QuestionVariantUnion,
)
from app.services.llm.grounding_check import (
    verify_grounding,
    verify_option_length_bias,
    verify_distractor_distinctiveness,
    verify_specificity,
    verify_fib_answer_in_source,
    verify_tf_single_edit,
    run_all_checks,
)
from app.services.llm.rule_profiler import profile_rule


# ---------------------------------------------------------------------------
# 1. Six Sample Rule Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def numeric_rule() -> str:
    return "All workers must wear a Class E hard hat rated for 20,000 volts when working within 10 feet of energized overhead electrical lines."


@pytest.fixture
def compound_rule() -> str:
    return "Before entering a confined space, supervisors must: (1) test the atmosphere for oxygen deficiency; (2) verify explosive gas levels below 10% LEL; (3) establish a rescue plan; (4) assign a trained attendant at the entry point."


@pytest.fixture
def prohibition_rule() -> str:
    return "Operators are strictly prohibited from bypassing safety interlocks on CNC milling machines. Any interlock bypass must be documented and approved."


@pytest.fixture
def plain_rule() -> str:
    return "After completing maintenance on hydraulic press Model HP-3000, replace all access panels and torque retaining bolts to 85 Nm before resuming production."


@pytest.fixture
def compound_mandate_rule() -> str:
    return "When handling hydrochloric acid concentrations above 15%, workers must wear chemical-resistant neoprene gloves, NIOSH-approved acid-mist respirator, and a full-face shield."


@pytest.fixture
def weight_limit_rule() -> str:
    return "Forklifts must not exceed 80% of their rated load capacity of 5000 kg as specified on the manufacturer nameplate."


# ---------------------------------------------------------------------------
# 2. Rule Profiler Tests
# ---------------------------------------------------------------------------

class TestRuleProfiler:
    def test_numeric_rule_allows_tf_and_fib(self, numeric_rule):
        profile = profile_rule(numeric_rule)
        assert "MCQ" in profile.allowed_types
        assert "TRUE_FALSE" in profile.allowed_types
        assert "FILL_IN_BLANK" in profile.allowed_types
        assert len(profile.maskable_terms) > 0

    def test_compound_rule_allows_multiselect(self, compound_rule):
        profile = profile_rule(compound_rule)
        assert "MULTI_SELECT" in profile.allowed_types

    def test_prohibition_rule_allows_true_false(self, prohibition_rule):
        profile = profile_rule(prohibition_rule)
        assert "TRUE_FALSE" in profile.allowed_types


# ---------------------------------------------------------------------------
# 3. Quality Gate Tests — Per Type Positive & Negative Cases
# ---------------------------------------------------------------------------

class TestMCQGates:
    def test_mcq_positive(self, numeric_rule):
        variant = {
            "question_type": "MCQ",
            "question_text": "What hard hat rating is required when working within 10 feet of energized lines?",
            "options": ["Class E rated for 20,000 volts", "Class G general electrical", "Class C non-insulated cap", "Standard bump cap"],
            "correct_option_index": 0,
            "correct_answer": "Class E rated for 20,000 volts",
            "bloom_level": "Remember",
        }
        passed, confidence, notes = run_all_checks(numeric_rule, variant)
        assert passed is True
        assert confidence > 0.7

    def test_mcq_negative_hallucinated_number(self, numeric_rule):
        variant = {
            "question_type": "MCQ",
            "question_text": "What voltage rating is required?",
            "options": ["50,000 volts", "40,000 volts", "30,000 volts", "60,000 volts"],  # numbers not in rule
            "correct_option_index": 0,
            "correct_answer": "50,000 volts",
            "bloom_level": "Remember",
        }
        passed, confidence, notes = run_all_checks(numeric_rule, variant)
        assert passed is False
        assert any("grounding_flag" in n for n in notes)

    def test_mcq_negative_duplicate_distractors(self, plain_rule):
        variant = {
            "question_type": "MCQ",
            "question_text": "What torque must be applied to retaining bolts on Model HP-3000?",
            "options": [
                "Torque retaining bolts to 85 Nm before resuming production",
                "Torque retaining bolts to 85 Nm before restarting production",  # near duplicate
                "Finger tighten all bolts",
                "Weld the access panel shut",
            ],
            "correct_option_index": 0,
            "correct_answer": "Torque retaining bolts to 85 Nm before resuming production",
            "bloom_level": "Apply",
        }
        passed, confidence, notes = run_all_checks(plain_rule, variant)
        assert passed is False
        assert any("distinctiveness_flag" in n for n in notes)


class TestTrueFalseGates:
    def test_true_false_positive(self, numeric_rule):
        # Number swap: 20,000 -> 15,000 (exempted in false twin)
        variant = {
            "question_type": "TRUE_FALSE",
            "question_text": "All workers must wear a Class E hard hat rated for 20,000 volts when working near energized lines.",
            "options": ["True", "False"],
            "correct_option_index": 0,
            "correct_answer": "True",
            "statement_true": "All workers must wear a Class E hard hat rated for 20,000 volts when working near energized lines.",
            "statement_false": "All workers must wear a Class E hard hat rated for 15,000 volts when working near energized lines.",
            "edit_kind": "number_swap",
            "changed_fragment": "20,000 volts",
            "bloom_level": "Understand",
        }
        passed, confidence, notes = run_all_checks(numeric_rule, variant)
        assert passed is True

    def test_true_false_negative_two_fragment_edits(self, numeric_rule):
        # Two unrelated edits: both voltage and feet swapped, with multiple diff opcodes
        variant = {
            "question_type": "TRUE_FALSE",
            "question_text": "All workers must wear a Class E hard hat rated for 20,000 volts when working within 10 feet.",
            "options": ["True", "False"],
            "correct_option_index": 0,
            "correct_answer": "True",
            "statement_true": "All workers must wear a Class E hard hat rated for 20,000 volts when working within 10 feet of energized lines.",
            "statement_false": "Only visitors can wear a Class C cap rated for 5,000 volts when standing within 50 meters of ungrounded boxes.",
            "edit_kind": "number_swap",
            "changed_fragment": "20,000 volts",
            "bloom_level": "Understand",
        }
        tf_ok, tf_sev, tf_note = verify_tf_single_edit(variant)
        assert tf_ok is False
        assert "too many diff regions" in tf_note

    def test_true_false_negative_missing_fragment_in_true(self, numeric_rule):
        variant = {
            "question_type": "TRUE_FALSE",
            "question_text": "All workers must wear a Class E hard hat.",
            "options": ["True", "False"],
            "correct_option_index": 0,
            "correct_answer": "True",
            "statement_true": "Workers must wear a Class E hard hat.",
            "statement_false": "Workers must wear a Class G hard hat.",
            "edit_kind": "actor_swap",
            "changed_fragment": "completely_unrelated_phrase_not_in_true",
            "bloom_level": "Understand",
        }
        tf_ok, tf_sev, tf_note = verify_tf_single_edit(variant)
        assert tf_ok is False
        assert "changed_fragment" in tf_note


class TestFillInBlankGates:
    def test_fib_positive(self, plain_rule):
        variant = {
            "question_type": "FILL_IN_BLANK",
            "question_text": "After completing maintenance on hydraulic press Model HP-3000, torque retaining bolts to _____ before resuming production.",
            "correct_answer": "85 Nm",
            "blank_answer_variants": ["85 Nm", "85 nm", "85Nm"],
            "bloom_level": "Remember",
        }
        passed, confidence, notes = run_all_checks(plain_rule, variant)
        assert passed is True

    def test_fib_negative_answer_not_in_source(self, plain_rule):
        variant = {
            "question_type": "FILL_IN_BLANK",
            "question_text": "Torque retaining bolts to _____ before resuming production.",
            "correct_answer": "150 foot-pounds",  # not in plain_rule (85 Nm is)
            "blank_answer_variants": ["150 foot-pounds"],
            "bloom_level": "Remember",
        }
        fib_ok, fib_sev, fib_note = verify_fib_answer_in_source(plain_rule, variant)
        assert fib_ok is False
        assert "not verbatim in rule" in fib_note

    def test_fib_negative_reconstructed_sentence_mismatch(self, plain_rule):
        variant = {
            "question_type": "FILL_IN_BLANK",
            "question_text": "Astronomers discovered that stars contain _____ in deep space.",  # totally different sentence
            "correct_answer": "85 Nm",
            "blank_answer_variants": ["85 Nm"],
            "bloom_level": "Remember",
        }
        fib_ok, fib_sev, fib_note = verify_fib_answer_in_source(plain_rule, variant)
        assert fib_ok is False
        assert "reconstructed sentence similarity" in fib_note


class TestMultiSelectGates:
    def test_multiselect_positive(self, compound_rule):
        variant = {
            "question_type": "MULTI_SELECT",
            "question_text": "Which protocols are mandatory before entering a confined space? (Select all that apply)",
            "options": [
                "Test the atmosphere for oxygen deficiency",
                "Verify explosive gas levels below 10% LEL",
                "Disconnect all facility telephone lines",
                "Ventilate space with pure nitrogen gas",
            ],
            "correct_option_indices": [0, 1],
            "bloom_level": "Analyze",
        }
        passed, confidence, notes = run_all_checks(compound_rule, variant)
        assert passed is True

    def test_multiselect_negative_duplicate_distractor(self, compound_rule):
        variant = {
            "question_type": "MULTI_SELECT",
            "question_text": "Which protocols are mandatory before entering a confined space?",
            "options": [
                "Test the atmosphere for oxygen deficiency",
                "Verify explosive gas levels below 10% LEL",
                "Verify explosive gas levels under 10% LEL",  # duplicate distractor
                "Establish a rescue plan",
            ],
            "correct_option_indices": [0, 3],
            "bloom_level": "Analyze",
        }
        passed, confidence, notes = run_all_checks(compound_rule, variant)
        assert passed is False
        assert any("distinctiveness_flag" in n for n in notes)

    def test_multiselect_negative_hallucinated_entities(self, compound_rule):
        variant = {
            "question_type": "MULTI_SELECT",
            "question_text": "What criteria must be met?",
            "options": [
                "Maintain temperature above 500 °C",  # 500 °C not in rule
                "Maintain pressure at 250 PSI",        # 250 PSI not in rule
                "Verify oxygen level",
                "Assign attendant",
            ],
            "correct_option_indices": [2, 3],
            "bloom_level": "Analyze",
        }
        passed, confidence, notes = run_all_checks(compound_rule, variant)
        assert passed is False
        assert any("grounding_flag" in n for n in notes)


# ---------------------------------------------------------------------------
# 4. Pydantic v2 Discriminated Union Schema Tests
# ---------------------------------------------------------------------------

class TestSchemasDiscriminatedUnion:
    def test_mcq_schema_validates_pairwise_distinct(self):
        # Valid
        m = MCQVariant(
            stem="What is required?",
            options=["A", "B", "C", "D"],
            correct_option_index=0,
            correct_answer="A",
        )
        assert m.question_type == "MCQ"

        # Invalid (duplicates)
        with pytest.raises(ValueError):
            MCQVariant(
                stem="What is required?",
                options=["Same", "Same", "C", "D"],
                correct_option_index=0,
                correct_answer="Same",
            )

    def test_true_false_schema_validates(self):
        tf = TrueFalseVariant(
            stem="The pressure must be 85 Nm.",
            correct_option_index=0,
            correct_answer="True",
            statement_true="The pressure must be 85 Nm.",
            statement_false="The pressure must be 100 Nm.",
            edit_kind="number_swap",
            changed_fragment="85 Nm",
        )
        assert tf.question_type == "TRUE_FALSE"
        assert tf.options == ["True", "False"]

    def test_fill_in_blank_schema_validates_blank_count(self):
        fib = FillInBlankVariant(
            stem="Torque bolts to _____ before production.",
            correct_answer="85 Nm",
            blank_answer_variants=["85 Nm", "85 nm"],
        )
        assert fib.question_type == "FILL_IN_BLANK"

        # Invalid: two blanks
        with pytest.raises(ValueError):
            FillInBlankVariant(
                stem="Set _____ to _____ before production.",
                correct_answer="85 Nm",
                blank_answer_variants=["85 Nm"],
            )

    def test_multi_select_schema_validates(self):
        ms = MultiSelectVariant(
            stem="Select all that apply:",
            options=["Option 1", "Option 2", "Option 3", "Option 4"],
            correct_option_indices=[0, 2],
        )
        assert ms.question_type == "MULTI_SELECT"

        # Invalid: correct >= options
        with pytest.raises(ValueError):
            MultiSelectVariant(
                stem="Select all that apply:",
                options=["Option 1", "Option 2"],
                correct_option_indices=[0, 1],
            )


# ---------------------------------------------------------------------------
# 5. Mocked-LLM Integration Test (All 4 Types Reach Bank)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_mocked_llm_all_four_types_reach_bank(numeric_rule, compound_rule):
    from app.services.llm.generator import generate_default_matrix

    mock_ollama_mcq = {
        "stem": "What voltage rating is required?",
        "options": ["20,000 volts", "5,000 volts", "1,000 volts", "100 volts"],
        "correct_option_index": 0,
        "correct_answer": "20,000 volts",
        "bloom_level": "Remember",
    }
    mock_ollama_tf = {
        "statement_true": "All workers must wear a Class E hard hat rated for 20,000 volts.",
        "statement_false": "All workers must wear a Class E hard hat rated for 10,000 volts.",
        "edit_kind": "number_swap",
        "changed_fragment": "20,000 volts",
        "bloom_level": "Understand",
    }
    mock_ollama_ms = {
        "stem": "Which requirements apply before entering a confined space?",
        "options": [
            "Test atmosphere for oxygen deficiency",
            "Verify explosive gas levels below 10% LEL",
            "Notify municipal fire chief",
            "Paint entry portal yellow",
        ],
        "correct_option_indices": [0, 1],
        "bloom_level": "Analyze",
    }

    # Test generation of default matrix for a compound numeric rule
    compound_numeric = "Before entering a substation, workers must: (1) wear Class E gear rated for 20,000 volts; (2) verify grounding; (3) notify supervisor."
    with patch("ollama.chat") as mock_chat:
        def chat_side_effect(model, messages, format, options):
            system = messages[0]["content"] if messages else ""
            if "TRUE_FALSE" in system:
                return {"message": {"content": json.dumps(mock_ollama_tf)}}
            elif "MULTI_SELECT" in system:
                return {"message": {"content": json.dumps(mock_ollama_ms)}}
            else:
                return {"message": {"content": json.dumps(mock_ollama_mcq)}}

        import json
        mock_chat.side_effect = chat_side_effect

        matrix_result = await generate_default_matrix(
            compound_numeric,
            risk_score=7,
            cognitive_level="Analyze",
        )

        produced_types = {v["question_type"] for v in matrix_result["results"]}
        # Default matrix produces MCQ, TRUE_FALSE, FIB, and MULTI_SELECT when allowed
        assert "MCQ" in produced_types
        assert "TRUE_FALSE" in produced_types
        assert "FILL_IN_BLANK" in produced_types
        assert "MULTI_SELECT" in produced_types
