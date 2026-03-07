"""Services for external data source connections and schema import."""

from __future__ import annotations

import json
import logging
import re
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text

from models import db, DataSource, DataSourceTable, DataSourceColumn, DataSourceRelation
from services.ai_service_manager import get_ai_service

logger = logging.getLogger(__name__)


class DataSourceService:
    """Runtime service for data source operations."""
    MAX_RELATION_INFER_TABLES = 30
    MAX_RELATION_INFER_COLS = 40

    @staticmethod
    def build_sqlalchemy_url(data_source: DataSource) -> str:
        db_type = (data_source.db_type or '').strip().lower()
        if db_type != 'mysql':
            raise ValueError(f"Unsupported db_type: {db_type}")

        username = quote_plus(data_source.username)
        password = quote_plus(data_source.password)
        host = data_source.host
        port = int(data_source.port or 3306)
        db_name = quote_plus(data_source.database_name)
        return f"mysql+pymysql://{username}:{password}@{host}:{port}/{db_name}?charset=utf8mb4"

    @staticmethod
    def create_engine(data_source: DataSource):
        url = DataSourceService.build_sqlalchemy_url(data_source)
        return create_engine(
            url,
            pool_pre_ping=True,
            pool_recycle=1800,
            connect_args={'connect_timeout': 10},
        )

    @staticmethod
    def test_connection(data_source: DataSource) -> tuple[bool, str]:
        try:
            engine = DataSourceService.create_engine(data_source)
            with engine.connect() as conn:
                conn.execute(text('SELECT 1'))
            engine.dispose()
            return True, 'Connection successful'
        except Exception as exc:
            logger.warning('Data source connection test failed: %s', exc, exc_info=True)
            return False, str(exc)

    @staticmethod
    def fetch_schema_preview(
        data_source: DataSource,
        selected_tables: list[str] | None = None,
    ) -> list[dict]:
        """Load live schema metadata from information_schema without persisting."""
        engine = DataSourceService.create_engine(data_source)
        preview_tables: list[dict] = []
        selected_filter_applied = selected_tables is not None
        selected_set = set(selected_tables or [])
        whitelist = set(data_source.get_whitelist_tables())

        try:
            with engine.connect() as conn:
                table_rows = conn.execute(
                    text(
                        """
                        SELECT TABLE_NAME, COALESCE(TABLE_COMMENT, '') AS TABLE_COMMENT
                        FROM information_schema.tables
                        WHERE table_schema = :schema_name AND table_type = 'BASE TABLE'
                        ORDER BY TABLE_NAME
                        """
                    ),
                    {'schema_name': data_source.database_name},
                ).mappings().all()

                if whitelist:
                    table_rows = [row for row in table_rows if row['TABLE_NAME'] in whitelist]
                if selected_filter_applied:
                    if selected_set:
                        table_rows = [row for row in table_rows if row['TABLE_NAME'] in selected_set]
                    else:
                        table_rows = []

                for row in table_rows:
                    table_name = row['TABLE_NAME']
                    column_rows = conn.execute(
                        text(
                            """
                            SELECT
                                COLUMN_NAME,
                                DATA_TYPE,
                                COLUMN_TYPE,
                                ORDINAL_POSITION,
                                IS_NULLABLE,
                                COLUMN_KEY,
                                COALESCE(COLUMN_COMMENT, '') AS COLUMN_COMMENT
                            FROM information_schema.columns
                            WHERE table_schema = :schema_name
                              AND table_name = :table_name
                            ORDER BY ORDINAL_POSITION
                            """
                        ),
                        {
                            'schema_name': data_source.database_name,
                            'table_name': table_name,
                        },
                    ).mappings().all()

                    columns = []
                    for col in column_rows:
                        columns.append(
                            {
                                'column_name': col['COLUMN_NAME'],
                                'data_type': col['DATA_TYPE'],
                                'column_type': col['COLUMN_TYPE'],
                                'ordinal_position': int(col['ORDINAL_POSITION'] or 1),
                                'is_nullable': (str(col['IS_NULLABLE']).upper() == 'YES'),
                                'is_primary': (str(col['COLUMN_KEY']).upper() == 'PRI'),
                                'column_comment': col['COLUMN_COMMENT'] or None,
                            }
                        )

                    preview_tables.append(
                        {
                            'table_name': table_name,
                            'table_comment': row['TABLE_COMMENT'] or None,
                            'columns': columns,
                        }
                    )
        finally:
            engine.dispose()

        return preview_tables

    @staticmethod
    def fetch_relation_candidates(
        data_source: DataSource,
        selected_tables: list[str] | None = None,
    ) -> list[dict]:
        """Infer relation candidates with LLM first, fallback to FK metadata."""
        schema_tables = DataSourceService._build_relation_infer_schema(
            data_source,
            selected_tables=selected_tables,
        )
        llm_candidates = DataSourceService._fetch_relation_candidates_by_llm(schema_tables)
        if llm_candidates:
            return llm_candidates
        return DataSourceService._fetch_relation_candidates_by_fk(data_source, selected_tables)

    @staticmethod
    def _fetch_relation_candidates_by_fk(
        data_source: DataSource,
        selected_tables: list[str] | None = None,
    ) -> list[dict]:
        """Load FK-based relation candidates from information_schema."""
        engine = DataSourceService.create_engine(data_source)
        selected_set = set(selected_tables or [])
        whitelist = set(data_source.get_whitelist_tables())
        candidates: list[dict] = []

        try:
            with engine.connect() as conn:
                rows = conn.execute(
                    text(
                        """
                        SELECT
                            kcu.TABLE_NAME AS SOURCE_TABLE,
                            kcu.COLUMN_NAME AS SOURCE_COLUMN,
                            kcu.REFERENCED_TABLE_NAME AS TARGET_TABLE,
                            kcu.REFERENCED_COLUMN_NAME AS TARGET_COLUMN,
                            kcu.CONSTRAINT_NAME AS CONSTRAINT_NAME
                        FROM information_schema.KEY_COLUMN_USAGE kcu
                        WHERE kcu.TABLE_SCHEMA = :schema_name
                          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                          AND kcu.REFERENCED_COLUMN_NAME IS NOT NULL
                        ORDER BY
                            kcu.TABLE_NAME,
                            kcu.COLUMN_NAME,
                            kcu.REFERENCED_TABLE_NAME,
                            kcu.REFERENCED_COLUMN_NAME
                        """
                    ),
                    {'schema_name': data_source.database_name},
                ).mappings().all()

                for row in rows:
                    source_table = row['SOURCE_TABLE']
                    target_table = row['TARGET_TABLE']

                    if whitelist and (source_table not in whitelist or target_table not in whitelist):
                        continue
                    if selected_set and (source_table not in selected_set or target_table not in selected_set):
                        continue

                    candidates.append(
                        {
                            'source_table': source_table,
                            'source_column': row['SOURCE_COLUMN'],
                            'target_table': target_table,
                            'target_column': row['TARGET_COLUMN'],
                            'relation_type': 'many_to_one',
                            'origin': 'AUTO',
                            'confidence': 0.95,
                            'note': f"constraint={row['CONSTRAINT_NAME']}",
                        }
                    )
        finally:
            engine.dispose()

        return candidates

    @staticmethod
    def _build_relation_infer_schema(
        data_source: DataSource,
        selected_tables: list[str] | None = None,
    ) -> list[dict]:
        selected_set = set(selected_tables or [])

        cached_tables = sorted(data_source.tables, key=lambda t: t.table_name)
        if selected_set:
            cached_tables = [table for table in cached_tables if table.table_name in selected_set]

        if cached_tables:
            output = []
            for table in cached_tables[:DataSourceService.MAX_RELATION_INFER_TABLES]:
                columns = sorted(table.columns, key=lambda c: c.ordinal_position)
                output.append(
                    {
                        'table_name': table.table_name,
                        'table_comment': table.table_comment,
                        'columns': [
                            {
                                'column_name': col.column_name,
                                'data_type': col.data_type,
                                'is_primary': bool(col.is_primary),
                                'column_comment': col.column_comment,
                            }
                            for col in columns[:DataSourceService.MAX_RELATION_INFER_COLS]
                        ],
                    }
                )
            return output

        try:
            preview_tables = DataSourceService.fetch_schema_preview(
            data_source,
            selected_tables=selected_tables,
        )
        except Exception as exc:
            logger.warning('Failed to load schema preview for relation inference: %s', exc, exc_info=True)
            return []

        output = []
        for table in preview_tables[:DataSourceService.MAX_RELATION_INFER_TABLES]:
            columns = table.get('columns') or []
            output.append(
                {
                    'table_name': table.get('table_name'),
                    'table_comment': table.get('table_comment'),
                    'columns': [
                        {
                            'column_name': col.get('column_name'),
                            'data_type': col.get('data_type'),
                            'is_primary': bool(col.get('is_primary', False)),
                            'column_comment': col.get('column_comment'),
                        }
                        for col in columns[:DataSourceService.MAX_RELATION_INFER_COLS]
                        if str(col.get('column_name') or '').strip()
                    ],
                }
            )
        return output

    @staticmethod
    def _extract_json_dict(text_resp: str) -> dict:
        raw = (text_resp or '').strip()
        if not raw:
            return {}

        candidates = [raw]
        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw, re.IGNORECASE)
        if fenced:
            candidates.append(fenced.group(1).strip())

        first_obj = raw.find('{')
        last_obj = raw.rfind('}')
        if first_obj != -1 and last_obj > first_obj:
            candidates.append(raw[first_obj:last_obj + 1])

        for item in candidates:
            try:
                parsed = json.loads(item)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                continue
        return {}

    @staticmethod
    def _build_relation_infer_prompt(schema_tables: list[dict]) -> str:
        schema_json = json.dumps(schema_tables, ensure_ascii=False, indent=2)
        return f"""
你是数据库建模专家。请基于给定表结构，推断最可能的表关联关系（用于 SQL JOIN）。

要求：
1) 只允许使用输入里已有的 table_name 和 column_name。
2) 优先识别常见主外键模式（如 xxx_id -> id）。
3) 给出有把握的候选关系，避免胡乱猜测。
4) relation_type 仅允许 one_to_one / one_to_many / many_to_one / many_to_many。
5) confidence 取 0~1 之间小数。
6) 最多输出 50 条。

输入表结构(JSON)：
{schema_json}

请只输出 JSON 对象，格式如下：
{{
  "relations": [
    {{
      "source_table": "order_items",
      "source_column": "order_id",
      "target_table": "orders",
      "target_column": "id",
      "relation_type": "many_to_one",
      "confidence": 0.9,
      "reason": "order_items.order_id 命名上指向 orders.id"
    }}
  ]
}}
""".strip()

    @staticmethod
    def _normalize_llm_relation_candidates(raw_relations: list, schema_tables: list[dict]) -> list[dict]:
        schema_map: dict[str, set[str]] = {}
        for table in schema_tables:
            table_name = str(table.get('table_name') or '').strip()
            if not table_name:
                continue
            columns = table.get('columns') if isinstance(table.get('columns'), list) else []
            schema_map[table_name] = {
                str(col.get('column_name') or '').strip()
                for col in columns
                if isinstance(col, dict) and str(col.get('column_name') or '').strip()
            }

        allowed_relation_types = {'one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'}
        seen = set()
        normalized: list[dict] = []
        if not isinstance(raw_relations, list):
            return normalized

        for item in raw_relations[:50]:
            if not isinstance(item, dict):
                continue
            source_table = str(item.get('source_table') or '').strip()
            source_column = str(item.get('source_column') or '').strip()
            target_table = str(item.get('target_table') or '').strip()
            target_column = str(item.get('target_column') or '').strip()
            if not (source_table and source_column and target_table and target_column):
                continue
            if source_table not in schema_map or target_table not in schema_map:
                continue
            if source_column not in schema_map[source_table] or target_column not in schema_map[target_table]:
                continue

            key = (source_table, source_column, target_table, target_column)
            if key in seen:
                continue
            seen.add(key)

            relation_type = str(item.get('relation_type') or '').strip().lower() or 'many_to_one'
            if relation_type not in allowed_relation_types:
                relation_type = 'many_to_one'

            confidence = item.get('confidence')
            try:
                confidence_value = float(confidence)
            except (TypeError, ValueError):
                confidence_value = 0.7
            confidence_value = max(0.0, min(1.0, confidence_value))

            reason = str(item.get('reason') or item.get('note') or '').strip()
            note = f"llm_guess: {reason}" if reason else 'llm_guess'

            normalized.append(
                {
                    'source_table': source_table,
                    'source_column': source_column,
                    'target_table': target_table,
                    'target_column': target_column,
                    'relation_type': relation_type,
                    'origin': 'AUTO',
                    'confidence': confidence_value,
                    'note': note,
                }
            )
        return normalized

    @staticmethod
    def _fetch_relation_candidates_by_llm(schema_tables: list[dict]) -> list[dict]:
        if not schema_tables:
            return []
        try:
            ai_service = get_ai_service()
            prompt = DataSourceService._build_relation_infer_prompt(schema_tables)
            response_text = ai_service.text_provider.generate_text(prompt, thinking_budget=256)
            parsed = DataSourceService._extract_json_dict(response_text)
            raw_relations = parsed.get('relations') if isinstance(parsed, dict) else []
            normalized = DataSourceService._normalize_llm_relation_candidates(raw_relations, schema_tables)
            if normalized:
                return normalized
            logger.info('LLM relation inference returned no valid candidates.')
            return []
        except Exception as exc:
            logger.warning('LLM relation inference failed: %s', exc, exc_info=True)
            return []

    @staticmethod
    def _prune_relations_for_import(
        data_source: DataSource,
        valid_columns_by_table: dict[str, set[str]],
    ) -> None:
        relations = DataSourceRelation.query.filter_by(datasource_id=data_source.id).all()
        valid_tables = set(valid_columns_by_table.keys())

        for relation in relations:
            if relation.source_table not in valid_tables or relation.target_table not in valid_tables:
                db.session.delete(relation)
                continue

            source_columns = valid_columns_by_table.get(relation.source_table, set())
            target_columns = valid_columns_by_table.get(relation.target_table, set())
            if relation.source_column not in source_columns or relation.target_column not in target_columns:
                db.session.delete(relation)


    @staticmethod
    def import_schema(
        data_source: DataSource,
        selected_tables: list[str] | None = None,
        selected_columns: dict[str, list[str]] | None = None,
    ) -> dict:
        """Import table/column metadata into local cache tables."""
        imported_tables = []
        selected_columns = selected_columns or {}
        valid_columns_by_table: dict[str, set[str]] = {}

        preview_tables = DataSourceService.fetch_schema_preview(
            data_source,
            selected_tables=selected_tables,
        )

        # Replace cached schema in one pass.
        # Query IDs first, then delete children -> parents for better cross-dialect compatibility.
        existing_table_ids = [
            row.id
            for row in db.session.query(DataSourceTable.id).filter_by(datasource_id=data_source.id).all()
        ]
        if existing_table_ids:
            DataSourceColumn.query.filter(DataSourceColumn.table_id.in_(existing_table_ids)).delete(
                synchronize_session=False
            )
        DataSourceTable.query.filter_by(datasource_id=data_source.id).delete(synchronize_session=False)

        for table in preview_tables:
            table_obj = DataSourceTable(
                datasource_id=data_source.id,
                table_name=table['table_name'],
                table_comment=table['table_comment'],
            )
            imported_tables.append((table_obj, table))

        for table_obj, table in imported_tables:
            db.session.add(table_obj)
            db.session.flush()

            allowed_cols = selected_columns.get(table_obj.table_name)
            allowed_set = set(allowed_cols) if isinstance(allowed_cols, list) else None
            columns = table.get('columns') or []
            if allowed_set is not None:
                columns = [col for col in columns if col['column_name'] in allowed_set]

            valid_columns_by_table[table_obj.table_name] = {
                str(col['column_name']).strip()
                for col in columns
                if str(col.get('column_name') or '').strip()
            }

            for col in columns:
                db.session.add(
                    DataSourceColumn(
                        table_id=table_obj.id,
                        column_name=col['column_name'],
                        data_type=col['data_type'],
                        column_type=col.get('column_type'),
                        ordinal_position=int(col.get('ordinal_position') or 1),
                        is_nullable=bool(col.get('is_nullable', True)),
                        is_primary=bool(col.get('is_primary', False)),
                        column_comment=col.get('column_comment'),
                    )
                )

        DataSourceService._prune_relations_for_import(data_source, valid_columns_by_table)

        return {
            'table_count': len(imported_tables),
            'tables': [table_obj.to_dict(include_columns=True) for table_obj, _ in imported_tables],
        }
