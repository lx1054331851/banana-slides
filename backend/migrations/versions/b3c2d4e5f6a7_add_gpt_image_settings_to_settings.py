"""add gpt image settings to settings

Revision ID: b3c2d4e5f6a7
Revises: 416cd372ad39
Create Date: 2026-06-10 18:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3c2d4e5f6a7'
down_revision = '416cd372ad39'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('settings', sa.Column('gpt_image_background', sa.String(length=20), nullable=True))
    op.add_column('settings', sa.Column('gpt_image_output_format', sa.String(length=20), nullable=True))
    op.add_column('settings', sa.Column('gpt_image_output_compression', sa.Integer(), nullable=True))
    op.add_column('settings', sa.Column('gpt_image_quality', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('settings', 'gpt_image_quality')
    op.drop_column('settings', 'gpt_image_output_compression')
    op.drop_column('settings', 'gpt_image_output_format')
    op.drop_column('settings', 'gpt_image_background')
