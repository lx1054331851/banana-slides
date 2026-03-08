"""add er layout to data sources

Revision ID: 024
Revises: 023
Create Date: 2026-03-08
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('data_sources', sa.Column('er_layout', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('data_sources', 'er_layout')
