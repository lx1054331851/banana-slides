"""add json refine context to pages

Revision ID: e3a1b7c9d201
Revises: 026_merge_canvas_and_json_refine_heads
Create Date: 2026-04-12 17:25:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3a1b7c9d201'
down_revision = '026_merge_canvas_and_json_refine_heads'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pages', sa.Column('json_refine_context', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pages', 'json_refine_context')
