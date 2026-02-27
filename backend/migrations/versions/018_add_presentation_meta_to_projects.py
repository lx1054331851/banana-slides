"""add presentation_meta to projects

Revision ID: 018
Revises: 017
Create Date: 2026-02-26

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('presentation_meta', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'presentation_meta')
