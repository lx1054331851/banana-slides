"""
Style Library Controller - global style templates & presets (no user system)
"""
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from flask import Blueprint, request, current_app
from werkzeug.utils import secure_filename

from models import db, StyleTemplate, StylePreset, PresetTemplate, Task
from services import FileService
from services.provider_routing import resolve_routing_bundle
from services.task_manager import task_manager
from services.style_preview_service import generate_style_preset_task, regenerate_style_preset_image_task
from utils import success_response, error_response, not_found, bad_request, allowed_file

logger = logging.getLogger(__name__)

style_library_bp = Blueprint('style_library', __name__, url_prefix='/api')
_PREVIEW_IMAGE_KEYS = ('cover_url', 'toc_url', 'detail_url', 'ending_url')
_STYLE_PRESET_TASK_TYPES = ('STYLE_PRESET_GENERATE', 'STYLE_PRESET_IMAGE_REGENERATE')
_RUNNING_TASK_STATUSES = ('PENDING', 'PROCESSING', 'RUNNING')


def _validate_json_text(text: str):
    if text is None:
        raise ValueError("JSON text is required")
    s = (text or "").strip()
    if not s:
        raise ValueError("JSON text is required")
    return json.loads(s)


def _normalize_preview_images_payload(payload):
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        raise ValueError("preview_images must be an object")
    normalized = {}
    for key in _PREVIEW_IMAGE_KEYS:
        normalized[key] = str(payload.get(key) or '').strip()
    return normalized


def _extract_relative_style_preview_path(url: str) -> str:
    parsed = urlparse(url or "")
    path = parsed.path or ""
    # /files/{project_id}/style-previews/{rec_id}/{filename}
    m = re.match(r'^/files/([^/]+)/style-previews/([^/]+)/([^/]+)$', path)
    if not m:
        raise ValueError("preview_images URLs must point to /files/{project_id}/style-previews/{rec_id}/{filename}")
    project_id, rec_id, raw_filename = m.groups()
    filename = secure_filename(raw_filename)
    if not filename:
        raise ValueError("Invalid preview image filename")
    return f"{project_id}/style-previews/{rec_id}/{filename}"


@style_library_bp.route('/style-templates', methods=['GET'])
def list_style_templates():
    """
    GET /api/style-templates - list style template skeletons
    """
    try:
        templates = StyleTemplate.query.order_by(StyleTemplate.created_at.desc()).all()
        return success_response({'templates': [t.to_dict() for t in templates]})
    except Exception as e:
        logger.error(f"list_style_templates failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/style-templates', methods=['POST'])
def create_style_template():
    """
    POST /api/style-templates
    Body: { name?: string, template_json: string }
    """
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip() or None
        template_json_text = (data.get('template_json') or '').strip()
        try:
            _validate_json_text(template_json_text)
        except Exception as e:
            return bad_request(f"template_json must be valid JSON: {str(e)}")

        obj = StyleTemplate(name=name, template_json=template_json_text)
        db.session.add(obj)
        db.session.commit()
        return success_response(obj.to_dict(), status_code=201)
    except Exception as e:
        db.session.rollback()
        logger.error(f"create_style_template failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/style-templates/<template_id>', methods=['DELETE'])
def delete_style_template(template_id: str):
    """
    DELETE /api/style-templates/{id}
    """
    try:
        obj = StyleTemplate.query.get(template_id)
        if not obj:
            return not_found('StyleTemplate')
        db.session.delete(obj)
        db.session.commit()
        return success_response(message="StyleTemplate deleted successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"delete_style_template failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


def _validate_preview_key(preview_key: str) -> str:
    normalized = secure_filename(str(preview_key or '').strip().lower())
    if normalized not in _PREVIEW_IMAGE_KEYS:
        raise ValueError('preview_key must be one of cover_url/toc_url/detail_url/ending_url')
    return normalized


def _recover_stale_style_task(task: Task) -> None:
    if task.status not in _RUNNING_TASK_STATUSES or task.completed_at is not None:
        return

    fail_reason = None
    if not task_manager.is_task_active(task.id):
        fail_reason = 'Task is not active. The server may have restarted or the worker crashed.'
    else:
        stale_timeout = int(current_app.config.get('TASK_STALE_TIMEOUT_SECONDS', 1800) or 0)
        if stale_timeout > 0 and task.created_at:
            running_seconds = int((datetime.utcnow() - task.created_at).total_seconds())
            if running_seconds > stale_timeout:
                fail_reason = (
                    f'Task exceeded maximum runtime ({stale_timeout}s). '
                    'This usually indicates an upstream model/network timeout.'
                )

    if not fail_reason:
        return

    progress = task.get_progress() or {}
    progress['stage'] = 'failed'
    progress['current_step'] = 'failed'
    task.set_progress(progress)
    task.status = 'FAILED'
    task.error_message = task.error_message or fail_reason
    task.completed_at = datetime.utcnow()
    db.session.commit()


@style_library_bp.route('/style-presets', methods=['GET'])
def list_style_presets():
    """
    GET /api/style-presets - list style presets
    """
    try:
        presets = StylePreset.query.order_by(StylePreset.updated_at.desc(), StylePreset.created_at.desc()).all()
        return success_response({'presets': [p.to_dict() for p in presets]})
    except Exception as e:
        logger.error(f"list_style_presets failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/style-presets/tasks', methods=['GET'])
def list_style_preset_tasks():
    """
    GET /api/style-presets/tasks - list active and recent failed style preset tasks
    """
    try:
        tasks = Task.query.filter(
            Task.project_id == 'global',
            Task.task_type.in_(_STYLE_PRESET_TASK_TYPES)
        ).order_by(Task.created_at.desc()).all()

        for task in tasks:
            _recover_stale_style_task(task)

        active_tasks = [task.to_dict() for task in tasks if task.status in _RUNNING_TASK_STATUSES]
        failed_tasks = [task.to_dict() for task in tasks if task.status == 'FAILED'][:10]
        return success_response({'tasks': active_tasks + failed_tasks})
    except Exception as e:
        logger.error(f"list_style_preset_tasks failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/style-presets/generate', methods=['POST'])
def generate_style_preset():
    """
    POST /api/style-presets/generate - generate a saved style preset from a JSON skeleton
    """
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip() or None
        template_json_text = (data.get('template_json') or '').strip()
        style_requirements = (data.get('style_requirements') or '').strip()
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        generation_override = data.get('generation_override') or {}
        if generation_override and not isinstance(generation_override, dict):
            return bad_request('generation_override must be an object')
        try:
            _validate_json_text(template_json_text)
        except Exception as e:
            return bad_request(f'template_json must be valid JSON: {str(e)}')

        try:
            routing_bundle = resolve_routing_bundle(project=None, generation_override=generation_override)
        except Exception as e:
            return bad_request(str(e))

        task = Task(project_id='global', task_type='STYLE_PRESET_GENERATE', status='PENDING')
        task.set_progress({
            'stage': 'json_generating',
            'current_step': 'queued',
            'total': 5,
            'completed': 0,
            'failed': 0,
            'template_json': template_json_text,
            'style_requirements': style_requirements,
            'preset_name': name or '',
            'preview_images': {},
        })
        db.session.add(task)
        db.session.commit()

        app = current_app._get_current_object()
        task_manager.submit_task(
            task.id,
            generate_style_preset_task,
            template_json_text,
            style_requirements,
            name,
            app,
            language,
            routing_bundle,
        )

        return success_response(task.to_dict(), status_code=202)
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_style_preset failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/style-presets/<preset_id>/preview-images/<preview_key>/regenerate', methods=['POST'])
def regenerate_style_preset_preview_image(preset_id: str, preview_key: str):
    """
    POST /api/style-presets/{preset_id}/preview-images/{preview_key}/regenerate - regenerate a single preset preview image
    """
    try:
        preset = StylePreset.query.get(preset_id)
        if not preset:
            return not_found('StylePreset')

        normalized_preview_key = _validate_preview_key(preview_key)
        data = request.get_json(silent=True) or {}
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        generation_override = data.get('generation_override') or {}
        if generation_override and not isinstance(generation_override, dict):
            return bad_request('generation_override must be an object')

        try:
            routing_bundle = resolve_routing_bundle(project=None, generation_override=generation_override)
        except Exception as e:
            return bad_request(str(e))

        task = Task(project_id='global', task_type='STYLE_PRESET_IMAGE_REGENERATE', status='PENDING')
        task.set_progress({
            'stage': 'single_preview_generating',
            'current_step': 'queued',
            'total': 1,
            'completed': 0,
            'failed': 0,
            'preset_id': preset_id,
            'preset_name': preset.name,
            'preview_key': normalized_preview_key,
            'preview_images': preset.get_preview_images(),
        })
        db.session.add(task)
        db.session.commit()

        app = current_app._get_current_object()
        task_manager.submit_task(
            task.id,
            regenerate_style_preset_image_task,
            preset_id,
            normalized_preview_key,
            app,
            language,
            routing_bundle,
        )

        return success_response(task.to_dict(), status_code=202)
    except ValueError as e:
        db.session.rollback()
        return bad_request(str(e))
    except Exception as e:
        db.session.rollback()
        logger.error(f"regenerate_style_preset_preview_image failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/style-presets', methods=['POST'])
def create_style_preset():
    """
    POST /api/style-presets
    Body: { name?: string, style_json: string, preview_images?: { cover_url?: string, ... } }
    """
    created_preset_id = None
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip() or None
        style_json_text = (data.get('style_json') or '').strip()
        preview_images_payload = data.get('preview_images')
        try:
            _validate_json_text(style_json_text)
        except Exception as e:
            return bad_request(f"style_json must be valid JSON: {str(e)}")
        try:
            normalized_preview_images = _normalize_preview_images_payload(preview_images_payload)
        except Exception as e:
            return bad_request(str(e))

        obj = StylePreset(name=name, style_json=style_json_text)
        db.session.add(obj)
        db.session.flush()
        created_preset_id = obj.id

        # Copy preview images into /uploads/style-presets/{preset_id}/
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        stored_preview_images = {k: '' for k in _PREVIEW_IMAGE_KEYS}
        for key, source_url in normalized_preview_images.items():
            if not source_url:
                continue
            source_relative_path = _extract_relative_style_preview_path(source_url)
            slide_type = key.replace('_url', '')
            dest_relative_path = file_service.save_style_preset_preview_image_from_relative(
                source_relative_path=source_relative_path,
                preset_id=obj.id,
                slide_type=slide_type
            )
            filename = Path(dest_relative_path).name
            stored_preview_images[key] = f"/files/style-presets/{obj.id}/{filename}"
        obj.preview_images_json = json.dumps(stored_preview_images, ensure_ascii=False)

        db.session.commit()
        return success_response(obj.to_dict(), status_code=201)
    except ValueError as e:
        db.session.rollback()
        if created_preset_id:
            try:
                FileService(current_app.config['UPLOAD_FOLDER']).delete_style_preset_files(created_preset_id)
            except Exception:
                pass
        return bad_request(str(e))
    except Exception as e:
        db.session.rollback()
        if created_preset_id:
            try:
                FileService(current_app.config['UPLOAD_FOLDER']).delete_style_preset_files(created_preset_id)
            except Exception:
                pass
        logger.error(f"create_style_preset failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/style-presets/<preset_id>', methods=['DELETE'])
def delete_style_preset(preset_id: str):
    """
    DELETE /api/style-presets/{id}
    """
    try:
        obj = StylePreset.query.get(preset_id)
        if not obj:
            return not_found('StylePreset')
        db.session.delete(obj)
        db.session.commit()
        try:
            FileService(current_app.config['UPLOAD_FOLDER']).delete_style_preset_files(preset_id)
        except Exception as cleanup_error:
            logger.warning(f"delete_style_preset cleanup failed: {cleanup_error}")
        return success_response(message="StylePreset deleted successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"delete_style_preset failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/preset-templates', methods=['GET'])
def list_preset_templates():
    """
    GET /api/preset-templates - list globally managed preset templates
    """
    try:
        templates = PresetTemplate.query.order_by(PresetTemplate.created_at.desc()).all()
        return success_response({'templates': [t.to_dict() for t in templates]})
    except Exception as e:
        logger.error(f"list_preset_templates failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/preset-templates', methods=['POST'])
def create_preset_template():
    """
    POST /api/preset-templates - upload preset template image

    Content-Type: multipart/form-data
    Form:
      - template_image=@file.png
      - name?=Template name
    """
    created_template_id = None
    try:
        if 'template_image' not in request.files:
            return bad_request("No file uploaded")

        file = request.files['template_image']
        if file.filename == '':
            return bad_request("No file selected")

        if not allowed_file(file.filename, current_app.config['ALLOWED_EXTENSIONS']):
            return bad_request("Invalid file type. Allowed types: png, jpg, jpeg, gif, webp")

        name = (request.form.get('name') or '').strip() or None

        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        import uuid
        template_id = str(uuid.uuid4())
        created_template_id = template_id
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        file_path = file_service.save_preset_template(file, template_id)
        thumb_path = file_service.save_preset_template_thumbnail(template_id, file_path)

        obj = PresetTemplate(
            id=template_id,
            name=name,
            file_path=file_path,
            thumb_path=thumb_path,
            file_size=file_size
        )
        db.session.add(obj)
        db.session.commit()

        return success_response(obj.to_dict(), status_code=201)
    except Exception as e:
        db.session.rollback()
        if created_template_id:
            try:
                FileService(current_app.config['UPLOAD_FOLDER']).delete_preset_template(created_template_id)
            except Exception:
                pass
        logger.error(f"create_preset_template failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/preset-templates/<template_id>', methods=['DELETE'])
def delete_preset_template(template_id: str):
    """
    DELETE /api/preset-templates/{id}
    """
    try:
        obj = PresetTemplate.query.get(template_id)
        if not obj:
            return not_found('PresetTemplate')
        db.session.delete(obj)
        db.session.commit()
        try:
            FileService(current_app.config['UPLOAD_FOLDER']).delete_preset_template(template_id)
        except Exception as cleanup_error:
            logger.warning(f"delete_preset_template cleanup failed: {cleanup_error}")
        return success_response(message="PresetTemplate deleted successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"delete_preset_template failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)
