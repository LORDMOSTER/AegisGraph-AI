import uuid
from typing import List, Dict, Any, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.company import Company
from app.models.hierarchy import Manual, Section, SubCategory, Rule, FilteredBlock
from app.models.question_bank import QuestionBank, QuestionStatus


class HierarchyService:
    """
    Replaces Neo4j's Cypher graph traversal with high-performance 
    PostgreSQL queries and async SQLAlchemy 2.0 query services.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_full_hierarchy_tree(self, company_id: uuid.UUID) -> Dict[str, Any]:
        """
        Assemble the full nested tree structure for a company:
        Company -> Manuals -> Sections -> SubCategories -> Rules
        Includes active rule counts and approved question counts.
        """
        # Execute exactly 4 queries to load the entire tree efficiently
        stmt = (
            select(Manual)
            .where(Manual.company_id == company_id)
            .options(
                selectinload(Manual.sections)
                .selectinload(Section.subcategories)
                .selectinload(SubCategory.rules)
                .selectinload(Rule.questions)
            )
        )
        
        result = await self.session.execute(stmt)
        manuals = result.scalars().all()
        
        tree = {
            "company_id": str(company_id),
            "manuals": []
        }
        
        for manual in manuals:
            m_dict = {
                "id": str(manual.id),
                "title": manual.title,
                "version": manual.version,
                "sections": []
            }
            for section in manual.sections:
                s_dict = {
                    "id": str(section.id),
                    "name": section.name,
                    "order_index": section.order_index,
                    "subcategories": []
                }
                for subcat in section.subcategories:
                    sc_dict = {
                        "id": str(subcat.id),
                        "name": subcat.name,
                        "rules": []
                    }
                    active_rules_count = 0
                    for rule in subcat.rules:
                        if rule.is_active:
                            active_rules_count += 1
                            approved_q = sum(1 for q in rule.questions if q.status == QuestionStatus.APPROVED)
                            sc_dict["rules"].append({
                                "id": str(rule.id),
                                "rule_code": rule.rule_code,
                                "text": rule.text,
                                "source_text": rule.source_text,
                                "risk_score": rule.risk_score,
                                "cognitive_level": rule.cognitive_level,
                                "response_time_sec": rule.response_time_sec,
                                "is_active": rule.is_active,
                                "confidence": rule.confidence,
                                "review_status": rule.review_status,
                                "page_number": rule.page_number,
                                "approved_questions_count": approved_q
                            })
                    sc_dict["active_rules_count"] = active_rules_count
                    s_dict["subcategories"].append(sc_dict)
                m_dict["sections"].append(s_dict)
            tree["manuals"].append(m_dict)
            
        return tree

    async def get_rule_breadcrumbs(self, rule_id: uuid.UUID) -> Dict[str, Any]:
        """
        Resolves the exact hierarchy path up to the manual and company:
        Rule -> SubCategory -> Section -> Manual -> Company
        """
        stmt = (
            select(Rule)
            .options(
                joinedload(Rule.subcategory)
                .joinedload(SubCategory.section)
                .joinedload(Section.manual)
                .joinedload(Manual.company)
            )
            .where(Rule.id == rule_id)
        )
        result = await self.session.execute(stmt)
        rule = result.scalar_one_or_none()
        
        if not rule:
            return {}
            
        subcat = rule.subcategory
        sec = subcat.section
        man = sec.manual
        comp = man.company
        
        return {
            "rule": {"id": str(rule.id), "code": rule.rule_code, "text": rule.text},
            "subcategory": {"id": str(subcat.id), "name": subcat.name},
            "section": {"id": str(sec.id), "name": sec.name},
            "manual": {"id": str(man.id), "title": man.title, "version": man.version},
            "company": {"id": str(comp.id), "name": comp.name}
        }

    async def get_sibling_rules(self, subcategory_id: uuid.UUID, exclude_subcategory: bool = True) -> List[Rule]:
        """
        Finds the parent section_id of the given subcategory_id.
        Queries all active Rule records residing in sibling subcategories under that exact same section.
        Replaces Neo4j's [:CONTAINS]->(sibling:SubCategory) hop.
        """
        # Subquery to find the section_id of the origin subcategory
        subcat_stmt = select(SubCategory.section_id).where(SubCategory.id == subcategory_id)
        
        stmt = (
            select(Rule)
            .join(Rule.subcategory)
            .where(SubCategory.section_id == subcat_stmt.scalar_subquery())
            .where(Rule.is_active == True)
        )
        
        if exclude_subcategory:
            stmt = stmt.where(SubCategory.id != subcategory_id)
            
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_rules_by_section(self, section_id: uuid.UUID, active_only: bool = True) -> List[Rule]:
        """
        Retrieve all rules beneath a specific section.
        """
        stmt = (
            select(Rule)
            .join(Rule.subcategory)
            .where(SubCategory.section_id == section_id)
        )
        
        if active_only:
            stmt = stmt.where(Rule.is_active == True)
            
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_approved_questions_for_rule(self, rule_id: uuid.UUID) -> List[QuestionBank]:
        """
        Retrieve all APPROVED questions for a specific rule.
        """
        stmt = (
            select(QuestionBank)
            .where(QuestionBank.rule_id == rule_id)
            .where(QuestionBank.status == QuestionStatus.APPROVED)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_question_counts_by_section(self, manual_id: Optional[uuid.UUID] = None) -> Dict[str, Dict[str, int]]:
        """
        Batch aggregation query to fetch question counts per section categorized by status.
        """
        stmt = (
            select(
                Section.id,
                QuestionBank.status,
                func.count(QuestionBank.id).label("count")
            )
            .select_from(Section)
            .join(SubCategory, SubCategory.section_id == Section.id)
            .join(Rule, Rule.subcategory_id == SubCategory.id)
            .join(QuestionBank, QuestionBank.rule_id == Rule.id)
            .group_by(Section.id, QuestionBank.status)
        )
        
        if manual_id:
            stmt = stmt.where(Section.manual_id == manual_id)
            
        result = await self.session.execute(stmt)
        
        counts = {}
        for row in result.all():
            sec_id = str(row.id)
            # Handle both Enum objects and raw strings
            status_val = row.status.value if hasattr(row.status, 'value') else row.status
            
            if sec_id not in counts:
                counts[sec_id] = {"DRAFT": 0, "APPROVED": 0, "REJECTED": 0}
                
            if status_val in counts[sec_id]:
                counts[sec_id][status_val] = row.count
                
        return counts

    async def get_filtered_blocks(self, manual_id: uuid.UUID) -> List[FilteredBlock]:
        """Fetch all filtered blocks for a manual."""
        stmt = select(FilteredBlock).where(FilteredBlock.manual_id == manual_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def promote_filtered_block(self, block_id: uuid.UUID) -> Optional[Rule]:
        """Runs LLM on the filtered block and creates a rule if valid."""
        from app.services.llm.rule_extractor import extract_structured_rule
        from app.services.llm.grounding_check import extract_numbers_and_units
        from sqlalchemy import desc

        stmt = select(FilteredBlock).where(FilteredBlock.id == block_id)
        result = await self.session.execute(stmt)
        block = result.scalar_one_or_none()
        
        if not block:
            return None

        structured = await extract_structured_rule(block.source_text)
        if not structured or not structured.is_valid_rule or not structured.rules:
            return None
            
        # For manual promotion from a filtered block, we'll just promote the first rule found
        # (or we could promote all and return a list, but returning the first fits the Optional[Rule] signature)
        extracted_rule = structured.rules[0]
            
        rule_text = extracted_rule.rule_text
        source_entities = extract_numbers_and_units(block.source_text)
        rule_entities = extract_numbers_and_units(rule_text)
        
        confidence = 1.0
        review_status = "approved"
        if rule_entities - source_entities:
            confidence = 0.4
            review_status = "pending"

        sec_name = extracted_rule.section
        sub_name = extracted_rule.subcategory
        
        # Resolve Section
        sec_stmt = select(Section).where(Section.manual_id == block.manual_id, Section.name == sec_name)
        sec = (await self.session.execute(sec_stmt)).scalar_one_or_none()
        if not sec:
            sec = Section(manual_id=block.manual_id, name=sec_name)
            self.session.add(sec)
            await self.session.flush()

        # Resolve Subcategory
        sc_stmt = select(SubCategory).where(SubCategory.section_id == sec.id, SubCategory.name == sub_name)
        sc = (await self.session.execute(sc_stmt)).scalar_one_or_none()
        if not sc:
            sc = SubCategory(section_id=sec.id, name=sub_name)
            self.session.add(sc)
            await self.session.flush()

        # Generate Rule Code
        prefix = sec_name[:4].upper()
        rc_stmt = select(Rule).filter(Rule.rule_code.like(f"{prefix}-%")).order_by(desc(Rule.rule_code)).limit(1)
        latest_rule = (await self.session.execute(rc_stmt)).scalar_one_or_none()
        seq = 1
        if latest_rule:
            try:
                seq = int(latest_rule.rule_code.split('-')[1]) + 1
            except:
                pass
        
        rule_code = f"{prefix}-{seq:03d}"
        
        rule = Rule(
            subcategory_id=sc.id,
            rule_code=rule_code,
            text=rule_text,
            source_text=block.source_text,
            risk_score=extracted_rule.risk_score,
            cognitive_level=extracted_rule.cognitive_level,
            response_time_sec=60,
            confidence=confidence,
            review_status=review_status,
            page_number=block.page_number
        )
        self.session.add(rule)
        await self.session.flush()
        
        block.promoted_to_rule_id = rule.id
        await self.session.commit()
        return rule

    async def update_rule(self, rule_id: uuid.UUID, update_data: dict) -> Optional[Rule]:
        """Updates a rule's fields."""
        stmt = select(Rule).where(Rule.id == rule_id)
        result = await self.session.execute(stmt)
        rule = result.scalar_one_or_none()
        
        if not rule:
            return None
            
        if "text" in update_data and update_data["text"] is not None:
            rule.text = update_data["text"]
            
        if "risk_score" in update_data and update_data["risk_score"] is not None:
            rule.risk_score = update_data["risk_score"]
            
        if "review_status" in update_data and update_data["review_status"] is not None:
            rule.review_status = update_data["review_status"]
            if update_data["review_status"] == "approved":
                rule.confidence = 1.0 # Force verify
                
        await self.session.commit()
        return rule
