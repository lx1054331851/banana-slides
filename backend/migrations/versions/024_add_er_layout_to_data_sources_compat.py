"""compatibility placeholder for revision 024

Revision ID: 024
Revises: 023
Create Date: 2026-03-10

Another branch added revision `024` for datasource ER layout metadata.
This branch does not need that schema change, but local SQLite databases may
already be stamped at `024` after switching branches.

Keeping a no-op placeholder lets Alembic resolve revision `024` instead of
failing with "Can't locate revision identified by '024'".
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
