"""compatibility placeholder for retired db-analysis revision 022

Revision ID: 022
Revises: 021
Create Date: 2026-03-08

This repository previously shipped a revision `022` for an experimental
DB-analysis feature. The feature was later removed from the current branch,
but existing local databases can still be stamped at `022` or `023`.

Keeping a no-op placeholder lets Alembic resolve those historical revision
numbers when developers switch branches or reuse an older local SQLite DB.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
