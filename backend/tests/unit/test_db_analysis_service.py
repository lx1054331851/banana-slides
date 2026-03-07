"""
Unit tests for DB analysis workflow service.
"""

from types import SimpleNamespace

import pytest

from models import DbAnalysisRound
from services.db_analysis_service import DbAnalysisService


def _build_round_with_schema(schema):
    round_obj = DbAnalysisRound(
        session_id='session-test',
        round_number=1,
        page_title='Test',
        sql_final='SELECT 1',
        status='WAITING_INPUT',
    )
    round_obj.set_interaction_schema(schema)
    return round_obj


def test_validate_safe_sql_allows_select_and_with():
    assert DbAnalysisService.validate_safe_sql('SELECT * FROM orders;') == 'SELECT * FROM orders'
    assert (
        DbAnalysisService.validate_safe_sql('WITH cte AS (SELECT 1 AS id) SELECT * FROM cte')
        == 'WITH cte AS (SELECT 1 AS id) SELECT * FROM cte'
    )


@pytest.mark.parametrize(
    'sql',
    [
        'DELETE FROM orders',
        'UPDATE orders SET amount = 1',
        'SELECT * FROM orders; SELECT * FROM users',
        'SELECT * FROM orders -- comment',
        '/* test */ SELECT * FROM orders',
    ],
)
def test_validate_safe_sql_blocks_unsafe_patterns(sql):
    with pytest.raises(ValueError):
        DbAnalysisService.validate_safe_sql(sql)


def test_normalize_questions_injects_required_next_dimension():
    questions = DbAnalysisService._normalize_questions(
        raw_questions=[
            {
                'id': 'detail_note',
                'label': '补充说明',
                'type': 'text_input',
                'required': False,
            }
        ],
        next_dimensions=['维度A', '维度B', '维度C'],
    )

    assert questions[0]['id'] == 'next_dimension'
    assert questions[0]['type'] == 'single_select'
    assert questions[0]['required'] is True
    assert questions[0]['options'] == ['维度A', '维度B', '维度C']
    assert any(item['id'] == 'detail_note' for item in questions)


def test_validate_answers_checks_required_and_option_membership():
    round_obj = _build_round_with_schema(
        [
            {
                'id': 'next_dimension',
                'label': '下一步分析维度',
                'type': 'single_select',
                'required': True,
                'options': ['时间趋势', '地区分布', '渠道表现'],
            },
            {
                'id': 'regions',
                'label': '关注地区',
                'type': 'multi_select',
                'required': False,
                'options': ['华东', '华南', '华北'],
            },
        ]
    )

    with pytest.raises(ValueError, match='Missing required answer: next_dimension'):
        DbAnalysisService.validate_answers(round_obj, {})

    with pytest.raises(ValueError, match='not in allowed options'):
        DbAnalysisService.validate_answers(round_obj, {'next_dimension': '无效维度'})

    with pytest.raises(ValueError, match='contains values outside allowed options'):
        DbAnalysisService.validate_answers(round_obj, {'next_dimension': '时间趋势', 'regions': ['华东', '海外']})

    DbAnalysisService.validate_answers(round_obj, {'next_dimension': '地区分布', 'regions': ['华东', '华南']})


def test_schema_summary_includes_active_relations():
    datasource = SimpleNamespace(
        tables=[
            SimpleNamespace(
                table_name='orders',
                columns=[SimpleNamespace(column_name='id', data_type='bigint')],
            ),
            SimpleNamespace(
                table_name='order_items',
                columns=[SimpleNamespace(column_name='order_id', data_type='bigint')],
            ),
        ],
        relations=[
            SimpleNamespace(
                source_table='order_items',
                source_column='order_id',
                target_table='orders',
                target_column='id',
                relation_type='many_to_one',
                is_active=True,
            )
        ],
    )

    summary = DbAnalysisService._schema_summary(datasource)
    assert 'orders: id(bigint)' in summary
    assert 'order_items.order_id = orders.id' in summary
