"""rename baidu_ocr_api_key to baidu_api_key

Revision ID: 019
Revises: 018
Create Date: 2026-02-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade():
    if _column_exists("settings", "baidu_api_key"):
        return

    if _column_exists("settings", "baidu_ocr_api_key"):
        with op.batch_alter_table("settings") as batch_op:
            batch_op.alter_column(
                "baidu_ocr_api_key",
                new_column_name="baidu_api_key",
                existing_type=sa.String(length=500),
            )
        return

    op.add_column("settings", sa.Column("baidu_api_key", sa.String(length=500), nullable=True))


def downgrade():
    if _column_exists("settings", "baidu_ocr_api_key"):
        return

    if _column_exists("settings", "baidu_api_key"):
        with op.batch_alter_table("settings") as batch_op:
            batch_op.alter_column(
                "baidu_api_key",
                new_column_name="baidu_ocr_api_key",
                existing_type=sa.String(length=500),
            )
