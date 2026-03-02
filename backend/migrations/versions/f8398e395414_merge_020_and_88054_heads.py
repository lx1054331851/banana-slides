"""merge 020 and 88054 heads

Revision ID: f8398e395414
Revises: 020, 88054bda1ece
Create Date: 2026-03-03 01:34:12.443652

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f8398e395414'
down_revision = ('020', '88054bda1ece')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass



