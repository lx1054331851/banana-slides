"""
Style Library Controller - global style templates & presets (no user system)
"""
import json
import logging

from flask import Blueprint, request

from models import db, StyleTemplate, StylePreset
from utils import success_response, error_response, not_found, bad_request

logger = logging.getLogger(__name__)

style_library_bp = Blueprint('style_library', __name__, url_prefix='/api')


def _validate_json_text(text: str):
    if text is None:
        raise ValueError("JSON text is required")
    s = (text or "").strip()
    if not s:
        raise ValueError("JSON text is required")
    return json.loads(s)


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


@style_library_bp.route('/style-presets', methods=['GET'])
def list_style_presets():
    """
    GET /api/style-presets - list style presets
    """
    try:
        presets = StylePreset.query.order_by(StylePreset.created_at.desc()).all()
        return success_response({'presets': [p.to_dict() for p in presets]})
    except Exception as e:
        logger.error(f"list_style_presets failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@style_library_bp.route('/style-presets', methods=['POST'])
def create_style_preset():
    """
    POST /api/style-presets
    Body: { name?: string, style_json: string }
    """
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip() or None
        style_json_text = (data.get('style_json') or '').strip()
        try:
            _validate_json_text(style_json_text)
        except Exception as e:
            return bad_request(f"style_json must be valid JSON: {str(e)}")

        obj = StylePreset(name=name, style_json=style_json_text)
        db.session.add(obj)
        db.session.commit()
        return success_response(obj.to_dict(), status_code=201)
    except Exception as e:
        db.session.rollback()
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
        return success_response(message="StylePreset deleted successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"delete_style_preset failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)

