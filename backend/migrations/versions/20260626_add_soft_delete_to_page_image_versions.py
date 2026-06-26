"""add soft delete fields to page image versions

Revision ID: 20260626_add_soft_delete_to_page_image_versions
Revises: 20260610_merge_azure_and_gpt_image_heads
Create Date: 2026-06-26 17:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260626_add_soft_delete_to_page_image_versions'
down_revision = '20260610_merge_azure_and_gpt_image_heads'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'page_image_versions',
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'page_image_versions',
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.alter_column('page_image_versions', 'is_deleted', server_default=None)


def downgrade() -> None:
    op.drop_column('page_image_versions', 'deleted_at')
    op.drop_column('page_image_versions', 'is_deleted')
