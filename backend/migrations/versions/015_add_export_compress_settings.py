"""add export compress settings to projects table

Revision ID: 015
Revises: 014
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('export_compress_enabled', sa.Boolean(), nullable=True, server_default='0'))
    op.add_column('projects', sa.Column('export_compress_mode', sa.String(length=20), nullable=True, server_default='auto'))
    op.add_column('projects', sa.Column('export_compress_format', sa.String(length=10), nullable=True, server_default='jpeg'))
    op.add_column('projects', sa.Column('export_compress_quality', sa.Integer(), nullable=True, server_default='92'))
    op.add_column('projects', sa.Column('export_compress_subsampling', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('projects', sa.Column('export_compress_progressive', sa.Boolean(), nullable=True, server_default='1'))
    op.add_column('projects', sa.Column('export_compress_auto_target', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('projects', sa.Column('export_compress_auto_min_quality', sa.Integer(), nullable=True, server_default='60'))
    op.add_column('projects', sa.Column('export_compress_auto_max_quality', sa.Integer(), nullable=True, server_default='95'))
    op.add_column('projects', sa.Column('export_compress_auto_max_trials', sa.Integer(), nullable=True, server_default='6'))

    op.execute("UPDATE projects SET export_compress_enabled = false WHERE export_compress_enabled IS NULL")


def downgrade():
    op.drop_column('projects', 'export_compress_auto_max_trials')
    op.drop_column('projects', 'export_compress_auto_max_quality')
    op.drop_column('projects', 'export_compress_auto_min_quality')
    op.drop_column('projects', 'export_compress_auto_target')
    op.drop_column('projects', 'export_compress_progressive')
    op.drop_column('projects', 'export_compress_subsampling')
    op.drop_column('projects', 'export_compress_quality')
    op.drop_column('projects', 'export_compress_format')
    op.drop_column('projects', 'export_compress_mode')
    op.drop_column('projects', 'export_compress_enabled')
