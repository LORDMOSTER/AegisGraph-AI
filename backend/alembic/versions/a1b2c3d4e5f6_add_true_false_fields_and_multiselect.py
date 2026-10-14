"""add_true_false_fields_and_multiselect_indices

Revision ID: a1b2c3d4e5f6
Revises: 9cb4995e1747
Create Date: 2026-10-11

Adds:
  - question_bank.statement_true (Text)
  - question_bank.statement_false (Text)
  - question_bank.edit_kind (String 32)
  - question_bank.changed_fragment (Text)
  - question_bank.correct_option_indices JSONB (if not already present)

The correct_option_indices column was added in the previous migration
9cbb42cf750e but we ensure it exists with ALTER TABLE IF NOT EXISTS semantics.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9cb4995e1747'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema — adds TRUE_FALSE metadata columns to question_bank."""
    # TRUE_FALSE pair storage
    op.add_column(
        'question_bank',
        sa.Column('statement_true', sa.Text(), nullable=True)
    )
    op.add_column(
        'question_bank',
        sa.Column('statement_false', sa.Text(), nullable=True)
    )
    op.add_column(
        'question_bank',
        sa.Column('edit_kind', sa.String(length=32), nullable=True)
    )
    op.add_column(
        'question_bank',
        sa.Column('changed_fragment', sa.Text(), nullable=True)
    )

    # Ensure correct_option_indices exists (may have been added by earlier migration)
    # Use raw SQL to add only if missing — safe to run multiple times
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='question_bank' AND column_name='correct_option_indices'
            ) THEN
                ALTER TABLE question_bank
                ADD COLUMN correct_option_indices JSONB;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('question_bank', 'changed_fragment')
    op.drop_column('question_bank', 'edit_kind')
    op.drop_column('question_bank', 'statement_false')
    op.drop_column('question_bank', 'statement_true')
