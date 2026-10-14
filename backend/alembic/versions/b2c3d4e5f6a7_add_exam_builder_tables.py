"""add_exam_builder_tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-11

Creates tables for Exam Builder:
  - exam_drafts
  - exam_sections
  - exam_questions
  - exam_question_revisions
  - generation_jobs
With foreign keys, ON DELETE CASCADE, and indexes on foreign keys.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. exam_drafts
    op.create_table(
        'exam_drafts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('target', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('duration_minutes', sa.Integer(), nullable=True, server_default='60'),
        sa.Column('available_from', sa.DateTime(timezone=True), nullable=True),
        sa.Column('available_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('scoring_mode', sa.String(32), nullable=False, server_default='per_question_marks'),
        sa.Column('pass_percent', sa.Float(), nullable=False, server_default='80.0'),
        sa.Column('reveal_score', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('exam_key_hash', sa.String(128), nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('locked_assessment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('assessments.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_exam_drafts_id', 'exam_drafts', ['id'])
    op.create_index('ix_exam_drafts_company_id', 'exam_drafts', ['company_id'])
    op.create_index('ix_exam_drafts_created_by', 'exam_drafts', ['created_by'])
    op.create_index('ix_exam_drafts_locked_assessment_id', 'exam_drafts', ['locked_assessment_id'])

    # 2. exam_sections
    op.create_table(
        'exam_sections',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('draft_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('exam_drafts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('topic_filter', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('type_mix', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('difficulty_mix', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('marks_per_question', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('min_pass_percent', sa.Float(), nullable=True),
        sa.Column('shuffle_questions', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('shuffle_options', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_exam_sections_id', 'exam_sections', ['id'])
    op.create_index('ix_exam_sections_draft_id', 'exam_sections', ['draft_id'])

    # 3. exam_questions
    op.create_table(
        'exam_questions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('section_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('exam_sections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('question_type', sa.String(32), nullable=False),
        sa.Column('difficulty', sa.String(16), nullable=False, server_default='medium'),
        sa.Column('marks', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('stem', sa.Text(), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('origin', sa.String(32), nullable=False, server_default='ai'),
        sa.Column('source_variant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('question_bank.id', ondelete='SET NULL'), nullable=True),
        sa.Column('rule_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('rules.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_locked', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('warnings', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_exam_questions_id', 'exam_questions', ['id'])
    op.create_index('ix_exam_questions_section_id', 'exam_questions', ['section_id'])
    op.create_index('ix_exam_questions_source_variant_id', 'exam_questions', ['source_variant_id'])
    op.create_index('ix_exam_questions_rule_id', 'exam_questions', ['rule_id'])

    # 4. exam_question_revisions
    op.create_table(
        'exam_question_revisions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('question_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('exam_questions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_exam_question_revisions_id', 'exam_question_revisions', ['id'])
    op.create_index('ix_exam_question_revisions_question_id', 'exam_question_revisions', ['question_id'])

    # 5. generation_jobs
    op.create_table(
        'generation_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('draft_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('exam_drafts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='pending'),
        sa.Column('progress', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_generation_jobs_id', 'generation_jobs', ['id'])
    op.create_index('ix_generation_jobs_draft_id', 'generation_jobs', ['draft_id'])


def downgrade() -> None:
    op.drop_table('generation_jobs')
    op.drop_table('exam_question_revisions')
    op.drop_table('exam_questions')
    op.drop_table('exam_sections')
    op.drop_table('exam_drafts')
