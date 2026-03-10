"""
Style preview service - recommend style_json and generate preview images.
"""
import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, Optional

from models import db, Task, Project, ReferenceFile, StylePreset
from services.ai_service_manager import get_ai_service
from services.file_service import FileService
from services.prompts import get_style_recommendations_prompt

logger = logging.getLogger(__name__)


def _get_project_reference_files_content(project_id: str | None) -> list[dict[str, str]]:
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


def _is_transient_image_network_error(exc: Exception) -> bool:
    """
    Heuristic matcher for transient network/TLS errors from provider SDK stacks.
    """
    text = f"{type(exc).__name__}: {exc}".lower()
    markers = (
        'connecterror',
        'connectionerror',
        'connection error',
        'readtimeout',
        'writetimeout',
        'timeout',
        'remoteprotocolerror',
        'unexpected_eof_while_reading',
        'ssl:',
        'eof occurred in violation of protocol',
        'temporarily unavailable',
        'connection reset',
        'broken pipe',
    )
    return any(marker in text for marker in markers)


def _call_with_transient_retry(*, fn, description: str, max_attempts: int = 3):
    """Retry transient upstream model/network errors with exponential backoff."""
    attempts = max(1, int(max_attempts))
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            last_error = exc
            transient = _is_transient_image_network_error(exc)
            if transient and attempt < attempts:
                sleep_s = min(2 ** (attempt - 1), 8)
                logger.warning(
                    "Transient upstream error, retrying: step=%s attempt=%s/%s sleep=%ss err=%s",
                    description, attempt, attempts, sleep_s, str(exc)
                )
                time.sleep(sleep_s)
                continue
            if transient:
                raise RuntimeError(
                    "上游模型连接失败，请稍后重试。原始错误: %s" % str(exc)
                ) from exc
            raise

    if last_error:
        raise last_error
    raise RuntimeError(f"{description} failed")


def _render_preview_slide_with_retry(*,
                                     ai_service,
                                     file_service: FileService,
                                     project_id: str,
                                     rec_id: str,
                                     slide_key: str,
                                     page_index: int,
                                     outline: list[dict],
                                     sample_pages: Dict[str, str],
                                     extra_req: str,
                                     aspect_ratio: str,
                                     resolution: str,
                                     language: str,
                                     extra_retries: int) -> tuple[str, str]:
    max_attempts = max(1, int(extra_retries) + 1)
    attempt = 0

    while attempt < max_attempts:
        attempt += 1
        try:
            page_desc = sample_pages.get(slide_key, '')
            page = outline[page_index - 1]
            prompt_img = ai_service.generate_image_prompt(
                outline=outline,
                page=page,
                page_desc=page_desc,
                page_index=page_index,
                extra_requirements=extra_req,
                language=language,
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
        except Exception as e:
            transient = _is_transient_image_network_error(e)
            if attempt < max_attempts and transient:
                sleep_s = min(2 ** (attempt - 1), 8)
                logger.warning(
                    "Regenerate preview transient error, retrying: rec=%s slide=%s attempt=%s/%s sleep=%ss err=%s",
                    rec_id, slide_key, attempt, max_attempts, sleep_s, str(e)
                )
                time.sleep(sleep_s)
                continue
            raise


def generate_style_recommendations_and_previews_task(task_id: str, project_id: str,
                                                     template_json_text: str,
                                                     style_requirements: str = "",
                                                     app=None,
                                                     language: str = None,
                                                     generate_previews: bool = True,
                                                     routing_bundle=None):
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

            project = None if project_id == 'global' else Project.query.get(project_id)
            if project_id != 'global' and not project:
                raise ValueError(f"Project {project_id} not found")

            # Store requirements to project for later reuse (best-effort)
            if project and style_requirements is not None:
                project.template_style = style_requirements
                project.updated_at = datetime.utcnow()
                db.session.commit()

            ai_service = get_ai_service(routing_bundle=routing_bundle)
            reference_files_content = _get_project_reference_files_content(project_id)

            # Update progress to show we're generating recommendations
            progress = task.get_progress() or {}
            progress['current_step'] = 'generating_recommendations'
            task.set_progress(progress)
            db.session.commit()

            prompt = get_style_recommendations_prompt(
                project_dict=project.to_dict(include_pages=False) if project else {},
                reference_files_content=reference_files_content,
                template_json_text=template_json_text,
                style_requirements=style_requirements,
                language=language
            )

            # Record prompt size for debugging slow calls
            progress = task.get_progress() or {}
            progress['prompt_chars'] = len(prompt) if prompt else 0
            progress['template_json_chars'] = len(template_json_text) if template_json_text else 0
            progress['reference_files_count'] = len(reference_files_content or [])
            task.set_progress(progress)
            db.session.commit()

            # For style recommendations we prefer low latency; explicitly disable thinking per-call
            result = _call_with_transient_retry(
                fn=lambda: ai_service.generate_json(prompt, thinking_budget=0),
                description='style_recommendations.generate_json',
                max_attempts=int(app.config.get('STYLE_PREVIEW_RECOMMENDATION_RETRIES', 3)),
            )
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
            aspect_ratio = (project.image_aspect_ratio if project else None) or app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
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
            slide_extra_retries = int(app.config.get('STYLE_PREVIEW_SLIDE_RETRIES', 1))
            # Use image-generation worker config for initial 12-image generation speedup.
            default_initial_workers = int(app.config.get('MAX_IMAGE_WORKERS', 8))
            max_workers = int(app.config.get('STYLE_PREVIEW_INITIAL_WORKERS', default_initial_workers))

            jobs: list[dict[str, Any]] = []
            for rec in normalized_recs:
                style_json_text = ""
                if rec.get('style_json') is not None:
                    style_json_text = json.dumps(rec['style_json'], ensure_ascii=False)
                extra_req = _build_style_extra_requirements(style_json_text, style_requirements)
                for slide_key, page_index in slide_keys:
                    jobs.append({
                        'rec_id': rec['id'],
                        'slide_key': slide_key,
                        'page_index': page_index,
                        'sample_pages': rec.get('sample_pages') or {},
                        'extra_req': extra_req,
                    })

            max_workers = max(1, min(max_workers, len(jobs) if jobs else 1))

            def render_preview_job(job: dict[str, Any]) -> tuple[str, str, str]:
                slide_key, url = _render_preview_slide_with_retry(
                    ai_service=ai_service,
                    file_service=file_service,
                    project_id=project_id,
                    rec_id=job['rec_id'],
                    slide_key=job['slide_key'],
                    page_index=job['page_index'],
                    outline=outline,
                    sample_pages=job['sample_pages'],
                    extra_req=job['extra_req'],
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    language=language or app.config.get('OUTPUT_LANGUAGE', 'zh'),
                    extra_retries=slide_extra_retries,
                )
                return job['rec_id'], slide_key, url

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {executor.submit(render_preview_job, job): job for job in jobs}
                for future in as_completed(future_map):
                    job = future_map[future]
                    rec_id = str(job['rec_id'])
                    slide_key = str(job['slide_key'])
                    try:
                        rec_id, slide_key, url = future.result()
                        completed += 1
                        db.session.expire_all()
                        task = Task.query.get(task_id)
                        if task:
                            p = task.get_progress() or {}
                            p['current_step'] = 'generating_preview_images'
                            p_recs = p.get('recommendations') or []
                            for r in p_recs:
                                if r.get('id') == rec_id:
                                    r.setdefault('preview_images', {})
                                    r['preview_images'][f"{slide_key}_url"] = url
                                    break
                            p['completed'] = completed
                            p['failed'] = failed
                            p['recommendations'] = p_recs
                            task.set_progress(p)
                            db.session.commit()
                    except Exception as e:
                        if _is_transient_image_network_error(e):
                            logger.error(
                                "Preview generation failed after retries (transient network): rec=%s slide=%s err=%s",
                                rec_id, slide_key, str(e)
                            )
                        else:
                            logger.error(
                                "Preview generation failed: rec=%s slide=%s err=%s",
                                rec_id, slide_key, str(e), exc_info=True
                            )
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
                                         language: str = None,
                                         routing_bundle=None):
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

            project = None if project_id == 'global' else Project.query.get(project_id)
            if project_id != 'global' and not project:
                raise ValueError(f"Project {project_id} not found")

            if not sample_pages:
                sample_pages = _find_sample_pages_from_latest_task(project_id, rec_id)
            if not sample_pages:
                raise ValueError("sample_pages is required and could not be inferred")

            # Keep style_requirements synced from project.template_style
            style_requirements = (project.template_style if project else "") or ""
            extra_req = _build_style_extra_requirements(style_json_text, style_requirements)

            ai_service = get_ai_service(routing_bundle=routing_bundle)
            file_service = FileService(app.config['UPLOAD_FOLDER'])
            aspect_ratio = (project.image_aspect_ratio if project else None) or app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
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

            slide_extra_retries = int(app.config.get('STYLE_PREVIEW_SLIDE_RETRIES', 1))
            max_workers = int(app.config.get('STYLE_PREVIEW_WORKERS', 2))
            max_workers = max(1, min(max_workers, len(slide_keys)))

            def render_slide(slide_key: str, page_index: int) -> tuple[str, str]:
                return _render_preview_slide_with_retry(
                    ai_service=ai_service,
                    file_service=file_service,
                    project_id=project_id,
                    rec_id=rec_id,
                    slide_key=slide_key,
                    page_index=page_index,
                    outline=outline,
                    sample_pages=sample_pages or {},
                    extra_req=extra_req,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    language=language or app.config.get('OUTPUT_LANGUAGE', 'zh'),
                    extra_retries=slide_extra_retries,
                )

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
                        if _is_transient_image_network_error(e):
                            logger.error(
                                "Regenerate preview failed after retries (transient network): rec=%s slide=%s err=%s",
                                rec_id, slide_key, str(e)
                            )
                        else:
                            logger.error(
                                "Regenerate preview failed: rec=%s slide=%s err=%s",
                                rec_id, slide_key, str(e), exc_info=True
                            )
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



def _normalize_single_style_recommendation(result: Any) -> dict:
    recs = _normalize_style_recommendations(result)
    if not recs:
        raise ValueError('No style recommendation returned')
    rec = recs[0] if isinstance(recs[0], dict) else {}
    style_json_obj = rec.get('style_json') if isinstance(rec, dict) else None
    if style_json_obj is None:
        raise ValueError('style_json missing from recommendation result')
    sample_pages = rec.get('sample_pages') if isinstance(rec, dict) else None
    if not isinstance(sample_pages, dict):
        sample_pages = {}
    return {
        'name': (rec.get('name') or '').strip() if isinstance(rec, dict) else '',
        'rationale': (rec.get('rationale') or '').strip() if isinstance(rec, dict) else '',
        'style_json': style_json_obj,
        'sample_pages': {
            'cover': sample_pages.get('cover', ''),
            'toc': sample_pages.get('toc', ''),
            'detail': sample_pages.get('detail', ''),
            'ending': sample_pages.get('ending', ''),
        }
    }


def _render_preset_preview_slide_with_retry(*,
                                            ai_service,
                                            file_service: FileService,
                                            preset_id: str,
                                            slide_key: str,
                                            page_index: int,
                                            outline: list[dict],
                                            sample_pages: Dict[str, str],
                                            extra_req: str,
                                            aspect_ratio: str,
                                            resolution: str,
                                            language: str,
                                            extra_retries: int) -> tuple[str, str]:
    max_attempts = max(1, int(extra_retries) + 1)
    attempt = 0

    while attempt < max_attempts:
        attempt += 1
        try:
            page_desc = sample_pages.get(slide_key, '')
            page = outline[page_index - 1]
            prompt_img = ai_service.generate_image_prompt(
                outline=outline,
                page=page,
                page_desc=page_desc,
                page_index=page_index,
                extra_requirements=extra_req,
                language=language,
                has_template=False
            )
            image = ai_service.generate_image(
                prompt_img,
                ref_image_path=None,
                aspect_ratio=aspect_ratio,
                resolution=resolution
            )
            if not image:
                raise ValueError('Failed to generate preview image')

            rel_path = file_service.save_style_preset_preview_image(
                image=image,
                preset_id=preset_id,
                slide_type=slide_key,
            )
            filename = rel_path.split('/')[-1]
            url = f'/files/style-presets/{preset_id}/{filename}'
            return slide_key, url
        except Exception as e:
            transient = _is_transient_image_network_error(e)
            if attempt < max_attempts and transient:
                sleep_s = min(2 ** (attempt - 1), 8)
                logger.warning(
                    'Preset preview transient error, retrying: preset=%s slide=%s attempt=%s/%s sleep=%ss err=%s',
                    preset_id, slide_key, attempt, max_attempts, sleep_s, str(e)
                )
                time.sleep(sleep_s)
                continue
            raise


def _find_sample_pages_from_latest_style_preset_task(preset_id: str) -> Optional[Dict[str, str]]:
    tasks = Task.query.filter_by(project_id='global').order_by(Task.created_at.desc()).all()
    for task in tasks:
        progress = task.get_progress() or {}
        if progress.get('preset_id') != preset_id:
            continue
        sample_pages = progress.get('sample_pages')
        if isinstance(sample_pages, dict):
            return {
                'cover': sample_pages.get('cover', ''),
                'toc': sample_pages.get('toc', ''),
                'detail': sample_pages.get('detail', ''),
                'ending': sample_pages.get('ending', ''),
            }
    return None


def generate_style_preset_task(task_id: str,
                               template_json_text: str,
                               style_requirements: str = '',
                               preset_name: str | None = None,
                               app=None,
                               language: str = None,
                               routing_bundle=None):
    """
    Background task for generating a single saved style preset plus 4 preview images.
    """
    if app is None:
        raise ValueError('Flask app instance must be provided')

    with app.app_context():
        task = None
        try:
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PROCESSING'
            progress = task.get_progress() or {}
            progress.update({
                'stage': 'json_generating',
                'current_step': 'generating_recommendations',
                'total': 5,
                'completed': 0,
                'failed': 0,
                'template_json': template_json_text,
                'style_requirements': style_requirements,
                'preset_name': (preset_name or '').strip(),
                'preview_images': {},
            })
            task.set_progress(progress)
            db.session.commit()

            ai_service = get_ai_service(routing_bundle=routing_bundle)
            prompt = get_style_recommendations_prompt(
                project_dict={},
                reference_files_content=[],
                template_json_text=template_json_text,
                style_requirements=style_requirements,
                language=language,
            )
            result = _call_with_transient_retry(
                fn=lambda: ai_service.generate_json(prompt, thinking_budget=0),
                description='style_preset.generate_json',
                max_attempts=int(app.config.get('STYLE_PREVIEW_RECOMMENDATION_RETRIES', 3)),
            )
            normalized = _normalize_single_style_recommendation(result)
            final_name = (preset_name or '').strip() or normalized['name'] or '未命名模板'
            style_json_text_final = json.dumps(normalized['style_json'], ensure_ascii=False)

            preset = StylePreset(name=final_name, style_json=style_json_text_final)
            preset.preview_images_json = json.dumps({
                'cover_url': '',
                'toc_url': '',
                'detail_url': '',
                'ending_url': '',
            }, ensure_ascii=False)
            db.session.add(preset)
            db.session.commit()

            preset_id = str(preset.id)
            sample_pages = normalized['sample_pages']
            output_language = language or app.config.get('OUTPUT_LANGUAGE', 'zh')
            preview_urls: Dict[str, str] = preset.get_preview_images()

            task = Task.query.get(task_id)
            if not task:
                return
            progress = task.get_progress() or {}
            progress.update({
                'stage': 'preview_generating',
                'current_step': 'generating_preview_images',
                'completed': 1,
                'preset_id': preset_id,
                'preset_name': final_name,
                'style_json': style_json_text_final,
                'sample_pages': sample_pages,
                'preview_images': preview_urls,
            })
            task.set_progress(progress)
            db.session.commit()

            file_service = FileService(app.config['UPLOAD_FOLDER'])
            aspect_ratio = app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
            resolution = app.config.get('DEFAULT_RESOLUTION', '2K')
            outline = [
                {'title': '封面', 'points': []},
                {'title': '目录', 'points': []},
                {'title': '详情', 'points': []},
                {'title': '结尾', 'points': []},
            ]
            slide_keys = [('cover', 1), ('toc', 2), ('detail', 3), ('ending', 4)]
            slide_extra_retries = int(app.config.get('STYLE_PREVIEW_SLIDE_RETRIES', 1))
            max_workers = max(1, min(int(app.config.get('STYLE_PREVIEW_WORKERS', 2)), len(slide_keys)))
            completed = 1
            failed = 0
            extra_req = _build_style_extra_requirements(style_json_text_final, style_requirements)
            preview_errors: Dict[str, str] = {}

            def render_slide(slide_key: str, page_index: int) -> tuple[str, str]:
                return _render_preset_preview_slide_with_retry(
                    ai_service=ai_service,
                    file_service=file_service,
                    preset_id=preset_id,
                    slide_key=slide_key,
                    page_index=page_index,
                    outline=outline,
                    sample_pages=sample_pages,
                    extra_req=extra_req,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    language=output_language,
                    extra_retries=slide_extra_retries,
                )

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {
                    executor.submit(render_slide, slide_key, page_index): slide_key
                    for slide_key, page_index in slide_keys
                }
                for future in as_completed(future_map):
                    slide_key = future_map[future]
                    try:
                        slide_key, url = future.result()
                        preview_urls[f'{slide_key}_url'] = url
                        completed += 1
                    except Exception as e:
                        failed += 1
                        preview_errors[f'{slide_key}_url'] = str(e)
                        logger.error('Style preset preview failed: preset=%s slide=%s err=%s', preset_id, slide_key, str(e), exc_info=True)
                    preset_obj = StylePreset.query.get(preset_id)
                    if preset_obj:
                        preset_obj.preview_images_json = json.dumps(preview_urls, ensure_ascii=False)
                        db.session.commit()
                    task = Task.query.get(task_id)
                    if task:
                        progress = task.get_progress() or {}
                        progress.update({
                            'completed': completed,
                            'failed': failed,
                            'preview_images': preview_urls,
                            'preview_errors': preview_errors,
                        })
                        task.set_progress(progress)
                        db.session.commit()

            task = Task.query.get(task_id)
            if task:
                progress = task.get_progress() or {}
                progress.update({
                    'completed': completed,
                    'failed': failed,
                    'preview_images': preview_urls,
                    'preview_errors': preview_errors,
                    'stage': 'completed' if failed == 0 else 'failed',
                    'current_step': 'completed' if failed == 0 else 'preview_generation_failed',
                })
                task.set_progress(progress)
                task.completed_at = datetime.utcnow()
                if failed == 0:
                    task.status = 'COMPLETED'
                else:
                    task.status = 'FAILED'
                    task.error_message = task.error_message or f'{failed} preview image(s) failed to generate'
                db.session.commit()
        except Exception as e:
            logger.error('generate_style_preset_task failed: %s', str(e), exc_info=True)
            if task:
                task = Task.query.get(task_id)
                if task:
                    progress = task.get_progress() or {}
                    progress['stage'] = 'failed'
                    progress['current_step'] = 'failed'
                    task.set_progress(progress)
                    task.status = 'FAILED'
                    task.error_message = str(e)
                    task.completed_at = datetime.utcnow()
                    db.session.commit()


def regenerate_style_preset_image_task(task_id: str,
                                       preset_id: str,
                                       preview_key: str,
                                       app=None,
                                       language: str = None,
                                       routing_bundle=None):
    """
    Background task for regenerating a single preview image of a saved preset.
    """
    if app is None:
        raise ValueError('Flask app instance must be provided')

    with app.app_context():
        task = None
        try:
            preset = StylePreset.query.get(preset_id)
            if not preset:
                raise ValueError(f'StylePreset {preset_id} not found')

            sample_pages = _find_sample_pages_from_latest_style_preset_task(preset_id) or {}
            task = Task.query.get(task_id)
            if not task:
                return
            task.status = 'PROCESSING'
            progress = task.get_progress() or {}
            progress.update({
                'stage': 'single_preview_generating',
                'current_step': 'generating_single_preview',
                'total': 1,
                'completed': 0,
                'failed': 0,
                'preset_id': preset_id,
                'preset_name': preset.name,
                'preview_key': preview_key,
                'preview_images': preset.get_preview_images(),
                'sample_pages': sample_pages,
            })
            task.set_progress(progress)
            db.session.commit()

            ai_service = get_ai_service(routing_bundle=routing_bundle)
            file_service = FileService(app.config['UPLOAD_FOLDER'])
            aspect_ratio = app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
            resolution = app.config.get('DEFAULT_RESOLUTION', '2K')
            outline = [
                {'title': '封面', 'points': []},
                {'title': '目录', 'points': []},
                {'title': '详情', 'points': []},
                {'title': '结尾', 'points': []},
            ]
            slide_to_page = {'cover': 1, 'toc': 2, 'detail': 3, 'ending': 4}
            slide_key = preview_key.replace('_url', '')
            extra_req = _build_style_extra_requirements(preset.style_json, '')
            slide_key, url = _render_preset_preview_slide_with_retry(
                ai_service=ai_service,
                file_service=file_service,
                preset_id=preset_id,
                slide_key=slide_key,
                page_index=slide_to_page[slide_key],
                outline=outline,
                sample_pages=sample_pages,
                extra_req=extra_req,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                language=language or app.config.get('OUTPUT_LANGUAGE', 'zh'),
                extra_retries=int(app.config.get('STYLE_PREVIEW_SLIDE_RETRIES', 1)),
            )

            preset = StylePreset.query.get(preset_id)
            preview_images = preset.get_preview_images()
            preview_images[preview_key] = url
            preset.preview_images_json = json.dumps(preview_images, ensure_ascii=False)
            db.session.commit()

            task = Task.query.get(task_id)
            if task:
                progress = task.get_progress() or {}
                progress.update({
                    'stage': 'completed',
                    'current_step': 'completed',
                    'completed': 1,
                    'failed': 0,
                    'preview_images': preview_images,
                })
                task.set_progress(progress)
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                db.session.commit()
        except Exception as e:
            logger.error('regenerate_style_preset_image_task failed: %s', str(e), exc_info=True)
            if task:
                task = Task.query.get(task_id)
                if task:
                    progress = task.get_progress() or {}
                    progress['stage'] = 'failed'
                    progress['current_step'] = 'failed'
                    task.set_progress(progress)
                    task.status = 'FAILED'
                    task.error_message = str(e)
                    task.completed_at = datetime.utcnow()
                    db.session.commit()
