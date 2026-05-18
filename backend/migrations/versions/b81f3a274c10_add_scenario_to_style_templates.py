"""add scenario to style_templates

Revision ID: b81f3a274c10
Revises: f2c4b0d91a11
Create Date: 2026-05-18 17:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'b81f3a274c10'
down_revision = 'f2c4b0d91a11'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {column['name'] for column in inspector.get_columns('style_templates')}

    if 'scenario' not in existing_columns:
        op.add_column('style_templates', sa.Column('scenario', sa.String(length=50), nullable=True))

    op.execute("UPDATE style_templates SET scenario = 'ppt' WHERE scenario IS NULL")
    with op.batch_alter_table('style_templates') as batch_op:
        batch_op.alter_column('scenario', existing_type=sa.String(length=50), nullable=False)


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {column['name'] for column in inspector.get_columns('style_templates')}
    if 'scenario' in existing_columns:
        with op.batch_alter_table('style_templates') as batch_op:
            batch_op.drop_column('scenario')
