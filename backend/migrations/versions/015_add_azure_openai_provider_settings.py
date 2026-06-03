"""add azure openai provider settings

Revision ID: 015
Revises: 014
Create Date: 2026-06-03

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('settings', sa.Column('azure_openai_endpoint', sa.String(500), nullable=True))
    op.add_column('settings', sa.Column('azure_openai_api_version', sa.String(50), nullable=True))
    op.add_column('settings', sa.Column('text_azure_openai_endpoint', sa.String(500), nullable=True))
    op.add_column('settings', sa.Column('text_azure_openai_api_version', sa.String(50), nullable=True))
    op.add_column('settings', sa.Column('image_azure_openai_endpoint', sa.String(500), nullable=True))
    op.add_column('settings', sa.Column('image_azure_openai_api_version', sa.String(50), nullable=True))
    op.add_column('settings', sa.Column('image_caption_azure_openai_endpoint', sa.String(500), nullable=True))
    op.add_column('settings', sa.Column('image_caption_azure_openai_api_version', sa.String(50), nullable=True))


def downgrade():
    op.drop_column('settings', 'image_caption_azure_openai_api_version')
    op.drop_column('settings', 'image_caption_azure_openai_endpoint')
    op.drop_column('settings', 'image_azure_openai_api_version')
    op.drop_column('settings', 'image_azure_openai_endpoint')
    op.drop_column('settings', 'text_azure_openai_api_version')
    op.drop_column('settings', 'text_azure_openai_endpoint')
    op.drop_column('settings', 'azure_openai_api_version')
    op.drop_column('settings', 'azure_openai_endpoint')
