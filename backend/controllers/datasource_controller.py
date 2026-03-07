"""Data source management controller for DB analysis mode."""

from __future__ import annotations

import logging

from flask import Blueprint, request

from models import db, DataSource, DataSourceRelation
from services.data_source_service import DataSourceService
from utils import bad_request, error_response, not_found, success_response

logger = logging.getLogger(__name__)

datasource_bp = Blueprint('datasource', __name__, url_prefix='/api/data-sources')


def _parse_whitelist(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(',') if item.strip()]
    return []


def _parse_str_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _parse_selected_columns(value) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        return {}
    parsed: dict[str, list[str]] = {}
    for table_name, columns in value.items():
        table_key = str(table_name).strip()
        if not table_key:
            continue
        parsed[table_key] = _parse_str_list(columns)
    return parsed


def _parse_bool(value, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 'yes', 'y', 'on'}
    return bool(value)


@datasource_bp.route('', methods=['GET'])
def list_data_sources():
    try:
        sources = DataSource.query.order_by(DataSource.updated_at.desc()).all()
        data_sources = []
        for source in sources:
            payload = source.to_dict()
            payload['schema_tables'] = [table.to_dict(include_columns=False) for table in source.tables]
            data_sources.append(payload)
        return success_response({'data_sources': data_sources})
    except Exception as exc:
        logger.error('list_data_sources failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('', methods=['POST'])
def create_data_source():
    try:
        data = request.get_json() or {}
        required_fields = ['name', 'host', 'port', 'username', 'password', 'database_name']
        missing = [field for field in required_fields if not str(data.get(field) or '').strip()]
        if missing:
            return bad_request(f"Missing required fields: {', '.join(missing)}")

        if DataSource.query.filter_by(name=data['name'].strip()).first():
            return bad_request('Data source name already exists')

        source = DataSource(
            name=data['name'].strip(),
            db_type=(data.get('db_type') or 'mysql').strip().lower(),
            host=data['host'].strip(),
            port=int(data['port']),
            username=data['username'].strip(),
            password=data['password'],
            database_name=data['database_name'].strip(),
            is_active=bool(data.get('is_active', True)),
        )
        source.set_whitelist_tables(_parse_whitelist(data.get('whitelist_tables')))

        db.session.add(source)
        db.session.commit()

        return success_response({'data_source': source.to_dict()}, status_code=201)
    except Exception as exc:
        db.session.rollback()
        logger.error('create_data_source failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>', methods=['GET'])
def get_data_source(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')
        return success_response({'data_source': source.to_dict(include_schema=True)})
    except Exception as exc:
        logger.error('get_data_source failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>', methods=['PUT'])
def update_data_source(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')

        data = request.get_json() or {}

        if 'name' in data:
            name = (data.get('name') or '').strip()
            if not name:
                return bad_request('name cannot be empty')
            existing = DataSource.query.filter(DataSource.name == name, DataSource.id != datasource_id).first()
            if existing:
                return bad_request('Data source name already exists')
            source.name = name

        if 'db_type' in data:
            source.db_type = (data.get('db_type') or 'mysql').strip().lower()
        if 'host' in data:
            source.host = (data.get('host') or '').strip() or source.host
        if 'port' in data:
            source.port = int(data.get('port') or source.port)
        if 'username' in data:
            source.username = (data.get('username') or '').strip() or source.username
        if 'password' in data and str(data.get('password') or '').strip():
            source.password = data['password']
        if 'database_name' in data:
            source.database_name = (data.get('database_name') or '').strip() or source.database_name
        if 'is_active' in data:
            source.is_active = bool(data['is_active'])
        if 'whitelist_tables' in data:
            source.set_whitelist_tables(_parse_whitelist(data.get('whitelist_tables')))

        db.session.commit()
        return success_response({'data_source': source.to_dict(include_schema=True)})
    except Exception as exc:
        db.session.rollback()
        logger.error('update_data_source failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>', methods=['DELETE'])
def delete_data_source(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')

        db.session.delete(source)
        db.session.commit()
        return success_response({'message': 'Data source deleted'})
    except Exception as exc:
        db.session.rollback()
        logger.error('delete_data_source failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>/test', methods=['POST'])
def test_data_source(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')

        ok, message = DataSourceService.test_connection(source)
        if not ok:
            return error_response('CONNECTION_FAILED', message, 400)

        return success_response({'ok': True, 'message': message})
    except Exception as exc:
        logger.error('test_data_source failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>/schema-preview', methods=['POST'])
def preview_data_source_schema(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')

        data = request.get_json() or {}
        selected_tables = _parse_str_list(data.get('selected_tables'))
        preview_tables = DataSourceService.fetch_schema_preview(
            source,
            selected_tables=selected_tables if selected_tables else None,
        )
        return success_response({'schema_tables': preview_tables})
    except Exception as exc:
        logger.error('preview_data_source_schema failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>/import-schema', methods=['POST'])
def import_data_source_schema(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')

        data = request.get_json() or {}
        selected_tables = _parse_str_list(data.get('selected_tables')) if 'selected_tables' in data else None
        selected_columns = _parse_selected_columns(data.get('selected_columns')) if 'selected_columns' in data else None

        result = DataSourceService.import_schema(
            source,
            selected_tables=selected_tables,
            selected_columns=selected_columns or None,
        )
        db.session.commit()

        source = DataSource.query.get(datasource_id)
        return success_response({'import_result': result, 'data_source': source.to_dict(include_schema=True)})
    except Exception as exc:
        db.session.rollback()
        logger.error('import_data_source_schema failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>/relations', methods=['GET'])
def list_data_source_relations(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')
        relations = DataSourceRelation.query.filter_by(datasource_id=datasource_id).order_by(DataSourceRelation.created_at.desc()).all()
        return success_response({'relations': [relation.to_dict() for relation in relations]})
    except Exception as exc:
        logger.error('list_data_source_relations failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>/relations/suggest', methods=['POST'])
def suggest_data_source_relations(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')

        data = request.get_json() or {}
        selected_tables = _parse_str_list(data.get('selected_tables'))
        if not selected_tables:
            selected_tables = [table.table_name for table in source.tables]
        if not selected_tables:
            return bad_request('请先导入至少一张表，或指定 selected_tables 后再自动识别关系')

        candidates = DataSourceService.fetch_relation_candidates(
            source,
            selected_tables=selected_tables,
        )

        existing = DataSourceRelation.query.filter_by(datasource_id=datasource_id).all()
        existing_map = {
            (
                item.source_table,
                item.source_column,
                item.target_table,
                item.target_column,
            ): item
            for item in existing
        }

        inserted_count = 0
        updated_count = 0
        for candidate in candidates:
            key = (
                candidate['source_table'],
                candidate['source_column'],
                candidate['target_table'],
                candidate['target_column'],
            )
            if key in existing_map:
                rel = existing_map[key]
                rel.is_active = True
                rel.confidence = candidate.get('confidence')
                if rel.origin != 'MANUAL':
                    rel.origin = 'AUTO'
                    rel.relation_type = candidate.get('relation_type') or rel.relation_type
                    rel.note = candidate.get('note') or rel.note
                updated_count += 1
            else:
                db.session.add(
                    DataSourceRelation(
                        datasource_id=datasource_id,
                        source_table=candidate['source_table'],
                        source_column=candidate['source_column'],
                        target_table=candidate['target_table'],
                        target_column=candidate['target_column'],
                        relation_type=candidate.get('relation_type') or 'many_to_one',
                        origin='AUTO',
                        confidence=candidate.get('confidence'),
                        note=candidate.get('note'),
                        is_active=True,
                    )
                )
                inserted_count += 1

        db.session.commit()
        relations = DataSourceRelation.query.filter_by(datasource_id=datasource_id).order_by(DataSourceRelation.created_at.desc()).all()
        return success_response(
            {
                'relations': [relation.to_dict() for relation in relations],
                'used_tables': selected_tables,
                'candidate_count': len(candidates),
                'inserted_count': inserted_count,
                'updated_count': updated_count,
            }
        )
    except Exception as exc:
        db.session.rollback()
        logger.error('suggest_data_source_relations failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>/relations', methods=['POST'])
def create_data_source_relation(datasource_id):
    try:
        source = DataSource.query.get(datasource_id)
        if not source:
            return not_found('DataSource')

        data = request.get_json() or {}
        source_table = str(data.get('source_table') or '').strip()
        source_column = str(data.get('source_column') or '').strip()
        target_table = str(data.get('target_table') or '').strip()
        target_column = str(data.get('target_column') or '').strip()
        relation_type = str(data.get('relation_type') or 'many_to_one').strip() or 'many_to_one'
        note = str(data.get('note') or '').strip() or None

        if not source_table or not source_column or not target_table or not target_column:
            return bad_request('source_table/source_column/target_table/target_column are required')

        existing = DataSourceRelation.query.filter_by(
            datasource_id=datasource_id,
            source_table=source_table,
            source_column=source_column,
            target_table=target_table,
            target_column=target_column,
        ).first()
        if existing:
            existing.is_active = True
            existing.origin = 'MANUAL'
            existing.relation_type = relation_type
            existing.note = note
            existing.confidence = None
            db.session.commit()
            return success_response({'relation': existing.to_dict()})

        relation = DataSourceRelation(
            datasource_id=datasource_id,
            source_table=source_table,
            source_column=source_column,
            target_table=target_table,
            target_column=target_column,
            relation_type=relation_type,
            origin='MANUAL',
            confidence=None,
            note=note,
            is_active=True,
        )
        db.session.add(relation)
        db.session.commit()
        return success_response({'relation': relation.to_dict()}, status_code=201)
    except Exception as exc:
        db.session.rollback()
        logger.error('create_data_source_relation failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>/relations/<relation_id>', methods=['PUT'])
def update_data_source_relation(datasource_id, relation_id):
    try:
        relation = DataSourceRelation.query.filter_by(id=relation_id, datasource_id=datasource_id).first()
        if not relation:
            return not_found('DataSourceRelation')

        data = request.get_json() or {}
        if 'is_active' in data:
            relation.is_active = _parse_bool(data.get('is_active'), default=relation.is_active)
        if 'note' in data:
            relation.note = str(data.get('note') or '').strip() or None
        if 'relation_type' in data:
            relation.relation_type = str(data.get('relation_type') or '').strip() or relation.relation_type
        db.session.commit()
        return success_response({'relation': relation.to_dict()})
    except Exception as exc:
        db.session.rollback()
        logger.error('update_data_source_relation failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@datasource_bp.route('/<datasource_id>/relations/<relation_id>', methods=['DELETE'])
def delete_data_source_relation(datasource_id, relation_id):
    try:
        relation = DataSourceRelation.query.filter_by(id=relation_id, datasource_id=datasource_id).first()
        if not relation:
            return not_found('DataSourceRelation')
        db.session.delete(relation)
        db.session.commit()
        return success_response({'message': 'Relation deleted'})
    except Exception as exc:
        db.session.rollback()
        logger.error('delete_data_source_relation failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)
