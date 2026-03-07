from types import SimpleNamespace

from models import DataSource, DataSourceColumn, DataSourceTable
from services.data_source_service import DataSourceService


def _build_datasource_with_tables() -> DataSource:
    source = DataSource(
        id='ds-test-1',
        name='ds-test',
        db_type='mysql',
        host='127.0.0.1',
        port=3306,
        username='readonly',
        password='readonly',
        database_name='analytics',
    )

    orders = DataSourceTable(
        id='tbl-orders',
        datasource_id=source.id,
        table_name='orders',
        table_comment='订单表',
    )
    orders.columns = [
        DataSourceColumn(
            id='col-orders-id',
            table_id=orders.id,
            column_name='id',
            data_type='bigint',
            ordinal_position=1,
            is_nullable=False,
            is_primary=True,
            column_comment='订单ID',
        ),
        DataSourceColumn(
            id='col-orders-user-id',
            table_id=orders.id,
            column_name='user_id',
            data_type='bigint',
            ordinal_position=2,
            is_nullable=False,
            is_primary=False,
            column_comment='用户ID',
        ),
    ]

    order_items = DataSourceTable(
        id='tbl-order-items',
        datasource_id=source.id,
        table_name='order_items',
        table_comment='订单明细',
    )
    order_items.columns = [
        DataSourceColumn(
            id='col-order-items-id',
            table_id=order_items.id,
            column_name='id',
            data_type='bigint',
            ordinal_position=1,
            is_nullable=False,
            is_primary=True,
            column_comment='明细ID',
        ),
        DataSourceColumn(
            id='col-order-items-order-id',
            table_id=order_items.id,
            column_name='order_id',
            data_type='bigint',
            ordinal_position=2,
            is_nullable=False,
            is_primary=False,
            column_comment='订单ID',
        ),
    ]

    source.tables = [orders, order_items]
    return source


def test_fetch_relation_candidates_prefers_llm(monkeypatch):
    source = _build_datasource_with_tables()
    llm_response = """
    {
      "relations": [
        {
          "source_table": "order_items",
          "source_column": "order_id",
          "target_table": "orders",
          "target_column": "id",
          "relation_type": "many_to_one",
          "confidence": 0.92,
          "reason": "命名规则匹配"
        }
      ]
    }
    """

    fake_ai = SimpleNamespace(
        text_provider=SimpleNamespace(generate_text=lambda _prompt, thinking_budget=0: llm_response)
    )
    monkeypatch.setattr('services.data_source_service.get_ai_service', lambda: fake_ai)

    def _should_not_call_fk(*_args, **_kwargs):
        raise AssertionError('FK fallback should not be called when LLM returns valid candidates')

    monkeypatch.setattr(DataSourceService, '_fetch_relation_candidates_by_fk', staticmethod(_should_not_call_fk))

    candidates = DataSourceService.fetch_relation_candidates(source, selected_tables=['orders', 'order_items'])
    assert len(candidates) == 1
    assert candidates[0]['source_table'] == 'order_items'
    assert candidates[0]['target_table'] == 'orders'
    assert candidates[0]['note'].startswith('llm_guess')


def test_fetch_relation_candidates_falls_back_when_llm_invalid(monkeypatch):
    source = _build_datasource_with_tables()
    llm_response = """
    {
      "relations": [
        {
          "source_table": "unknown_table",
          "source_column": "order_id",
          "target_table": "orders",
          "target_column": "id"
        }
      ]
    }
    """

    fake_ai = SimpleNamespace(
        text_provider=SimpleNamespace(generate_text=lambda _prompt, thinking_budget=0: llm_response)
    )
    monkeypatch.setattr('services.data_source_service.get_ai_service', lambda: fake_ai)

    fallback_candidates = [
        {
            'source_table': 'order_items',
            'source_column': 'order_id',
            'target_table': 'orders',
            'target_column': 'id',
            'relation_type': 'many_to_one',
            'origin': 'AUTO',
            'confidence': 0.95,
            'note': 'constraint=fk_order_items_orders',
        }
    ]
    monkeypatch.setattr(
        DataSourceService,
        '_fetch_relation_candidates_by_fk',
        staticmethod(lambda *_args, **_kwargs: fallback_candidates),
    )

    candidates = DataSourceService.fetch_relation_candidates(source, selected_tables=['orders', 'order_items'])
    assert candidates == fallback_candidates


def test_fetch_relation_candidates_falls_back_when_llm_raises(monkeypatch):
    source = _build_datasource_with_tables()

    def _raise_error(_prompt, thinking_budget=0):
        raise RuntimeError('llm unavailable')

    fake_ai = SimpleNamespace(
        text_provider=SimpleNamespace(generate_text=_raise_error)
    )
    monkeypatch.setattr('services.data_source_service.get_ai_service', lambda: fake_ai)

    fallback_candidates = [
        {
            'source_table': 'order_items',
            'source_column': 'order_id',
            'target_table': 'orders',
            'target_column': 'id',
            'relation_type': 'many_to_one',
            'origin': 'AUTO',
            'confidence': 0.95,
            'note': 'constraint=fk_order_items_orders',
        }
    ]
    monkeypatch.setattr(
        DataSourceService,
        '_fetch_relation_candidates_by_fk',
        staticmethod(lambda *_args, **_kwargs: fallback_candidates),
    )

    candidates = DataSourceService.fetch_relation_candidates(source, selected_tables=['orders', 'order_items'])
    assert candidates == fallback_candidates
