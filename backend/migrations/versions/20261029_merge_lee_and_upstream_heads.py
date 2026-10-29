"""Merge the custom image history and upstream text output limit migrations."""

revision = '20261029_merge_lee_upstream'
down_revision = ('20260626_add_soft_delete_to_page_image_versions', 'd84c2a7f9130')
branch_labels = None
depends_on = None


def upgrade():
    """Join both migration histories without changing data."""
    pass


def downgrade():
    """Restore both branch heads without changing data."""
    pass
