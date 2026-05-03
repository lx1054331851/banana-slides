"""add prompt templates table

Revision ID: 20260504_prompt_templates
Revises: 20260502_merge_heads
Create Date: 2026-05-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260504_prompt_templates'
down_revision = '20260502_merge_heads'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create prompt template override table."""
    op.create_table(
        'prompt_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('mode', sa.String(length=50), nullable=False),
        sa.Column('stage', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('default_content', sa.Text(), nullable=False),
        sa.Column('custom_content', sa.Text(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )
    op.create_index('ix_prompt_templates_key', 'prompt_templates', ['key'], unique=False)
    op.create_index('ix_prompt_templates_mode', 'prompt_templates', ['mode'], unique=False)
    op.create_index('ix_prompt_templates_stage', 'prompt_templates', ['stage'], unique=False)


def downgrade() -> None:
    """Drop prompt template override table."""
    op.drop_index('ix_prompt_templates_stage', table_name='prompt_templates')
    op.drop_index('ix_prompt_templates_mode', table_name='prompt_templates')
    op.drop_index('ix_prompt_templates_key', table_name='prompt_templates')
    op.drop_table('prompt_templates')
