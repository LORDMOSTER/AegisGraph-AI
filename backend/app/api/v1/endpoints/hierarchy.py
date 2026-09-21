import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.hierarchy import HierarchyTreeResponse, RuleResponse, FilteredBlockResponse, RuleUpdate
from app.services.hierarchy_service import HierarchyService
from app.api.deps import get_db_session, get_current_active_user
from app.models.user import User

router = APIRouter()

@router.get("/tree", response_model=HierarchyTreeResponse)
async def get_hierarchy_tree(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Returns the complete tree for the authenticated user's company."""
    service = HierarchyService(db)
    tree = await service.get_full_hierarchy_tree(current_user.company_id)
    return tree

@router.get("/sections/{section_id}/rules", response_model=list[RuleResponse])
async def get_section_rules(
    section_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Returns all rules under a specific section."""
    service = HierarchyService(db)
    rules = await service.get_rules_by_section(section_id)
    return rules

@router.get("/rules/{rule_id}")
async def get_rule_breadcrumbs(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Returns rule details with its ancestor breadcrumbs."""
    service = HierarchyService(db)
    breadcrumbs = await service.get_rule_breadcrumbs(rule_id)
    if not breadcrumbs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return breadcrumbs

@router.patch("/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    rule_update: RuleUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Updates a rule."""
    service = HierarchyService(db)
    rule = await service.update_rule(rule_id, rule_update.model_dump(exclude_unset=True))
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return rule

@router.get("/manuals/{manual_id}/filtered-blocks", response_model=list[FilteredBlockResponse])
async def get_filtered_blocks(
    manual_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Returns filtered (noise/rejected) blocks for a given manual."""
    service = HierarchyService(db)
    blocks = await service.get_filtered_blocks(manual_id)
    return blocks

@router.post("/filtered-blocks/{block_id}/promote")
async def promote_filtered_block(
    block_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Manually triggers LLM extraction on a discarded block and promotes it to a Rule if valid."""
    service = HierarchyService(db)
    rule = await service.promote_filtered_block(block_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to promote block (LLM rejected or error).")
    return {"status": "success", "rule_id": str(rule.id)}

