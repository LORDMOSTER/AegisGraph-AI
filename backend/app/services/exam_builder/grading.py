"""
grading.py

Evaluation and grading service for Exam Builder:
  - grade_response: Evaluates single question response across all 4 types
  - grade_exam_session: Computes per-section scores, totals, percentages,
    section minimum pass compliance, and overall pass/fail status.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from app.services.llm.generator import grade_fill_in_blank, grade_multi_select


def grade_response(
    question_type: str,
    payload: Dict[str, Any],
    user_response: Any,
) -> bool:
    """
    Evaluates whether user_response is correct for the question.
    Handles all 4 types: MCQ, TRUE_FALSE, FILL_IN_BLANK, MULTI_SELECT.
    """
    if user_response is None:
        return False

    # Extract clean response values from dict or raw value
    if isinstance(user_response, dict):
        selected_idx = user_response.get("selected_option_index")
        selected_indices = user_response.get("selected_option_indices")
        text_answer = user_response.get("text_answer")
    else:
        selected_idx = user_response
        selected_indices = user_response if isinstance(user_response, list) else None
        text_answer = str(user_response) if isinstance(user_response, str) else None

    if question_type == "MCQ":
        correct_idx = payload.get("correct_option_index")
        if correct_idx is None or selected_idx is None:
            return False
        return int(selected_idx) == int(correct_idx)

    elif question_type == "TRUE_FALSE":
        correct_idx = payload.get("correct_option_index")
        if correct_idx is not None and selected_idx is not None:
            return int(selected_idx) == int(correct_idx)
        # Fallback to string / boolean comparison
        correct_ans = str(payload.get("correct_answer", "")).strip().lower()
        if text_answer is not None:
            return text_answer.strip().lower() == correct_ans
        return False

    elif question_type == "FILL_IN_BLANK":
        if text_answer is None:
            return False
        correct_ans = payload.get("correct_answer") or payload.get("blank_answer") or ""
        variants = payload.get("blank_answer_variants") or []
        return grade_fill_in_blank(str(text_answer), str(correct_ans), variants)

    elif question_type == "MULTI_SELECT":
        if selected_indices is None:
            return False
        correct_indices = payload.get("correct_option_indices") or []
        # All-or-nothing grading for multi-select
        return grade_multi_select(selected_indices, correct_indices)

    return False


def grade_exam_manifest(
    manifest_questions: List[Dict[str, Any]],
    user_responses: Dict[str, Any],
    scoring_mode: str = "per_question_marks",
    pass_percent: float = 80.0,
    sections_config: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Grades an exam taking the manifest questions and user responses.
    Returns:
      {
        "total_score": float,
        "total_possible": float,
        "overall_percentage": float,
        "passed": bool,
        "sections": {
          section_id: {
            "title": str,
            "score": float,
            "total_possible": float,
            "percentage": float,
            "min_pass_percent": float | None,
            "passed": bool,
            "question_count": int,
          }
        },
        "graded_items": List[Dict[str, Any]]
      }
    """
    sec_cfg_map: Dict[str, Dict[str, Any]] = {}
    if sections_config:
        for sc in sections_config:
            s_id = str(sc.get("id", ""))
            sec_cfg_map[s_id] = sc

    sections_summary: Dict[str, Dict[str, Any]] = {}
    total_score = 0.0
    total_possible = 0.0
    graded_items: List[Dict[str, Any]] = []

    for q in manifest_questions:
        q_id = str(q.get("id", ""))
        sec_id = str(q.get("section_id", "default"))
        sec_title = str(q.get("section_title", "General"))
        q_type = q.get("question_type", "MCQ")
        payload = q.get("payload", {})
        rule_risk = q.get("rule_risk_score", 1)

        # Marks calculation
        if scoring_mode == "risk_weighted":
            max_marks = float(rule_risk)
        else:
            max_marks = float(q.get("marks", 1.0))

        # Evaluate response
        resp = user_responses.get(q_id)
        is_correct = grade_response(q_type, payload, resp)
        awarded_marks = max_marks if is_correct else 0.0

        total_score += awarded_marks
        total_possible += max_marks

        # Section accumulator
        if sec_id not in sections_summary:
            cfg = sec_cfg_map.get(sec_id, {})
            sections_summary[sec_id] = {
                "section_id": sec_id,
                "title": cfg.get("title", sec_title),
                "score": 0.0,
                "total_possible": 0.0,
                "min_pass_percent": cfg.get("min_pass_percent"),
                "question_count": 0,
            }

        sections_summary[sec_id]["score"] += awarded_marks
        sections_summary[sec_id]["total_possible"] += max_marks
        sections_summary[sec_id]["question_count"] += 1

        graded_items.append({
            "question_id": q_id,
            "section_id": sec_id,
            "question_type": q_type,
            "is_correct": is_correct,
            "awarded_marks": awarded_marks,
            "max_marks": max_marks,
            "user_response": resp,
        })

    # Evaluate section percentages and min pass compliance
    all_sections_passed = True
    for s_id, s_data in sections_summary.items():
        pos = s_data["total_possible"]
        pct = (s_data["score"] / pos * 100.0) if pos > 0 else 0.0
        s_data["percentage"] = round(pct, 2)

        min_pass = s_data["min_pass_percent"]
        if min_pass is not None:
            sec_pass = pct >= float(min_pass)
        else:
            sec_pass = True

        s_data["passed"] = sec_pass
        if not sec_pass:
            all_sections_passed = False

    overall_pct = (total_score / total_possible * 100.0) if total_possible > 0 else 0.0
    overall_pct_round = round(overall_pct, 2)
    overall_pass = (overall_pct >= pass_percent) and all_sections_passed

    return {
        "total_score": round(total_score, 2),
        "total_possible": round(total_possible, 2),
        "overall_percentage": overall_pct_round,
        "passed": overall_pass,
        "all_sections_passed": all_sections_passed,
        "sections": sections_summary,
        "graded_items": graded_items,
    }
