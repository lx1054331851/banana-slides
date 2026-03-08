"""DB analysis workflow controller."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from flask import Blueprint, current_app, request
from werkzeug.utils import secure_filename

from models import db, DataSource, DbAnalysisSession, DbAnalysisRound, DbInteraction, Project
from services import FileService
from services.db_analysis_export_service import DbAnalysisExportService
from services.db_analysis_service import DbAnalysisService
from utils import bad_request, error_response, not_found, success_response

logger = logging.getLogger(__name__)

db_analysis_bp = Blueprint('db_analysis', __name__, url_prefix='/api/projects')


def _serialize_db_analysis_round(session_obj: DbAnalysisSession, round_obj: DbAnalysisRound) -> dict:
    payload = round_obj.to_dict(include_interactions=True)
    payload['llm_debug'] = DbAnalysisService.build_round_llm_debug(session_obj, round_obj)
    return payload


def _serialize_db_analysis_session(session_obj: DbAnalysisSession) -> dict:
    payload = session_obj.to_dict(include_rounds=False)
    payload['rounds'] = [_serialize_db_analysis_round(session_obj, round_obj) for round_obj in session_obj.rounds]
    return payload


def _get_session_by_project_id(project_id: str) -> DbAnalysisSession | None:
    return (
        DbAnalysisSession.query.filter_by(project_id=project_id)
        .order_by(DbAnalysisSession.created_at.desc())
        .first()
    )


@db_analysis_bp.route('/db-analysis/start', methods=['POST'])
def start_db_analysis():
    """Start a db_analysis project and generate the first round."""
    try:
        data = request.get_json() or {}
        datasource_id = data.get('datasource_id')
        business_context = str(data.get('business_context') or '').strip()
        analysis_goal = str(data.get('analysis_goal') or '').strip()

        if not datasource_id:
            return bad_request('datasource_id is required')
        if not business_context:
            return bad_request('business_context is required')
        if not analysis_goal:
            return bad_request('analysis_goal is required')

        datasource = DataSource.query.get(datasource_id)
        if not datasource:
            return not_found('DataSource')
        if not datasource.is_active:
            return bad_request('Selected data source is not active')

        project = Project(
            creation_type='db_analysis',
            idea_prompt=analysis_goal,
            description_text=business_context,
            datasource_id=datasource.id,
            status='DRAFT',
        )
        db.session.add(project)
        db.session.flush()

        session_obj = DbAnalysisSession(
            project_id=project.id,
            datasource_id=datasource.id,
            business_context=business_context,
            analysis_goal=analysis_goal,
            status='ACTIVE',
        )
        db.session.add(session_obj)
        db.session.flush()

        first_round = DbAnalysisService.generate_round(session_obj)
        db.session.add(first_round)
        db.session.commit()

        return success_response(
            {
                'project_id': project.id,
                'session': _serialize_db_analysis_session(session_obj),
                'project': project.to_dict(include_pages=False),
            },
            status_code=201,
        )
    except Exception as exc:
        db.session.rollback()
        logger.error('start_db_analysis failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@db_analysis_bp.route('/<project_id>/db-analysis/state', methods=['GET'])
def get_db_analysis_state(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        session_obj = _get_session_by_project_id(project_id)
        if not session_obj:
            return not_found('DbAnalysisSession')

        return success_response(
            {
                'project': project.to_dict(include_pages=False),
                'session': _serialize_db_analysis_session(session_obj),
                'datasource': session_obj.datasource.to_dict(include_schema=True) if session_obj.datasource else None,
            }
        )
    except Exception as exc:
        logger.error('get_db_analysis_state failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@db_analysis_bp.route('/<project_id>/db-analysis/round/<round_id>/answers', methods=['POST'])
def submit_db_analysis_answers(project_id, round_id):
    try:
        session_obj = _get_session_by_project_id(project_id)
        if not session_obj:
            return not_found('DbAnalysisSession')

        round_obj = DbAnalysisRound.query.filter_by(id=round_id, session_id=session_obj.id).first()
        if not round_obj:
            return not_found('DbAnalysisRound')

        data = request.get_json() or {}
        answers = data.get('answers')
        if not isinstance(answers, dict):
            return bad_request('answers must be an object')

        DbAnalysisService.validate_answers(round_obj, answers)

        round_obj.set_interaction_answers(answers)
        round_obj.status = 'READY'

        interaction = DbInteraction(
            round_id=round_obj.id,
            payload_json=json.dumps(answers, ensure_ascii=False),
        )
        db.session.add(interaction)
        db.session.commit()

        return success_response({'round': _serialize_db_analysis_round(session_obj, round_obj)})
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))
    except Exception as exc:
        db.session.rollback()
        logger.error('submit_db_analysis_answers failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@db_analysis_bp.route('/<project_id>/db-analysis/round/next', methods=['POST'])
def generate_next_db_analysis_round(project_id):
    try:
        session_obj = _get_session_by_project_id(project_id)
        if not session_obj:
            return not_found('DbAnalysisSession')
        if session_obj.status != 'ACTIVE':
            return bad_request('Session is not active')

        previous_round = (
            DbAnalysisRound.query.filter_by(session_id=session_obj.id)
            .order_by(DbAnalysisRound.round_number.desc())
            .first()
        )

        if previous_round:
            schema = previous_round.get_interaction_schema()
            if schema and previous_round.status != 'READY':
                return bad_request('Current round requires interaction answers before continuing')

        next_round = DbAnalysisService.generate_round(
            session_obj=session_obj,
            previous_round=previous_round,
            previous_answers=(previous_round.get_interaction_answers() if previous_round else None),
        )

        db.session.add(next_round)
        db.session.commit()

        return success_response({'round': _serialize_db_analysis_round(session_obj, next_round)})
    except Exception as exc:
        db.session.rollback()
        logger.error('generate_next_db_analysis_round failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@db_analysis_bp.route('/<project_id>/db-analysis/stop', methods=['POST'])
def stop_db_analysis(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        session_obj = _get_session_by_project_id(project_id)
        if not session_obj:
            return not_found('DbAnalysisSession')

        session_obj.status = 'STOPPED'
        session_obj.ended_at = datetime.utcnow()
        project.status = 'COMPLETED'
        db.session.commit()

        return success_response({'session': _serialize_db_analysis_session(session_obj), 'project': project.to_dict(include_pages=False)})
    except Exception as exc:
        db.session.rollback()
        logger.error('stop_db_analysis failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)


@db_analysis_bp.route('/<project_id>/db-analysis/export/editable-pptx', methods=['POST'])
def export_db_analysis_editable_pptx(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        session_obj = _get_session_by_project_id(project_id)
        if not session_obj:
            return not_found('DbAnalysisSession')

        rounds = DbAnalysisRound.query.filter_by(session_id=session_obj.id).order_by(DbAnalysisRound.round_number).all()
        if not rounds:
            return bad_request('No rounds to export')

        data = request.get_json() or {}
        filename = secure_filename(data.get('filename') or f'db_analysis_{project_id}.pptx')
        if not filename:
            filename = f'db_analysis_{project_id}.pptx'
        if not filename.lower().endswith('.pptx'):
            filename += '.pptx'

        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        exports_dir = file_service._get_exports_dir(project_id)
        output_path = str(exports_dir / filename)

        DbAnalysisExportService.create_editable_pptx(rounds, output_path, aspect_ratio=project.image_aspect_ratio or '16:9')

        download_path = f'/files/{project_id}/exports/{filename}'
        base_url = request.url_root.rstrip('/')
        return success_response(
            {
                'download_url': download_path,
                'download_url_absolute': f'{base_url}{download_path}',
            }
        )
    except Exception as exc:
        logger.error('export_db_analysis_editable_pptx failed: %s', exc, exc_info=True)
        return error_response('SERVER_ERROR', str(exc), 500)
