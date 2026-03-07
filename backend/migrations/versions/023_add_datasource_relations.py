"""add datasource relations table

Revision ID: 023
Revises: 022
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '023'
down_revision = '022'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'data_source_relations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('datasource_id', sa.String(length=36), nullable=False),
        sa.Column('source_table', sa.String(length=255), nullable=False),
        sa.Column('source_column', sa.String(length=255), nullable=False),
        sa.Column('target_table', sa.String(length=255), nullable=False),
        sa.Column('target_column', sa.String(length=255), nullable=False),
        sa.Column('relation_type', sa.String(length=50), nullable=False, server_default='many_to_one'),
        sa.Column('origin', sa.String(length=20), nullable=False, server_default='MANUAL'),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['datasource_id'], ['data_sources.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'datasource_id',
            'source_table',
            'source_column',
            'target_table',
            'target_column',
            name='uq_data_source_relation_pair',
        ),
    )


def downgrade():
    op.drop_table('data_source_relations')
