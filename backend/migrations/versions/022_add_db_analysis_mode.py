"""add db analysis mode models

Revision ID: 022
Revises: 021
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'data_sources',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('db_type', sa.String(length=20), nullable=False),
        sa.Column('host', sa.String(length=255), nullable=False),
        sa.Column('port', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=255), nullable=False),
        sa.Column('password', sa.String(length=500), nullable=False),
        sa.Column('database_name', sa.String(length=255), nullable=False),
        sa.Column('whitelist_tables', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_data_sources_name'),
    )

    op.add_column('projects', sa.Column('datasource_id', sa.String(length=36), nullable=True))
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        with op.batch_alter_table('projects') as batch_op:
            batch_op.create_foreign_key(
                'fk_projects_datasource_id',
                'data_sources',
                ['datasource_id'],
                ['id'],
            )
    else:
        op.create_foreign_key('fk_projects_datasource_id', 'projects', 'data_sources', ['datasource_id'], ['id'])

    op.create_table(
        'data_source_tables',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('datasource_id', sa.String(length=36), nullable=False),
        sa.Column('table_name', sa.String(length=255), nullable=False),
        sa.Column('table_comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['datasource_id'], ['data_sources.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('datasource_id', 'table_name', name='uq_data_source_table_name'),
    )

    op.create_table(
        'data_source_columns',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('table_id', sa.String(length=36), nullable=False),
        sa.Column('column_name', sa.String(length=255), nullable=False),
        sa.Column('data_type', sa.String(length=100), nullable=False),
        sa.Column('column_type', sa.String(length=255), nullable=True),
        sa.Column('ordinal_position', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('is_nullable', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('column_comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['table_id'], ['data_source_tables.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('table_id', 'column_name', name='uq_data_source_column_name'),
    )

    op.create_table(
        'db_analysis_sessions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('datasource_id', sa.String(length=36), nullable=False),
        sa.Column('business_context', sa.Text(), nullable=False),
        sa.Column('analysis_goal', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['datasource_id'], ['data_sources.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'db_analysis_rounds',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('session_id', sa.String(length=36), nullable=False),
        sa.Column('round_number', sa.Integer(), nullable=False),
        sa.Column('page_title', sa.String(length=300), nullable=False),
        sa.Column('sql_draft', sa.Text(), nullable=True),
        sa.Column('sql_final', sa.Text(), nullable=False),
        sa.Column('sql_rewrite_reason', sa.Text(), nullable=True),
        sa.Column('query_result_json', sa.Text(), nullable=True),
        sa.Column('query_error', sa.Text(), nullable=True),
        sa.Column('key_findings', sa.Text(), nullable=True),
        sa.Column('next_dimension_candidates', sa.Text(), nullable=True),
        sa.Column('interaction_schema', sa.Text(), nullable=True),
        sa.Column('interaction_answers', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['db_analysis_sessions.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'round_number', name='uq_db_analysis_round_number'),
    )

    op.create_table(
        'db_interactions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('round_id', sa.String(length=36), nullable=False),
        sa.Column('payload_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['round_id'], ['db_analysis_rounds.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('db_interactions')
    op.drop_table('db_analysis_rounds')
    op.drop_table('db_analysis_sessions')
    op.drop_table('data_source_columns')
    op.drop_table('data_source_tables')

    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        with op.batch_alter_table('projects') as batch_op:
            batch_op.drop_constraint('fk_projects_datasource_id', type_='foreignkey')
    else:
        op.drop_constraint('fk_projects_datasource_id', 'projects', type_='foreignkey')
    op.drop_column('projects', 'datasource_id')

    op.drop_table('data_sources')
