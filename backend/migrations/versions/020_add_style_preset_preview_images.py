"""add preview_images_json to style_presets

Revision ID: 020
Revises: 019
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('style_presets', sa.Column('preview_images_json', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('style_presets', 'preview_images_json')
