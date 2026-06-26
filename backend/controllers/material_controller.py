"""
Material Controller - handles standalone material image generation
"""
import json
from flask import Blueprint, request, current_app, send_file
from models import db, Project, Material, Task
from utils import success_response, error_response, not_found, bad_request
from utils.validators import normalize_aspect_ratio
from utils.aspect_ratio_policy import get_supported_aspect_ratios_for_model
from utils.image_resolution_policy import (
    get_project_default_image_resolution,
    resolve_effective_image_resolution,
)
from utils.text_normalization import normalize_user_text
from services import FileService
from services.ai_service_manager import get_ai_service
from services.ai_providers import get_caption_provider
from services.provider_routing import resolve_routing_bundle
from services.task_manager import task_manager, generate_material_image_task, process_material_image_task
from pathlib import Path
from werkzeug.utils import secure_filename
from typing import Optional
import tempfile
import shutil
import time
import zipfile
import io
import base64
import logging
import re
import struct
import uuid
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)

material_bp = Blueprint('materials', __name__, url_prefix='/api/projects')
material_global_bp = Blueprint('materials_global', __name__, url_prefix='/api/materials')

ALLOWED_MATERIAL_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'}
ALLOWED_ASPECT_RATIOS = frozenset({'16:9', '21:9', '4:3', '3:2', '5:4', '1:1', '4:5', '2:3', '3:4', '9:16'})
ALLOWED_MATERIAL_OPERATIONS = frozenset({'generate', 'edit_full', 'region_edit', 'erase_region'})
ALLOWED_REGION_APPLY_MODES = frozenset({'overlay_selection', 'replace_full'})
PIL_FORMAT_EXTENSIONS = {
    'PNG': '.png',
    'JPEG': '.jpg',
    'GIF': '.gif',
    'WEBP': '.webp',
    'BMP': '.bmp',
}


def _classify_caption_error(error: Exception) -> str:
    """Map caption generation failures to a stable error code for the frontend."""
    message = str(error).upper()
    if 'INVALID_API_KEY' in message:
        return 'invalid_api_key'
    return 'generation_failed'


def _generate_image_caption(filepath: str) -> tuple[str, str | None]:
    """Generate AI caption for an uploaded image. Returns (caption, error_code)."""
    if filepath.lower().endswith('.svg'):
        return "", None
    try:
        output_lang = current_app.config.get('OUTPUT_LANGUAGE', 'zh')
        if output_lang == 'en':
            prompt = "Please provide a short description of the main content of this image. Return only the description text without any other explanation."
        else:
            prompt = "请用一句简短的中文描述这张图片的主要内容。只返回描述文字，不要其他解释。"

        caption_model = current_app.config.get('IMAGE_CAPTION_MODEL', 'gemini-3-flash-preview')
        routing_bundle = resolve_routing_bundle(project=None, generation_override=None)
        provider = get_caption_provider(model=caption_model, route=routing_bundle.image_caption)
        if hasattr(provider, 'generate_with_image'):
            return (provider.generate_with_image(prompt=prompt, image_path=filepath, thinking_budget=0) or "").strip(), None
        if hasattr(provider, 'generate_text_with_images'):
            return (
                provider.generate_text_with_images(prompt=prompt, images=[filepath], thinking_budget=0) or ""
            ).strip(), None
        return "", None
    except Exception as e:
        logger.warning(f"Failed to generate caption for {filepath}: {e}")
        return "", _classify_caption_error(e)


def _build_material_query(filter_project_id: str):
    """Build common material query with project validation."""
    query = Material.query

    if filter_project_id == 'all':
        return query, None
    if filter_project_id == 'none':
        return query.filter(Material.project_id.is_(None)), None

    project = Project.query.get(filter_project_id)
    if not project:
        return None, not_found('Project')

    return query.filter(Material.project_id == filter_project_id), None


def _get_materials_list(filter_project_id: str):
    """
    Common logic to get materials list.
    Returns (materials_list, error_response)
    """
    query, error = _build_material_query(filter_project_id)
    if error:
        return None, error
    
    materials = query.order_by(Material.created_at.desc()).all()
    materials_list = [material.to_dict() for material in materials]
    
    return materials_list, None


def _handle_material_upload(default_project_id: Optional[str] = None):
    """
    Common logic to handle material upload.
    Returns Flask response object.
    """
    try:
        raw_project_id = request.args.get('project_id', default_project_id)
        target_project_id, error = _resolve_target_project_id(raw_project_id)
        if error:
            return error

        files = request.files.getlist('files') or []
        if not files:
            single_file = request.files.get('file')
            if single_file:
                files = [single_file]

        if not files:
            return bad_request("file is required")

        generate_caption = request.args.get('generate_caption', '').lower() in ('true', '1', 'yes')
        saved_materials = []
        file_service = FileService(current_app.config['UPLOAD_FOLDER']) if generate_caption else None

        for file in files:
            material, save_error = _save_material_file(file, target_project_id)
            if save_error:
                return save_error

            result = material.to_dict()
            if generate_caption and file_service:
                filepath = file_service.get_absolute_path(material.relative_path)
                caption, caption_error_code = _generate_image_caption(filepath)
                material.caption = caption
                db.session.commit()
                result['caption'] = caption
                result['caption_status'] = 'generated' if caption else 'fallback_filename'
                result['caption_error_code'] = caption_error_code
            saved_materials.append(result)

        if len(saved_materials) == 1:
            return success_response(saved_materials[0], status_code=201)

        return success_response({
            'materials': saved_materials,
            'count': len(saved_materials)
        }, status_code=201)

    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


def _resolve_target_project_id(raw_project_id: Optional[str], allow_none: bool = True):
    """
    Normalize project_id from request.
    Returns (project_id | None, error_response | None)
    """
    if allow_none and (raw_project_id is None or raw_project_id == 'none'):
        return None, None

    if raw_project_id == 'all':
        return None, bad_request("project_id cannot be 'all' when uploading materials")

    if raw_project_id:
        project = Project.query.get(raw_project_id)
        if not project:
            return None, not_found('Project')

    return raw_project_id, None


def _save_material_file(file, target_project_id: Optional[str]):
    """Shared logic for saving uploaded material files to disk and DB."""
    if not file or not file.filename:
        return None, bad_request("file is required")

    original_filename = file.filename
    try:
        file_ext = _detect_material_file_extension(file)
    except ValueError:
        return None, bad_request(f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_MATERIAL_EXTENSIONS))}")

    file_service = FileService(current_app.config['UPLOAD_FOLDER'])
    if target_project_id:
        materials_dir = file_service.upload_folder / file_service._get_materials_dir(target_project_id)
    else:
        materials_dir = file_service.upload_folder / "materials"
    materials_dir.mkdir(exist_ok=True, parents=True)

    unique_filename = f"{uuid.uuid4().hex}{file_ext}"

    filepath = materials_dir / unique_filename
    file.save(str(filepath))

    relative_path = str(filepath.relative_to(file_service.upload_folder))
    if target_project_id:
        image_url = file_service.get_file_url(target_project_id, 'materials', unique_filename)
    else:
        image_url = f"/files/materials/{unique_filename}"

    material = Material(
        project_id=target_project_id,
        filename=unique_filename,
        relative_path=relative_path,
        url=image_url,
        original_filename=original_filename
    )

    try:
        db.session.add(material)
        db.session.commit()
        return material, None
    except Exception:
        db.session.rollback()
        raise


def _detect_material_file_extension(file) -> str:
    """Detect a supported material image type from uploaded content."""
    stream = file.stream
    original_position = stream.tell()
    try:
        with Image.open(stream) as image:
            file_ext = PIL_FORMAT_EXTENSIONS.get(image.format)
            if not file_ext or file_ext not in ALLOWED_MATERIAL_EXTENSIONS:
                raise ValueError("unsupported raster image format")
            image.verify()
            return file_ext
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, IndexError, struct.error):
        stream.seek(original_position)
        if _is_svg_upload(stream) and '.svg' in ALLOWED_MATERIAL_EXTENSIONS:
            return '.svg'
        raise ValueError("unsupported image content")
    finally:
        stream.seek(original_position)


def _is_svg_upload(stream) -> bool:
    """Return True when the upload content is an SVG document."""
    head = stream.read(4096)
    if isinstance(head, str):
        head = head.encode('utf-8')

    if head.startswith(b'\xef\xbb\xbf'):
        head = head[3:]

    clean_head = re.sub(b'<!--.*?-->', b'', head, flags=re.DOTALL)
    clean_head = re.sub(b'<\\?xml.*?\\?>', b'', clean_head, flags=re.DOTALL)
    clean_head = re.sub(b'<!DOCTYPE.*?\\]>\\s*', b'', clean_head, count=1, flags=re.DOTALL | re.IGNORECASE)
    clean_head = re.sub(b'<!DOCTYPE.*?>', b'', clean_head, flags=re.DOTALL | re.IGNORECASE)

    match = re.match(b'\\s*<\\s*([^\\s>/]+)', clean_head)
    if not match:
        return False

    tag = match.group(1).decode('utf-8', errors='ignore')
    return tag.split(':')[-1].lower() == 'svg'


def _parse_selection(raw_selection):
    """Parse and validate selection payload for material processing."""
    if not raw_selection:
        return None

    if isinstance(raw_selection, str):
        try:
            raw_selection = json.loads(raw_selection)
        except json.JSONDecodeError:
            raise ValueError("selection must be valid JSON")

    if not isinstance(raw_selection, dict):
        raise ValueError("selection must be an object")

    required_fields = ('x', 'y', 'width', 'height')
    missing = [field for field in required_fields if field not in raw_selection]
    if missing:
        raise ValueError(f"selection is missing required fields: {', '.join(missing)}")

    try:
        selection = {
            'x': int(raw_selection['x']),
            'y': int(raw_selection['y']),
            'width': int(raw_selection['width']),
            'height': int(raw_selection['height']),
            'image_width': int(raw_selection['image_width']) if raw_selection.get('image_width') is not None else None,
            'image_height': int(raw_selection['image_height']) if raw_selection.get('image_height') is not None else None,
        }
    except (TypeError, ValueError):
        raise ValueError("selection fields must be integers")

    if selection['width'] <= 0 or selection['height'] <= 0:
        raise ValueError("selection width and height must be positive")

    return selection


@material_bp.route('/<project_id>/materials/generate', methods=['POST'])
def generate_material_image(project_id):
    """
    POST /api/projects/{project_id}/materials/generate - Generate a standalone material image

    Supports multipart/form-data:
    - prompt: Text-to-image prompt (passed directly to the model without modification)
    - ref_image: Main reference image (optional)
    - extra_images: Additional reference images (multiple files, optional)
    
    Note: project_id can be 'none' to generate global materials (not associated with any project)
    """
    try:
        # 支持 'none' 作为特殊值，表示生成全局素材
        if project_id != 'none':
            project = Project.query.get(project_id)
            if not project:
                return not_found('Project')
        else:
            project = None
            project_id = None  # 设置为None表示全局素材

        # Parse request data (prioritize multipart for file uploads)
        if request.is_json:
            data = request.get_json() or {}
            prompt = normalize_user_text(data.get('prompt'))
            ref_file = None
            extra_files = []
        else:
            data = request.form.to_dict()
            prompt = normalize_user_text(data.get('prompt'))
            ref_file = request.files.get('ref_image')
            extra_files = request.files.getlist('extra_images') or []
            if data.get('generation_override'):
                try:
                    data['generation_override'] = json.loads(data['generation_override'])
                except Exception:
                    data['generation_override'] = {}

        generation_override = data.get('generation_override') or {}
        if generation_override and not isinstance(generation_override, dict):
            return bad_request("generation_override must be an object")

        aspect_ratio = (data.get('aspect_ratio') or '').strip() or None
        if aspect_ratio:
            try:
                aspect_ratio = normalize_aspect_ratio(aspect_ratio)
            except ValueError as e:
                return bad_request(str(e))

            routing_bundle = resolve_routing_bundle(
                project=project,
                generation_override=generation_override,
            )
            image_model = routing_bundle.image.model or current_app.config.get('IMAGE_MODEL', '')
            allowed_ratios = get_supported_aspect_ratios_for_model(image_model)
            if aspect_ratio not in allowed_ratios:
                return bad_request(
                    f"Aspect ratio '{aspect_ratio}' is not supported by image model '{image_model}'. "
                    f"Allowed values: {', '.join(allowed_ratios)}"
                )

        if not prompt:
            return bad_request("prompt is required")

        # 处理project_id：对于全局素材，使用'global'作为Task的project_id
        # Task模型要求project_id不能为null，但Material可以
        task_project_id = project_id if project_id is not None else 'global'
        
        # 验证project_id（如果不是'global'）
        if task_project_id != 'global':
            project = Project.query.get(task_project_id)
            if not project:
                return not_found('Project')

        # Initialize services
        try:
            routing_bundle = resolve_routing_bundle(
                project=project,
                generation_override=generation_override,
            )
        except Exception as e:
            return bad_request(str(e))

        ai_service = get_ai_service(routing_bundle=routing_bundle)
        request_resolution = None
        image_override = generation_override.get('image') or {}
        if isinstance(image_override, dict):
            request_resolution = image_override.get('resolution')
        project_resolution = get_project_default_image_resolution(project)
        try:
            effective_resolution = resolve_effective_image_resolution(
                routing_bundle.image.provider,
                routing_bundle.image.model,
                channel=routing_bundle.image.channel,
                request_resolution=request_resolution,
                project_resolution=project_resolution,
                global_resolution=current_app.config.get('DEFAULT_RESOLUTION', '2K'),
            )
        except ValueError as e:
            return bad_request(str(e))

        file_service = FileService(current_app.config['UPLOAD_FOLDER'])

        # 创建临时目录保存参考图片（后台任务会清理）
        temp_dir = Path(tempfile.mkdtemp(dir=current_app.config['UPLOAD_FOLDER']))
        temp_dir_str = str(temp_dir)

        try:
            ref_path = None
            # Save main reference image to temp directory if provided
            if ref_file and ref_file.filename:
                ref_filename = secure_filename(ref_file.filename or 'ref.png')
                ref_path = temp_dir / ref_filename
                ref_file.save(str(ref_path))
                ref_path_str = str(ref_path)
            else:
                ref_path_str = None

            # Save additional reference images to temp directory
            additional_ref_images = []
            for extra in extra_files:
                if not extra or not extra.filename:
                    continue
                extra_filename = secure_filename(extra.filename)
                extra_path = temp_dir / extra_filename
                extra.save(str(extra_path))
                additional_ref_images.append(str(extra_path))

            # Create async task for material generation
            task = Task(
                project_id=task_project_id,
                task_type='GENERATE_MATERIAL',
                status='PENDING'
            )
            task.set_progress({
                'total': 1,
                'completed': 0,
                'failed': 0
            })
            db.session.add(task)
            db.session.commit()

            # Get app instance for background task
            app = current_app._get_current_object()

            # Submit background task
            task_manager.submit_task(
                task.id,
                generate_material_image_task,
                task_project_id,  # 传递给任务函数，它会处理'global'的情况
                prompt,
                ai_service,
                file_service,
                ref_path_str,
                additional_ref_images if additional_ref_images else None,
                aspect_ratio or (project.image_aspect_ratio if project else None) or current_app.config.get('DEFAULT_ASPECT_RATIO', '16:9'),
                effective_resolution,
                temp_dir_str,
                app
            )

            # Return task_id immediately (不再清理temp_dir，由后台任务清理)
            return success_response({
                'task_id': task.id,
                'status': 'PENDING'
            }, status_code=202)
        
        except Exception as e:
            # Clean up temp directory on error
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise

    except Exception as e:
        db.session.rollback()
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@material_bp.route('/<project_id>/materials/process', methods=['POST'])
def process_material_image(project_id):
    """
    POST /api/projects/{project_id}/materials/process - Unified material swiss-army processing endpoint

    Supported multipart/form-data fields:
    - operation: generate | edit_full | region_edit | erase_region
    - prompt: optional for erase_region, required otherwise
    - aspect_ratio: required for generate, ignored for edit modes
    - apply_mode: overlay_selection | replace_full (region_edit only)
    - selection: JSON object with x/y/width/height in source-image pixels
    - source_image: edit target image (required for edit modes)
    - ref_image: optional primary reference
    - extra_images: optional additional references
    """
    try:
        if project_id != 'none':
            project = Project.query.get(project_id)
            if not project:
                return not_found('Project')
        else:
            project = None
            project_id = None

        if request.is_json:
            data = request.get_json() or {}
            source_file = None
            ref_file = None
            extra_files = []
        else:
            data = request.form.to_dict()
            source_file = request.files.get('source_image')
            ref_file = request.files.get('ref_image')
            extra_files = request.files.getlist('extra_images') or []

        operation = (data.get('operation') or 'generate').strip()
        if operation not in ALLOWED_MATERIAL_OPERATIONS:
            return bad_request(f"Invalid operation. Allowed values: {', '.join(sorted(ALLOWED_MATERIAL_OPERATIONS))}")

        prompt = (data.get('prompt') or '').strip()
        if operation != 'erase_region' and not prompt:
            return bad_request("prompt is required")

        aspect_ratio = (data.get('aspect_ratio') or '').strip() or None
        if operation == 'generate':
            if aspect_ratio and aspect_ratio not in ALLOWED_ASPECT_RATIOS:
                return bad_request(f"Invalid aspect ratio. Allowed values: {', '.join(sorted(ALLOWED_ASPECT_RATIOS))}")
        else:
            aspect_ratio = None

        apply_mode = (data.get('apply_mode') or 'overlay_selection').strip()
        if operation == 'region_edit' and apply_mode not in ALLOWED_REGION_APPLY_MODES:
            return bad_request(f"Invalid apply_mode. Allowed values: {', '.join(sorted(ALLOWED_REGION_APPLY_MODES))}")

        if operation in {'edit_full', 'region_edit', 'erase_region'} and (source_file is None or not source_file.filename):
            return bad_request("source_image is required for edit operations")

        try:
            selection = _parse_selection(data.get('selection'))
        except ValueError as exc:
            return bad_request(str(exc))

        if operation in {'region_edit', 'erase_region'} and selection is None:
            return bad_request("selection is required for region operations")

        task_project_id = project_id if project_id is not None else 'global'
        if task_project_id != 'global':
            project = Project.query.get(task_project_id)
            if not project:
                return not_found('Project')

        ai_service = get_ai_service()
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])

        temp_dir = Path(tempfile.mkdtemp(dir=current_app.config['UPLOAD_FOLDER']))
        temp_dir_str = str(temp_dir)

        try:
            def _save_temp_upload(uploaded_file, fallback_name):
                if not uploaded_file or not uploaded_file.filename:
                    return None
                filename = secure_filename(uploaded_file.filename or fallback_name)
                path = temp_dir / filename
                uploaded_file.save(str(path))
                return str(path)

            source_image_path = _save_temp_upload(source_file, 'source.png')
            ref_path_str = _save_temp_upload(ref_file, 'ref.png')

            additional_ref_images = []
            for extra in extra_files:
                saved = _save_temp_upload(extra, 'extra.png')
                if saved:
                    additional_ref_images.append(saved)

            task = Task(
                project_id=task_project_id,
                task_type='PROCESS_MATERIAL',
                status='PENDING'
            )
            task.set_progress({
                'total': 1,
                'completed': 0,
                'failed': 0,
                'operation': operation,
                'apply_mode': apply_mode if operation == 'region_edit' else None,
                'selection': selection if operation in {'region_edit', 'erase_region'} else None,
            })
            db.session.add(task)
            db.session.commit()

            app = current_app._get_current_object()
            task_manager.submit_task(
                task.id,
                process_material_image_task,
                task_project_id,
                operation,
                prompt,
                ai_service,
                file_service,
                source_image_path,
                ref_path_str,
                additional_ref_images if additional_ref_images else None,
                aspect_ratio or (project.image_aspect_ratio if project else None) or current_app.config.get('DEFAULT_ASPECT_RATIO', '16:9'),
                current_app.config['DEFAULT_RESOLUTION'],
                selection,
                apply_mode,
                temp_dir_str,
                app
            )

            return success_response({
                'task_id': task.id,
                'status': 'PENDING'
            }, status_code=202)
        except Exception:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise

    except Exception as e:
        db.session.rollback()
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@material_bp.route('/<project_id>/materials', methods=['GET'])
def list_materials(project_id):
    """
    GET /api/projects/{project_id}/materials - List materials for a specific project
    
    Returns:
        List of material images with filename, url, and metadata for the specified project
    """
    try:
        materials_list, error = _get_materials_list(project_id)
        if error:
            return error
        
        return success_response({
            "materials": materials_list,
            "count": len(materials_list)
        })
    
    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@material_bp.route('/<project_id>/materials/upload', methods=['POST'])
def upload_material(project_id):
    """
    POST /api/projects/{project_id}/materials/upload - Upload a material image
    
    Supports multipart/form-data:
    - file: Image file (required)
    - project_id: Optional query parameter, defaults to path parameter if not provided
    
    Returns:
        Material info with filename, url, and metadata
    """
    return _handle_material_upload(default_project_id=project_id)


@material_global_bp.route('', methods=['GET'])
def list_all_materials():
    """
    GET /api/materials - Global materials endpoint for complex queries
    
    Query params:
        - project_id: Filter by project_id
          * 'all' (default): Get all materials regardless of project
          * 'none': Get only materials without a project (global materials)
          * <project_id>: Get materials for specific project
    
    Returns:
        List of material images with filename, url, and metadata
    """
    try:
        filter_project_id = request.args.get('project_id', 'all')
        materials_list, error = _get_materials_list(filter_project_id)
        if error:
            return error
        
        return success_response({
            "materials": materials_list,
            "count": len(materials_list)
        })
    
    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@material_global_bp.route('/upload', methods=['POST'])
def upload_material_global():
    """
    POST /api/materials/upload - Upload a material image (global, not bound to a project)
    
    Supports multipart/form-data:
    - file: Image file (required)
    - project_id: Optional query parameter to associate with a project
    
    Returns:
        Material info with filename, url, and metadata
    """
    return _handle_material_upload(default_project_id=None)


@material_global_bp.route('/<material_id>', methods=['DELETE'])
def delete_material(material_id):
    """
    DELETE /api/materials/{material_id} - Delete a material and its file
    """
    try:
        material = Material.query.get(material_id)
        if not material:
            return not_found('Material')

        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        material_path = Path(file_service.get_absolute_path(material.relative_path))

        # First, delete the database record to ensure data consistency
        db.session.delete(material)
        db.session.commit()

        # Then, attempt to delete the file. If this fails, log the error
        # but still return a success response. This leaves an orphan file,
        try:
            if material_path.exists():
                material_path.unlink(missing_ok=True)
        except OSError as e:
            current_app.logger.warning(f"Failed to delete file for material {material_id} at {material_path}: {e}")

        return success_response({"id": material_id})
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@material_global_bp.route('/associate', methods=['POST'])
def associate_materials_to_project():
    """
    POST /api/materials/associate - Associate materials to a project by URLs

    Request body (JSON):
    {
        "project_id": "project_id",
        "material_urls": ["url1", "url2", ...]
    }

    Returns:
        List of associated material IDs and count
    """
    try:
        data = request.get_json() or {}
        project_id = data.get('project_id')
        material_urls = data.get('material_urls', [])

        if not project_id:
            return bad_request("project_id is required")

        if not material_urls or not isinstance(material_urls, list):
            return bad_request("material_urls must be a non-empty array")

        # Validate project exists
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        # Find materials by URLs and update their project_id
        updated_ids = []
        materials_to_update = Material.query.filter(
            Material.url.in_(material_urls),
            Material.project_id.is_(None)
        ).all()
        for material in materials_to_update:
            material.project_id = project_id
            updated_ids.append(material.id)

        db.session.commit()

        return success_response({
            "updated_ids": updated_ids,
            "count": len(updated_ids)
        })

    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@material_global_bp.route('/download', methods=['POST'])
def download_materials_zip():
    """Bundle requested materials into a ZIP and stream it back."""
    body = request.get_json(silent=True) or {}
    ids = body.get('material_ids')

    if not ids or not isinstance(ids, list):
        return bad_request("material_ids must be a non-empty list")

    MAX_BATCH = 200
    if len(ids) > MAX_BATCH:
        return bad_request(f"Too many materials requested (max {MAX_BATCH})")

    rows = Material.query.filter(Material.id.in_(ids)).all()
    if not rows:
        return not_found('Materials')

    tmp = tempfile.SpooledTemporaryFile(max_size=64 * 1024 * 1024)
    try:
        fs = FileService(current_app.config['UPLOAD_FOLDER'])

        with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zf:
            for row in rows:
                abs_path = Path(fs.get_absolute_path(row.relative_path))
                if not abs_path.is_file():
                    current_app.logger.warning("Skipping missing file for material %s", row.id)
                    continue
                zf.write(str(abs_path), row.filename)

        tmp.seek(0)
        fname = f"materials_{int(time.time())}.zip"

        return send_file(tmp, mimetype='application/zip',
                         as_attachment=True, download_name=fname)
    except Exception:
        tmp.close()
        current_app.logger.exception("Failed to build materials zip")
        return error_response('SERVER_ERROR', 'Failed to create zip archive', 500)



@material_global_bp.route('/<material_id>/caption', methods=['GET'])
def get_material_caption(material_id):
    """Get or lazily generate caption for an existing material."""
    material = Material.query.get(material_id)
    if not material:
        return not_found('Material')

    if material.caption is not None:
        return success_response({'caption': material.caption})

    try:
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        filepath = file_service.get_absolute_path(material.relative_path)
        caption, _caption_error_code = _generate_image_caption(filepath)
        material.caption = caption
        db.session.commit()
        return success_response({'caption': caption})
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@material_global_bp.route('/by-url', methods=['GET'])
def get_material_by_url():
    """Get material record by URL and ensure caption is available."""
    url = (request.args.get('url') or '').strip()
    if not url:
        return bad_request('url parameter is required')

    material = Material.query.filter_by(url=url).first()
    if not material:
        return not_found('Material')

    try:
        if material.caption is None:
            file_service = FileService(current_app.config['UPLOAD_FOLDER'])
            filepath = file_service.get_absolute_path(material.relative_path)
            material.caption, _caption_error_code = _generate_image_caption(filepath)
            db.session.commit()
        return success_response(material.to_dict())
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)
