"""add scenario to projects

Revision ID: f2c4b0d91a11
Revises: d7b6f4e2c9ab
Create Date: 2026-05-18 16:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2c4b0d91a11'
down_revision = 'd7b6f4e2c9ab'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('scenario', sa.String(length=50), nullable=True))
    op.execute("UPDATE projects SET scenario = 'ppt' WHERE scenario IS NULL")
    op.alter_column('projects', 'scenario', existing_type=sa.String(length=50), nullable=False)


def downgrade():
    op.drop_column('projects', 'scenario')
