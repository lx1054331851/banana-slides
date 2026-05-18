"""add scenario to style_templates

Revision ID: b81f3a274c10
Revises: f2c4b0d91a11
Create Date: 2026-05-18 17:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b81f3a274c10'
down_revision = 'f2c4b0d91a11'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('style_templates', sa.Column('scenario', sa.String(length=50), nullable=True))
    op.execute("UPDATE style_templates SET scenario = 'ppt' WHERE scenario IS NULL")
    op.alter_column('style_templates', 'scenario', existing_type=sa.String(length=50), nullable=False)


def downgrade():
    op.drop_column('style_templates', 'scenario')
