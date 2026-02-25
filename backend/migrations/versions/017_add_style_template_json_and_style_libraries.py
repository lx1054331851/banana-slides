"""add template_style_json to projects and add style template/preset libraries

Revision ID: 017
Revises: 49dc18e533f3
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '017'
down_revision = '49dc18e533f3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('template_style_json', sa.Text(), nullable=True))

    op.create_table(
        'style_templates',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('template_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'style_presets',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('style_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('style_presets')
    op.drop_table('style_templates')
    op.drop_column('projects', 'template_style_json')

