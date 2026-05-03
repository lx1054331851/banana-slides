"""Prompt template management endpoints."""
import logging

from flask import Blueprint, request

from services.prompt_template_service import (
    get_prompt_template,
    list_prompt_templates,
    reset_prompt_template,
    save_prompt_template,
)
from utils import bad_request, error_response, success_response

logger = logging.getLogger(__name__)

prompt_template_bp = Blueprint('prompt_templates', __name__, url_prefix='/api/prompt-templates')


@prompt_template_bp.route('', methods=['GET'])
def list_templates():
    """GET /api/prompt-templates - list editable prompt templates."""
    try:
        return success_response({'templates': list_prompt_templates()})
    except Exception as exc:
        logger.error("list prompt templates failed: %s", exc, exc_info=True)
        return error_response('PROMPT_TEMPLATE_ERROR', str(exc), 500)


@prompt_template_bp.route('/<string:key>', methods=['GET'])
def get_template(key: str):
    """GET /api/prompt-templates/<key> - return one prompt template."""
    try:
        return success_response(get_prompt_template(key))
    except KeyError:
        return error_response('PROMPT_TEMPLATE_NOT_FOUND', 'Prompt template not found', 404)
    except Exception as exc:
        logger.error("get prompt template failed: %s", exc, exc_info=True)
        return error_response('PROMPT_TEMPLATE_ERROR', str(exc), 500)


@prompt_template_bp.route('/<string:key>', methods=['PUT'])
def update_template(key: str):
    """PUT /api/prompt-templates/<key> - save a custom prompt override."""
    try:
        data = request.get_json() or {}
        if 'custom_content' not in data:
            return bad_request('custom_content is required')
        custom_content = str(data.get('custom_content') or '')
        enabled = bool(data.get('enabled', False))
        return success_response(save_prompt_template(key, custom_content, enabled))
    except KeyError:
        return error_response('PROMPT_TEMPLATE_NOT_FOUND', 'Prompt template not found', 404)
    except ValueError as exc:
        return bad_request(str(exc))
    except Exception as exc:
        logger.error("update prompt template failed: %s", exc, exc_info=True)
        return error_response('PROMPT_TEMPLATE_ERROR', str(exc), 500)


@prompt_template_bp.route('/<string:key>/reset', methods=['POST'])
def reset_template(key: str):
    """POST /api/prompt-templates/<key>/reset - restore default prompt behavior."""
    try:
        return success_response(reset_prompt_template(key))
    except KeyError:
        return error_response('PROMPT_TEMPLATE_NOT_FOUND', 'Prompt template not found', 404)
    except Exception as exc:
        logger.error("reset prompt template failed: %s", exc, exc_info=True)
        return error_response('PROMPT_TEMPLATE_ERROR', str(exc), 500)
