import uuid
import random
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.question_bank import QuestionVariant
from app.models.hierarchy import Rule, SubCategory, Section
from app.core.role_templates import ROLE_TEMPLATES

async def assemble_exam_for_role(db: AsyncSession, job_title: str, total_questions: int) -> List[QuestionVariant]:
    """
    Assembles an exam instantly from the cached question_bank using pre-defined Role Templates.
    Executes a knapsack-like selection over APPROVED questions only.
    """
    profile = ROLE_TEMPLATES.get(job_title)
    if not profile:
        raise ValueError(f"No role template found for {job_title}")
    
    selected_questions = []
    
    # Calculate target questions per section based on percentages
    section_targets = {}
    for section_name, percentage in profile.items():
        count = max(1, int(total_questions * (percentage / 100.0)))
        section_targets[section_name] = count
        
    # We might overshoot or undershoot slightly due to rounding, adjust total
    current_total = sum(section_targets.values())
    
    # If we overshot, subtract from the largest target
    while current_total > total_questions:
        max_sec = max(section_targets, key=section_targets.get)
        section_targets[max_sec] -= 1
        current_total -= 1
        
    # If we undershot, add to the largest target
    while current_total < total_questions:
        max_sec = max(section_targets, key=section_targets.get)
        section_targets[max_sec] += 1
        current_total += 1

    for section_name, target_count in section_targets.items():
        if target_count <= 0:
            continue
            
        stmt = (
            select(QuestionVariant)
            .join(Rule, QuestionVariant.rule_id == Rule.id)
            .join(SubCategory, Rule.subcategory_id == SubCategory.id)
            .join(Section, SubCategory.section_id == Section.id)
            .where(
                QuestionVariant.review_status == "approved",
                Section.name == section_name
            )
            .order_by(func.random())
            .limit(target_count)
            .options(selectinload(QuestionVariant.rule))
        )
        result = await db.execute(stmt)
        questions = result.scalars().all()
        selected_questions.extend(questions)
        
    # If we couldn't meet the target for some sections, backfill with random approved questions
    shortfall = total_questions - len(selected_questions)
    if shortfall > 0:
        exclude_ids = [q.id for q in selected_questions]
        stmt = (
            select(QuestionVariant)
            .where(
                QuestionVariant.review_status == "approved",
                QuestionVariant.id.notin_(exclude_ids) if exclude_ids else True
            )
            .order_by(func.random())
            .limit(shortfall)
            .options(selectinload(QuestionVariant.rule))
        )
        result = await db.execute(stmt)
        selected_questions.extend(result.scalars().all())
        
    random.shuffle(selected_questions)
    return selected_questions

async def swap_question(db: AsyncSession, current_question_id: uuid.UUID) -> Optional[QuestionVariant]:
    """
    Fetches a random different APPROVED question from the same subcategory/bloom level.
    """
    stmt = (
        select(QuestionVariant)
        .options(selectinload(QuestionVariant.rule))
        .where(QuestionVariant.id == current_question_id)
    )
    result = await db.execute(stmt)
    current_q = result.scalar_one_or_none()
    
    if not current_q:
        raise ValueError("Question not found")
        
    stmt_swap = (
        select(QuestionVariant)
        .join(Rule, QuestionVariant.rule_id == Rule.id)
        .where(
            QuestionVariant.id != current_question_id,
            QuestionVariant.review_status == "approved",
            Rule.subcategory_id == current_q.rule.subcategory_id,
            QuestionVariant.bloom_level == current_q.bloom_level
        )
        .order_by(func.random())
        .limit(1)
        .options(selectinload(QuestionVariant.rule))
    )
    
    result_swap = await db.execute(stmt_swap)
    new_q = result_swap.scalar_one_or_none()
    return new_q
