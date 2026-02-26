"""
Style preview service - recommend style_json and generate preview images.
"""
import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, Optional

from models import db, Task, Project, ReferenceFile
from services.ai_service_manager import get_ai_service
from services.file_service import FileService
from services.prompts import get_style_recommendations_prompt

logger = logging.getLogger(__name__)


def _get_project_reference_files_content(project_id: str) -> list[dict[str, str]]:
    reference_files = ReferenceFile.query.filter_by(
        project_id=project_id,
        parse_status='completed'
    ).all()
    files_content: list[dict[str, str]] = []
    for rf in reference_files:
        if rf.markdown_content:
            files_content.append({'filename': rf.filename, 'content': rf.markdown_content})
    return files_content


def _build_style_extra_requirements(style_json_text: str, style_requirements: str = "") -> str:
    parts = []
    if style_json_text and style_json_text.strip():
        parts.append("ppt页面风格指导(JSON)：\n<style_json>\n" + style_json_text.strip() + "\n</style_json>")
    if style_requirements and style_requirements.strip():
        parts.append("附加风格要求：\n" + style_requirements.strip())
    return "\n\n".join(parts).strip()


def _normalize_style_recommendations(result: Any) -> list[dict]:
    if isinstance(result, dict):
        recs = result.get('recommendations')
        if isinstance(recs, list):
            return recs
    if isinstance(result, list):
        return result
    return []


def generate_style_recommendations_and_previews_task(task_id: str, project_id: str,
                                                     template_json_text: str,
                                                     style_requirements: str = "",
                                                     app=None,
                                                     language: str = None,
                                                     generate_previews: bool = True):
    """
    Background task:
    1) Call text model to recommend 3 style_json + 4 sample pages each
    2) Generate 12 preview images (3 * 4) and save under uploads/{project_id}/style-previews/
    3) Persist everything into Task.progress for frontend polling.
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PROCESSING'
            db.session.commit()

            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            # Store requirements to project for later reuse (best-effort)
            if style_requirements is not None:
                project.template_style = style_requirements
                project.updated_at = datetime.utcnow()
                db.session.commit()

            ai_service = get_ai_service()
            reference_files_content = _get_project_reference_files_content(project_id)

            # Update progress to show we're generating recommendations
            progress = task.get_progress() or {}
            progress['current_step'] = 'generating_recommendations'
            task.set_progress(progress)
            db.session.commit()

            prompt = get_style_recommendations_prompt(
                project_dict=project.to_dict(include_pages=False),
                reference_files_content=reference_files_content,
                template_json_text=template_json_text,
                style_requirements=style_requirements,
                language=language
            )

            # Record prompt size for debugging slow calls
            progress = task.get_progress() or {}
            progress['prompt_chars'] = len(prompt) if prompt else 0
            progress['template_json_chars'] = len(template_json_text) if template_json_text else 0
            task.set_progress(progress)
            db.session.commit()

            # For style recommendations we prefer low latency; explicitly disable thinking per-call
            result = ai_service.generate_json(prompt, thinking_budget=0)
            recs = _normalize_style_recommendations(result)
            if len(recs) != 3:
                logger.warning(f"Expected 3 recommendations, got {len(recs)}")

            # Prepare progress payload
            normalized_recs: list[dict] = []
            for rec in recs[:3]:
                rec_id = str(uuid.uuid4())
                name = (rec.get('name') or '').strip() if isinstance(rec, dict) else ''
                rationale = (rec.get('rationale') or '').strip() if isinstance(rec, dict) else ''
                style_json_obj = rec.get('style_json') if isinstance(rec, dict) else None
                sample_pages = rec.get('sample_pages') if isinstance(rec, dict) else None

                if not isinstance(sample_pages, dict):
                    sample_pages = {}

                normalized_recs.append({
                    'id': rec_id,
                    'name': name or f"Style {len(normalized_recs) + 1}",
                    'rationale': rationale,
                    'style_json': style_json_obj,
                    'sample_pages': {
                        'cover': sample_pages.get('cover', ''),
                        'toc': sample_pages.get('toc', ''),
                        'detail': sample_pages.get('detail', ''),
                        'ending': sample_pages.get('ending', ''),
                    },
                    'preview_images': {
                        'cover_url': '',
                        'toc_url': '',
                        'detail_url': '',
                        'ending_url': '',
                    }
                })

            # Ensure progress initialized
            progress = task.get_progress() or {}
            total = 12 if generate_previews else len(normalized_recs)
            completed_init = 0 if generate_previews else len(normalized_recs)
            progress.update({
                'mode': 'recommendations_and_previews' if generate_previews else 'recommendations_only',
                'total': total,
                'completed': completed_init,
                'failed': 0,
                'current_step': 'generating_preview_images' if generate_previews else 'recommendations_ready',
                'recommendations': normalized_recs,
            })
            task.set_progress(progress)
            db.session.commit()

            # Step-by-step testing mode: only return recommendations, skip image generation.
            if not generate_previews:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                p = task.get_progress() or {}
                p['current_step'] = 'recommendations_completed'
                p['completed'] = len(normalized_recs)
                p['total'] = len(normalized_recs)
                task.set_progress(p)
                db.session.commit()
                return

            file_service = FileService(app.config['UPLOAD_FOLDER'])
            aspect_ratio = project.image_aspect_ratio or app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
            resolution = app.config.get('DEFAULT_RESOLUTION', '2K')

            outline = [
                {'title': '封面', 'points': []},
                {'title': '目录', 'points': []},
                {'title': '详情', 'points': []},
                {'title': '结尾', 'points': []},
            ]

            slide_keys = [('cover', 1), ('toc', 2), ('detail', 3), ('ending', 4)]

            completed = 0
            failed = 0

            for rec in normalized_recs:
                style_json_text = ""
                if rec.get('style_json') is not None:
                    style_json_text = json.dumps(rec['style_json'], ensure_ascii=False)

                extra_req = _build_style_extra_requirements(style_json_text, style_requirements)

                for slide_key, page_index in slide_keys:
                    try:
                        page_desc = (rec.get('sample_pages') or {}).get(slide_key, '')
                        page = outline[page_index - 1]
                        prompt_img = ai_service.generate_image_prompt(
                            outline=outline,
                            page=page,
                            page_desc=page_desc,
                            page_index=page_index,
                            extra_requirements=extra_req,
                            language=language or app.config.get('OUTPUT_LANGUAGE', 'zh'),
                            has_template=False
                        )
                        image = ai_service.generate_image(
                            prompt_img,
                            ref_image_path=None,
                            aspect_ratio=aspect_ratio,
                            resolution=resolution
                        )
                        if not image:
                            raise ValueError("Failed to generate preview image")

                        run_id = uuid.uuid4().hex[:10]
                        rel_path = file_service.save_style_preview_image(
                            image=image,
                            project_id=project_id,
                            rec_id=rec['id'],
                            slide_type=slide_key,
                            run_id=run_id,
                            image_format='PNG'
                        )
                        filename = rel_path.split('/')[-1]
                        url = f"/files/{project_id}/style-previews/{rec['id']}/{filename}"

                        # Update task progress
                        db.session.expire_all()
                        task = Task.query.get(task_id)
                        if task:
                            p = task.get_progress() or {}
                            p['current_step'] = 'generating_preview_images'
                            p_recs = p.get('recommendations') or []
                            for r in p_recs:
                                if r.get('id') == rec['id']:
                                    r.setdefault('preview_images', {})
                                    r['preview_images'][f"{slide_key}_url"] = url
                                    break
                            completed += 1
                            p['completed'] = completed
                            p['failed'] = failed
                            p['recommendations'] = p_recs
                            task.set_progress(p)
                            db.session.commit()
                    except Exception as e:
                        logger.error(f"Preview generation failed: rec={rec.get('id')} slide={slide_key}: {str(e)}", exc_info=True)
                        failed += 1
                        db.session.expire_all()
                        task = Task.query.get(task_id)
                        if task:
                            p = task.get_progress() or {}
                            p['completed'] = completed
                            p['failed'] = failed
                            task.set_progress(p)
                            db.session.commit()

            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                # Ensure total is correct even if recs < 3
                p = task.get_progress() or {}
                p.setdefault('total', 12)
                p['completed'] = completed
                p['failed'] = failed
                task.set_progress(p)
                db.session.commit()

        except Exception as e:
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def _find_sample_pages_from_latest_task(project_id: str, rec_id: str) -> Optional[Dict[str, str]]:
    tasks = Task.query.filter_by(project_id=project_id).order_by(Task.created_at.desc()).all()
    for t in tasks:
        progress = t.get_progress()
        recs = progress.get('recommendations') if isinstance(progress, dict) else None
        if not isinstance(recs, list):
            continue
        for r in recs:
            if isinstance(r, dict) and r.get('id') == rec_id:
                sp = r.get('sample_pages')
                if isinstance(sp, dict):
                    return {
                        'cover': sp.get('cover', ''),
                        'toc': sp.get('toc', ''),
                        'detail': sp.get('detail', ''),
                        'ending': sp.get('ending', ''),
                    }
    return None


def regenerate_single_style_previews_task(task_id: str, project_id: str, rec_id: str,
                                         style_json_text: str,
                                         sample_pages: Optional[Dict[str, str]] = None,
                                         app=None,
                                         language: str = None):
    """
    Background task: regenerate 4 preview images for a given rec_id.
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PROCESSING'
            db.session.commit()

            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            if not sample_pages:
                sample_pages = _find_sample_pages_from_latest_task(project_id, rec_id)
            if not sample_pages:
                raise ValueError("sample_pages is required and could not be inferred")

            # Keep style_requirements synced from project.template_style
            style_requirements = project.template_style or ""
            extra_req = _build_style_extra_requirements(style_json_text, style_requirements)

            ai_service = get_ai_service()
            file_service = FileService(app.config['UPLOAD_FOLDER'])
            aspect_ratio = project.image_aspect_ratio or app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
            resolution = app.config.get('DEFAULT_RESOLUTION', '2K')

            outline = [
                {'title': '封面', 'points': []},
                {'title': '目录', 'points': []},
                {'title': '详情', 'points': []},
                {'title': '结尾', 'points': []},
            ]

            slide_keys = [('cover', 1), ('toc', 2), ('detail', 3), ('ending', 4)]

            completed = 0
            failed = 0
            progress = task.get_progress() or {}
            progress.update({'total': 4, 'completed': 0, 'failed': 0, 'rec_id': rec_id})
            task.set_progress(progress)
            db.session.commit()

            preview_urls: Dict[str, str] = {}

            def render_slide(slide_key: str, page_index: int) -> tuple[str, str]:
                page_desc = sample_pages.get(slide_key, '')
                page = outline[page_index - 1]
                prompt_img = ai_service.generate_image_prompt(
                    outline=outline,
                    page=page,
                    page_desc=page_desc,
                    page_index=page_index,
                    extra_requirements=extra_req,
                    language=language or app.config.get('OUTPUT_LANGUAGE', 'zh'),
                    has_template=False
                )
                image = ai_service.generate_image(
                    prompt_img,
                    ref_image_path=None,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution
                )
                if not image:
                    raise ValueError("Failed to generate preview image")

                run_id = uuid.uuid4().hex[:10]
                rel_path = file_service.save_style_preview_image(
                    image=image,
                    project_id=project_id,
                    rec_id=rec_id,
                    slide_type=slide_key,
                    run_id=run_id,
                    image_format='PNG'
                )
                filename = rel_path.split('/')[-1]
                url = f"/files/{project_id}/style-previews/{rec_id}/{filename}"
                return slide_key, url

            max_workers = int(app.config.get('STYLE_PREVIEW_WORKERS', 4))
            max_workers = max(1, min(max_workers, len(slide_keys)))

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {
                    executor.submit(render_slide, slide_key, page_index): slide_key
                    for slide_key, page_index in slide_keys
                }
                for future in as_completed(future_map):
                    slide_key = future_map[future]
                    try:
                        slide_key, url = future.result()
                        preview_urls[f"{slide_key}_url"] = url
                        completed += 1
                    except Exception as e:
                        logger.error(f"Regenerate preview failed: rec={rec_id} slide={slide_key}: {str(e)}", exc_info=True)
                        failed += 1
                    task = Task.query.get(task_id)
                    if task:
                        p = task.get_progress() or {}
                        p['completed'] = completed
                        p['failed'] = failed
                        p['preview_images'] = preview_urls
                        task.set_progress(p)
                        db.session.commit()

            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                p = task.get_progress() or {}
                p['completed'] = completed
                p['failed'] = failed
                p['preview_images'] = preview_urls
                task.set_progress(p)
                db.session.commit()

        except Exception as e:
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()
