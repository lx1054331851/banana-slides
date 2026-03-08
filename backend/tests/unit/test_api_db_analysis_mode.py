"""
API tests for DB analysis mode workflow.
"""

from unittest.mock import patch

from models import db, DbAnalysisRound, DataSourceTable, DataSourceColumn, DataSourceRelation


def _mock_round(session_obj, previous_round=None, previous_answers=None):
    round_number = 1 if previous_round is None else previous_round.round_number + 1
    round_obj = DbAnalysisRound(
        session_id=session_obj.id,
        round_number=round_number,
        page_title=f'第{round_number}页：测试分析',
        sql_draft='SELECT 1 AS x',
        sql_final='SELECT 1 AS x',
        status='WAITING_INPUT',
    )
    round_obj.set_query_result({'columns': ['x'], 'rows': [{'x': round_number}]})
    round_obj.set_next_dimension_candidates(['时间趋势', '地区分布', '渠道表现'])
    round_obj.set_interaction_schema(
        [
            {
                'id': 'next_dimension',
                'label': '下一页重点分析哪个维度？',
                'type': 'single_select',
                'required': True,
                'options': ['时间趋势', '地区分布', '渠道表现'],
            }
        ]
    )
    return round_obj


def _create_datasource(client, name='db-analysis-test'):
    response = client.post(
        '/api/data-sources',
        json={
            'name': name,
            'host': '127.0.0.1',
            'port': 3306,
            'username': 'readonly_user',
            'password': 'readonly_password',
            'database_name': 'analytics_db',
        },
    )
    assert response.status_code == 201
    payload = response.get_json()
    assert payload['success'] is True
    return payload['data']['data_source']


def _seed_cached_schema(datasource_id: str) -> None:
    orders = DataSourceTable(datasource_id=datasource_id, table_name='orders', table_comment='订单')
    order_items = DataSourceTable(datasource_id=datasource_id, table_name='order_items', table_comment='订单明细')
    db.session.add_all([orders, order_items])
    db.session.flush()

    db.session.add_all([
        DataSourceColumn(table_id=orders.id, column_name='id', data_type='bigint', ordinal_position=1, is_primary=True),
        DataSourceColumn(table_id=orders.id, column_name='created_at', data_type='datetime', ordinal_position=2),
        DataSourceColumn(table_id=order_items.id, column_name='id', data_type='bigint', ordinal_position=1, is_primary=True),
        DataSourceColumn(table_id=order_items.id, column_name='order_id', data_type='bigint', ordinal_position=2),
    ])
    db.session.add(
        DataSourceRelation(
            datasource_id=datasource_id,
            source_table='order_items',
            source_column='order_id',
            target_table='orders',
            target_column='id',
            relation_type='many_to_one',
            origin='MANUAL',
        )
    )
    db.session.commit()


def test_start_db_analysis_project_success(client):
    datasource = _create_datasource(client, name='db-analysis-start')

    with patch('controllers.db_analysis_controller.DbAnalysisService.generate_round', side_effect=_mock_round):
        response = client.post(
            '/api/projects/db-analysis/start',
            json={
                'datasource_id': datasource['id'],
                'business_context': '测试业务背景',
                'analysis_goal': '测试分析目标',
            },
        )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['success'] is True
    data = payload['data']
    assert data['project']['creation_type'] == 'db_analysis'
    assert data['project']['datasource_id'] == datasource['id']
    assert data['session']['status'] == 'ACTIVE'
    assert len(data['session']['rounds']) == 1
    assert data['session']['rounds'][0]['round_number'] == 1


def test_start_db_analysis_response_includes_llm_debug_context(client):
    datasource = _create_datasource(client, name='db-analysis-start-debug')
    _seed_cached_schema(datasource['id'])

    with patch('controllers.db_analysis_controller.DbAnalysisService.generate_round', side_effect=_mock_round):
        response = client.post(
            '/api/projects/db-analysis/start',
            json={
                'datasource_id': datasource['id'],
                'business_context': '测试业务背景',
                'analysis_goal': '测试分析目标',
            },
        )

    assert response.status_code == 201
    payload = response.get_json()
    round_payload = payload['data']['session']['rounds'][0]
    llm_debug = round_payload['llm_debug']
    plan_prompt = llm_debug['plan_prompt']

    assert plan_prompt['datasource_context']['datasource']['id'] == datasource['id']
    assert plan_prompt['datasource_context']['datasource']['table_count'] == 2
    assert sorted(table['name'] for table in plan_prompt['datasource_context']['tables']) == ['order_items', 'orders']
    assert plan_prompt['datasource_context']['relations'][0]['join_sql'] == 'order_items.order_id = orders.id'
    assert '结构化数据源上下文' in plan_prompt['prompt_text']
    assert 'order_items.order_id = orders.id' in plan_prompt['prompt_text']
    assert llm_debug['rewrite_prompt'] is None


def test_db_analysis_state_returns_llm_debug_context(client):
    datasource = _create_datasource(client, name='db-analysis-state-debug')
    _seed_cached_schema(datasource['id'])

    with patch('controllers.db_analysis_controller.DbAnalysisService.generate_round', side_effect=_mock_round):
        start_resp = client.post(
            '/api/projects/db-analysis/start',
            json={
                'datasource_id': datasource['id'],
                'business_context': '测试业务背景',
                'analysis_goal': '测试分析目标',
            },
        )

    project_id = start_resp.get_json()['data']['project_id']
    response = client.get(f'/api/projects/{project_id}/db-analysis/state')

    assert response.status_code == 200
    payload = response.get_json()['data']
    round_payload = payload['session']['rounds'][0]
    plan_prompt = round_payload['llm_debug']['plan_prompt']

    assert payload['datasource']['id'] == datasource['id']
    assert plan_prompt['schema_summary']
    assert plan_prompt['datasource_context']['datasource']['database_name'] == 'analytics_db'
    assert '可用数据表结构（摘要）' in plan_prompt['prompt_text']


def test_db_analysis_requires_answer_before_next_round(client):
    datasource = _create_datasource(client, name='db-analysis-next')

    with patch('controllers.db_analysis_controller.DbAnalysisService.generate_round', side_effect=_mock_round):
        start_resp = client.post(
            '/api/projects/db-analysis/start',
            json={
                'datasource_id': datasource['id'],
                'business_context': '测试业务背景',
                'analysis_goal': '测试分析目标',
            },
        )

        start_data = start_resp.get_json()['data']
        project_id = start_data['project_id']
        first_round = start_data['session']['rounds'][0]

        blocked_resp = client.post(f'/api/projects/{project_id}/db-analysis/round/next', json={})
        assert blocked_resp.status_code == 400

        answer_resp = client.post(
            f"/api/projects/{project_id}/db-analysis/round/{first_round['id']}/answers",
            json={'answers': {'next_dimension': '时间趋势'}},
        )
        assert answer_resp.status_code == 200

        next_resp = client.post(f'/api/projects/{project_id}/db-analysis/round/next', json={})
        assert next_resp.status_code == 200
        next_payload = next_resp.get_json()
        assert next_payload['success'] is True
        assert next_payload['data']['round']['round_number'] == 2


def test_schema_preview_endpoint_supports_table_filter(client):
    datasource = _create_datasource(client, name='db-analysis-preview')

    fake_preview = [
        {
            'table_name': 'orders',
            'table_comment': '订单',
            'columns': [
                {'column_name': 'id', 'data_type': 'bigint', 'ordinal_position': 1},
            ],
        }
    ]

    with patch('controllers.datasource_controller.DataSourceService.fetch_schema_preview', return_value=fake_preview) as mock_preview:
        response = client.post(
            f"/api/data-sources/{datasource['id']}/schema-preview",
            json={'selected_tables': ['orders']},
        )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['data']['schema_tables'][0]['table_name'] == 'orders'
    assert mock_preview.call_count == 1
    assert mock_preview.call_args.kwargs.get('selected_tables') == ['orders']


def test_import_schema_endpoint_accepts_selected_columns(client):
    datasource = _create_datasource(client, name='db-analysis-import-filter')
    fake_import_result = {'table_count': 1, 'tables': []}

    with patch('controllers.datasource_controller.DataSourceService.import_schema', return_value=fake_import_result) as mock_import:
        response = client.post(
            f"/api/data-sources/{datasource['id']}/import-schema",
            json={
                'selected_tables': ['orders'],
                'selected_columns': {'orders': ['id', 'created_at']},
            },
        )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['data']['import_result']['table_count'] == 1
    assert mock_import.call_count == 1
    assert mock_import.call_args.kwargs.get('selected_tables') == ['orders']
    assert mock_import.call_args.kwargs.get('selected_columns') == {'orders': ['id', 'created_at']}


def test_suggest_relations_endpoint_upserts_candidates(client):
    datasource = _create_datasource(client, name='db-analysis-rel-suggest')
    candidates = [
        {
            'source_table': 'order_items',
            'source_column': 'order_id',
            'target_table': 'orders',
            'target_column': 'id',
            'relation_type': 'many_to_one',
            'origin': 'AUTO',
            'confidence': 0.95,
        }
    ]
    with patch('controllers.datasource_controller.DataSourceService.fetch_relation_candidates', return_value=candidates) as mock_fetch:
        response = client.post(
            f"/api/data-sources/{datasource['id']}/relations/suggest",
            json={'selected_tables': ['orders', 'order_items']},
        )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['data']['candidate_count'] == 1
    assert payload['data']['inserted_count'] == 1
    assert payload['data']['relations'][0]['source_table'] == 'order_items'
    assert payload['data']['used_tables'] == ['orders', 'order_items']
    assert mock_fetch.call_count == 1
    assert mock_fetch.call_args.kwargs.get('selected_tables') == ['orders', 'order_items']


def test_suggest_relations_endpoint_falls_back_to_imported_tables(client):
    datasource = _create_datasource(client, name='db-analysis-rel-suggest-imported')
    db.session.add(DataSourceTable(datasource_id=datasource['id'], table_name='orders', table_comment=''))
    db.session.add(DataSourceTable(datasource_id=datasource['id'], table_name='order_items', table_comment=''))
    db.session.commit()

    with patch('controllers.datasource_controller.DataSourceService.fetch_relation_candidates', return_value=[]) as mock_fetch:
        response = client.post(
            f"/api/data-sources/{datasource['id']}/relations/suggest",
            json={},
        )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert sorted(payload['data']['used_tables']) == ['order_items', 'orders']
    assert mock_fetch.call_count == 1
    assert sorted(mock_fetch.call_args.kwargs.get('selected_tables')) == ['order_items', 'orders']




def test_import_schema_endpoint_allows_clearing_cached_schema(client):
    datasource = _create_datasource(client, name='db-analysis-import-clear')
    preview_tables = [
        {
            'table_name': 'orders',
            'table_comment': '订单',
            'columns': [
                {'column_name': 'id', 'data_type': 'bigint', 'ordinal_position': 1},
                {'column_name': 'created_at', 'data_type': 'datetime', 'ordinal_position': 2},
            ],
        }
    ]

    def _preview_side_effect(_data_source, selected_tables=None):
        if selected_tables is not None and len(selected_tables) == 0:
            return []
        if selected_tables is None:
            return preview_tables
        selected_set = set(selected_tables)
        return [table for table in preview_tables if table['table_name'] in selected_set]

    with patch('services.data_source_service.DataSourceService.fetch_schema_preview', side_effect=_preview_side_effect):
        first_resp = client.post(
            f"/api/data-sources/{datasource['id']}/import-schema",
            json={
                'selected_tables': ['orders'],
                'selected_columns': {'orders': ['id', 'created_at']},
            },
        )
        assert first_resp.status_code == 200

        clear_resp = client.post(
            f"/api/data-sources/{datasource['id']}/import-schema",
            json={
                'selected_tables': [],
                'selected_columns': {},
            },
        )

    assert clear_resp.status_code == 200
    clear_payload = clear_resp.get_json()
    assert clear_payload['success'] is True
    assert clear_payload['data']['import_result']['table_count'] == 0
    assert clear_payload['data']['data_source']['schema_tables'] == []


def test_import_schema_prunes_relations_for_removed_tables_and_columns(client):
    datasource = _create_datasource(client, name='db-analysis-import-prune-relations')
    preview_tables = [
        {
            'table_name': 'orders',
            'table_comment': '订单',
            'columns': [
                {'column_name': 'id', 'data_type': 'bigint', 'ordinal_position': 1},
                {'column_name': 'created_at', 'data_type': 'datetime', 'ordinal_position': 2},
            ],
        },
        {
            'table_name': 'order_items',
            'table_comment': '订单明细',
            'columns': [
                {'column_name': 'id', 'data_type': 'bigint', 'ordinal_position': 1},
                {'column_name': 'order_id', 'data_type': 'bigint', 'ordinal_position': 2},
            ],
        },
    ]

    def _preview_side_effect(_data_source, selected_tables=None):
        if selected_tables is not None and len(selected_tables) == 0:
            return []
        if selected_tables is None:
            return preview_tables
        selected_set = set(selected_tables)
        return [table for table in preview_tables if table['table_name'] in selected_set]

    with patch('services.data_source_service.DataSourceService.fetch_schema_preview', side_effect=_preview_side_effect):
        import_resp = client.post(
            f"/api/data-sources/{datasource['id']}/import-schema",
            json={
                'selected_tables': ['orders', 'order_items'],
                'selected_columns': {
                    'orders': ['id', 'created_at'],
                    'order_items': ['id', 'order_id'],
                },
            },
        )
        assert import_resp.status_code == 200

        relation_resp = client.post(
            f"/api/data-sources/{datasource['id']}/relations",
            json={
                'source_table': 'order_items',
                'source_column': 'order_id',
                'target_table': 'orders',
                'target_column': 'id',
                'relation_type': 'many_to_one',
            },
        )
        assert relation_resp.status_code == 201

        prune_resp = client.post(
            f"/api/data-sources/{datasource['id']}/import-schema",
            json={
                'selected_tables': ['orders'],
                'selected_columns': {'orders': ['id']},
            },
        )

    assert prune_resp.status_code == 200
    list_resp = client.get(f"/api/data-sources/{datasource['id']}/relations")
    assert list_resp.status_code == 200
    list_payload = list_resp.get_json()
    assert list_payload['data']['relations'] == []


def test_cached_schema_mutation_removes_tables_locally_without_fetching_remote_schema(client):
    datasource = _create_datasource(client, name='db-analysis-local-delete-table')
    _seed_cached_schema(datasource['id'])

    with patch('controllers.datasource_controller.DataSourceService.fetch_schema_preview', side_effect=AssertionError('should not fetch remote schema')) as mock_preview:
        response = client.post(
            f"/api/data-sources/{datasource['id']}/cached-schema/mutate",
            json={'remove_tables': ['order_items']},
        )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['data']['mutation_result']['removed_tables'] == ['order_items']
    assert [table['table_name'] for table in payload['data']['data_source']['schema_tables']] == ['orders']
    assert payload['data']['data_source']['relations'] == []
    assert mock_preview.call_count == 0


def test_cached_schema_mutation_removes_columns_locally_and_drops_empty_tables(client):
    datasource = _create_datasource(client, name='db-analysis-local-delete-column')
    _seed_cached_schema(datasource['id'])

    with patch('controllers.datasource_controller.DataSourceService.fetch_schema_preview', side_effect=AssertionError('should not fetch remote schema')) as mock_preview:
        response = client.post(
            f"/api/data-sources/{datasource['id']}/cached-schema/mutate",
            json={
                'remove_columns': {
                    'orders': ['created_at'],
                    'order_items': ['id', 'order_id'],
                }
            },
        )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['data']['mutation_result']['removed_tables'] == ['order_items']
    assert payload['data']['mutation_result']['removed_columns'] == {
        'orders': ['created_at'],
        'order_items': ['id', 'order_id'],
    }
    schema_tables = payload['data']['data_source']['schema_tables']
    assert len(schema_tables) == 1
    assert schema_tables[0]['table_name'] == 'orders'
    assert [column['column_name'] for column in schema_tables[0]['columns']] == ['id']
    assert payload['data']['data_source']['relations'] == []
    assert mock_preview.call_count == 0

def test_manual_relation_create_and_delete(client):
    datasource = _create_datasource(client, name='db-analysis-rel-manual')
    create_resp = client.post(
        f"/api/data-sources/{datasource['id']}/relations",
        json={
            'source_table': 'sales',
            'source_column': 'customer_id',
            'target_table': 'customers',
            'target_column': 'id',
            'relation_type': 'many_to_one',
        },
    )
    assert create_resp.status_code == 201
    create_payload = create_resp.get_json()
    relation_id = create_payload['data']['relation']['id']

    list_resp = client.get(f"/api/data-sources/{datasource['id']}/relations")
    assert list_resp.status_code == 200
    list_payload = list_resp.get_json()
    assert len(list_payload['data']['relations']) == 1

    delete_resp = client.delete(f"/api/data-sources/{datasource['id']}/relations/{relation_id}")
    assert delete_resp.status_code == 200

    list_resp_2 = client.get(f"/api/data-sources/{datasource['id']}/relations")
    list_payload_2 = list_resp_2.get_json()
    assert len(list_payload_2['data']['relations']) == 0

def test_datasource_er_layout_can_be_saved_and_loaded(client):
    datasource = _create_datasource(client, name='db-analysis-er-layout')

    layout = {
        'positions': {
            'orders': {'x': 128, 'y': 64},
        },
        'sizes': {
            'orders': {'width': 320, 'height': 180},
        },
        'scrollTop': {
            'orders': 42,
        },
        'viewport': {'x': 144, 'y': 96, 'scale': 1.15},
        'panels': {'overviewOpen': True, 'relationsOpen': False},
    }

    update_resp = client.put(
        f"/api/data-sources/{datasource['id']}/er-layout",
        json={'er_layout': layout},
    )

    assert update_resp.status_code == 200
    update_payload = update_resp.get_json()
    assert update_payload['success'] is True
    assert update_payload['data']['er_layout'] == layout

    get_resp = client.get(f"/api/data-sources/{datasource['id']}")
    assert get_resp.status_code == 200
    get_payload = get_resp.get_json()
    assert get_payload['data']['data_source']['er_layout'] == layout
