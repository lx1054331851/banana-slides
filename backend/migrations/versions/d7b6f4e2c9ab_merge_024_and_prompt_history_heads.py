"""merge 024 and prompt history heads

Revision ID: d7b6f4e2c9ab
Revises: 024, c61a4f9b32de
Create Date: 2026-03-20 14:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd7b6f4e2c9ab'
down_revision = ('024', 'c61a4f9b32de')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
