"""merge azure and gpt image migration heads

Revision ID: 20260610_merge_azure_and_gpt_image_heads
Revises: 20260603_add_azure_openai_provider_settings, b3c2d4e5f6a7
Create Date: 2026-06-10 21:20:00.000000

"""

# revision identifiers, used by Alembic.
revision = '20260610_merge_azure_and_gpt_image_heads'
down_revision = ('20260603_add_azure_openai_provider_settings', 'b3c2d4e5f6a7')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Merge the latest migration branches without schema changes."""
    pass


def downgrade() -> None:
    """Re-split the merged migration branches without schema changes."""
    pass
