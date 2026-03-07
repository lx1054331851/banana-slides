"""DB analysis workflow service (SQL generation, execution, interaction schema)."""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import text

from models import DataSource, DbAnalysisRound, DbAnalysisSession
from services.ai_service_manager import get_ai_service
from services.data_source_service import DataSourceService

logger = logging.getLogger(__name__)

_ALLOWED_QUESTION_TYPES = {'date_range', 'single_select', 'multi_select', 'text_input'}


class DbAnalysisService:
    """Core service for db analysis mode."""

    MAX_ROWS = 20
    MAX_COLS = 8
    MAX_QUERY_TIME_MS = 15000

    @staticmethod
    def _serialize_value(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, bytes):
            try:
                return value.decode('utf-8', errors='ignore')
            except Exception:
                return str(value)
        return value

    @staticmethod
    def _extract_json(text_resp: str) -> dict:
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
    def _schema_summary(datasource: DataSource, max_tables: int = 30, max_cols: int = 20) -> str:
        lines = []
        tables = sorted(datasource.tables, key=lambda t: t.table_name)[:max_tables]
        for table in tables:
            cols = table.columns[:max_cols]
            cols_desc = ', '.join([f"{col.column_name}({col.data_type})" for col in cols])
            lines.append(f"- {table.table_name}: {cols_desc}")
        active_relations = [relation for relation in datasource.relations if relation.is_active]
        if active_relations:
            lines.append('')
            lines.append('关系定义（优先按以下关系做 JOIN）：')
            for relation in active_relations[:80]:
                lines.append(
                    f"- {relation.source_table}.{relation.source_column} = "
                    f"{relation.target_table}.{relation.target_column} "
                    f"[{relation.relation_type}]"
                )
        return '\n'.join(lines)

    @staticmethod
    def validate_safe_sql(sql: str) -> str:
        if not sql or not str(sql).strip():
            raise ValueError('Generated SQL is empty')

        normalized = str(sql).strip()
        normalized = normalized.rstrip(';').strip()

        lower = normalized.lower()
        if not (lower.startswith('select') or lower.startswith('with')):
            raise ValueError('Only SELECT queries are allowed')

        # Hard-block high-risk patterns and write operations
        forbidden_patterns = [
            r'\binsert\b',
            r'\bupdate\b',
            r'\bdelete\b',
            r'\bdrop\b',
            r'\balter\b',
            r'\btruncate\b',
            r'\bcreate\b',
            r'\breplace\b',
            r'\bgrant\b',
            r'\brevoke\b',
            r'\bcall\b',
            r'\binto\s+outfile\b',
            r'\bload\s+data\b',
            r'\bunion\s+select\b\s+.*\binto\b',
        ]

        for pattern in forbidden_patterns:
            if re.search(pattern, lower):
                raise ValueError(f'Unsafe SQL pattern detected: {pattern}')

        # No multi-statement SQL
        if ';' in normalized:
            raise ValueError('Multiple SQL statements are not allowed')

        # Keep comments out for safety and simpler parsing
        if '--' in normalized or '/*' in normalized or '*/' in normalized:
            raise ValueError('SQL comments are not allowed')

        return normalized

    @classmethod
    def execute_sql(cls, datasource: DataSource, sql: str) -> dict:
        safe_sql = cls.validate_safe_sql(sql)
        wrapped_sql = f"SELECT * FROM ({safe_sql}) AS banana_sub LIMIT {cls.MAX_ROWS + 1}"

        engine = DataSourceService.create_engine(datasource)
        try:
            with engine.connect() as conn:
                # MAX_EXECUTION_TIME is MySQL-specific and may fail on old versions/managed engines.
                # Keep workflow running if this guard cannot be applied.
                try:
                    conn.execute(text(f'SET SESSION MAX_EXECUTION_TIME = {cls.MAX_QUERY_TIME_MS}'))
                except Exception as exc:
                    logger.debug('Skip MAX_EXECUTION_TIME setup: %s', exc)

                result = conn.execute(text(wrapped_sql))
                column_names = list(result.keys())
                fetched_rows = result.fetchall()
        finally:
            engine.dispose()

        if not fetched_rows:
            raise ValueError('Query returned no data')

        truncated_rows = len(fetched_rows) > cls.MAX_ROWS
        output_rows = fetched_rows[:cls.MAX_ROWS]

        truncated_cols = len(column_names) > cls.MAX_COLS
        output_cols = column_names[:cls.MAX_COLS]

        rows = []
        for row in output_rows:
            mapping = row._mapping
            rows.append({col: cls._serialize_value(mapping[col]) for col in output_cols})

        return {
            'columns': output_cols,
            'rows': rows,
            'truncated_rows': truncated_rows,
            'truncated_cols': truncated_cols,
        }

    @staticmethod
    def _default_plan(datasource: DataSource, round_number: int) -> dict:
        table_name = datasource.tables[0].table_name if datasource.tables else None
        if not table_name:
            sql = 'SELECT 1 AS sample_value'
            title = f'第{round_number}页：数据连通性检查'
        else:
            sql = f"SELECT * FROM `{table_name}`"
            title = f'第{round_number}页：{table_name} 数据概览'

        return {
            'page_title': title,
            'sql': sql,
            'sql_reason': '回退到默认查询方案，优先确保流程可继续。',
            'key_findings_markdown': '',
            'next_dimensions': ['时间趋势', '地区分布', '渠道表现'],
            'questions': [],
        }

    @staticmethod
    def _normalize_questions(raw_questions: Any, next_dimensions: list[str]) -> list[dict]:
        questions: list[dict] = []
        if isinstance(raw_questions, list):
            for item in raw_questions:
                if not isinstance(item, dict):
                    continue
                q_type = str(item.get('type') or '').strip()
                if q_type not in _ALLOWED_QUESTION_TYPES:
                    continue
                question = {
                    'id': str(item.get('id') or '').strip() or f"q_{len(questions) + 1}",
                    'label': str(item.get('label') or '').strip() or '请补充此项信息',
                    'type': q_type,
                    'required': bool(item.get('required', False)),
                    'options': item.get('options') if isinstance(item.get('options'), list) else [],
                    'placeholder': str(item.get('placeholder') or '').strip(),
                    'reason': str(item.get('reason') or '').strip(),
                }
                questions.append(question)

        # Ensure there is always a required next-dimension selector
        if not any(question['id'] == 'next_dimension' for question in questions):
            questions.insert(
                0,
                {
                    'id': 'next_dimension',
                    'label': '下一页重点分析哪个维度？',
                    'type': 'single_select',
                    'required': True,
                    'options': next_dimensions[:3],
                    'placeholder': '',
                    'reason': '用于确定下一页分析方向。',
                },
            )

        return questions

    @staticmethod
    def _build_prompt(
        session_obj: DbAnalysisSession,
        datasource: DataSource,
        round_number: int,
        previous_round: DbAnalysisRound | None,
        previous_answers: dict | None,
    ) -> str:
        schema_summary = DbAnalysisService._schema_summary(datasource)
        previous_section = ''
        if previous_round is not None:
            previous_section = (
                '\n上一次分析结果：\n'
                f"- 页面标题：{previous_round.page_title}\n"
                f"- SQL：{previous_round.sql_final}\n"
                f"- 结论：{previous_round.key_findings or ''}\n"
                f"- 用户补充：{json.dumps(previous_answers or {}, ensure_ascii=False)}\n"
            )

        return f"""
你是资深数据分析顾问，需要为一个PPT分析项目生成下一页的查询与结论草案。

项目背景：{session_obj.business_context}
分析目标：{session_obj.analysis_goal}
当前轮次：第{round_number}轮

可用数据表结构：
{schema_summary}
{previous_section}

约束：
1) 只允许输出单条 SELECT 查询（可含 JOIN/GROUP BY/ORDER BY）。
2) 不允许输出写操作或多语句。
3) 结果页必须包含：页面标题、SQL、关键结论、下一步维度建议。
4) 下一步维度建议请给3个。
5) 如果信息不足，请给出结构化提问（支持 date_range/single_select/multi_select/text_input）。

请严格输出JSON对象，字段结构如下：
{{
  "page_title": "",
  "sql": "",
  "sql_reason": "",
  "key_findings_markdown": "",
  "next_dimensions": ["", "", ""],
  "questions": [
    {{
      "id": "",
      "label": "",
      "type": "date_range|single_select|multi_select|text_input",
      "required": true,
      "options": [""],
      "placeholder": "",
      "reason": ""
    }}
  ]
}}
""".strip()

    @staticmethod
    def _build_rewrite_prompt(sql: str, error_message: str, schema_summary: str) -> str:
        return f"""
你需要修复一条数据库查询语句，要求仍为单条只读 SELECT 查询。

原SQL：{sql}
执行错误：{error_message}
可用表结构：
{schema_summary}

请只输出JSON：
{{"sql": "...", "rewrite_reason": "..."}}
""".strip()

    @staticmethod
    def _build_default_findings(result_data: dict) -> str:
        row_count = len(result_data.get('rows') or [])
        col_count = len(result_data.get('columns') or [])
        columns = ', '.join(result_data.get('columns') or [])
        return (
            f"- 本页返回 **{row_count}** 行、**{col_count}** 列数据。\n"
            f"- 当前字段包括：{columns}。\n"
            '- 建议结合业务目标继续分维度下钻。'
        )

    @classmethod
    def _generate_plan_with_llm(
        cls,
        session_obj: DbAnalysisSession,
        datasource: DataSource,
        round_number: int,
        previous_round: DbAnalysisRound | None,
        previous_answers: dict | None,
    ) -> dict:
        prompt = cls._build_prompt(session_obj, datasource, round_number, previous_round, previous_answers)

        try:
            ai_service = get_ai_service()
            response_text = ai_service.text_provider.generate_text(prompt, thinking_budget=256)
            parsed = cls._extract_json(response_text)
            if parsed:
                return parsed
        except Exception as exc:
            logger.warning('LLM plan generation failed, falling back: %s', exc, exc_info=True)

        return cls._default_plan(datasource, round_number)

    @classmethod
    def _rewrite_sql_once(cls, datasource: DataSource, sql: str, error_message: str) -> tuple[str, str]:
        schema_summary = cls._schema_summary(datasource)
        prompt = cls._build_rewrite_prompt(sql, error_message, schema_summary)

        try:
            ai_service = get_ai_service()
            response_text = ai_service.text_provider.generate_text(prompt, thinking_budget=128)
            parsed = cls._extract_json(response_text)
            rewritten_sql = str(parsed.get('sql') or '').strip()
            rewrite_reason = str(parsed.get('rewrite_reason') or '').strip() or '自动改写 SQL 以修复执行异常。'
            if rewritten_sql:
                return rewritten_sql, rewrite_reason
        except Exception as exc:
            logger.warning('SQL rewrite generation failed: %s', exc, exc_info=True)

        table_name = datasource.tables[0].table_name if datasource.tables else None
        fallback_sql = f"SELECT * FROM `{table_name}`" if table_name else 'SELECT 1 AS sample_value'
        return fallback_sql, '自动改写失败，回退到默认可执行查询。'

    @classmethod
    def validate_answers(cls, round_obj: DbAnalysisRound, answers: dict) -> None:
        schema = round_obj.get_interaction_schema()
        if not schema:
            return

        for question in schema:
            q_id = question.get('id')
            q_type = question.get('type')
            required = bool(question.get('required'))
            value = answers.get(q_id)

            def _is_empty(v):
                if v is None:
                    return True
                if isinstance(v, str):
                    return not v.strip()
                if isinstance(v, list):
                    return len(v) == 0
                if isinstance(v, dict):
                    return len(v) == 0
                return False

            if required and _is_empty(value):
                raise ValueError(f'Missing required answer: {q_id}')

            if _is_empty(value):
                continue

            if q_type == 'date_range':
                if not isinstance(value, dict) or not value.get('start') or not value.get('end'):
                    raise ValueError(f'Invalid date_range answer for {q_id}')
            elif q_type == 'single_select':
                if not isinstance(value, str):
                    raise ValueError(f'Invalid single_select answer for {q_id}')
                options = question.get('options') if isinstance(question.get('options'), list) else []
                if options and value not in options:
                    raise ValueError(f'Answer for {q_id} is not in allowed options')
            elif q_type == 'multi_select':
                if not isinstance(value, list):
                    raise ValueError(f'Invalid multi_select answer for {q_id}')
                options = question.get('options') if isinstance(question.get('options'), list) else []
                if options and any(item not in options for item in value):
                    raise ValueError(f'Answer for {q_id} contains values outside allowed options')
            elif q_type == 'text_input':
                if not isinstance(value, str):
                    raise ValueError(f'Invalid text_input answer for {q_id}')

    @classmethod
    def generate_round(
        cls,
        session_obj: DbAnalysisSession,
        previous_round: DbAnalysisRound | None = None,
        previous_answers: dict | None = None,
    ) -> DbAnalysisRound:
        datasource = session_obj.datasource
        if datasource is None:
            raise ValueError('Session datasource is missing')

        round_number = 1 if previous_round is None else previous_round.round_number + 1

        plan = cls._generate_plan_with_llm(
            session_obj=session_obj,
            datasource=datasource,
            round_number=round_number,
            previous_round=previous_round,
            previous_answers=previous_answers,
        )

        page_title = str(plan.get('page_title') or '').strip() or f'第{round_number}页：数据分析'
        sql_draft = str(plan.get('sql') or '').strip()
        sql_final = sql_draft
        sql_rewrite_reason = ''

        next_dimensions = plan.get('next_dimensions') if isinstance(plan.get('next_dimensions'), list) else []
        next_dimensions = [str(item).strip() for item in next_dimensions if str(item).strip()]
        if len(next_dimensions) < 3:
            defaults = ['时间趋势', '地区分布', '渠道表现']
            for item in defaults:
                if item not in next_dimensions:
                    next_dimensions.append(item)
                if len(next_dimensions) >= 3:
                    break

        questions = cls._normalize_questions(plan.get('questions'), next_dimensions)

        # Execute SQL with one auto-rewrite fallback.
        query_error = None
        result_data = {'columns': [], 'rows': []}
        try:
            result_data = cls.execute_sql(datasource, sql_final)
        except Exception as exc:
            query_error = str(exc)
            rewritten_sql, rewrite_reason = cls._rewrite_sql_once(datasource, sql_final, query_error)
            sql_rewrite_reason = rewrite_reason
            sql_final = rewritten_sql
            result_data = cls.execute_sql(datasource, sql_final)

        key_findings = str(plan.get('key_findings_markdown') or '').strip()
        if not key_findings:
            key_findings = cls._build_default_findings(result_data)

        round_obj = DbAnalysisRound(
            session_id=session_obj.id,
            round_number=round_number,
            page_title=page_title,
            sql_draft=sql_draft,
            sql_final=sql_final,
            sql_rewrite_reason=sql_rewrite_reason or str(plan.get('sql_reason') or '').strip() or None,
            query_error=query_error,
            key_findings=key_findings,
            status='WAITING_INPUT',
        )
        round_obj.set_query_result(result_data)
        round_obj.set_next_dimension_candidates(next_dimensions[:3])
        round_obj.set_interaction_schema(questions)

        return round_obj
