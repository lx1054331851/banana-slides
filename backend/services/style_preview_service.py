"""
Style preview service - recommend style_json and generate preview images.
"""
import json
import logging
import os
import socket
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from models import db, Task, Project, ReferenceFile, StylePreset
from services.ai_service_manager import get_ai_service
from services.file_service import FileService
from services.prompts import get_style_recommendations_prompt
from services.style_recommendation_service import generate_style_recommendation_json
from utils.style_guidance import build_preview_style_json_for_page_type, extract_style_template_page_slots

logger = logging.getLogger(__name__)

PREVIEW_SLOT_DEFINITIONS = [
    {'sample_key': 'cover', 'preview_key': 'cover_url', 'page_index': 1, 'title': '封面'},
    {'sample_key': 'catalog', 'preview_key': 'catalog_url', 'page_index': 2, 'title': '目录'},
    {'sample_key': 'section_header', 'preview_key': 'section_header_url', 'page_index': 3, 'title': '章节过渡'},
    {'sample_key': 'agenda_timeline', 'preview_key': 'agenda_timeline_url', 'page_index': 4, 'title': '议程时间线'},
    {'sample_key': 'detail_text_split', 'preview_key': 'detail_text_split_url', 'page_index': 5, 'title': '标准图文'},
    {'sample_key': 'bullet_keypoints', 'preview_key': 'bullet_keypoints_url', 'page_index': 6, 'title': '要点列表'},
    {'sample_key': 'comparison', 'preview_key': 'comparison_url', 'page_index': 7, 'title': '对比'},
    {'sample_key': 'process_flow', 'preview_key': 'process_flow_url', 'page_index': 8, 'title': '流程'},
    {'sample_key': 'framework_matrix', 'preview_key': 'framework_matrix_url', 'page_index': 9, 'title': '框架矩阵'},
    {'sample_key': 'detail_chart', 'preview_key': 'detail_chart_url', 'page_index': 10, 'title': '图表'},
    {'sample_key': 'case_showcase', 'preview_key': 'case_showcase_url', 'page_index': 11, 'title': '案例展示'},
    {'sample_key': 'closing', 'preview_key': 'closing_url', 'page_index': 12, 'title': '结尾'},
]

DEFAULT_PREVIEW_SAMPLE_PAGES = {
    'cover': '封面页页面描述（含标题/副标题/演讲者信息等文字要求）',
    'catalog': '目录页页面描述（含目录结构文字要求）',
    'section_header': '章节过渡页页面描述（含章节编号、章节标题和过渡语气）',
    'agenda_timeline': '议程时间线页页面描述（含阶段、时间节点和推进顺序）',
    'detail_text_split': '标准图文页页面描述（含主结论、若干要点和配图/图示布局说明）',
    'bullet_keypoints': '要点列表页页面描述（含一句总判断和3-6条核心要点）',
    'comparison': '对比页页面描述（含左右对比维度、差异点和结论）',
    'process_flow': '流程页页面描述（含步骤、连接关系和闭环逻辑）',
    'framework_matrix': '框架矩阵页页面描述（含象限/层级/能力模型说明）',
    'detail_chart': '图表页页面描述（含图表类型、关键数据和结论说明）',
    'case_showcase': '案例展示页页面描述（含2-4个案例卡片、亮点和成果）',
    'closing': '结尾页页面描述（致谢/Q&A/行动号召/联系方式等文字要求）',
}

CORE_PREVIEW_SAMPLE_KEYS = (
    'cover',
    'catalog',
    'detail_text_split',
    'comparison',
    'process_flow',
    'framework_matrix',
    'detail_chart',
    'closing',
)


def _resolve_preview_slots(style_json_text: Optional[str] = None) -> list[dict[str, Any]]:
    dynamic_slots = extract_style_template_page_slots(style_json_text)
    return dynamic_slots or list(PREVIEW_SLOT_DEFINITIONS)


def _resolve_core_preview_keys(slots: list[dict[str, Any]]) -> tuple[str, ...]:
    slot_keys = {slot['sample_key'] for slot in slots}
    filtered = tuple(key for key in CORE_PREVIEW_SAMPLE_KEYS if key in slot_keys)
    if filtered:
        return filtered
    return tuple(slot['sample_key'] for slot in slots)


def _empty_preview_images(slots: Optional[list[dict[str, Any]]] = None) -> Dict[str, str]:
    resolved_slots = slots or PREVIEW_SLOT_DEFINITIONS
    return {slot['preview_key']: '' for slot in resolved_slots}


def _normalize_sample_pages(sample_pages: Any, slots: Optional[list[dict[str, Any]]] = None) -> Dict[str, str]:
    resolved_slots = slots or PREVIEW_SLOT_DEFINITIONS
    normalized = {
        slot['sample_key']: DEFAULT_PREVIEW_SAMPLE_PAGES.get(
            slot['sample_key'],
            f"{slot['title']}页面描述"
        )
        for slot in resolved_slots
    }
    if not isinstance(sample_pages, dict):
        return normalized

    alias_map = {
        'toc': 'catalog',
        'detail': 'detail_text_split',
        'ending': 'closing',
    }
    for raw_key, value in sample_pages.items():
        if not isinstance(raw_key, str):
            continue
        mapped_key = alias_map.get(raw_key, raw_key)
        if mapped_key in normalized:
            normalized[mapped_key] = str(value or '')
    return normalized


def _build_preview_outline(slots: Optional[list[dict[str, Any]]] = None) -> list[dict]:
    resolved_slots = slots or PREVIEW_SLOT_DEFINITIONS
    return [{'title': slot['title'], 'points': []} for slot in resolved_slots]


def _build_slot_scoped_extra_requirements(
    style_json_text: str,
    *,
    sample_key: str,
    style_requirements: str = "",
) -> str:
    scoped_style_json = build_preview_style_json_for_page_type(style_json_text, page_type_key=sample_key)
    return _build_style_extra_requirements(scoped_style_json or style_json_text, style_requirements)


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


def _has_proxy_env() -> bool:
    return bool(os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY"))


def _enable_local_proxy_if_available(proxy_url: str = "http://127.0.0.1:7897") -> bool:
    """
    Best-effort local proxy fallback for unstable upstream network.
    """
    if _has_proxy_env():
        return False

    try:
        parsed = urlparse(proxy_url)
        host = parsed.hostname
        port = parsed.port
        if not host or not port:
            return False

        with socket.create_connection((host, port), timeout=0.5):
            pass

        os.environ["HTTP_PROXY"] = proxy_url
        os.environ["HTTPS_PROXY"] = proxy_url
        logger.info("Enabled local proxy for style preview upstream calls: %s", proxy_url)
        return True
    except Exception:
        return False


def _call_with_transient_retry(*, fn, description: str, max_attempts: int = 3):
    """Retry transient upstream model/network errors with exponential backoff."""
    attempts = max(1, int(max_attempts))
    last_error = None
    auto_proxy_enabled = False

    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            last_error = exc
            transient = _is_transient_image_network_error(exc)
            if transient and not _has_proxy_env() and not auto_proxy_enabled:
                auto_proxy_enabled = _enable_local_proxy_if_available()
            if transient and attempt < attempts:
                sleep_s = min(2 ** (attempt - 1), 8)
                logger.warning(
                    "Transient upstream error, retrying: step=%s attempt=%s/%s sleep=%ss err=%s",
                    description, attempt, attempts, sleep_s, str(exc)
                )
                time.sleep(sleep_s)
                continue
            if transient:
                if auto_proxy_enabled:
                    hint = "已自动启用本地代理后仍失败，请检查代理可用性或上游服务状态。"
                elif not _has_proxy_env():
                    hint = "建议配置 HTTP_PROXY/HTTPS_PROXY（例如 http://127.0.0.1:7897）后重试。"
                else:
                    hint = "请检查当前代理和网络可用性。"
                raise RuntimeError(
                    "上游模型连接失败，请稍后重试。%s 原始错误: %s" % (hint, str(exc))
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

            prompt_project_dict = project.to_dict(include_pages=False) if project else {}
            full_prompt = get_style_recommendations_prompt(
                project_dict=prompt_project_dict,
                reference_files_content=reference_files_content,
                template_json_text=template_json_text,
                style_requirements=style_requirements,
                language=language
            )

            # Record prompt size for debugging slow calls
            progress = task.get_progress() or {}
            progress['prompt_chars'] = len(full_prompt) if full_prompt else 0
            progress['template_json_chars'] = len(template_json_text) if template_json_text else 0
            progress['reference_files_count'] = len(reference_files_content or [])
            task.set_progress(progress)
            db.session.commit()

            # For style recommendations we prefer low latency; explicitly disable thinking per-call
            result = _call_with_transient_retry(
                fn=lambda: generate_style_recommendation_json(
                    ai_service=ai_service,
                    project_dict=prompt_project_dict,
                    reference_files_content=reference_files_content,
                    template_json_text=template_json_text,
                    style_requirements=style_requirements,
                    language=language,
                    thinking_budget=0,
                ),
                description='style_recommendations.generate_json',
                max_attempts=int(app.config.get('STYLE_PREVIEW_RECOMMENDATION_RETRIES', 3)),
            )
            recs = _normalize_style_recommendations(result)
            if len(recs) != 3:
                logger.warning(f"Expected 3 recommendations, got {len(recs)}")
            template_slots = _resolve_preview_slots(template_json_text)

            # Prepare progress payload
            normalized_recs: list[dict] = []
            for rec in recs[:3]:
                rec_id = str(uuid.uuid4())
                name = (rec.get('name') or '').strip() if isinstance(rec, dict) else ''
                rationale = (rec.get('rationale') or '').strip() if isinstance(rec, dict) else ''
                style_json_obj = rec.get('style_json') if isinstance(rec, dict) else None
                sample_pages = rec.get('sample_pages') if isinstance(rec, dict) else None

                style_json_text = json.dumps(style_json_obj, ensure_ascii=False) if style_json_obj is not None else template_json_text
                resolved_slots = _resolve_preview_slots(style_json_text or template_json_text)
                sample_pages = _normalize_sample_pages(sample_pages, resolved_slots)

                normalized_recs.append({
                    'id': rec_id,
                    'name': name or f"Style {len(normalized_recs) + 1}",
                    'rationale': rationale,
                    'style_json': style_json_obj,
                    'sample_pages': sample_pages,
                    'preview_images': _empty_preview_images(resolved_slots),
                    'preview_slots': resolved_slots,
                })

            # Ensure progress initialized
            progress = task.get_progress() or {}
            total_preview_jobs = sum(
                len(_resolve_core_preview_keys(rec.get('preview_slots') or template_slots))
                for rec in normalized_recs
            )
            total = total_preview_jobs if generate_previews else len(normalized_recs)
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
                resolved_slots = rec.get('preview_slots') or template_slots
                outline = _build_preview_outline(resolved_slots)
                core_preview_keys = _resolve_core_preview_keys(resolved_slots)
                core_slots = [slot for slot in resolved_slots if slot['sample_key'] in core_preview_keys]
                for slot in core_slots:
                    jobs.append({
                        'rec_id': rec['id'],
                        'slide_key': slot['sample_key'],
                        'preview_key': slot['preview_key'],
                        'page_index': slot['page_index'],
                        'outline': outline,
                        'sample_pages': rec.get('sample_pages') or {},
                        'extra_req': _build_slot_scoped_extra_requirements(
                            style_json_text,
                            sample_key=slot['sample_key'],
                            style_requirements=style_requirements,
                        ),
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
                    outline=job['outline'],
                    sample_pages=job['sample_pages'],
                    extra_req=job['extra_req'],
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    language=language or app.config.get('OUTPUT_LANGUAGE', 'zh'),
                    extra_retries=slide_extra_retries,
                )
                return job['rec_id'], job['preview_key'], url

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {executor.submit(render_preview_job, job): job for job in jobs}
                for future in as_completed(future_map):
                    job = future_map[future]
                    rec_id = str(job['rec_id'])
                    preview_key = str(job['preview_key'])
                    try:
                        rec_id, preview_key, url = future.result()
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
                                    r['preview_images'][preview_key] = url
                                    break
                            p['completed'] = completed
                            p['failed'] = failed
                            p['recommendations'] = p_recs
                            task.set_progress(p)
                            db.session.commit()
                    except Exception as e:
                        if _is_transient_image_network_error(e):
                            logger.error(
                                "Preview generation failed after retries (transient network): rec=%s preview=%s err=%s",
                                rec_id, preview_key, str(e)
                            )
                        else:
                            logger.error(
                                "Preview generation failed: rec=%s preview=%s err=%s",
                                rec_id, preview_key, str(e), exc_info=True
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
                p.setdefault('total', total_preview_jobs)
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
                    preview_slots = r.get('preview_slots') if isinstance(r.get('preview_slots'), list) else None
                    return _normalize_sample_pages(sp, preview_slots)
    return None


def regenerate_single_style_previews_task(task_id: str, project_id: str, rec_id: str,
                                         style_json_text: str,
                                         sample_pages: Optional[Dict[str, str]] = None,
                                         app=None,
                                         language: str = None,
                                         routing_bundle=None):
    """
    Background task: regenerate core preview images for a given rec_id.
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

            ai_service = get_ai_service(routing_bundle=routing_bundle)
            file_service = FileService(app.config['UPLOAD_FOLDER'])
            aspect_ratio = (project.image_aspect_ratio if project else None) or app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
            resolution = app.config.get('DEFAULT_RESOLUTION', '2K')

            resolved_slots = _resolve_preview_slots(style_json_text)
            outline = _build_preview_outline(resolved_slots)
            core_preview_keys = _resolve_core_preview_keys(resolved_slots)
            core_slots = [slot for slot in resolved_slots if slot['sample_key'] in core_preview_keys]

            completed = 0
            failed = 0
            progress = task.get_progress() or {}
            progress.update({'total': len(core_slots), 'completed': 0, 'failed': 0, 'rec_id': rec_id})
            task.set_progress(progress)
            db.session.commit()

            preview_urls: Dict[str, str] = _empty_preview_images(resolved_slots)

            slide_extra_retries = int(app.config.get('STYLE_PREVIEW_SLIDE_RETRIES', 1))
            max_workers = int(app.config.get('STYLE_PREVIEW_WORKERS', 2))
            max_workers = max(1, min(max_workers, len(core_slots)))

            def render_slide(slot: dict[str, Any]) -> tuple[str, str]:
                _, url = _render_preview_slide_with_retry(
                    ai_service=ai_service,
                    file_service=file_service,
                    project_id=project_id,
                    rec_id=rec_id,
                    slide_key=slot['sample_key'],
                    page_index=slot['page_index'],
                    outline=outline,
                    sample_pages=sample_pages or {},
                    extra_req=_build_slot_scoped_extra_requirements(
                        style_json_text,
                        sample_key=slot['sample_key'],
                        style_requirements=style_requirements,
                    ),
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    language=language or app.config.get('OUTPUT_LANGUAGE', 'zh'),
                    extra_retries=slide_extra_retries,
                )
                return slot['preview_key'], url

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {
                    executor.submit(render_slide, slot): slot['preview_key']
                    for slot in core_slots
                }
                for future in as_completed(future_map):
                    preview_key = future_map[future]
                    try:
                        preview_key, url = future.result()
                        preview_urls[preview_key] = url
                        completed += 1
                    except Exception as e:
                        if _is_transient_image_network_error(e):
                            logger.error(
                                "Regenerate preview failed after retries (transient network): rec=%s preview=%s err=%s",
                                rec_id, preview_key, str(e)
                            )
                        else:
                            logger.error(
                                "Regenerate preview failed: rec=%s preview=%s err=%s",
                                rec_id, preview_key, str(e), exc_info=True
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
    style_json_text = json.dumps(style_json_obj, ensure_ascii=False)
    resolved_slots = _resolve_preview_slots(style_json_text)
    return {
        'name': (rec.get('name') or '').strip() if isinstance(rec, dict) else '',
        'rationale': (rec.get('rationale') or '').strip() if isinstance(rec, dict) else '',
        'style_json': style_json_obj,
        'sample_pages': _normalize_sample_pages(sample_pages, resolved_slots),
        'preview_slots': resolved_slots,
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
            preview_slots = progress.get('preview_slots') if isinstance(progress.get('preview_slots'), list) else None
            return _normalize_sample_pages(sample_pages, preview_slots)
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
            template_slots = _resolve_preview_slots(template_json_text)
            template_core_preview_keys = _resolve_core_preview_keys(template_slots)
            progress = task.get_progress() or {}
            progress.update({
                'stage': 'json_generating',
                'current_step': 'generating_recommendations',
                'total': 1 + len(template_core_preview_keys),
                'completed': 0,
                'failed': 0,
                'template_json': template_json_text,
                'style_requirements': style_requirements,
                'preset_name': (preset_name or '').strip(),
                'preview_images': {},
                'preview_slots': template_slots,
            })
            task.set_progress(progress)
            db.session.commit()

            ai_service = get_ai_service(routing_bundle=routing_bundle)
            result = _call_with_transient_retry(
                fn=lambda: generate_style_recommendation_json(
                    ai_service=ai_service,
                    project_dict={},
                    reference_files_content=[],
                    template_json_text=template_json_text,
                    style_requirements=style_requirements,
                    language=language,
                    thinking_budget=0,
                ),
                description='style_preset.generate_json',
                max_attempts=int(app.config.get('STYLE_PREVIEW_RECOMMENDATION_RETRIES', 3)),
            )
            normalized = _normalize_single_style_recommendation(result)
            final_name = (preset_name or '').strip() or normalized['name'] or '未命名模板'
            style_json_text_final = json.dumps(normalized['style_json'], ensure_ascii=False)
            resolved_slots = normalized.get('preview_slots') or _resolve_preview_slots(style_json_text_final)

            preset = StylePreset(name=final_name, style_json=style_json_text_final)
            preset.preview_images_json = json.dumps(_empty_preview_images(resolved_slots), ensure_ascii=False)
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
                'preview_slots': resolved_slots,
            })
            task.set_progress(progress)
            db.session.commit()

            file_service = FileService(app.config['UPLOAD_FOLDER'])
            aspect_ratio = app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
            resolution = app.config.get('DEFAULT_RESOLUTION', '2K')
            outline = _build_preview_outline(resolved_slots)
            core_preview_keys = _resolve_core_preview_keys(resolved_slots)
            core_slots = [slot for slot in resolved_slots if slot['sample_key'] in core_preview_keys]
            slide_extra_retries = int(app.config.get('STYLE_PREVIEW_SLIDE_RETRIES', 1))
            max_workers = max(1, min(int(app.config.get('STYLE_PREVIEW_WORKERS', 2)), len(core_slots)))
            completed = 1
            failed = 0
            preview_errors: Dict[str, str] = {}

            def render_slide(slot: dict[str, Any]) -> tuple[str, str]:
                _, url = _render_preset_preview_slide_with_retry(
                    ai_service=ai_service,
                    file_service=file_service,
                    preset_id=preset_id,
                    slide_key=slot['sample_key'],
                    page_index=slot['page_index'],
                    outline=outline,
                    sample_pages=sample_pages,
                    extra_req=_build_slot_scoped_extra_requirements(
                        style_json_text_final,
                        sample_key=slot['sample_key'],
                        style_requirements=style_requirements,
                    ),
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    language=output_language,
                    extra_retries=slide_extra_retries,
                )
                return slot['preview_key'], url

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {
                    executor.submit(render_slide, slot): slot['preview_key']
                    for slot in core_slots
                }
                for future in as_completed(future_map):
                    preview_key = future_map[future]
                    try:
                        preview_key, url = future.result()
                        preview_urls[preview_key] = url
                        completed += 1
                    except Exception as e:
                        failed += 1
                        preview_errors[preview_key] = str(e)
                        logger.error('Style preset preview failed: preset=%s preview=%s err=%s', preset_id, preview_key, str(e), exc_info=True)
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
            resolved_slots = _resolve_preview_slots(preset.style_json)
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
                'preview_slots': resolved_slots,
            })
            task.set_progress(progress)
            db.session.commit()

            ai_service = get_ai_service(routing_bundle=routing_bundle)
            file_service = FileService(app.config['UPLOAD_FOLDER'])
            aspect_ratio = app.config.get('DEFAULT_ASPECT_RATIO', '16:9')
            resolution = app.config.get('DEFAULT_RESOLUTION', '2K')
            outline = _build_preview_outline(resolved_slots)
            slot = next((item for item in resolved_slots if item['preview_key'] == preview_key), None)
            if not slot:
                raise ValueError(f'Unknown preview_key: {preview_key}')
            _, url = _render_preset_preview_slide_with_retry(
                ai_service=ai_service,
                file_service=file_service,
                preset_id=preset_id,
                slide_key=slot['sample_key'],
                page_index=slot['page_index'],
                outline=outline,
                sample_pages=sample_pages,
                extra_req=_build_slot_scoped_extra_requirements(
                    preset.style_json,
                    sample_key=slot['sample_key'],
                    style_requirements='',
                ),
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
