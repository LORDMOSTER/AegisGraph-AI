"""
migrate_legacy_assessments.py

Data migration utility to migrate existing MCQ-only assessments
into a single section named "Section A" containing all their questions.
Old sessions still open, grade, and display.
Includes --dry-run and --rollback flags.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker
from app.models.assessment_session import Assessment

logger = logging.getLogger(__name__)


async def run_migration(
    db: AsyncSession,
    dry_run: bool = False,
    rollback: bool = False,
) -> Dict[str, Any]:
    """
    Executes the legacy assessment migration or rollback.
    """
    stmt = select(Assessment)
    result = await db.execute(stmt)
    assessments = result.scalars().all()

    migrated_ids: List[str] = []
    rolled_back_ids: List[str] = []

    for a in assessments:
        sec_breakdown = a.section_breakdown or {}
        is_migrated = bool(
            sec_breakdown.get("section-a", {}).get("_migrated_legacy")
        )

        if rollback:
            if is_migrated:
                rolled_back_ids.append(str(a.id))
                if not dry_run:
                    # Strip section-a wrap
                    a.section_breakdown = None
                    new_manifest = []
                    for item in (a.manifest or []):
                        m = dict(item)
                        m.pop("section_id", None)
                        m.pop("section_title", None)
                        new_manifest.append(m)
                    a.manifest = new_manifest
        else:
            # Forward migration: identify flat/legacy assessments without section breakdown
            if not sec_breakdown or len(sec_breakdown) == 0:
                migrated_ids.append(str(a.id))
                if not dry_run:
                    manifest_len = len(a.manifest or [])
                    new_section_breakdown = {
                        "section-a": {
                            "title": "Section A",
                            "instructions": "Answer all questions to the best of your ability.",
                            "order_index": 0,
                            "min_pass_percent": a.pass_mark_pct,
                            "marks_per_question": a.marks_per_question or 1.0,
                            "question_count": manifest_len,
                            "shuffle_questions": False,
                            "shuffle_options": False,
                            "_migrated_legacy": True,
                        }
                    }
                    new_manifest = []
                    for idx, item in enumerate(a.manifest or []):
                        m = dict(item)
                        m["section_id"] = "section-a"
                        m["section_title"] = "Section A"
                        m["order_index"] = idx
                        new_manifest.append(m)

                    a.section_breakdown = new_section_breakdown
                    a.manifest = new_manifest

    if not dry_run:
        await db.commit()

    if rollback:
        return {
            "action": "rollback",
            "dry_run": dry_run,
            "count": len(rolled_back_ids),
            "rolled_back_count": len(rolled_back_ids),
            "assessment_ids": rolled_back_ids,
        }
    else:
        return {
            "action": "migrate",
            "dry_run": dry_run,
            "count": len(migrated_ids),
            "migrated_count": len(migrated_ids),
            "assessment_ids": migrated_ids,
        }


async def main():
    parser = argparse.ArgumentParser(description="Migrate legacy assessments to Section A")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without committing")
    parser.add_argument("--rollback", action="store_true", help="Revert previous legacy migration")
    args = parser.parse_args()

    async with async_session_maker() as session:
        res = await run_migration(session, dry_run=args.dry_run, rollback=args.rollback)
        print(f"Migration completed: {res}")


if __name__ == "__main__":
    asyncio.run(main())
