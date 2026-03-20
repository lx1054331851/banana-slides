"""add prompt history to page image versions

Revision ID: c61a4f9b32de
Revises: 5d6b0ed7b8c1
Create Date: 2026-03-20 11:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c61a4f9b32de'
down_revision = '5d6b0ed7b8c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('page_image_versions', sa.Column('operation_type', sa.String(length=32), nullable=True))
    op.add_column('page_image_versions', sa.Column('prompt_text', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('page_image_versions', 'prompt_text')
    op.drop_column('page_image_versions', 'operation_type')
