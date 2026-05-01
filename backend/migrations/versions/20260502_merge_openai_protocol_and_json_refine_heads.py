"""merge openai protocol and json refine heads

Revision ID: 20260502_merge_heads
Revises: 416cd372ad39, e3a1b7c9d201
Create Date: 2026-05-02 00:15:00.000000

"""

# revision identifiers, used by Alembic.
revision = '20260502_merge_heads'
down_revision = ('416cd372ad39', 'e3a1b7c9d201')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Merge the current migration heads without changing schema."""
    pass


def downgrade() -> None:
    """Split the merged migration heads when downgrading."""
    pass
