"""add pngquant export setting to projects table

Revision ID: 016
Revises: 015
Create Date: 2026-02-23

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('export_compress_png_quantize_enabled', sa.Boolean(), nullable=True, server_default='0'))
    op.execute("UPDATE projects SET export_compress_png_quantize_enabled = false WHERE export_compress_png_quantize_enabled IS NULL")


def downgrade():
    op.drop_column('projects', 'export_compress_png_quantize_enabled')
