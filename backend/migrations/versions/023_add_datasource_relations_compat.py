"""compatibility placeholder for retired db-analysis revision 023

Revision ID: 023
Revises: 022
Create Date: 2026-03-08

This repository previously shipped a revision `023` for datasource relation
metadata. The feature has since been removed from the current branch, but some
local databases still carry `alembic_version = '023'`.

Keeping this revision as a no-op compatibility marker prevents Alembic from
failing with "Can't locate revision identified by '023'" on startup.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '023'
down_revision = '022'
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
