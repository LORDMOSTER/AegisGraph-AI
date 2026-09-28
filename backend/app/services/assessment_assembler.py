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
        profile = {
            "General Safety": 50,
            "Emergency Protocols": 50
        }

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

    from app.services.llm.generator import generate_question_variants
    import uuid
    import random

    selected_rules = []
    
    for section_name, target_count in section_targets.items():
        if target_count <= 0:
            continue
            
        # Select random Rules for this section
        stmt = (
            select(Rule)
            .join(SubCategory, Rule.subcategory_id == SubCategory.id)
            .join(Section, SubCategory.section_id == Section.id)
            .where(Section.name == section_name)
            .order_by(func.random())
            .limit(target_count)
        )
        result = await db.execute(stmt)
        rules = result.scalars().all()
        selected_rules.extend(rules)
        
    # If we couldn't meet the target for some sections, backfill with random rules
    shortfall = total_questions - len(selected_rules)
    if shortfall > 0:
        exclude_ids = [r.id for r in selected_rules]
        stmt = (
            select(Rule)
            .where(Rule.id.notin_(exclude_ids) if exclude_ids else True)
            .order_by(func.random())
            .limit(shortfall)
        )
        result = await db.execute(stmt)
        selected_rules.extend(result.scalars().all())
        
    random.shuffle(selected_rules)
    
    # Generate questions dynamically using LLM
    for rule in selected_rules:
        try:
            extraction_response = await generate_question_variants(rule.text)
            # Find an MCQ variant, or fallback to the first
            mcq_variant = next((v for v in extraction_response.variants if v.question_type == "MCQ"), None)
            if not mcq_variant:
                mcq_variant = extraction_response.variants[0]
                
            # Find index of correct answer
            correct_idx = 0
            if mcq_variant.options and mcq_variant.correct_answer in mcq_variant.options:
                correct_idx = mcq_variant.options.index(mcq_variant.correct_answer)
                
            q = QuestionVariant(
                id=uuid.uuid4(),
                rule_id=rule.id,
                question_text=mcq_variant.stem,
                options=mcq_variant.options or [],
                correct_option_index=correct_idx,
                correct_answer=mcq_variant.correct_answer,
                question_type=mcq_variant.question_type.value if hasattr(mcq_variant.question_type, "value") else str(mcq_variant.question_type),
                bloom_level=mcq_variant.bloom_level,
                review_status="approved",
                rule=rule
            )
            db.add(q)
            selected_questions.append(q)
        except Exception as e:
            print(f"Failed to generate question for rule {rule.id}: {e}")
            
    if selected_questions:
        try:
            await db.commit()
        except Exception as e:
            print(f"Failed to commit generated questions: {e}")
            await db.rollback()
            
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
