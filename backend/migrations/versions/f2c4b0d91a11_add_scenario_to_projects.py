"""add scenario to projects

Revision ID: f2c4b0d91a11
Revises: d7b6f4e2c9ab
Create Date: 2026-05-18 16:40:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'f2c4b0d91a11'
down_revision = 'd7b6f4e2c9ab'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {column['name'] for column in inspector.get_columns('projects')}

    if 'scenario' not in existing_columns:
        op.add_column('projects', sa.Column('scenario', sa.String(length=50), nullable=True))

    op.execute("UPDATE projects SET scenario = 'ppt' WHERE scenario IS NULL")
    with op.batch_alter_table('projects') as batch_op:
        batch_op.alter_column('scenario', existing_type=sa.String(length=50), nullable=False)


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {column['name'] for column in inspector.get_columns('projects')}
    if 'scenario' in existing_columns:
        with op.batch_alter_table('projects') as batch_op:
            batch_op.drop_column('scenario')
