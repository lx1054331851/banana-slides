"""add preset_templates library table

Revision ID: 021
Revises: 5d6b0ed7b8c1
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '021'
down_revision = '5d6b0ed7b8c1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'preset_templates',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('thumb_path', sa.String(length=500), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('preset_templates')
