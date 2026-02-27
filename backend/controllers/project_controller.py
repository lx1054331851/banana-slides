"""
Project Controller - handles project-related endpoints
"""
import json
import logging
import os
import subprocess
import traceback
from datetime import datetime
from pathlib import Path

from flask import Blueprint, request, jsonify, current_app, Response, stream_with_context
from sqlalchemy import desc
from utils.validators import normalize_aspect_ratio
from sqlalchemy.orm import joinedload
from werkzeug.exceptions import BadRequest
from werkzeug.utils import secure_filename

from models import db, Project, Page, Task, ReferenceFile
from services import ProjectContext, FileService
from services.prompts import get_long_report_split_prompt
from services.ai_service_manager import get_ai_service
from services.task_manager import (
    task_manager,
    generate_descriptions_task,
    generate_images_task,
    process_ppt_renovation_task
)
from services.style_preview_service import (
    generate_style_recommendations_and_previews_task,
    regenerate_single_style_previews_task
)
from utils import (
    success_response, error_response, not_found, bad_request,
    parse_page_ids_from_body, get_filtered_pages
)

logger = logging.getLogger(__name__)

project_bp = Blueprint('projects', __name__, url_prefix='/api/projects')


def _get_project_reference_files_content(project_id: str) -> list:
    """
    Get reference files content for a project
    
    Args:
        project_id: Project ID
        
    Returns:
        List of dicts with 'filename' and 'content' keys
    """
    reference_files = ReferenceFile.query.filter_by(
        project_id=project_id,
        parse_status='completed'
    ).all()
    
    files_content = []
    for ref_file in reference_files:
        if ref_file.markdown_content:
            files_content.append({
                'filename': ref_file.filename,
                'content': ref_file.markdown_content
            })
    
    return files_content


def _get_reference_files_content_by_ids(file_ids: list) -> list:
    """
    Get reference files content by IDs (only completed files)

    Args:
        file_ids: List of reference file IDs

    Returns:
        List of dicts with 'filename' and 'content' keys
    """
    if not file_ids:
        return []

    reference_files = ReferenceFile.query.filter(
        ReferenceFile.id.in_(file_ids),
        ReferenceFile.parse_status == 'completed'
    ).all()

    files_content = []
    for ref_file in reference_files:
        if ref_file.markdown_content:
            files_content.append({
                'filename': ref_file.filename,
                'content': ref_file.markdown_content
            })

    return files_content


def _format_sse_data(data: str) -> str:
    """
    Format data for SSE. Ensures each line is prefixed with 'data:'.
    """
    if data is None:
        data = ""
    lines = str(data).splitlines() or [""]
    return "\n".join([f"data: {line}" for line in lines]) + "\n\n"


def _reconstruct_outline_from_pages(pages: list) -> list:
    """
    Reconstruct outline structure from Page objects
    
    Args:
        pages: List of Page objects ordered by order_index
        
    Returns:
        Outline structure (list) with optional part grouping
    """
    outline = []
    current_part = None
    current_part_pages = []
    
    for page in pages:
        outline_content = page.get_outline_content()
        if not outline_content:
            continue
            
        page_data = outline_content.copy()
        
        # 如果当前页面属于一个 part
        if page.part:
            # 如果这是新的 part，先保存之前的 part（如果有）
            if current_part and current_part != page.part:
                outline.append({
                    "part": current_part,
                    "pages": current_part_pages
                })
                current_part_pages = []
            
            current_part = page.part
            # 移除 part 字段，因为它在顶层
            if 'part' in page_data:
                del page_data['part']
            current_part_pages.append(page_data)
        else:
            # 如果当前页面不属于任何 part，先保存之前的 part（如果有）
            if current_part:
                outline.append({
                    "part": current_part,
                    "pages": current_part_pages
                })
                current_part = None
                current_part_pages = []
            
            # 直接添加页面
            outline.append(page_data)
    
    # 保存最后一个 part（如果有）
    if current_part:
        outline.append({
            "part": current_part,
            "pages": current_part_pages
        })
    
    return outline


def _smart_merge_pages(project_id, pages_data):
    """Smart merge: match new pages to existing by title, update in place to preserve images/descriptions."""
    old_pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()

    old_by_title = {}
    for p in old_pages:
        outline = p.get_outline_content()
        title = (outline.get('title') or '').strip() if outline else ''
        if title and title not in old_by_title:
            old_by_title[title] = p

    matched_ids = set()
    pages_list = []

    for i, page_data in enumerate(pages_data):
        title = (page_data.get('title') or '').strip()
        old_page = old_by_title.get(title) if title else None

        if old_page and old_page.id not in matched_ids:
            matched_ids.add(old_page.id)
            page = old_page
        else:
            page = Page(project_id=project_id, status='DRAFT')
            db.session.add(page)

        page.order_index = i
        page.part = page_data.get('part')
        page.set_outline_content({
            'title': page_data.get('title'),
            'points': page_data.get('points', [])
        })
        pages_list.append(page)

    for p in old_pages:
        if p.id not in matched_ids:
            db.session.delete(p)

    return pages_list


@project_bp.route('', methods=['GET'])
def list_projects():
    """
    GET /api/projects - Get all projects (for history)
    
    Query params:
    - limit: number of projects to return (default: 50, max: 100)
    - offset: offset for pagination (default: 0)
    """
    try:
        # Parameter validation
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        # Enforce limits to prevent performance issues
        limit = min(max(1, limit), 100)  # Between 1-100
        offset = max(0, offset)  # Non-negative
        
        # Fetch limit + 1 items to check for more pages efficiently
        # This avoids a second database query
        projects_with_extra = Project.query\
            .options(joinedload(Project.pages))\
            .order_by(desc(Project.updated_at))\
            .limit(limit + 1)\
            .offset(offset)\
            .all()
        
        # Check if there are more items beyond the current page
        has_more = len(projects_with_extra) > limit
        # Return only the requested limit
        projects = projects_with_extra[:limit]
        
        return success_response({
            'projects': [project.to_dict(include_pages=True) for project in projects],
            'has_more': has_more,
            'limit': limit,
            'offset': offset
        })
    
    except Exception as e:
        logger.error(f"list_projects failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('', methods=['POST'])
def create_project():
    """
    POST /api/projects - Create a new project
    
    Request body:
    {
        "creation_type": "idea|outline|descriptions",
        "idea_prompt": "...",  # required for idea type
        "outline_text": "...",  # required for outline type
        "description_text": "...",  # required for descriptions type
        "template_id": "optional"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return bad_request("Request body is required")
        
        # creation_type is required
        if 'creation_type' not in data:
            return bad_request("creation_type is required")
        
        creation_type = data.get('creation_type')
        
        if creation_type not in ['idea', 'outline', 'descriptions']:
            return bad_request("Invalid creation_type")
        
        # Validate and set aspect ratio if provided
        image_aspect_ratio = '16:9'
        if 'image_aspect_ratio' in data:
            try:
                image_aspect_ratio = normalize_aspect_ratio(data['image_aspect_ratio'])
            except ValueError as e:
                return bad_request(str(e))

        # Create project
        project = Project(
            creation_type=creation_type,
            idea_prompt=data.get('idea_prompt'),
            outline_text=data.get('outline_text'),
            description_text=data.get('description_text'),
            template_style=data.get('template_style'),
            template_style_json=data.get('template_style_json'),
            image_aspect_ratio=image_aspect_ratio,
            status='DRAFT'
        )
        
        db.session.add(project)
        db.session.commit()
        
        return success_response({
            'project_id': project.id,
            'status': project.status,
            'pages': []
        }, status_code=201)
    
    except BadRequest as e:
        # Handle JSON parsing errors (invalid JSON body)
        db.session.rollback()
        logger.warning(f"create_project: Invalid JSON body - {str(e)}")
        return bad_request("Invalid JSON in request body")
    
    except Exception as e:
        db.session.rollback()
        error_trace = traceback.format_exc()
        logger.error(f"create_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>', methods=['GET'])
def get_project(project_id):
    """
    GET /api/projects/{project_id} - Get project details
    """
    try:
        # Use eager loading to load project and related pages
        project = Project.query\
            .options(joinedload(Project.pages))\
            .filter(Project.id == project_id)\
            .first()
        
        if not project:
            return not_found('Project')
        
        return success_response(project.to_dict(include_pages=True))
    
    except Exception as e:
        logger.error(f"get_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>', methods=['PUT'])
def update_project(project_id):
    """
    PUT /api/projects/{project_id} - Update project
    
    Request body:
    {
        "idea_prompt": "...",
        "pages_order": ["page-uuid-1", "page-uuid-2", ...]
    }
    """
    try:
        # Use eager loading to load project and pages (for page order updates)
        project = Project.query\
            .options(joinedload(Project.pages))\
            .filter(Project.id == project_id)\
            .first()
        
        if not project:
            return not_found('Project')
        
        data = request.get_json()
        
        # Update idea_prompt if provided
        if 'idea_prompt' in data:
            project.idea_prompt = data['idea_prompt']

        # Update outline_text if provided
        if 'outline_text' in data:
            project.outline_text = data['outline_text']

        # Update description_text if provided
        if 'description_text' in data:
            project.description_text = data['description_text']

        # Update extra_requirements if provided
        if 'extra_requirements' in data:
            project.extra_requirements = data['extra_requirements']
        
        # Update template_style if provided
        if 'template_style' in data:
            project.template_style = data['template_style']

        # Update template_style_json if provided
        if 'template_style_json' in data:
            project.template_style_json = data['template_style_json']

        # Update presentation_meta if provided
        if 'presentation_meta' in data:
            project.presentation_meta = data['presentation_meta']
        
        # Update aspect ratio if provided
        if 'image_aspect_ratio' in data:
            try:
                project.image_aspect_ratio = normalize_aspect_ratio(data['image_aspect_ratio'])
            except ValueError as e:
                return bad_request(str(e))

        # Update export settings if provided
        if 'export_extractor_method' in data:
            project.export_extractor_method = data['export_extractor_method']
        if 'export_inpaint_method' in data:
            project.export_inpaint_method = data['export_inpaint_method']
        if 'export_allow_partial' in data:
            project.export_allow_partial = bool(data['export_allow_partial'])

        # Export image compression settings (project-level)
        if 'export_compress_enabled' in data:
            project.export_compress_enabled = bool(data['export_compress_enabled'])
        if 'export_compress_mode' in data:
            project.export_compress_mode = 'manual'
        if 'export_compress_format' in data:
            fmt = (data['export_compress_format'] or 'jpeg').strip().lower()
            if fmt not in ('jpeg', 'png', 'webp'):
                return bad_request("export_compress_format must be jpeg, png, or webp")
            project.export_compress_format = fmt
        if 'export_compress_quality' in data:
            try:
                project.export_compress_quality = int(data['export_compress_quality'])
            except (TypeError, ValueError):
                return bad_request("export_compress_quality must be an integer")
        if 'export_compress_subsampling' in data:
            try:
                project.export_compress_subsampling = int(data['export_compress_subsampling'])
            except (TypeError, ValueError):
                return bad_request("export_compress_subsampling must be an integer")
        if 'export_compress_progressive' in data:
            project.export_compress_progressive = bool(data['export_compress_progressive'])
        if 'export_compress_png_quantize_enabled' in data:
            project.export_compress_png_quantize_enabled = bool(data['export_compress_png_quantize_enabled'])
        # auto mode removed
        
        # Update page order if provided
        if 'pages_order' in data:
            pages_order = data['pages_order']
            # Optimization: batch query all pages to update, avoiding N+1 queries
            pages_to_update = Page.query.filter(
                Page.id.in_(pages_order),
                Page.project_id == project_id
            ).all()
            
            # Create page_id -> page mapping for O(1) lookup
            pages_map = {page.id: page for page in pages_to_update}
            
            # Batch update order
            for index, page_id in enumerate(pages_order):
                if page_id in pages_map:
                    pages_map[page_id].order_index = index
        
        project.updated_at = datetime.utcnow()
        db.session.commit()
        
        return success_response(project.to_dict(include_pages=True))
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"update_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """
    DELETE /api/projects/{project_id} - Delete project
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # Delete project files
        from services import FileService
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        file_service.delete_project_files(project_id)
        
        # Delete project from database (cascade will delete pages and tasks)
        db.session.delete(project)
        db.session.commit()
        
        return success_response(message="Project deleted successfully")
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"delete_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/generate/outline', methods=['POST'])
def generate_outline(project_id):
    """
    POST /api/projects/{project_id}/generate/outline - Generate outline

    For 'idea' type: Generate outline from idea_prompt
    For 'outline' type: Parse outline_text into structured format
    For 'descriptions' type: Extract outline structure from description_text

    Request body (optional):
    {
        "idea_prompt": "...",  # for idea type
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get request data and language parameter
        data = request.get_json() or {}
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        if reference_files_content:
            logger.info(f"Found {len(reference_files_content)} reference files for project {project_id}")
            for rf in reference_files_content:
                logger.info(f"  - {rf['filename']}: {len(rf['content'])} characters")
        else:
            logger.info(f"No reference files found for project {project_id}")
        
        # 根据项目类型选择不同的处理方式
        if project.creation_type == 'outline':
            # 从大纲生成：解析用户输入的大纲文本
            if not project.outline_text:
                return bad_request("outline_text is required for outline type project")
            
            # Create project context and parse outline text into structured format
            project_context = ProjectContext(project, reference_files_content)
            outline = ai_service.parse_outline_text(project_context, language=language)
        elif project.creation_type == 'descriptions':
            # 从描述生成：从 description_text 提取大纲结构（仅大纲，不含页面描述）
            if not project.description_text:
                return bad_request("description_text is required for descriptions type project")

            project_context = ProjectContext(project, reference_files_content)
            outline = ai_service.parse_description_to_outline(project_context, language=language)
        else:
            # 一句话生成：从idea生成大纲
            idea_prompt = data.get('idea_prompt') or project.idea_prompt
            
            if not idea_prompt:
                return bad_request("idea_prompt is required")
            
            project.idea_prompt = idea_prompt
            
            # Create project context and generate outline from idea
            project_context = ProjectContext(project, reference_files_content)
            outline = ai_service.generate_outline(project_context, language=language)
        
        # Flatten outline to pages and smart merge with existing
        pages_data = ai_service.flatten_outline(outline)
        pages_list = _smart_merge_pages(project_id, pages_data)

        # Update project status (don't downgrade if all pages already have content)
        if all(p.description_content for p in pages_list) and pages_list:
            project.status = 'DESCRIPTIONS_GENERATED'
        else:
            project.status = 'OUTLINE_GENERATED'
        project.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        logger.info(f"大纲生成完成: 项目 {project_id}, 创建了 {len(pages_list)} 个页面")
        
        # Return pages
        return success_response({
            'pages': [page.to_dict() for page in pages_list]
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_outline failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/<project_id>/generate/from-description', methods=['POST'])
def generate_from_description(project_id):
    """
    POST /api/projects/{project_id}/generate/from-description - Generate outline and page descriptions from description text
    
    This endpoint:
    1. Parses the description_text to extract outline structure
    2. Splits the description_text into individual page descriptions
    3. Creates pages with both outline and description content filled
    4. Sets project status to DESCRIPTIONS_GENERATED
    
    Request body (optional):
    {
        "description_text": "...",  # if not provided, uses project.description_text
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        if project.creation_type != 'descriptions':
            return bad_request("This endpoint is only for descriptions type projects")
        
        # Get description text and language
        data = request.get_json() or {}
        description_text = data.get('description_text') or project.description_text
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        if not description_text:
            return bad_request("description_text is required")
        
        project.description_text = description_text
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        project_context = ProjectContext(project, reference_files_content)
        
        logger.info(f"开始从描述生成大纲和页面描述: 项目 {project_id}")
        
        # Step 1: Parse description to outline
        logger.info("Step 1: 解析描述文本到大纲结构...")
        outline = ai_service.parse_description_to_outline(project_context, language=language)
        logger.info(f"大纲解析完成，共 {len(ai_service.flatten_outline(outline))} 页")
        
        # Step 2: Split description into page descriptions
        logger.info("Step 2: 切分描述文本到每页描述...")
        page_descriptions = ai_service.parse_description_to_page_descriptions(project_context, outline, language=language)
        logger.info(f"描述切分完成，共 {len(page_descriptions)} 页")
        
        # Step 3: Flatten outline to pages
        pages_data = ai_service.flatten_outline(outline)
        
        if len(pages_data) != len(page_descriptions):
            logger.warning(f"页面数量不匹配: 大纲 {len(pages_data)} 页, 描述 {len(page_descriptions)} 页")
            # 取较小的数量，避免索引错误
            min_count = min(len(pages_data), len(page_descriptions))
            pages_data = pages_data[:min_count]
            page_descriptions = page_descriptions[:min_count]
        
        # Step 4: Delete existing pages (using ORM session to trigger cascades)
        old_pages = Page.query.filter_by(project_id=project_id).all()
        for old_page in old_pages:
            db.session.delete(old_page)
        
        # Step 5: Create pages with both outline and description
        pages_list = []
        for i, (page_data, page_desc) in enumerate(zip(pages_data, page_descriptions)):
            page = Page(
                project_id=project_id,
                order_index=i,
                part=page_data.get('part'),
                status='DESCRIPTION_GENERATED'  # 直接设置为已生成描述
            )
            
            # Set outline content
            page.set_outline_content({
                'title': page_data.get('title'),
                'points': page_data.get('points', [])
            })
            
            # Set description content
            desc_content = {
                "text": page_desc,
                "generated_at": datetime.utcnow().isoformat()
            }
            page.set_description_content(desc_content)
            
            db.session.add(page)
            pages_list.append(page)
        
        # Update project status
        project.status = 'DESCRIPTIONS_GENERATED'
        project.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        logger.info(f"从描述生成完成: 项目 {project_id}, 创建了 {len(pages_list)} 个页面，已填充大纲和描述")
        
        # Return pages
        return success_response({
            'pages': [page.to_dict() for page in pages_list],
            'status': 'DESCRIPTIONS_GENERATED'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_from_description failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/<project_id>/parse/description', methods=['POST'])
def parse_description_text(project_id):
    """
    POST /api/projects/{project_id}/parse/description - Parse description text into page descriptions (no pages created)

    Request body:
    {
        "description_text": "...",  # required unless project has description_text
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)

        if not project:
            return not_found('Project')

        if project.creation_type != 'descriptions':
            return bad_request("This endpoint is only for descriptions type projects")

        data = request.get_json() or {}
        description_text = data.get('description_text') or project.description_text
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))

        if not description_text:
            return bad_request("description_text is required")

        ai_service = get_ai_service()

        reference_files_content = _get_project_reference_files_content(project_id)
        project_dict = project.to_dict()
        project_dict['description_text'] = description_text
        project_context = ProjectContext(project_dict, reference_files_content)

        outline = ai_service.parse_description_to_outline(project_context, language=language)
        page_descriptions = ai_service.parse_description_to_page_descriptions(project_context, outline, language=language)

        return success_response({
            'page_descriptions': page_descriptions
        })

    except Exception as e:
        logger.error(f"parse_description_text failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/<project_id>/detect/cover-ending-fields', methods=['POST'])
def detect_cover_ending_fields(project_id):
    """
    POST /api/projects/{project_id}/detect/cover-ending-fields - Detect missing fields in cover/ending descriptions

    Request body:
    {
        "cover": {"page_id": "...", "description": "..."},
        "ending": {"page_id": "...", "description": "..."},
        "language": "zh"
    }
    """
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        data = request.get_json() or {}
        cover = data.get('cover') or {}
        ending = data.get('ending') or {}
        cover_text = cover.get('description') or ''
        ending_text = ending.get('description') or ''
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))

        ai_service = get_ai_service()
        reference_files_content = _get_project_reference_files_content(project_id)
        project_context = ProjectContext(project, reference_files_content)

        def _normalize_fields(raw_fields):
            allowed_keys = {
                'logo', 'company_name', 'project_name', 'presenter', 'presenter_title',
                'date', 'location', 'phone', 'website_or_email', 'thanks_or_slogan'
            }
            allowed_roles = {'cover', 'ending'}
            normalized = []
            if not isinstance(raw_fields, list):
                return normalized
            for item in raw_fields:
                if not isinstance(item, dict):
                    continue
                key = item.get('key')
                page_role = item.get('page_role')
                if key not in allowed_keys or page_role not in allowed_roles:
                    continue
                placeholders = item.get('placeholders')
                if not isinstance(placeholders, list):
                    placeholders = []
                placeholders = [str(p) for p in placeholders if str(p)]
                confidence = item.get('confidence')
                try:
                    confidence = float(confidence)
                except (TypeError, ValueError):
                    confidence = None
                normalized.append({
                    'key': key,
                    'page_role': page_role,
                    'present': bool(item.get('present')),
                    'value': str(item.get('value') or ''),
                    'is_placeholder': bool(item.get('is_placeholder')),
                    'placeholders': placeholders,
                    'confidence': confidence
                })
            return normalized

        try:
            result = ai_service.detect_cover_ending_fields(
                project_context,
                cover_text,
                ending_text,
                language=language
            )
            fields = _normalize_fields(result.get('fields') if isinstance(result, dict) else None)
        except Exception as e:
            logger.warning(f"detect_cover_ending_fields failed: {str(e)}", exc_info=True)
            fields = []

        return success_response({'fields': fields})

    except Exception as e:
        logger.error(f"detect_cover_ending_fields failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/<project_id>/generate/descriptions', methods=['POST'])
def generate_descriptions(project_id):
    """
    POST /api/projects/{project_id}/generate/descriptions - Generate descriptions
    
    Request body:
    {
        "max_workers": 5,
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        if project.status not in ['OUTLINE_GENERATED', 'DRAFT', 'DESCRIPTIONS_GENERATED']:
            return bad_request("Project must have outline generated first")
        
        # IMPORTANT: Expire cached objects to ensure fresh data
        db.session.expire_all()
        
        # Get pages
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        
        if not pages:
            return bad_request("No pages found for project")
        
        # Reconstruct outline from pages with part structure
        outline = _reconstruct_outline_from_pages(pages)
        
        data = request.get_json() or {}
        # 从配置中读取默认并发数，如果请求中提供了则使用请求的值
        max_workers = data.get('max_workers', current_app.config.get('MAX_DESCRIPTION_WORKERS', 5))
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        # Create task
        task = Task(
            project_id=project_id,
            task_type='GENERATE_DESCRIPTIONS',
            status='PENDING'
        )
        task.set_progress({
            'total': len(pages),
            'completed': 0,
            'failed': 0
        })
        
        db.session.add(task)
        db.session.commit()
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        project_context = ProjectContext(project, reference_files_content)
        
        # Get app instance for background task
        app = current_app._get_current_object()
        
        # Submit background task
        task_manager.submit_task(
            task.id,
            generate_descriptions_task,
            project_id,
            ai_service,
            project_context,
            outline,
            max_workers,
            app,
            language
        )
        
        # Update project status
        project.status = 'GENERATING_DESCRIPTIONS'
        db.session.commit()
        
        return success_response({
            'task_id': task.id,
            'status': 'GENERATING_DESCRIPTIONS',
            'total_pages': len(pages)
        }, status_code=202)
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_descriptions failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/generate/images', methods=['POST'])
def generate_images(project_id):
    """
    POST /api/projects/{project_id}/generate/images - Generate images
    
    Request body:
    {
        "max_workers": 8,
        "use_template": true,
        "language": "zh",  # output language: zh, en, ja, auto
        "page_ids": ["id1", "id2"]  # optional: specific page IDs to generate (if not provided, generates all)
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # if project.status not in ['DESCRIPTIONS_GENERATED', 'OUTLINE_GENERATED']:
        #     return bad_request("Project must have descriptions generated first")
        
        # IMPORTANT: Expire cached objects to ensure fresh data
        db.session.expire_all()
        
        data = request.get_json() or {}
        
        # Get page_ids from request body and fetch filtered pages
        selected_page_ids = parse_page_ids_from_body(data)
        pages = get_filtered_pages(project_id, selected_page_ids if selected_page_ids else None)
        
        if not pages:
            return bad_request("No pages found for project")
        
        # 检查是否有模板图片或风格描述/风格JSON
        from services import FileService
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        use_template_requested = data.get('use_template', True)
        ref_image_path = None
        if use_template_requested:
            ref_image_path = file_service.get_template_path(project_id)
        has_template = bool(ref_image_path)
        use_template = has_template  # use actual template presence for prompt/runtime
        
        if not has_template and not project.template_style and not project.template_style_json:
            return bad_request("请先上传模板图片或添加风格描述。")
        
        # Reconstruct outline from pages with part structure
        outline = _reconstruct_outline_from_pages(pages)
        
        # 从配置中读取默认并发数，如果请求中提供了则使用请求的值
        max_workers = data.get('max_workers', current_app.config.get('MAX_IMAGE_WORKERS', 8))
        # use_template already normalized by actual presence
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        # Create task
        task = Task(
            project_id=project_id,
            task_type='GENERATE_IMAGES',
            status='PENDING'
        )
        task.set_progress({
            'total': len(pages),
            'completed': 0,
            'failed': 0
        })
        
        db.session.add(task)
        db.session.commit()
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # 合并额外要求和风格描述
        combined_requirements = project.extra_requirements or ""
        if project.template_style_json:
            combined_requirements = combined_requirements + f"\n\nppt页面风格指导(JSON)：\n<style_json>\n{project.template_style_json}\n</style_json>\n"
        if project.template_style:
            combined_requirements = combined_requirements + f"\n\n附加风格要求：\n{project.template_style}"
        
        # Get app instance for background task
        app = current_app._get_current_object()
        
        # Submit background task
        task_manager.submit_task(
            task.id,
            generate_images_task,
            project_id,
            ai_service,
            file_service,
            outline,
            use_template,
            max_workers,
            project.image_aspect_ratio,
            current_app.config['DEFAULT_RESOLUTION'],
            app,
            combined_requirements if combined_requirements.strip() else None,
            language,
            selected_page_ids if selected_page_ids else None
        )
        
        # Update project status
        project.status = 'GENERATING_IMAGES'
        db.session.commit()
        
        return success_response({
            'task_id': task.id,
            'status': 'GENERATING_IMAGES',
            'total_pages': len(pages)
        }, status_code=202)
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_images failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/style/recommendations', methods=['POST'])
def generate_style_recommendations(project_id):
    """
    POST /api/projects/{project_id}/style/recommendations - Recommend 3 style_json and generate 12 preview images

    Body:
    {
      "template_json": "...",        # required (JSON string)
      "style_requirements": "...",   # optional
      "language": "zh",              # optional
      "generate_previews": true      # optional, default false. If false, only return 3 recommended style_json (no images)
    }
    """
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        data = request.get_json() or {}
        template_json_text = (data.get('template_json') or '').strip()
        if not template_json_text:
            return bad_request("template_json is required")
        try:
            template_json_obj = json.loads(template_json_text)
        except Exception as e:
            return bad_request(f"template_json must be valid JSON: {str(e)}")

        style_requirements = (data.get('style_requirements') or '').strip()
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        generate_previews = data.get('generate_previews', False)
        if generate_previews is None:
            generate_previews = False
        if not isinstance(generate_previews, bool):
            return bad_request("generate_previews must be a boolean")

        # Compact JSON skeleton for prompt to reduce token/whitespace overhead.
        # This keeps the exact same structure/values but strips formatting spaces/newlines.
        template_json_text_compact = json.dumps(template_json_obj, ensure_ascii=False, separators=(',', ':'))

        task = Task(project_id=project_id, task_type='STYLE_RECOMMENDATIONS', status='PENDING')
        task.set_progress({
            'mode': 'recommendations_and_previews' if generate_previews else 'recommendations_only',
            'total': 12 if generate_previews else 3,
            'completed': 0,
            'failed': 0,
            'recommendations': []
        })
        db.session.add(task)
        db.session.commit()

        app = current_app._get_current_object()
        task_manager.submit_task(
            task.id,
            generate_style_recommendations_and_previews_task,
            project_id,
            template_json_text_compact,
            style_requirements,
            app,
            language,
            generate_previews
        )

        return success_response({'task_id': task.id, 'status': 'PROCESSING'}, status_code=202)

    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_style_recommendations failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/style/recommendations/<rec_id>/previews', methods=['POST'])
def regenerate_style_previews(project_id, rec_id):
    """
    POST /api/projects/{project_id}/style/recommendations/{rec_id}/previews - Regenerate 4 preview images for one style_json

    Body:
    {
      "style_json": {...} | "...",   # required
      "sample_pages": {              # optional
        "cover": "...",
        "toc": "...",
        "detail": "...",
        "ending": "..."
      },
      "language": "zh"               # optional
    }
    """
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        data = request.get_json() or {}
        style_json = data.get('style_json')
        if style_json is None:
            return bad_request("style_json is required")

        style_json_text = ""
        if isinstance(style_json, (dict, list)):
            style_json_text = json.dumps(style_json, ensure_ascii=False)
        elif isinstance(style_json, str):
            style_json_text = style_json.strip()
            if not style_json_text:
                return bad_request("style_json is required")
            try:
                json.loads(style_json_text)
            except Exception as e:
                return bad_request(f"style_json must be valid JSON: {str(e)}")
        else:
            return bad_request("style_json must be an object/array or JSON string")

        sample_pages = data.get('sample_pages')
        if sample_pages is not None and not isinstance(sample_pages, dict):
            return bad_request("sample_pages must be an object")

        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))

        task = Task(project_id=project_id, task_type='STYLE_PREVIEW_REGENERATE', status='PENDING')
        task.set_progress({'total': 4, 'completed': 0, 'failed': 0, 'rec_id': rec_id})
        db.session.add(task)
        db.session.commit()

        app = current_app._get_current_object()
        task_manager.submit_task(
            task.id,
            regenerate_single_style_previews_task,
            project_id,
            rec_id,
            style_json_text,
            sample_pages,
            app,
            language
        )

        return success_response({'task_id': task.id, 'status': 'PROCESSING'}, status_code=202)

    except Exception as e:
        db.session.rollback()
        logger.error(f"regenerate_style_previews failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/tasks/<task_id>', methods=['GET'])
def get_task_status(project_id, task_id):
    """
    GET /api/projects/{project_id}/tasks/{task_id} - Get task status
    """
    try:
        task = Task.query.get(task_id)
        
        if not task or task.project_id != project_id:
            return not_found('Task')

        # If the server restarted or the in-memory executor lost the Future,
        # tasks can be left in PROCESSING forever. Detect and fail-fast so the
        # frontend stops infinite polling.
        if task.status in ('PENDING', 'PROCESSING', 'RUNNING') and task.completed_at is None:
            if not task_manager.is_task_active(task_id):
                task.status = 'FAILED'
                task.error_message = task.error_message or "Task is not active. The server may have restarted or the worker crashed."
                task.completed_at = datetime.utcnow()
                db.session.commit()
        
        return success_response(task.to_dict())
    
    except Exception as e:
        logger.error(f"get_task_status failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/refine/outline', methods=['POST'])
def refine_outline(project_id):
    """
    POST /api/projects/{project_id}/refine/outline - Refine outline based on user requirements
    
    Request body:
    {
        "user_requirement": "用户要求，例如：增加一页关于XXX的内容",
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        data = request.get_json()
        
        if not data or not data.get('user_requirement'):
            return bad_request("user_requirement is required")
        
        user_requirement = data['user_requirement']
        
        # IMPORTANT: Expire all cached objects to ensure we get fresh data from database
        # This prevents issues when multiple refine operations are called in sequence
        db.session.expire_all()
        
        # Get current outline from pages
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        
        # Reconstruct current outline from pages (如果没有页面，使用空列表)
        if not pages:
            logger.info(f"项目 {project_id} 当前没有页面，将从空开始生成")
            current_outline = []  # 空大纲
        else:
            current_outline = _reconstruct_outline_from_pages(pages)
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        if reference_files_content:
            logger.info(f"Found {len(reference_files_content)} reference files for refine_outline")
            for rf in reference_files_content:
                logger.info(f"  - {rf['filename']}: {len(rf['content'])} characters")
        else:
            logger.info(f"No reference files found for project {project_id}")
        
        project_context = ProjectContext(project.to_dict(), reference_files_content)
        
        # Get previous requirements and language from request
        previous_requirements = data.get('previous_requirements', [])
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        # Refine outline
        logger.info(f"开始修改大纲: 项目 {project_id}, 用户要求: {user_requirement}, 历史要求数: {len(previous_requirements)}")
        refined_outline = ai_service.refine_outline(
            current_outline=current_outline,
            user_requirement=user_requirement,
            project_context=project_context,
            previous_requirements=previous_requirements,
            language=language
        )
        
        # Flatten outline to pages and smart merge with existing
        pages_data = ai_service.flatten_outline(refined_outline)
        pages_list = _smart_merge_pages(project_id, pages_data)

        preserved_count = sum(1 for p in pages_list if p.description_content)
        new_count = len(pages_list) - preserved_count
        logger.info(f"描述匹配完成: 保留了 {preserved_count} 个页面的描述, {new_count} 个页面需要重新生成描述")

        # Update project status
        if preserved_count and all(p.description_content for p in pages_list):
            project.status = 'DESCRIPTIONS_GENERATED'
        else:
            project.status = 'OUTLINE_GENERATED'
        project.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        logger.info(f"大纲修改完成: 项目 {project_id}, 创建了 {len(pages_list)} 个页面")
        
        # Return pages
        return success_response({
            'pages': [page.to_dict() for page in pages_list],
            'message': '大纲修改成功'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"refine_outline failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/<project_id>/refine/descriptions', methods=['POST'])
def refine_descriptions(project_id):
    """
    POST /api/projects/{project_id}/refine/descriptions - Refine page descriptions based on user requirements
    
    Request body:
    {
        "user_requirement": "用户要求，例如：让描述更详细一些",
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        data = request.get_json()
        
        if not data or not data.get('user_requirement'):
            return bad_request("user_requirement is required")
        
        user_requirement = data['user_requirement']
        
        db.session.expire_all()
        
        # Get current pages
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        
        if not pages:
            logger.info(f"项目 {project_id} 当前没有页面，无法修改描述")
            return bad_request("No pages found for project. Please generate outline first.")
        
        # Check if pages have descriptions (允许没有描述，从空开始)
        has_descriptions = any(page.description_content for page in pages)
        if not has_descriptions:
            logger.info(f"项目 {project_id} 当前没有描述，将基于大纲生成新描述")
        
        # Reconstruct outline from pages
        outline = _reconstruct_outline_from_pages(pages)
        
        # Prepare current descriptions
        current_descriptions = []
        for i, page in enumerate(pages):
            outline_content = page.get_outline_content()
            desc_content = page.get_description_content()
            
            current_descriptions.append({
                'index': i,
                'title': outline_content.get('title', '未命名') if outline_content else '未命名',
                'description_content': desc_content if desc_content else ''
            })
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        if reference_files_content:
            logger.info(f"Found {len(reference_files_content)} reference files for refine_descriptions")
            for rf in reference_files_content:
                logger.info(f"  - {rf['filename']}: {len(rf['content'])} characters")
        else:
            logger.info(f"No reference files found for project {project_id}")
        
        project_context = ProjectContext(project.to_dict(), reference_files_content)
        
        # Get previous requirements and language from request
        previous_requirements = data.get('previous_requirements', [])
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        # Refine descriptions
        logger.info(f"开始修改页面描述: 项目 {project_id}, 用户要求: {user_requirement}, 历史要求数: {len(previous_requirements)}")
        refined_descriptions = ai_service.refine_descriptions(
            current_descriptions=current_descriptions,
            user_requirement=user_requirement,
            project_context=project_context,
            outline=outline,
            previous_requirements=previous_requirements,
            language=language
        )
        
        # 验证返回的描述数量
        if len(refined_descriptions) != len(pages):
            error_msg = ""
            logger.error(f"AI 返回的描述数量不匹配: 期望 {len(pages)} 个页面，实际返回 {len(refined_descriptions)} 个描述。")
            
            # 如果 AI 试图增删页面，给出明确提示
            if len(refined_descriptions) > len(pages):
                error_msg += " 提示：如需增加页面，请在大纲页面进行操作。"
            elif len(refined_descriptions) < len(pages):
                error_msg += " 提示：如需删除页面，请在大纲页面进行操作。"
            
            return bad_request(error_msg)
        
        # Update pages with refined descriptions
        for page, refined_desc in zip(pages, refined_descriptions):
            desc_content = {
                "text": refined_desc,
                "generated_at": datetime.utcnow().isoformat()
            }
            page.set_description_content(desc_content)
            page.status = 'DESCRIPTION_GENERATED'
        
        # Update project status
        project.status = 'DESCRIPTIONS_GENERATED'
        project.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        logger.info(f"页面描述修改完成: 项目 {project_id}, 更新了 {len(pages)} 个页面")
        
        # Return pages
        return success_response({
            'pages': [page.to_dict() for page in pages],
            'message': '页面描述修改成功'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"refine_descriptions failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/renovation', methods=['POST'])
def create_ppt_renovation_project():
    """
    POST /api/projects/renovation - Create a PPT renovation project

    Accepts a PDF/PPTX file upload, creates project with pages from PDF images,
    then submits an async task to parse content and fill outline + descriptions.

    Content-Type: multipart/form-data
    Form:
        file: PDF or PPTX file (required)
        keep_layout: "true"/"false" - whether to preserve layout via caption model (optional, default false)
        template_style: style description text (optional)

    Returns:
        {project_id, task_id, page_count}
    """
    try:
        # Validate file
        if 'file' not in request.files:
            return bad_request("No file uploaded")

        file = request.files['file']
        if file.filename == '':
            return bad_request("No file selected")

        # Check file extension
        filename = file.filename.lower()
        if not (filename.endswith('.pdf') or filename.endswith('.pptx') or filename.endswith('.ppt')):
            return bad_request("Only PDF and PPTX files are supported")

        keep_layout = request.form.get('keep_layout', 'false').lower() == 'true'
        template_style = request.form.get('template_style', '').strip() or None

        # Create project
        project = Project(
            creation_type='ppt_renovation',
            template_style=template_style,
            status='DRAFT'
        )
        db.session.add(project)
        db.session.commit()

        project_id = project.id

        # Save uploaded file
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        project_dir = Path(current_app.config['UPLOAD_FOLDER']) / project_id
        template_dir = project_dir / "template"
        template_dir.mkdir(parents=True, exist_ok=True)

        # Save original file
        safe_name = secure_filename(file.filename)
        safe_name = secure_filename(file.filename)
        original_path = template_dir / safe_name
        file.save(str(original_path))

        # Convert PPTX to PDF if needed
        pdf_path = str(original_path)
        if safe_name.lower().endswith(('.pptx', '.ppt')):
            try:
                subprocess.run(
                    ['libreoffice', '--headless', '--convert-to', 'pdf', '--outdir', str(template_dir), str(original_path)],
                    check=True, timeout=120, capture_output=True
                )
                pdf_name = safe_name.rsplit('.', 1)[0] + '.pdf'
                pdf_path = str(template_dir / pdf_name)
                if not os.path.exists(pdf_path):
                    raise ValueError("PDF conversion failed - output file not found")
                logger.info(f"Converted PPTX to PDF: {pdf_path}")
            except subprocess.TimeoutExpired:
                raise ValueError("PPTX to PDF conversion timed out")
            except FileNotFoundError:
                raise ValueError("PPTX conversion requires LibreOffice, which is not installed. Please convert your PPTX to PDF locally before uploading.")

        # Convert PDF to page images using PyMuPDF or pdf2image
        pages_dir = project_dir / "pages"
        pages_dir.mkdir(parents=True, exist_ok=True)

        page_image_paths = []
        pdf_page_width = None
        pdf_page_height = None
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(pdf_path)
            # Extract page dimensions from the first page before rendering
            if len(doc) > 0:
                rect = doc[0].rect
                pdf_page_width = rect.width
                pdf_page_height = rect.height
            for i, fitz_page in enumerate(doc):
                try:
                    mat = fitz.Matrix(2, 2)
                    pix = fitz_page.get_pixmap(matrix=mat)
                    img_path = str(pages_dir / f"page_{i + 1}_original.png")
                    pix.save(img_path)
                    page_image_paths.append(img_path)
                except Exception as e:
                    logger.error(f"Failed to render page {i + 1} with PyMuPDF: {e}")
                    page_image_paths.append(None)
            doc.close()
        except ImportError:
            # Fallback: use pdf2image
            try:
                from pdf2image import convert_from_path
                images = convert_from_path(pdf_path, dpi=200)
                for i, img in enumerate(images):
                    try:
                        # Extract page dimensions from the first image
                        if pdf_page_width is None:
                            pdf_page_width = img.width
                            pdf_page_height = img.height
                        img_path = str(pages_dir / f"page_{i + 1}_original.png")
                        img.save(img_path, 'PNG')
                        page_image_paths.append(img_path)
                    except Exception as e:
                        logger.error(f"Failed to render page {i + 1} with pdf2image: {e}")
                        page_image_paths.append(None)
            except ImportError:
                raise ValueError("Neither PyMuPDF nor pdf2image is available for PDF rendering")

        # Fail-fast if no pages rendered at all
        valid_pages = [p for p in page_image_paths if p is not None]
        if not valid_pages:
            raise ValueError("All pages failed to render from PDF")

        logger.info(f"Rendered {len(valid_pages)}/{len(page_image_paths)} page images from PDF")

        # Set project aspect ratio from PDF page dimensions
        if pdf_page_width and pdf_page_height and pdf_page_width > 0 and pdf_page_height > 0:
            try:
                raw_ratio = f"{int(round(pdf_page_width))}:{int(round(pdf_page_height))}"
                project.image_aspect_ratio = normalize_aspect_ratio(raw_ratio)
                logger.info(f"Set project aspect ratio from PDF: {pdf_page_width}x{pdf_page_height} -> {project.image_aspect_ratio}")
            except (ValueError, OverflowError) as e:
                logger.warning(f"Could not normalize PDF aspect ratio ({pdf_page_width}x{pdf_page_height}): {e}, keeping default 16:9")

        # Create Page records with initial images
        from services.task_manager import save_image_with_version
        from PIL import Image as PILImage

        pages_list = []
        for i, img_path in enumerate(page_image_paths):
            if img_path is None:
                logger.warning(f"Skipping page {i + 1}: render failed")
                continue

            page = Page(
                project_id=project_id,
                order_index=len(pages_list),
                status='DRAFT'
            )
            page.set_outline_content({
                'title': f'Page {i + 1}',
                'points': []
            })
            db.session.add(page)
            db.session.flush()  # Get page.id

            # Save the PDF page image as initial version
            img = PILImage.open(img_path)
            image_path, _version = save_image_with_version(
                img, project_id, page.id, file_service, page_obj=page
            )
            img.close()

            pages_list.append(page)

        db.session.commit()

        # Create async task
        task = Task(
            project_id=project_id,
            task_type='PPT_RENOVATION',
            status='PENDING'
        )
        task.set_progress({
            'total': len(pages_list),
            'completed': 0,
            'failed': 0,
            'current_step': 'queued'
        })
        db.session.add(task)
        db.session.commit()

        # Get services
        ai_service = get_ai_service()
        from services.file_parser_service import FileParserService
        file_parser_service = FileParserService(
            mineru_token=current_app.config['MINERU_TOKEN'],
            mineru_api_base=current_app.config['MINERU_API_BASE'],
            google_api_key=current_app.config.get('GOOGLE_API_KEY', ''),
            google_api_base=current_app.config.get('GOOGLE_API_BASE', ''),
            openai_api_key=current_app.config.get('OPENAI_API_KEY', ''),
            openai_api_base=current_app.config.get('OPENAI_API_BASE', ''),
            image_caption_model=current_app.config['IMAGE_CAPTION_MODEL'],
            provider_format=current_app.config.get('AI_PROVIDER_FORMAT', 'gemini'),
            lazyllm_image_caption_source=current_app.config.get('IMAGE_CAPTION_MODEL_SOURCE', 'doubao'),
        )

        language = request.form.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        app = current_app._get_current_object()

        # Submit async task
        task_manager.submit_task(
            task.id,
            process_ppt_renovation_task,
            project_id,
            ai_service,
            file_service,
            file_parser_service,
            keep_layout,
            5,  # max_workers
            app,
            language
        )

        project.status = 'PROCESSING'
        db.session.commit()

        return success_response({
            'project_id': project_id,
            'task_id': task.id,
            'page_count': len(pages_list)
        }, status_code=202)

    except Exception as e:
        db.session.rollback()
        logger.error(f"create_ppt_renovation_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


# Style extraction blueprint (not bound to any project)
style_bp = Blueprint('style', __name__, url_prefix='/api')


@style_bp.route('/extract-style', methods=['POST'])
def extract_style():
    """
    POST /api/extract-style - Extract style description from an image

    Content-Type: multipart/form-data
    Form:
        image: Image file (required)

    Returns:
        {style_description: "..."}
    """
    try:
        if 'image' not in request.files:
            return bad_request("No image file uploaded")

        file = request.files['image']
        if file.filename == '':
            return bad_request("No file selected")

        # Save to temp location
        import tempfile

        ext = secure_filename(file.filename).rsplit('.', 1)[-1].lower() if '.' in file.filename else 'png'
        with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        try:
            ai_service = get_ai_service()
            style_description = ai_service.extract_style_description(tmp_path)

            return success_response({
                'style_description': style_description
            })
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"extract_style failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@style_bp.route('/parse/description', methods=['POST'])
def parse_description_without_project():
    """
    POST /api/parse/description - Parse description text into page descriptions (no project required)

    Request body:
    {
        "description_text": "...",  # required
        "language": "zh",  # output language: zh, en, ja, auto
        "reference_file_ids": ["id1", "id2"]  # optional
    }
    """
    try:
        data = request.get_json() or {}
        description_text = data.get('description_text')
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        reference_file_ids = data.get('reference_file_ids') or []

        if not description_text:
            return bad_request("description_text is required")

        if not isinstance(reference_file_ids, list):
            reference_file_ids = []

        ai_service = get_ai_service()
        reference_files_content = _get_reference_files_content_by_ids(reference_file_ids)
        project_context = ProjectContext({
            'description_text': description_text,
            'creation_type': 'descriptions'
        }, reference_files_content)

        outline = ai_service.parse_description_to_outline(project_context, language=language)
        page_descriptions = ai_service.parse_description_to_page_descriptions(project_context, outline, language=language)

        return success_response({
            'page_descriptions': page_descriptions
        })

    except Exception as e:
        logger.error(f"parse_description_without_project failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@style_bp.route('/parse/report', methods=['POST'])
def split_report_without_project():
    """
    POST /api/parse/report - Split long report into PPT JSON (no project required)

    Request body:
    {
        "report_text": "...",  # required
        "language": "zh",  # output language: zh, en, ja, auto (optional)
        "reference_file_ids": ["id1", "id2"]  # optional
    }
    """
    try:
        data = request.get_json() or {}
        report_text = data.get('report_text')
        reference_file_ids = data.get('reference_file_ids') or []

        if not report_text:
            return bad_request("report_text is required")

        if not isinstance(reference_file_ids, list):
            reference_file_ids = []

        ai_service = get_ai_service()
        reference_files_content = _get_reference_files_content_by_ids(reference_file_ids)
        prompt = get_long_report_split_prompt(report_text, reference_files_content)
        result_text = ai_service.text_provider.generate_text(prompt, thinking_budget=1000).strip()

        return success_response({
            'result': result_text
        })

    except Exception as e:
        logger.error(f"split_report_without_project failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@style_bp.route('/parse/report/stream', methods=['POST'])
def split_report_without_project_stream():
    """
    POST /api/parse/report/stream - Stream split report result via SSE

    Request body:
    {
        "report_text": "...",  # required
        "language": "zh",  # output language: zh, en, ja, auto (optional)
        "reference_file_ids": ["id1", "id2"]  # optional
    }
    """
    data = request.get_json() or {}
    report_text = data.get('report_text')
    reference_file_ids = data.get('reference_file_ids') or []

    if not report_text:
        return bad_request("report_text is required")

    if not isinstance(reference_file_ids, list):
        reference_file_ids = []

    def generate():
        try:
            ai_service = get_ai_service()
            reference_files_content = _get_reference_files_content_by_ids(reference_file_ids)
            prompt = get_long_report_split_prompt(report_text, reference_files_content)
            provider = ai_service.text_provider
            for chunk in provider.stream_text(prompt, thinking_budget=1000):
                if chunk:
                    yield _format_sse_data(chunk)
            yield _format_sse_data('[DONE]')
        except Exception as e:
            logger.error(f"split_report_without_project_stream failed: {str(e)}", exc_info=True)
            yield "event: error\n" + _format_sse_data(str(e))

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
    }
    return Response(stream_with_context(generate()), headers=headers)
