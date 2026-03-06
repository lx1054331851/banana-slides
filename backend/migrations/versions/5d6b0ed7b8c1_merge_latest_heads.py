"""merge latest heads

Revision ID: 5d6b0ed7b8c1
Revises: f8398e395414, 9ad736fec43d
Create Date: 2026-03-06 12:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5d6b0ed7b8c1'
down_revision = ('f8398e395414', '9ad736fec43d')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass