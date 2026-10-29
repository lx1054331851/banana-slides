"""
Task Manager - handles background tasks using ThreadPoolExecutor
No need for Celery or Redis, uses in-memory task tracking
"""
import logging
import os
import json
import shutil
import tempfile
import threading
from pathlib import Path

import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from typing import Callable, List, Dict, Any, Optional
from datetime import datetime
from math import gcd
import time
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from PIL import Image, ImageDraw, ImageFilter
from models import db, Task, Page, Material, PageImageVersion, Settings, ProjectTemplateAsset, Project
from services.prompts import get_image_edit_prompt
from services.upstream_retry import call_with_transient_retry
from services.task_watchdog import task_scope, task_watchdog
from utils import get_filtered_pages
from utils.image_utils import check_image_resolution
from utils.style_guidance import (
    build_combined_style_requirements,
    build_preview_style_json_for_page_type,
    resolve_effective_page_type,
)
from utils.text_normalization import normalize_user_text

logger = logging.getLogger(__name__)

IMAGE_QUALITY_CONTROL_MAX_ATTEMPTS = 3


class ImageQualityControlError(ValueError):
    """Raised when generated images repeatedly fail quality review."""


def get_image_prompt_field_names() -> set:
    """读取设置中允许进入文生图 prompt 的额外字段名。"""
    try:
        settings = Settings.get_settings()
        return set(settings.get_image_prompt_extra_fields())
    except Exception as e:
        logger.warning("Failed to retrieve image prompt extra fields; using defaults: %s", e)
        return set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS)


def _append_extra_fields(
    desc_text: Optional[str],
    desc_content: Optional[dict],
    allowed_fields: Optional[set] = None,
) -> str:
    """将 extra_fields 拼接到描述文本末尾，供图片生成 prompt 使用。

    存量数据里的旧字段名（视觉元素/视觉焦点/排版布局等）经 LEGACY_FIELD_EQUIV 等价到
    新字段名后再判断，避免字段改名后旧项目重新生图时这些内容突然不进 prompt。
    """
    safe_desc = (desc_text or "").strip()
    if not desc_content or not isinstance(desc_content, dict):
        return safe_desc
    extra_fields = desc_content.get('extra_fields')
    if not extra_fields or not isinstance(extra_fields, dict):
        return safe_desc
    allowed = allowed_fields if allowed_fields is not None else get_image_prompt_field_names()
    legacy_equiv = {
        **Settings.LEGACY_FIELD_EQUIV,
        '视觉建议': '配图与素材',
        '备注': '演讲者备注',
    }
    parts = []
    if safe_desc:
        parts.append(safe_desc)
    for name, value in extra_fields.items():
        if value is None or str(value).strip() == "":
            continue
        if name in allowed or legacy_equiv.get(name) in allowed:
            parts.append(f"{name}：{value}")
    return '\n'.join(parts)


def get_image_quality_control_enabled() -> bool:
    """Return whether generated page images should pass visual QC before saving."""
    try:
        return bool(Settings.get_settings().enable_image_quality_control)
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.warning("Failed to retrieve image quality control setting; using disabled: %s", e)
        return False


def _format_quality_review_failure(review: Optional[dict]) -> str:
    if not review:
        return "质量控制未通过"
    issues = review.get('issues') or []
    if isinstance(issues, str):
        issues = [issues]
    elif not isinstance(issues, list):
        issues = []
    reason = (review.get('reason') or '').strip()
    details = "；".join(str(issue).strip() for issue in issues if str(issue).strip())
    if reason and details:
        return f"{reason}（{details}）"
    return reason or details or "质量控制未通过"


def _get_absolute_page_index(page_obj, fallback_index: Optional[int]) -> Optional[int]:
    order_index = getattr(page_obj, 'order_index', None)
    if order_index is None:
        return fallback_index
    return order_index + 1


def review_image_quality(
    ai_service,
    image: Image.Image,
    generation_prompt: str,
    page_desc: str,
    page_data: Optional[Dict[str, Any]] = None,
    page_index: Optional[int] = None,
) -> dict:
    """Run the multimodal quality review on an unsaved generated image."""
    temp_path = None
    converted_image = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            temp_path = tmp.name
        review_image = image
        if image.mode != 'RGB':
            converted_image = image.convert('RGB')
            review_image = converted_image
        review_image.save(temp_path, format='JPEG', quality=85)
        return ai_service.review_generated_slide_image(
            temp_path,
            generation_prompt=generation_prompt,
            page_desc=page_desc,
            page_outline=page_data or {},
            page_index=page_index,
        )
    finally:
        if converted_image is not None:
            converted_image.close()
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


def generate_image_until_quality_passes(
    generate_image: Callable[[], Optional[Image.Image]],
    ai_service,
    generation_prompt: str,
    page_desc: str,
    page_data: Optional[Dict[str, Any]] = None,
    page_index: Optional[int] = None,
    quality_control_enabled: bool = False,
    max_attempts: int = IMAGE_QUALITY_CONTROL_MAX_ATTEMPTS,
) -> Image.Image:
    """Generate an image and, when enabled, retry until QC passes or attempts are exhausted."""
    attempts = max(1, int(max_attempts)) if quality_control_enabled else 1
    last_error: Optional[Exception] = None
    last_review: Optional[dict] = None

    for attempt in range(1, attempts + 1):
        try:
            image = generate_image()
            if not image:
                raise ValueError("Failed to generate image")

            if not quality_control_enabled:
                return image

            review = review_image_quality(
                ai_service,
                image,
                generation_prompt,
                page_desc,
                page_data=page_data,
                page_index=page_index,
            )
            last_review = review
            last_error = None
            if review.get('passed'):
                logger.info("Image quality control passed for page %s on attempt %s", page_index, attempt)
                return image

            logger.warning(
                "Image quality control rejected page %s on attempt %s/%s: %s",
                page_index,
                attempt,
                attempts,
                _format_quality_review_failure(review),
            )
        except Exception as e:
            last_error = e
            last_review = None
            logger.warning(
                "Image quality control attempt %s/%s failed for page %s: %s",
                attempt,
                attempts,
                page_index,
                e,
            )
            if attempt >= attempts and not quality_control_enabled:
                raise

    if last_review:
        reason = _format_quality_review_failure(last_review)
        raise ImageQualityControlError(f"图片质量控制未通过：{reason}。请调整页面描述或提示词后重试。")
    if last_error:
        raise ImageQualityControlError(f"图片质量控制失败：{last_error}。请调整页面描述或提示词后重试。") from last_error
    raise ImageQualityControlError("图片质量控制未通过。请调整页面描述或提示词后重试。")
from pathlib import Path
from services.pdf_service import split_pdf_to_pages
from services.export_helpers import build_export_filename, maybe_compress_export_images

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("image_audit")

_IMAGE_GENERATION_MAX_ATTEMPTS = 3
_IMAGE_RETRY_PROGRESS_KEYS = (
    "retry_attempt",
    "retry_max_attempts",
    "retry_page_id",
    "retry_notice",
    "last_error",
)

class ResourceLimiter:
    """Thread-safe concurrency limiter for a shared external resource."""

    def __init__(self, name: str, capacity: int):
        self.name = name
        self.capacity = max(1, int(capacity))
        self._in_use = 0
        self._condition = threading.Condition()

    def update_capacity(self, capacity: int):
        new_capacity = max(1, int(capacity))
        with self._condition:
            if new_capacity == self.capacity:
                return
            logger.info(f"Updating {self.name} limiter: {self.capacity} -> {new_capacity}")
            self.capacity = new_capacity
            self._condition.notify_all()

    @contextmanager
    def slot(self, label: str, on_acquire: Optional[Callable[[], None]] = None):
        waited = False
        with self._condition:
            while self._in_use >= self.capacity:
                if not waited:
                    waited = True
                    logger.info(
                        f"{self.name} limiter full ({self._in_use}/{self.capacity}), waiting: {label}"
                    )
                # 等待限流槽期间 worker 仍然活着，保持心跳，避免被看门狗判为卡住
                task_watchdog.touch_current_thread()
                self._condition.wait(timeout=0.5)

            self._in_use += 1

        if waited:
            logger.info(f"{self.name} limiter slot acquired: {label}")

        try:
            if on_acquire:
                on_acquire()
            yield
        finally:
            with self._condition:
                self._in_use -= 1
                self._condition.notify()


def _rebuild_image_provider_after_proxy_enabled(ai_service) -> None:
    """Refresh provider client state after proxy env is enabled mid-process."""
    provider = getattr(ai_service, "image_provider", None)
    rebuild = getattr(provider, "_rebuild_client_after_transient_error", None)
    if callable(rebuild):
        rebuild()


def _get_existing_page_image_path(page: Page) -> Optional[str]:
    """Return the best available stored image path for page edits."""
    return (
        page.generated_image_path
        or page.cached_image_path
        or getattr(page, 'preview_image_path', None)
    )


def _remove_scoped_session() -> None:
    """Release the current scoped session so worker threads do not pin pooled connections."""
    try:
        db.session.remove()
    except Exception:
        logger.debug("Failed to remove scoped db session", exc_info=True)


def _normalize_history_reference(ref: Optional[str], upload_root: Optional[Path] = None) -> Optional[str]:
    """Normalize a reference image/material path into a readable history value."""
    if not ref or not isinstance(ref, str):
        return None
    if ref.startswith('http://') or ref.startswith('https://') or ref.startswith('/files/'):
        return ref
    normalized = ref.replace('\\', '/')
    if normalized.startswith('uploads/'):
        return f"/files/{normalized[len('uploads/'):]}"
    if upload_root:
        try:
            abs_ref = os.path.abspath(ref)
            upload_root_abs = os.path.abspath(str(upload_root))
            rel = os.path.relpath(abs_ref, upload_root_abs)
            if not rel.startswith('..'):
                return f"/files/{rel.replace(os.sep, '/')}"
        except Exception:
            pass
    return ref


def _format_multiline_section(title: str, value: Optional[str]) -> str:
    text = (value or '').strip()
    return f"{title}：\n{text if text else '无'}"


def _format_list_section(title: str, values: Optional[List[str]]) -> str:
    items = [item for item in (values or []) if item]
    if not items:
        return f"{title}：\n无"
    joined = '\n'.join(f"- {item}" for item in items)
    return f"{title}：\n{joined}"


def _resolve_image_model_label(ai_service) -> str:
    """Return a readable image model label for history snapshot."""
    metadata = _get_image_route_metadata(ai_service)

    fields = []
    if metadata["provider"]:
        fields.append(f"provider={metadata['provider']}")
    if metadata["source"]:
        fields.append(f"source={metadata['source']}")
    if metadata["model"]:
        fields.append(f"model={metadata['model']}")
    return ', '.join(fields) if fields else '未记录'


def _get_image_route_metadata(ai_service) -> Dict[str, str]:
    """Extract provider/source/model values for UI copy and task snapshots."""
    route = getattr(getattr(ai_service, 'routing_bundle', None), 'image', None)
    provider = str(getattr(route, 'provider', '') or '').strip()
    source = str(getattr(route, 'source', '') or '').strip()
    model = str(getattr(route, 'model', '') or '').strip()
    if not model:
        model = str(getattr(ai_service, 'image_model', '') or '').strip()
    if not model:
        model = str(getattr(getattr(ai_service, 'image_provider', None), 'model', '') or '').strip()
    return {
        "provider": provider,
        "source": source,
        "model": model,
    }


def _log_image_audit_event(event: str, **fields: Any) -> None:
    parts = [f"{key}={fields[key]!r}" for key in sorted(fields)]
    audit_logger.info("%s %s", event, " ".join(parts))


def _append_progress_message(progress: Dict[str, Any], message: str, *, limit: int = 6) -> None:
    messages = list(progress.get("messages") or [])
    if not messages or messages[-1] != message:
        messages.append(message)
    progress["messages"] = messages[-limit:]


def _clear_image_retry_progress(progress: Optional[Dict[str, Any]], *, page_id: Optional[str] = None) -> Dict[str, Any]:
    cleaned = dict(progress or {})
    if page_id is not None and cleaned.get("retry_page_id") not in {None, page_id}:
        return cleaned
    for key in _IMAGE_RETRY_PROGRESS_KEYS:
        cleaned.pop(key, None)
    if str(cleaned.get("current_step") or "").startswith("图片生成失败，正在自动重试"):
        cleaned.pop("current_step", None)
    return cleaned


def _update_image_retry_progress(
    task_id: str,
    *,
    page_id: str,
    next_attempt: int,
    max_attempts: int,
    retry_notice: str,
    error: Exception,
) -> None:
    task = Task.query.get(task_id)
    if not task:
        return
    progress = task.get_progress() or {}
    progress["retry_attempt"] = next_attempt
    progress["retry_max_attempts"] = max_attempts
    progress["retry_page_id"] = page_id
    progress["retry_notice"] = retry_notice
    progress["current_step"] = retry_notice
    progress["last_error"] = str(error)
    _append_progress_message(progress, retry_notice)
    task.set_progress(progress)
    db.session.commit()


def _generate_image_with_auto_retry(
    *,
    task_id: str,
    page_id: str,
    operation: str,
    generate_fn: Callable[[], Image.Image],
    max_attempts: int = _IMAGE_GENERATION_MAX_ATTEMPTS,
) -> Image.Image:
    last_error: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            return generate_fn()
        except Exception as exc:
            last_error = exc
            if attempt >= max_attempts:
                raise
            next_attempt = attempt + 1
            retry_notice = f"图片生成失败，正在自动重试（第 {next_attempt}/{max_attempts} 次尝试）"
            logger.warning(
                "Image generation failed, retrying: task=%s page=%s operation=%s next_attempt=%s/%s error=%s",
                task_id,
                page_id,
                operation,
                next_attempt,
                max_attempts,
                exc,
            )
            _log_image_audit_event(
                "image_task_retry",
                task_id=task_id,
                page_id=page_id,
                operation=operation,
                next_attempt=next_attempt,
                max_attempts=max_attempts,
                error=type(exc).__name__,
                detail=str(exc),
            )
            _update_image_retry_progress(
                task_id,
                page_id=page_id,
                next_attempt=next_attempt,
                max_attempts=max_attempts,
                retry_notice=retry_notice,
                error=exc,
            )
            time.sleep(min(2 ** (attempt - 1), 4))
    if last_error:
        raise last_error
    raise RuntimeError(f"Image generation failed for page {page_id}")


def _build_resolution_mismatch_warning_message(
    ai_service,
    requested_resolution: str,
    actual_resolution: str,
    image_size: tuple[int, int],
) -> str:
    """Build a user-facing mismatch warning with actionable, route-aware guidance."""
    metadata = _get_image_route_metadata(ai_service)
    is_gemini_format = (
        metadata["provider"].lower() == "gemini"
        or (not metadata["provider"] and metadata["source"].lower() == "gemini")
    )
    width, height = image_size
    base_message = (
        "图片返回分辨率与设置不符"
        f"（请求 {str(requested_resolution or '').upper() or '未记录'}，"
        f"实际判定 {str(actual_resolution or '').upper() or '未记录'}，"
        f"实际尺寸 {width}x{height}）。"
    )
    if is_gemini_format:
        return base_message + " 请按实际结果检查版式或调整分辨率后重试。"
    return base_message + " 当前通道未必严格遵循分辨率设置，如需更稳定控制，可尝试切换到 Gemini 格式。"


def _build_image_request_snapshot(
    *,
    operation_type: str,
    aspect_ratio: str,
    resolution: str,
    prompt_text: str,
    image_model: Optional[str] = None,
    primary_reference: Optional[str] = None,
    additional_references: Optional[List[str]] = None,
    description_text: Optional[str] = None,
    edit_instruction: Optional[str] = None,
    original_description: Optional[str] = None,
    extra_requirements: Optional[str] = None,
    extra_requirements_in_prompt: bool = True,
    upload_root: Optional[Path] = None,
) -> str:
    # 单独图片编辑只允许传递“当前页图片 + 引用图片 + 修改指令”。
    # 即使上层误传了原始页面描述/风格要求，也不写入请求快照，避免被带入模型上下文。
    suppress_page_context = operation_type == 'edit'

    primary_ref_display = _normalize_history_reference(primary_reference, upload_root)
    extra_ref_displays = [
        normalized
        for normalized in (
            _normalize_history_reference(ref, upload_root)
            for ref in (additional_references or [])
        )
        if normalized
    ]

    operation_label_map = {
        'generate': '首次生成',
        'regenerate': '重新生成',
        'edit': '图片编辑',
    }
    operation_label = operation_label_map.get(operation_type, operation_type)

    sections = [
        f"操作类型：{operation_label}",
        f"本次图片模型：{(image_model or '未记录').strip() or '未记录'}",
        f"画面比例：{aspect_ratio or '未记录'}",
        f"分辨率：{resolution or '未记录'}",
        _format_multiline_section("主参考图", primary_ref_display),
        _format_list_section("附加参考图 / 素材", extra_ref_displays),
    ]

    if description_text is not None and not suppress_page_context:
        sections.append(_format_multiline_section("页面描述（用于构建 prompt）", description_text))
    if original_description is not None and not suppress_page_context:
        sections.append(_format_multiline_section("原始页面描述", original_description))
    if edit_instruction is not None:
        sections.append(_format_multiline_section("用户修改指令", edit_instruction))
    if extra_requirements is not None and not suppress_page_context:
        if extra_requirements_in_prompt:
            # 避免在历史快照里把同一段要求展示两次：
            # 这段内容已经包含在下方“最终发送给 nano banana 的 prompt”中。
            sections.append(_format_multiline_section("后端追加要求", "已拼入最终 prompt（为避免重复，此处不再展开）。"))
        else:
            sections.append(_format_multiline_section("项目上下文附加要求（本次未直接拼入 prompt）", extra_requirements))

    sections.append(_format_multiline_section("最终发送给 nano banana 的 prompt", prompt_text))
    return '\n\n'.join(sections)


def _load_page_generation_snapshot(page_id: str, project_id: str | None = None) -> dict[str, Any]:
    """Load only the plain page fields needed by long-running image tasks."""
    page = db.session.get(Page, page_id)
    if not page:
        raise ValueError(f"Page {page_id} not found")
    if project_id is not None and page.project_id != project_id:
        raise ValueError(f"Page {page_id} not found")

    page_data = page.get_outline_content() or {}
    if page.part:
        page_data['part'] = page.part

    return {
        'description_content': page.get_description_content(),
        'page_data': page_data,
        'order_index': page.order_index,
        'current_image_rel_path': _get_existing_page_image_path(page),
    }


def _split_pdf_sort_key(path: Path) -> tuple[int, str]:
    stem = path.stem
    if stem.startswith("page_"):
        suffix = stem[5:]
        if suffix.isdigit():
            return (int(suffix), path.name)
    return (10**9, path.name)


def _original_page_image_sort_key(path: Path) -> tuple[int, str]:
    stem = path.stem
    if stem.startswith("page_") and stem.endswith("_original"):
        middle = stem[5:-9]
        if middle.isdigit():
            return (int(middle), path.name)
    return (10**9, path.name)


def get_renovation_page_sources(project_dir: Path) -> list[str]:
    """Return per-page source files for renovation.

    Preferred order:
    1. Existing split page PDFs
    2. Re-split from the original template PDF
    3. Existing per-page original images rendered during project creation
    """
    split_dir = project_dir / "split_pages"
    if split_dir.exists():
        split_pdfs = sorted(
            (
                path for path in split_dir.iterdir()
                if path.is_file() and path.suffix.lower() == '.pdf'
            ),
            key=_split_pdf_sort_key,
        )
        if split_pdfs:
            return [str(path) for path in split_pdfs]

    template_dir = project_dir / "template"
    source_pdf = None
    if template_dir.exists():
        source_pdf = next(
            (
                path for path in sorted(template_dir.iterdir())
                if path.is_file() and path.suffix.lower() == '.pdf'
            ),
            None,
        )
    if not source_pdf:
        pages_dir = project_dir / "pages"
        if not pages_dir.exists():
            return []
        original_images = sorted(
            (
                path for path in pages_dir.iterdir()
                if path.is_file()
                and path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'}
                and path.stem.startswith("page_")
                and path.stem.endswith("_original")
            ),
            key=_original_page_image_sort_key,
        )
        return [str(path) for path in original_images]

    return split_pdf_to_pages(str(source_pdf), str(split_dir))


def get_renovation_original_page_images(project_dir: Path) -> list[str]:
    """Return original per-page images rendered during renovation project creation."""
    pages_dir = project_dir / "pages"
    if not pages_dir.exists():
        return []

    original_images = sorted(
        (
            path for path in pages_dir.iterdir()
            if path.is_file()
            and path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'}
            and path.stem.startswith("page_")
            and path.stem.endswith("_original")
        ),
        key=_original_page_image_sort_key,
    )
    return [str(path) for path in original_images]


def _generation_logs_enabled() -> bool:
    try:
        from flask import current_app, has_app_context
        if has_app_context() and current_app and hasattr(current_app, 'config'):
            return bool(current_app.config.get('LOG_GENERATION_DETAILS', True))
    except Exception:
        pass
    return True


class TaskManager:
    """Simple task manager using ThreadPoolExecutor"""

    def __init__(self, max_workers: int = 4):
        """Initialize task manager"""
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.active_tasks = {}  # task_id -> Future
        self.lock = threading.Lock()

    def submit_task(self, task_id: str, func: Callable, *args, **kwargs):
        """Submit a background task"""
        with self.lock:
            executor = self.executor

        def _run(tid, *run_args, **run_kwargs):
            # 队列等待不算"卡住"：worker 真正开始执行时才登记心跳，
            # 因此排队期间不会因为"没有心跳"被判为卡住
            task_watchdog.touch(tid, '开始执行')
            task_watchdog.bind_thread(tid)
            try:
                return func(tid, *run_args, **run_kwargs)
            finally:
                task_watchdog.unbind_thread()

        try:
            future = executor.submit(_run, task_id, *args, **kwargs)
        except Exception:
            task_watchdog.forget(task_id)
            raise

        with self.lock:
            self.active_tasks[task_id] = future

        # Add callback to clean up when done and log exceptions
        future.add_done_callback(lambda f: self._task_done_callback(task_id, f))

    def _task_done_callback(self, task_id: str, future):
        """Handle task completion and log any exceptions"""
        try:
            # Check if task raised an exception
            exception = future.exception()
            if exception:
                logger.error(f"Task {task_id} failed with exception: {exception}", exc_info=exception)
        except Exception as e:
            logger.error(f"Error in task callback for {task_id}: {e}", exc_info=True)
        finally:
            self._cleanup_task(task_id)

    def _cleanup_task(self, task_id: str):
        """Clean up completed task"""
        task_watchdog.forget(task_id)
        with self.lock:
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]

    def is_task_active(self, task_id: str) -> bool:
        """Check if task is still running"""
        with self.lock:
            return task_id in self.active_tasks

    def shutdown(self):
        """Shutdown the executor"""
        self.executor.shutdown(wait=True)

    def update_max_workers(self, max_workers: int):
        """Replace the shared executor so new tasks use a higher/lower ceiling."""
        new_max_workers = max(1, int(max_workers))
        old_executor = None

        with self.lock:
            if new_max_workers == getattr(self, 'max_workers', new_max_workers):
                return

            logger.info(
                f"Updating background task pool size: {getattr(self, 'max_workers', new_max_workers)} -> {new_max_workers}"
            )
            old_executor = self.executor
            self.executor = ThreadPoolExecutor(max_workers=new_max_workers)
            self.max_workers = new_max_workers

        if old_executor is not None:
            old_executor.shutdown(wait=False, cancel_futures=False)


def _compute_background_worker_target(description_workers: int, image_workers: int) -> int:
    """Keep the shared task pool from becoming the product-level bottleneck."""
    return max(8, int(description_workers) + int(image_workers) + 4)


# Global task manager instance
task_manager = TaskManager(max_workers=max(8, int(os.getenv('MAX_BACKGROUND_TASK_WORKERS', '16'))))
task_manager.max_workers = max(8, int(os.getenv('MAX_BACKGROUND_TASK_WORKERS', '16')))
image_resource_limiter = ResourceLimiter("image", int(os.getenv('MAX_IMAGE_WORKERS', '20')))
text_resource_limiter = ResourceLimiter("text", int(os.getenv('MAX_DESCRIPTION_WORKERS', '20')))


def sync_resource_limits(description_workers: int, image_workers: int):
    """Apply the latest runtime settings to shared concurrency controls."""
    task_manager.update_max_workers(
        _compute_background_worker_target(description_workers, image_workers)
    )
    image_resource_limiter.update_capacity(image_workers)
    text_resource_limiter.update_capacity(description_workers)


def save_image_with_version(image, project_id: str, page_id: str, file_service,
                            page_obj=None, image_format: str = 'PNG',
                            prompt_text: Optional[str] = None,
                            operation_type: Optional[str] = None) -> tuple[str, int]:
    """
    保存图片并创建历史版本记录的公共函数

    Args:
        image: PIL Image 对象
        project_id: 项目ID
        page_id: 页面ID
        file_service: FileService 实例
        page_obj: Page 对象（可选，如果提供则更新页面状态）
        image_format: 图片格式，默认 PNG

    Returns:
        tuple: (image_path, version_number) - 图片路径和版本号

    这个函数会：
    1. 计算下一个版本号（使用 MAX 查询确保安全）
    2. 标记所有旧版本为非当前版本
    3. 保存图片到最终位置
    4. 生成并保存压缩的缓存图片
    5. 创建新版本记录
    6. 如果提供了 page_obj，更新页面状态和图片路径
    """
    # 使用 MAX 查询确保版本号安全（即使有版本被删除也不会重复）
    max_version = db.session.query(func.max(PageImageVersion.version_number)).filter_by(page_id=page_id).scalar() or 0
    next_version = max_version + 1

    # 批量更新：标记所有旧版本为非当前版本（使用单条 SQL 更高效）
    PageImageVersion.query.filter_by(page_id=page_id).update({'is_current': False})

    # 保存原图到最终位置（使用版本号）
    image_path = file_service.save_generated_image(
        image, project_id, page_id,
        version_number=next_version,
        image_format=image_format
    )

    # 生成并保存压缩的缓存图片（用于前端快速显示）
    cached_image_path = file_service.save_cached_image(
        image, project_id, page_id,
        version_number=next_version,
        quality=85
    )

    # 创建新版本记录
    new_version = PageImageVersion(
        page_id=page_id,
        image_path=image_path,
        version_number=next_version,
        operation_type=operation_type,
        prompt_text=prompt_text,
        is_current=True
    )
    db.session.add(new_version)

    # 如果提供了 page_obj，更新页面状态和图片路径
    if page_obj:
        page_obj.generated_image_path = image_path
        page_obj.cached_image_path = cached_image_path
        page_obj.status = 'COMPLETED'
        page_obj.updated_at = datetime.utcnow()

    _commit_with_retry()

    logger.debug(f"Page {page_id} image saved as version {next_version}: {image_path}, cached: {cached_image_path}")

    return image_path, next_version


def resolve_page_template(page, project, file_service):
    """Per-page-template priority chain (PRD §13).

    Returns (ref_image_abs_path | None, page_style_text | None).

    Priority:
      1. page.template_asset_id        → asset.image_path (per-page image)
      2. page.template_style_text      → page-level style text
      3. project.template_image_path   → legacy project-level image (backfill / single-mode)
      4. project.template_style        → legacy project-level style
    """
    image_path = None
    style_text = None

    asset = getattr(page, 'template_asset', None)
    if asset and getattr(asset, 'image_path', None):
        image_path = file_service.get_absolute_path(asset.image_path)

    if getattr(page, 'template_style_text', None):
        style_text = page.template_style_text

    if image_path is None and project and getattr(project, 'template_image_path', None):
        image_path = file_service.get_template_path(project.id)

    if not style_text and project and getattr(project, 'template_style', None):
        style_text = project.template_style

    return image_path, style_text


def _commit_with_retry(max_retries=5, base_delay=0.5):
    for attempt in range(max_retries):
        try:
            db.session.commit()
            return
        except OperationalError as e:
            if "database is locked" in str(e) and attempt < max_retries - 1:
                db.session.rollback()
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Database locked, retrying commit in {delay:.1f}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
            else:
                raise


SUPPORTED_IMAGE_ASPECT_RATIOS = (
    '1:1',
    '1:4',
    '1:8',
    '2:3',
    '3:2',
    '3:4',
    '4:1',
    '4:3',
    '4:5',
    '5:4',
    '8:1',
    '9:16',
    '16:9',
    '21:9',
)


def _aspect_ratio_from_size(width: int, height: int) -> str:
    """Map arbitrary pixel dimensions to the nearest provider-supported aspect ratio."""
    safe_width = max(1, width)
    safe_height = max(1, height)
    divisor = gcd(safe_width, safe_height)
    normalized = f"{safe_width // divisor}:{safe_height // divisor}"
    if normalized in SUPPORTED_IMAGE_ASPECT_RATIOS:
        return normalized

    source_ratio = safe_width / safe_height
    return min(
        SUPPORTED_IMAGE_ASPECT_RATIOS,
        key=lambda candidate: abs(source_ratio - (int(candidate.split(':')[0]) / int(candidate.split(':')[1]))),
    )


def _normalize_selection_bbox(selection: dict, image_size: tuple[int, int]) -> tuple[int, int, int, int]:
    """Clamp a selection rectangle into source image bounds."""
    width, height = image_size
    x0 = max(0, min(int(selection['x']), width - 1))
    y0 = max(0, min(int(selection['y']), height - 1))
    x1 = max(x0 + 1, min(x0 + int(selection['width']), width))
    y1 = max(y0 + 1, min(y0 + int(selection['height']), height))
    return x0, y0, x1, y1


def _create_marked_reference_image(source_image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    """Highlight the selected region so edit models can focus on it reliably."""
    marked = source_image.convert('RGB').copy()
    draw = ImageDraw.Draw(marked, 'RGBA')
    outline_width = max(4, min(source_image.size) // 120)
    draw.rectangle(bbox, fill=(0, 0, 0, 190), outline=(255, 255, 255, 255), width=outline_width)
    return marked


def _blend_region_into_source(
    source_image: Image.Image,
    edited_image: Image.Image,
    bbox: tuple[int, int, int, int],
    feather_radius: int = 12,
) -> Image.Image:
    """Blend only the selected region from the edited result back into the source image."""
    if edited_image.size != source_image.size:
        edited_image = edited_image.resize(source_image.size, Image.Resampling.LANCZOS)

    source_rgb = source_image.convert('RGB')
    edited_rgb = edited_image.convert('RGB')
    mask = Image.new('L', source_rgb.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle(bbox, fill=255)
    if feather_radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather_radius))
    return Image.composite(edited_rgb, source_rgb, mask)


def _build_region_edit_instruction(prompt: str, operation: str) -> str:
    """Create a focused prompt for region-based edits using a marked reference image."""
    cleaned_prompt = (prompt or '').strip()
    if operation == 'erase_region':
        user_goal = cleaned_prompt or "移除黑色标记区域中的主体内容，并自然补全背景纹理与光影。"
        return (
            "用户会提供两张参考图：一张原图，一张带有黑色实心选区标记的图。\n"
            "请只处理黑色标记区域，将该区域内容移除，并根据周围视觉自然补全。\n"
            "黑色区域之外的构图、文字、光影、色调尽量保持不变。\n"
            f"额外要求：{user_goal}"
        )

    return (
        "用户会提供两张参考图：一张原图，一张带有黑色实心选区标记的图。\n"
        "请重点修改黑色标记区域，严格围绕该区域执行用户指令。\n"
        "未标记区域尽量保持原样，不要无关改动整体构图。\n"
        f"用户编辑要求：{cleaned_prompt}"
    )


def generate_descriptions_task(task_id: str, project_id: str, ai_service,
                               project_context, outline: List[Dict],
                               max_workers: int = 5, app=None,
                               language: str = None,
                               detail_level: str = 'default',
                               page_ids: list = None):
    """
    Background task for generating page descriptions
    Based on demo.py gen_desc() with parallel processing

    Note: app instance MUST be passed from the request context

    Args:
        task_id: Task ID
        project_id: Project ID
        ai_service: AI service instance
        project_context: ProjectContext object containing all project information
        outline: Complete outline structure
        max_workers: Maximum number of parallel workers
        app: Flask app instance
        language: Output language (zh, en, ja, auto)
        detail_level: Description detail level (concise/default/detailed)
        page_ids: Optional list of page IDs to generate (if not provided, generates all pages)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    # 在整个任务中保持应用上下文
    with app.app_context():
        try:
            if _generation_logs_enabled():
                logger.info(
                    "[Descriptions Task Start] task=%s project=%s pages=%s workers=%s language=%s detail=%s page_filter=%s",
                    task_id,
                    project_id,
                    len(outline) if outline else 0,
                    max_workers,
                    language,
                    detail_level,
                    len(page_ids) if page_ids else 'all',
                )
            # 重要：在后台线程开始时就获取task和设置状态
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return

            task.status = 'PROCESSING'
            db.session.commit()
            logger.info(f"Task {task_id} status updated to PROCESSING")

            # Get pages for this project (filtered by page_ids if provided)
            pages = get_filtered_pages(project_id, page_ids)

            if _generation_logs_enabled():
                logger.info(
                    "[Descriptions Task Pages] task=%s project=%s db_pages=%s outline_pages=%s",
                    task_id,
                    project_id,
                    len(pages),
                    len(ai_service.flatten_outline(outline)),
                )

            if not pages:
                raise ValueError("No pages found for project")

            # 关键修复：不要用 order_index 直接映射 outline 下标。
            # order_index 可能存在断号（删除/插入后未重排），会导致页内容错位。
            all_project_pages = get_filtered_pages(project_id, None)
            page_sequence_by_id = {
                page.id: idx for idx, page in enumerate(all_project_pages)
            }

            def _build_page_outline_snapshot(page: Page, sequence_index: int) -> Dict:
                outline_content = page.get_outline_content() or {}
                title = outline_content.get('title')
                if not title:
                    title = f'第{sequence_index + 1}页'
                points = outline_content.get('points')
                if not isinstance(points, list):
                    points = []
                page_outline = {
                    'title': title,
                    'points': points,
                }
                part = page.part or outline_content.get('part')
                if part:
                    page_outline['part'] = part
                return page_outline

            page_jobs = []
            for i, page in enumerate(pages):
                sequence_index = page_sequence_by_id.get(page.id)
                if sequence_index is None:
                    # 兜底：极端情况下按当前筛选结果顺序回退
                    sequence_index = i
                page_jobs.append({
                    'page_id': page.id,
                    'order_index': page.order_index,
                    'sequence_index': sequence_index,
                    'page_outline': _build_page_outline_snapshot(page, sequence_index),
                })

            is_renovation = (project_context.creation_type == 'ppt_renovation')
            page_source_image_by_id: Dict[str, str] = {}
            if is_renovation:
                try:
                    from services import FileService
                    file_service = FileService(app.config['UPLOAD_FOLDER'])
                    project_dir = Path(app.config['UPLOAD_FOLDER']) / project_id
                    original_images = get_renovation_original_page_images(project_dir)
                    original_by_order = {i: img for i, img in enumerate(original_images)}

                    for page in pages:
                        image_path = original_by_order.get(page.order_index)
                        if not image_path:
                            rel = page.generated_image_path or page.cached_image_path
                            if rel:
                                try:
                                    image_path = file_service.get_absolute_path(rel)
                                except Exception:
                                    image_path = None
                        if image_path and Path(image_path).exists():
                            page_source_image_by_id[page.id] = image_path

                    logger.info(
                        "Renovation description generation uses raw page images: mapped=%s/%s",
                        len(page_source_image_by_id),
                        len(pages),
                    )
                except Exception:
                    logger.warning("Failed to prepare renovation page source images", exc_info=True)

            # Mark all pages as GENERATING_DESCRIPTION before starting
            for page in pages:
                page.status = 'GENERATING_DESCRIPTION'

            # Initialize progress
            task.set_progress({
                "total": len(pages),
                "completed": 0,
                "failed": 0
            })
            db.session.commit()

            # Generate descriptions in parallel
            completed = 0
            failed = 0

            def generate_single_desc(page_id, page_outline, page_index):
                """
                Generate description for a single page
                注意：只传递 page_id（字符串），不传递 ORM 对象，避免跨线程会话问题
                """
                # 关键修复：在子线程中也需要应用上下文
                with app.app_context():
                    try:
                        if _generation_logs_enabled():
                            logger.info(
                                "[Description Page Start] task=%s page=%s index=%s title=%s",
                                task_id,
                                page_id,
                                page_index,
                                page_outline.get('title', 'Untitled'),
                            )
                        # Get singleton AI service instance
                        from services.ai_service_manager import get_ai_service
                        ai_service = get_ai_service()

                        if is_renovation:
                            source_image = page_source_image_by_id.get(page_id)
                            if not source_image:
                                raise ValueError(f"No original page image found for renovation page {page_id}")
                            with task_scope(task_id), text_resource_limiter.slot(
                                f"renovation-description project={project_id} page={page_id}"
                            ):
                                extracted = ai_service.extract_page_content_from_image(
                                    source_image,
                                    language=language,
                                )
                            desc_result = {
                                'text': extracted.get('description', ''),
                            }
                        else:
                            with task_scope(task_id), text_resource_limiter.slot(
                                f"description project={project_id} page={page_id}"
                            ):
                                desc_result = ai_service.generate_page_description(
                                    project_context, outline, page_outline, page_index,
                                    language=language,
                                    detail_level=detail_level
                                )

                        # generate_page_description returns dict with text + optional extra_fields
                        desc_content = {
                            "text": desc_result['text'],
                            "generated_at": datetime.utcnow().isoformat()
                        }
                        if desc_result.get('extra_fields'):
                            desc_content['extra_fields'] = desc_result['extra_fields']
                        if _generation_logs_enabled():
                            logger.info(
                                "[Description Page Done] task=%s page=%s index=%s chars=%s",
                                task_id,
                                page_id,
                                page_index,
                                len(desc_result.get('text') or ''),
                            )

                        return (page_id, desc_content, None)
                    except Exception as e:
                        import traceback
                        error_detail = traceback.format_exc()
                        logger.error(f"Failed to generate description for page {page_id}: {error_detail}")
                        return (page_id, None, str(e))

            # Use ThreadPoolExecutor for parallel generation
            # 关键：提前提取 page.id，不要传递 ORM 对象到子线程
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(
                        generate_single_desc,
                        job['page_id'],
                        job['page_outline'],
                        job['sequence_index'] + 1,
                    )
                    for i, job in enumerate(page_jobs, 1)
                ]

                # Process results as they complete
                for future in as_completed(futures):
                    page_id, desc_content, error = future.result()

                    db.session.expire_all()

                    # Update page in database
                    page = Page.query.get(page_id)
                    if page:
                        if error:
                            page.status = 'FAILED'
                            failed += 1
                            if _generation_logs_enabled():
                                logger.error(
                                    "[Description Page Failed] task=%s page=%s error=%s",
                                    task_id,
                                    page_id,
                                    error,
                                )
                        else:
                            page.set_description_content(desc_content)
                            page.status = 'DESCRIPTION_GENERATED'
                            completed += 1

                        db.session.commit()

                    # Update task progress
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                        logger.info(f"Description Progress: {completed}/{len(pages)} pages completed")

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                db.session.commit()
                logger.info(f"Task {task_id} COMPLETED - {completed} pages generated, {failed} failed")

            # Update project status
            from models import Project
            project = Project.query.get(project_id)
            if project and failed == 0:
                all_project_pages = Page.query.filter_by(project_id=project_id).all()
                all_have_descriptions = all(
                    page.description_content and page.get_description_content()
                    for page in all_project_pages
                )
                project.status = 'DESCRIPTIONS_GENERATED' if all_have_descriptions else 'OUTLINE_GENERATED'
                db.session.commit()
                logger.info(f"Project {project_id} status updated to {project.status}")

        except Exception as e:
            logger.error(f"Task {task_id} FAILED while generating descriptions: {e}", exc_info=True)
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def generate_images_task(task_id: str, project_id: str, ai_service, file_service,
                        outline: List[Dict], use_template: bool = True,
                        max_workers: int = 8, aspect_ratio: str = "16:9",
                        resolution: str = "2K", app=None,
                        extra_requirements: str = None,
                        language: str = None,
                        page_ids: list = None,
                        base_extra_requirements: str = None,
                        project_template_style_json: str = None,
                        project_template_style: str = None,
                        page_style_json_map: Optional[Dict[str, str]] = None,
                        image_prompt_field_names: Optional[set] = None):
    """
    Background task for generating page images
    Based on demo.py gen_images_parallel()

    Note: app instance MUST be passed from the request context

    Args:
        language: Output language (zh, en, ja, auto)
        page_ids: Optional list of page IDs to generate (if not provided, generates all pages)
        base_extra_requirements: project-level extra requirements without style content
        project_template_style_json: project-level style guide JSON
        project_template_style: project-level style text
        page_style_json_map: optional page_id -> style_json override map
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            if _generation_logs_enabled():
                logger.info(
                    "[Images Task Start] task=%s project=%s workers=%s use_template=%s aspect_ratio=%s resolution=%s page_filter=%s",
                    task_id,
                    project_id,
                    max_workers,
                    use_template,
                    aspect_ratio,
                    resolution,
                    len(page_ids) if page_ids else 'all',
                )
            # Queue single-page generation until a real image slot is acquired
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PENDING'
            task.set_progress({
                "total": 1,
                "completed": 0,
                "failed": 0,
            })
            db.session.commit()

            # Get pages for this project (filtered by page_ids if provided)
            pages = get_filtered_pages(project_id, page_ids)
            all_pages_data = ai_service.flatten_outline(outline)
            image_prompt_field_names = (
                image_prompt_field_names
                if image_prompt_field_names is not None
                else get_image_prompt_field_names()
            )
            all_project_pages = get_filtered_pages(project_id, None)
            page_sequence_by_id = {
                page.id: idx for idx, page in enumerate(all_project_pages)
            }
            page_jobs = []
            for i, page in enumerate(pages):
                sequence_index = page_sequence_by_id.get(page.id)
                if sequence_index is None:
                    sequence_index = i
                page_jobs.append({
                    'page_id': page.id,
                    'order_index': page.order_index,
                    'sequence_index': sequence_index,
                })

            quality_control_enabled = get_image_quality_control_enabled()

            if _generation_logs_enabled():
                logger.info(
                    "[Images Task Pages] task=%s selected_pages=%s outline_pages=%s",
                    task_id,
                    len(pages),
                    len(all_pages_data),
                )

            # Build mapping from outline sequence index to page_data.
            pages_data_by_index = {i: pd for i, pd in enumerate(all_pages_data)}

            # 注意：不在任务开始时获取模板路径，而是在每个子线程中动态获取
            # 这样可以确保即使用户在上传新模板后立即生成，也能使用最新模板

            # Initialize progress
            task.set_progress({
                "total": len(pages),
                "completed": 0,
                "failed": 0
            })
            db.session.commit()

            # Generate images in parallel
            completed = 0
            failed = 0
            resolution_mismatched = 0  # Count of resolution mismatches
            first_resolution_warning_message = None

            total_pages = len(all_pages_data)

            def generate_single_image(page_id, page_data, page_index):
                """
                Generate image for a single page
                注意：只传递 page_id（字符串），不传递 ORM 对象，避免跨线程会话问题
                """
                # 关键修复：在子线程中也需要应用上下文
                with app.app_context():
                    try:
                        if _generation_logs_enabled():
                            logger.info(
                                "[Image Page Start] task=%s page=%s index=%s",
                                task_id,
                                page_id,
                                page_index,
                            )
                        logger.debug(f"Starting image generation for page {page_id}, index {page_index}")
                        page_snapshot = _load_page_generation_snapshot(page_id)
                        desc_content = page_snapshot['description_content']
                        if not desc_content:
                            raise ValueError("No description content for page")

                        def mark_generating():
                            page_for_update = Page.query.get(page_id)
                            if page_for_update:
                                page_for_update.status = 'GENERATING'
                                db.session.commit()
                                logger.debug(f"Page {page_id} status updated to GENERATING")

                        with task_scope(task_id), image_resource_limiter.slot(
                            f"project={project_id} page={page_id}",
                            on_acquire=mark_generating,
                        ):
                            desc_text = desc_content.get('text', '')
                            if not desc_text and desc_content.get('text_content'):
                                text_content = desc_content.get('text_content', [])
                                if isinstance(text_content, list):
                                    desc_text = '\n'.join(text_content)
                                else:
                                    desc_text = str(text_content)

                            # 将 extra_fields 拼入描述文本供图片生成使用
                            desc_text = _append_extra_fields(desc_text, desc_content, image_prompt_field_names)
                            logger.debug(f"Got description text for page {page_id}: {desc_text[:100]}...")

                            page_additional_ref_images = []
                            has_material_images = False
                            if desc_text:
                                image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
                                if image_urls:
                                    logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                                    page_additional_ref_images = image_urls
                                    has_material_images = True


                            # Per-page-template (PRD §13): resolve image + style
                            # per-page, falling back to project-level for legacy/single-mode.
                            project_for_template = Project.query.get(project_id)
                            page_ref_image_path, page_style_text = resolve_page_template(
                                Page.query.get(page_id), project_for_template, file_service)
                            has_template_image = bool(page_ref_image_path)


                            page_style_json = None
                            if isinstance(page_style_json_map, dict):
                                page_style_json = page_style_json_map.get(page_id)
                            if (
                                base_extra_requirements is not None
                                or project_template_style_json is not None
                                or project_template_style is not None
                            ):
                                effective_style_json = page_style_json or project_template_style_json
                                effective_page_type = resolve_effective_page_type(page_data)
                                scoped_style_json = build_preview_style_json_for_page_type(
                                    effective_style_json,
                                    page_type_key=effective_page_type,
                                ) if effective_style_json else effective_style_json
                                page_extra_requirements = build_combined_style_requirements(
                                    extra_requirements=base_extra_requirements,
                                    style_json=scoped_style_json,
                                    style_text=project_template_style,
                                )
                            else:
                                page_extra_requirements = extra_requirements
                            if isinstance(page_extra_requirements, str):
                                page_extra_requirements = page_extra_requirements.strip() or None

                            prompt = ai_service.generate_image_prompt(
                                outline, page_data, desc_text, page_index,
                                has_material_images=has_material_images,
                                extra_requirements=page_extra_requirements,
                                language=language,
                                has_template=has_template_image,
                                aspect_ratio=aspect_ratio,
                                page_style_text=page_style_text,
                            )
                            logger.debug(f"Generated image prompt for page {page_id}")

                            logger.info(f"🎨 Calling AI service to generate image for page {page_index}/{len(pages)}...")
                            image = generate_image_until_quality_passes(
                                lambda: _generate_image_with_auto_retry(
                                    task_id=task_id, page_id=page_id, operation='batch_generate',
                                    generate_fn=lambda: ai_service.generate_image(
                                        prompt, page_ref_image_path, aspect_ratio, resolution,
                                        additional_ref_images=page_additional_ref_images or None),
                                ),
                                ai_service,
                                prompt,
                                desc_text,
                                page_data=page_data,
                                page_index=_get_absolute_page_index(Page.query.get(page_id), page_index),
                                quality_control_enabled=quality_control_enabled,
                            )
                        logger.info(f"✅ Image generated successfully for page {page_index}")

                        if not image:
                            raise ValueError("Failed to generate image")

                        logger.info(
                            "Image generation result: task=%s project=%s page=%s model=%s requested_resolution=%s actual_size=%sx%s aspect_ratio=%s",
                            task_id,
                            project_id,
                            page_id,
                            _resolve_image_model_label(ai_service),
                            resolution,
                            image.width,
                            image.height,
                            aspect_ratio,
                        )
                        _log_image_audit_event(
                            "image_task_result",
                            task_id=task_id,
                            project_id=project_id,
                            page_id=page_id,
                            operation="generate_batch_page",
                            model=_resolve_image_model_label(ai_service),
                            requested_resolution=resolution,
                            actual_width=image.width,
                            actual_height=image.height,
                            aspect_ratio=aspect_ratio,
                        )

                        # Check resolution for all providers
                        actual_res, is_match = check_image_resolution(image, resolution)
                        warning_message = None
                        if not is_match:
                            logger.warning(f"Resolution mismatch for page {page_index}: requested {resolution}, got {actual_res}")
                            warning_message = _build_resolution_mismatch_warning_message(
                                ai_service,
                                requested_resolution=resolution,
                                actual_resolution=actual_res,
                                image_size=(image.width, image.height),
                            )

                        # 优化：直接在子线程中计算版本号并保存到最终位置
                        # 每个页面独立，使用数据库事务保证版本号原子性，避免临时文件
                        page_obj = db.session.get(Page, page_id)
                        if not page_obj:
                            raise ValueError(f"Page {page_id} not found")
                        request_snapshot = _build_image_request_snapshot(
                            operation_type='regenerate' if page_snapshot['current_image_rel_path'] else 'generate',
                            aspect_ratio=aspect_ratio,
                            resolution=resolution,
                            prompt_text=prompt,
                            image_model=_resolve_image_model_label(ai_service),
                            primary_reference=page_ref_image_path,
                            additional_references=page_additional_ref_images,
                            description_text=desc_text,
                            extra_requirements=page_extra_requirements,
                            extra_requirements_in_prompt=True,
                            upload_root=file_service.upload_folder,
                        )
                        image_path, next_version = save_image_with_version(
                            image,
                            project_id,
                            page_id,
                            file_service,
                            page_obj=page_obj,
                            prompt_text=request_snapshot,
                            operation_type='regenerate' if page_snapshot['current_image_rel_path'] else 'generate',
                        )
                        if _generation_logs_enabled():
                            logger.info(
                                "[Image Page Done] task=%s page=%s index=%s version=%s path=%s",
                                task_id,
                                page_id,
                                page_index,
                                next_version,
                                image_path,
                            )

                        return (page_id, image_path, None, not is_match, warning_message)

                    except Exception as e:
                        import traceback
                        error_detail = traceback.format_exc()
                        _log_image_audit_event(
                            "image_task_error",
                            task_id=task_id,
                            project_id=project_id,
                            page_id=page_id,
                            operation="generate_batch_page",
                            error=type(e).__name__,
                            detail=str(e),
                        )
                        logger.error(f"Failed to generate image for page {page_id}: {error_detail}")
                        return (page_id, None, str(e), None, None)
                    finally:
                        _remove_scoped_session()

            # Use ThreadPoolExecutor for parallel generation
            # 关键：提前提取 page.id，不要传递 ORM 对象到子线程
            _remove_scoped_session()
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(
                        generate_single_image,
                        job['page_id'],
                        pages_data_by_index.get(job['sequence_index'], {}),
                        job['sequence_index'] + 1,
                    )
                    for i, job in enumerate(page_jobs, 1)
                ]

                # Process results as they complete
                for future in as_completed(futures):
                    page_id, image_path, error, is_mismatched, mismatch_warning_message = future.result()

                    if is_mismatched:
                        resolution_mismatched += 1
                        if not first_resolution_warning_message and mismatch_warning_message:
                            first_resolution_warning_message = mismatch_warning_message

                    db.session.expire_all()

                    # Update page in database (主要是为了更新失败状态)
                    page = Page.query.get(page_id)
                    if page:
                        if error:
                            page.status = 'FAILED'
                            failed += 1
                            if _generation_logs_enabled():
                                logger.error(
                                    "[Image Page Failed] task=%s page=%s error=%s",
                                    task_id,
                                    page_id,
                                    error,
                                )
                            db.session.commit()
                        else:
                            # 图片已在子线程中保存并创建版本记录，这里只需要更新计数
                            completed += 1
                            # 刷新页面对象以获取最新状态
                            db.session.refresh(page)

                    # Update task progress
                    task = Task.query.get(task_id)
                    if task:
                        progress = _clear_image_retry_progress(task.get_progress(), page_id=page_id)
                        progress['completed'] = completed
                        progress['failed'] = failed
                        # 第一次检测到不匹配时设置警告
                        if (
                            resolution_mismatched > 0
                            and 'warning_message' not in progress
                            and first_resolution_warning_message
                        ):
                            progress['warning_message'] = first_resolution_warning_message
                        task.set_progress(progress)
                        db.session.commit()
                        logger.info(f"Image Progress: {completed}/{len(pages)} pages completed")

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress(_clear_image_retry_progress(task.get_progress()))
                if resolution_mismatched > 0:
                    logger.warning(f"Task {task_id} has {resolution_mismatched} resolution mismatches")
                db.session.commit()
                logger.info(f"Task {task_id} COMPLETED - {completed} images generated, {failed} failed")

            # Update project status
            project = Project.query.get(project_id)
            if project and failed == 0:
                project.status = 'COMPLETED'
                db.session.commit()
                logger.info(f"Project {project_id} status updated to COMPLETED")

        except Exception as e:
            logger.error(f"Task {task_id} FAILED while generating images: {e}", exc_info=True)
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                task.set_progress(_clear_image_retry_progress(task.get_progress()))
                db.session.commit()
        finally:
            _remove_scoped_session()


def generate_single_page_image_task(task_id: str, project_id: str, page_id: str,
                                    ai_service, file_service, outline: List[Dict],
                                    use_template: bool = True, aspect_ratio: str = "16:9",
                                    resolution: str = "2K", app=None,
                                    extra_requirements: str = None,
                                    language: str = None,
                                    image_prompt_field_names: Optional[set] = None):
    """
    Background task for generating a single page image

    Note: app instance MUST be passed from the request context
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            # Queue edit work until a real image slot is acquired
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PENDING'
            db.session.commit()

            # Get page from database
            page_snapshot = _load_page_generation_snapshot(page_id, project_id)

            page = db.session.get(Page, page_id)
            page.status = 'QUEUED'
            page_order_index = page.order_index
            project_for_template = db.session.get(Project, project_id)
            ref_image_path, page_style_text = resolve_page_template(page, project_for_template, file_service)
            db.session.commit()
            _remove_scoped_session()

            # Get description content
            desc_content = page_snapshot['description_content']
            if not desc_content:
                raise ValueError("No saved description content for page")
            image_prompt_field_names = (
                image_prompt_field_names
                if image_prompt_field_names is not None
                else get_image_prompt_field_names()
            )
            quality_control_enabled = get_image_quality_control_enabled()

            # 获取描述文本（可能是 text 字段或 text_content 数组）
            desc_text = desc_content.get('text', '')
            if not desc_text and desc_content.get('text_content'):
                text_content = desc_content.get('text_content', [])
                if isinstance(text_content, list):
                    desc_text = '\n'.join(text_content)
                else:
                    desc_text = str(text_content)

            # 将 extra_fields 拼入描述文本供图片生成使用
            desc_text = _append_extra_fields(desc_text, desc_content, image_prompt_field_names)

            # 从描述文本中提取图片 URL
            additional_ref_images = []
            has_material_images = False

            if desc_text:
                image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
                if image_urls:
                    logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                    additional_ref_images = image_urls
                    has_material_images = True

            # Per-page-template (PRD §13): resolve image + style per-page,
            # falling back to project-level for legacy/single-mode.
            if not use_template:
                ref_image_path = None
            if ref_image_path and not Path(ref_image_path).is_file():
                logger.warning(
                    "Template image disappeared before generation for page %s: %s",
                    page_id,
                    ref_image_path,
                )
                ref_image_path = None
            if use_template and not ref_image_path and not page_style_text and not extra_requirements:
                raise ValueError(
                    "No template image or style description found for page")
            has_template_image = bool(ref_image_path)

            # Generate image prompt
            page_data = page_snapshot['page_data']

            prompt = ai_service.generate_image_prompt(
                outline, page_data, desc_text, page_snapshot['order_index'] + 1,
                has_material_images=has_material_images,
                extra_requirements=extra_requirements,
                language=language,
                has_template=has_template_image,
                aspect_ratio=aspect_ratio,
                page_style_text=page_style_text,
            )
            route_meta = _get_image_route_metadata(ai_service)
            _log_image_audit_event(
                "image_task_request",
                task_id=task_id,
                project_id=project_id,
                page_id=page_id,
                operation="generate_single_page",
                provider=route_meta.get("provider"),
                source=route_meta.get("source"),
                model=route_meta.get("model"),
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                use_template=use_template,
                has_template=bool(ref_image_path),
                ref_count=len(additional_ref_images),
            )

            logger.info(f"🎨 Generating image for page {page_id}...")
            def mark_generating():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    db.session.commit()
                page_obj = Page.query.get(page_id)
                if page_obj:
                    page_obj.status = 'GENERATING'
                    db.session.commit()

            with task_scope(task_id), image_resource_limiter.slot(
                f"project={project_id} page={page_id}",
                on_acquire=mark_generating,
            ):
                _remove_scoped_session()
                logger.info(f"🎨 Generating image for page {page_id}...")
                image = generate_image_until_quality_passes(
                    lambda: _generate_image_with_auto_retry(
                        task_id=task_id, page_id=page_id, operation='single_generate',
                        generate_fn=lambda: ai_service.generate_image(
                            prompt, ref_image_path, aspect_ratio, resolution,
                            additional_ref_images=additional_ref_images or None),
                    ),
                    ai_service,
                    prompt,
                    desc_text,
                    page_data=page_data,
                    page_index=page_order_index + 1,
                    quality_control_enabled=quality_control_enabled,
                )

            if not image:
                raise ValueError("Failed to generate image")
            _log_image_audit_event(
                "image_task_result",
                task_id=task_id,
                project_id=project_id,
                page_id=page_id,
                operation="generate_single_page",
                model=_resolve_image_model_label(ai_service),
                requested_resolution=resolution,
                actual_width=image.width,
                actual_height=image.height,
                aspect_ratio=aspect_ratio,
            )

            # 保存图片并创建历史版本记录
            page = db.session.get(Page, page_id)
            if not page:
                raise ValueError(f"Page {page_id} not found")
            request_snapshot = _build_image_request_snapshot(
                operation_type='regenerate' if page_snapshot['current_image_rel_path'] else 'generate',
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                prompt_text=prompt,
                image_model=_resolve_image_model_label(ai_service),
                primary_reference=ref_image_path,
                additional_references=additional_ref_images,
                description_text=desc_text,
                extra_requirements=extra_requirements,
                extra_requirements_in_prompt=True,
                upload_root=file_service.upload_folder,
            )
            image_path, next_version = save_image_with_version(
                image,
                project_id,
                page_id,
                file_service,
                page_obj=page,
                prompt_text=request_snapshot,
                operation_type='regenerate' if page_snapshot['current_image_rel_path'] else 'generate',
            )

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    "total": 1,
                    "completed": 1,
                    "failed": 0,
                })
                db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Page {page_id} image generated")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            _log_image_audit_event(
                "image_task_error",
                task_id=task_id,
                project_id=project_id,
                page_id=page_id,
                operation="generate_single_page",
                error=type(e).__name__,
                detail=str(e),
            )
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    "total": 1,
                    "completed": 0,
                    "failed": 1,
                })
                db.session.commit()

            # Update page status
            page = Page.query.get(page_id)
            if page:
                page.status = 'FAILED'
                db.session.commit()
        finally:
            _remove_scoped_session()


def edit_page_image_task(task_id: str, project_id: str, page_id: str,
                         edit_instruction: str, ai_service, file_service,
                         aspect_ratio: str = "16:9", resolution: str = "2K",
                         original_description: str = None,
                         additional_ref_images: List[str] = None,
                         temp_dir: str = None, app=None,
                         outline: Optional[List[Dict]] = None,
                         use_template: bool = False,
                         extra_requirements: Optional[str] = None,
                         language: str = 'zh',
                         reference_metas: Optional[List[Dict[str, Any]]] = None,
                         annotated_primary_image_path: Optional[str] = None,
                         source_image_rel_path: Optional[str] = None):
    """
    Background task for editing a page image

    Note: app instance MUST be passed from the request context
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PROCESSING'
            db.session.commit()

            # Get page from database
            page_snapshot = _load_page_generation_snapshot(page_id, project_id)

            page = db.session.get(Page, page_id)
            page.status = 'QUEUED'
            db.session.commit()
            _remove_scoped_session()

            edit_instruction_text = normalize_user_text(edit_instruction)
            current_image_rel_path = source_image_rel_path or page_snapshot['current_image_rel_path']
            template_path = file_service.get_template_path(project_id) if use_template else None
            if not current_image_rel_path:
                raise ValueError("Page must have generated image first")

            prompt_text: Optional[str] = None
            request_snapshot: Optional[str] = None
            operation_type = 'edit'

            try:
                current_image_path = annotated_primary_image_path or file_service.get_absolute_path(current_image_rel_path)
                merged_edit_refs: List[str] = []
                if additional_ref_images:
                    merged_edit_refs.extend(additional_ref_images)
                has_annotated_primary = bool(annotated_primary_image_path)
                upload_reference_metas = [
                    meta for meta in (reference_metas or [])
                    if isinstance(meta, dict) and meta.get('sourceType') in ('upload', 'material')
                ]
                primary_image_note = (
                    "带有区域编号标注的完整 PPT 页面图，请以这张图为主进行编辑，并严格按照图中的“区域1/区域2/...”定位修改位置。"
                    if has_annotated_primary
                    else None
                )
                reference_image_notes: List[str] = []
                if merged_edit_refs:
                    for idx, _ in enumerate(merged_edit_refs):
                        meta = upload_reference_metas[idx] if idx < len(upload_reference_metas) else None
                        label = str((meta or {}).get('label') or '').strip()
                        reference_image_notes.append(
                            f"用户上传素材{f'（{label}）' if label else ''}，仅在修改要求明确提到对应素材时使用。"
                        )
                effective_edit_instruction = edit_instruction_text or (
                    "Please update the current PPT page image using the attached references."
                    if str(language or '').lower().startswith('en')
                    else "请参考附加图片修改当前页 PPT 图片。"
                )

                logger.info(f"🎨 Editing image for page {page_id}...")
                prompt_text = get_image_edit_prompt(
                    edit_instruction=effective_edit_instruction,
                    reference_image_count=1 + len(merged_edit_refs),
                    reference_image_notes=reference_image_notes,
                    primary_image_note=primary_image_note,
                )
                route_meta = _get_image_route_metadata(ai_service)
                _log_image_audit_event(
                    "image_task_request",
                    task_id=task_id,
                    project_id=project_id,
                    page_id=page_id,
                    operation="edit_page_image",
                    provider=route_meta.get("provider"),
                    source=route_meta.get("source"),
                    model=route_meta.get("model"),
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    use_template=use_template,
                    has_template=bool(template_path),
                    ref_count=len(merged_edit_refs) + 1,
                )
                request_snapshot = _build_image_request_snapshot(
                    operation_type=operation_type,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    prompt_text=prompt_text,
                    image_model=_resolve_image_model_label(ai_service),
                    primary_reference=current_image_path,
                    additional_references=merged_edit_refs,
                    edit_instruction=effective_edit_instruction,
                    upload_root=file_service.upload_folder,
                )
                def mark_generating():
                    task_obj = Task.query.get(task_id)
                    if task_obj:
                        task_obj.status = 'PROCESSING'
                        db.session.commit()
                    page_obj = Page.query.get(page_id)
                    if page_obj:
                        page_obj.status = 'GENERATING'
                        db.session.commit()

                with task_scope(task_id), image_resource_limiter.slot(
                    f"edit project={project_id} page={page_id}",
                    on_acquire=mark_generating,
                ):
                    image = call_with_transient_retry(
                        fn=lambda: ai_service.generate_image(
                            prompt_text,
                            current_image_path,
                            aspect_ratio,
                            resolution,
                            additional_ref_images=merged_edit_refs if merged_edit_refs else None,
                        ),
                        description=f"edit_page_image:{page_id}",
                        max_attempts=3,
                        on_proxy_enabled=lambda: _rebuild_image_provider_after_proxy_enabled(ai_service),
                    )
            finally:
                # Clean up temp directory if created
                if temp_dir:
                    import shutil
                    from pathlib import Path
                    temp_path = Path(temp_dir)
                    if temp_path.exists():
                        shutil.rmtree(temp_dir)

            if not image:
                raise ValueError("Failed to edit image")
            _log_image_audit_event(
                "image_task_result",
                task_id=task_id,
                project_id=project_id,
                page_id=page_id,
                operation="edit_page_image",
                model=_resolve_image_model_label(ai_service),
                requested_resolution=resolution,
                actual_width=image.width,
                actual_height=image.height,
                aspect_ratio=aspect_ratio,
            )

            # 保存编辑后的图片并创建历史版本记录
            page = db.session.get(Page, page_id)
            if not page:
                raise ValueError(f"Page {page_id} not found")
            image_path, next_version = save_image_with_version(
                image,
                project_id,
                page_id,
                file_service,
                page_obj=page,
                prompt_text=request_snapshot or prompt_text,
                operation_type=operation_type,
            )

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    "total": 1,
                    "completed": 1,
                    "failed": 0
                })
                db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Page {page_id} image edited")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            _log_image_audit_event(
                "image_task_error",
                task_id=task_id,
                project_id=project_id,
                page_id=page_id,
                operation="edit_page_image",
                error=type(e).__name__,
                detail=str(e),
            )
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            # Clean up temp directory on error
            if temp_dir:
                import shutil
                from pathlib import Path
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir)

            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

            # Update page status
            page = Page.query.get(page_id)
            if page:
                page.status = 'FAILED'
                db.session.commit()
        finally:
            _remove_scoped_session()


def generate_material_image_task(task_id: str, project_id: str, prompt: str,
                                 ai_service, file_service,
                                 ref_image_path: str = None,
                                 additional_ref_images: List[str] = None,
                                 aspect_ratio: str = "16:9",
                                 resolution: str = "2K",
                                 temp_dir: str = None, app=None):
    """
    Background task for generating a material image
    复用核心的generate_image逻辑，但保存到Material表而不是Page表

    Note: app instance MUST be passed from the request context
    project_id can be None for global materials (but Task model requires a project_id,
    so we use a special value 'global' for task tracking)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PROCESSING'
            db.session.commit()

            # Generate image (复用核心逻辑)
            logger.info(f"🎨 Generating material image with prompt: {prompt[:100]}...")
            image = ai_service.generate_image(
                prompt=prompt,
                ref_image_path=ref_image_path,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                additional_ref_images=additional_ref_images or None,
            )

            if not image:
                raise ValueError("Failed to generate image")

            # 处理project_id：如果为'global'或None，转换为None
            actual_project_id = None if (project_id == 'global' or project_id is None) else project_id

            # Save generated material image
            relative_path = file_service.save_material_image(image, actual_project_id)
            relative = Path(relative_path)
            filename = relative.name

            # Construct frontend-accessible URL
            image_url = file_service.get_file_url(actual_project_id, 'materials', filename)

            # Save material info to database
            material = Material(
                project_id=actual_project_id,
                filename=filename,
                relative_path=relative_path,
                url=image_url
            )
            db.session.add(material)

            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0,
                "material_id": material.id,
                "image_url": image_url
            })
            db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Material {material.id} generated")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

        finally:
            if temp_dir:
                import shutil
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)


def process_material_image_task(
    task_id: str,
    project_id: str,
    operation: str,
    prompt: str,
    ai_service,
    file_service,
    source_image_path: str = None,
    ref_image_path: str = None,
    additional_ref_images: List[str] = None,
    aspect_ratio: str = "16:9",
    resolution: str = "2K",
    selection: Optional[dict] = None,
    apply_mode: str = "overlay_selection",
    temp_dir: str = None,
    app=None,
):
    """Unified material processing task for generate/edit/region-edit workflows."""
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PROCESSING'
            db.session.commit()

            refs = list(additional_ref_images or [])
            result_image: Optional[Image.Image] = None
            source_image = None
            source_aspect_ratio = aspect_ratio

            if source_image_path:
                source_image = Image.open(source_image_path).convert('RGB')
                source_aspect_ratio = _aspect_ratio_from_size(*source_image.size)

            if operation == 'generate':
                result_image = ai_service.generate_image(
                    prompt=prompt,
                    ref_image_path=ref_image_path,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    additional_ref_images=refs if refs else None,
                )
            elif operation == 'edit_full':
                if not source_image_path:
                    raise ValueError("source_image_path is required for edit_full")

                if ref_image_path:
                    refs.insert(0, ref_image_path)

                result_image = ai_service.edit_image(
                    prompt=prompt,
                    current_image_path=source_image_path,
                    aspect_ratio=source_aspect_ratio,
                    resolution=resolution,
                    additional_ref_images=refs if refs else None,
                )
            elif operation in {'region_edit', 'erase_region'}:
                if not source_image or not source_image_path:
                    raise ValueError("source_image_path is required for region operations")
                if not selection:
                    raise ValueError("selection is required for region operations")

                bbox = _normalize_selection_bbox(selection, source_image.size)
                marked_reference = _create_marked_reference_image(source_image, bbox)
                if not temp_dir:
                    raise ValueError("区域操作需要 temp_dir")

                marked_reference_path = str(Path(temp_dir) / f"{task_id}_marked_region.png")
                marked_reference.save(marked_reference_path)
                refs.insert(0, marked_reference_path)

                if ref_image_path:
                    refs.insert(0, ref_image_path)

                instruction = _build_region_edit_instruction(prompt, operation)
                generated = ai_service.edit_image(
                    prompt=instruction,
                    current_image_path=source_image_path,
                    aspect_ratio=source_aspect_ratio,
                    resolution=resolution,
                    additional_ref_images=refs if refs else None,
                )

                if generated is None:
                    raise ValueError("Failed to process region edit")

                if generated.size != source_image.size:
                    generated = generated.resize(source_image.size, Image.Resampling.LANCZOS)

                if operation == 'erase_region' or apply_mode == 'overlay_selection':
                    result_image = _blend_region_into_source(source_image, generated, bbox)
                else:
                    result_image = generated
            else:
                raise ValueError(f"Unsupported material operation: {operation}")

            if result_image is None:
                raise ValueError("Failed to generate image")

            actual_project_id = None if (project_id == 'global' or project_id is None) else project_id
            relative_path = file_service.save_material_image(result_image, actual_project_id)
            relative = Path(relative_path)
            filename = relative.name
            image_url = file_service.get_file_url(actual_project_id, 'materials', filename)

            material = Material(
                project_id=actual_project_id,
                filename=filename,
                relative_path=relative_path,
                url=image_url
            )
            db.session.add(material)

            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0,
                "operation": operation,
                "apply_mode": apply_mode if operation == 'region_edit' else None,
                "selection": selection if operation in {'region_edit', 'erase_region'} else None,
                "material_id": material.id,
                "image_url": image_url
            })
            db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Material {material.id} processed via {operation}")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

        finally:
            if temp_dir:
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)


def process_ppt_renovation_task(task_id: str, project_id: str, ai_service,
                                file_service, file_parser_service,
                                keep_layout: bool = False,
                                max_workers: int = 5, app=None,
                                language: str = 'zh'):
    """
    Background task for PPT renovation: parse PDF pages → extract content → fill outline + description

    Flow:
    1. Split PDF → per-page PDFs
    2. Parallel: parse each page PDF → markdown via fileparser
    3. Parallel: AI extract {title, points, description} from each markdown
    4. If keep_layout: parallel caption model describe layout → append to description
    5. Update page.outline_content + page.description_content
    6. Concatenate descriptions → project.description_text
    7. project.status = DESCRIPTIONS_GENERATED

    Args:
        task_id: Task ID
        project_id: Project ID
        ai_service: AI service instance
        file_service: FileService instance
        file_parser_service: FileParserService instance
        keep_layout: Whether to preserve original layout via caption model
        max_workers: Maximum parallel workers
        app: Flask app instance
        language: Output language
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return

            task.status = 'PROCESSING'
            db.session.commit()

            from models import Project
            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            project_dir = Path(app.config['UPLOAD_FOLDER']) / project_id
            page_sources = get_renovation_page_sources(project_dir)
            if not page_sources:
                raise ValueError(
                    "No source file found for renovation project. "
                    "Expected split_pages PDFs, a source PDF in the template folder, "
                    "or existing page_*_original images."
                )
            logger.info(f"Loaded {len(page_sources)} renovation page source files")

            # Get existing pages
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()

            # Ensure page count matches
            if len(pages) != len(page_sources):
                logger.warning(f"Page count mismatch: {len(pages)} pages vs {len(page_sources)} source files. Using min.")
            page_count = min(len(pages), len(page_sources))
            if page_count == 0:
                raise ValueError("No pages to process")

            task.set_progress({
                "total": page_count,
                "completed": 0,
                "failed": 0,
                "current_step": "parsing"
            })
            db.session.commit()

            # Process each page as an independent pipeline:
            # parse markdown → AI extract content → (optional layout caption) → write to DB
            logger.info("Processing pages (parse → extract → save pipeline)...")
            import threading
            progress_lock = threading.Lock()
            completed = 0
            failed = 0
            extraction_errors = []
            content_results = {}  # index -> {title, points, description}

            def process_single_page(idx, page_pdf_path):
                nonlocal completed, failed
                with app.app_context():
                    try:
                        # Step A: Parse page PDF → markdown
                        filename = os.path.basename(page_pdf_path)
                        _batch_id, md_text, extract_id, error_msg, _failed = file_parser_service.parse_file(page_pdf_path, filename)
                        if error_msg:
                            # Do not silently turn a parser failure into a blank, successful page.
                            # In particular, this preserves MinerU credential failures for the UI.
                            raise ValueError(f"MinerU parsing failed: {error_msg}")
                        md_text = md_text or ''

                        # Supplement with header/footer from layout.json
                        if extract_id:
                            hf_text = file_parser_service.extract_header_footer_from_layout(extract_id)
                            if hf_text:
                                md_text = hf_text + '\n\n' + md_text

                        if not md_text.strip():
                            content = {'title': f'Page {idx + 1}', 'points': [], 'description': ''}
                            error = 'empty_input'
                        else:
                            # Step B: AI extract structured content
                            with task_scope(task_id), text_resource_limiter.slot(
                                f"renovation-extract project={project_id} page-index={idx}"
                            ):
                                content = ai_service.extract_page_content(md_text, language=language)
                            error = None

                        # Step C: Optional layout caption
                        if keep_layout and not error:
                            try:
                                page_obj = pages[idx] if idx < len(pages) else None
                                if page_obj:
                                    image_path = None
                                    if page_obj.cached_image_path:
                                        image_path = file_service.get_absolute_path(page_obj.cached_image_path)
                                    elif page_obj.generated_image_path:
                                        image_path = file_service.get_absolute_path(page_obj.generated_image_path)
                                    if image_path and Path(image_path).exists():
                                        with task_scope(task_id), text_resource_limiter.slot(
                                            f"layout-caption project={project_id} page-index={idx}"
                                        ):
                                            caption = ai_service.generate_layout_caption(image_path)
                                        if caption:
                                            slide_obj = content.get('slide') if isinstance(content.get('slide'), dict) else None
                                            if slide_obj:
                                                slide_obj = {**slide_obj, 'layout_guidance': caption}
                                                content['slide'] = slide_obj
                                                content['description'] = json.dumps(slide_obj, ensure_ascii=False, indent=2)
                                            else:
                                                desc_text = content.get('description', '')
                                                content['description'] = f"{desc_text}\n\n{caption}" if desc_text else caption
                            except Exception as e:
                                logger.error(f"Layout caption failed for page {idx}: {e}")

                        # Step D: Write to DB immediately
                        content_results[idx] = content
                        page_obj = Page.query.get(pages[idx].id)
                        if page_obj:
                            title = content.get('title', f'Page {idx + 1}')
                            points = content.get('points', [])
                            description = content.get('description', '')

                            page_obj.set_outline_content({
                                'title': title,
                                'points': points
                            })
                            page_obj.set_description_content({
                                "text": description,
                                "generated_at": datetime.utcnow().isoformat()
                            })
                            page_obj.status = 'DESCRIPTION_GENERATED'
                            db.session.commit()

                        with progress_lock:
                            if error and error != 'empty_input':
                                failed += 1
                                extraction_errors.append(error)
                            else:
                                completed += 1
                            task_obj = Task.query.get(task_id)
                            if task_obj:
                                task_obj.update_progress(completed=completed, failed=failed)
                                db.session.commit()

                        logger.info(f"Page {idx} pipeline done (completed={completed}, failed={failed})")

                    except Exception as e:
                        logger.error(f"Pipeline failed for page {idx}: {e}")
                        with progress_lock:
                            failed += 1
                            extraction_errors.append(str(e))
                            task_obj = Task.query.get(task_id)
                            if task_obj:
                                task_obj.update_progress(completed=completed, failed=failed)
                                db.session.commit()

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(process_single_page, i, page_sources[i])
                    for i in range(page_count)
                ]
                for future in as_completed(futures):
                    future.result()  # propagate any unexpected exceptions

            logger.info(f"All pages processed: {completed} completed, {failed} failed")

            # Fail-fast: any extraction failure aborts the entire task
            if failed > 0:
                reason = extraction_errors[0] if extraction_errors else "empty page content"
                raise ValueError(f"{failed}/{page_count} 页内容提取失败: {reason}")

            # Update project-level aggregated text
            project = Project.query.get(project_id)
            if project:
                all_outlines = []
                all_descriptions = []
                for i in range(page_count):
                    content = content_results.get(i, {})
                    title = content.get('title', '')
                    points = content.get('points', [])
                    description = content.get('description', '')
                    header = f"第{i + 1}页：{title}"
                    if points:
                        all_outlines.append(f"{header}\n" + "\n".join(f"- {p}" for p in points))
                    else:
                        all_outlines.append(header)
                    all_descriptions.append(f"--- 第{i + 1}页 ---\n{description}")
                project.outline_text = "\n\n".join(all_outlines)
                project.description_text = "\n\n".join(all_descriptions)
                project.status = 'DESCRIPTIONS_GENERATED'
                project.updated_at = datetime.utcnow()

            db.session.commit()

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    "total": page_count,
                    "completed": completed,
                    "failed": failed,
                    "current_step": "done"
                })
                db.session.commit()

            logger.info(f"Task {task_id} COMPLETED - PPT renovation processed {page_count} pages")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()

            # Reset project status so user can retry
            project = Project.query.get(project_id)
            if project:
                project.status = 'DRAFT'

            db.session.commit()


def export_editable_pptx_with_recursive_analysis_task(
    task_id: str,
    project_id: str,
    filename: str,
    file_service,
    page_ids: list = None,
    max_depth: int = 2,
    max_workers: int = 4,
    export_extractor_method: str = 'hybrid',
    export_inpaint_method: str = 'hybrid',
    app=None
):
    """
    使用递归图片可编辑化分析导出可编辑PPTX的后台任务

    这是新的架构方法，使用ImageEditabilityService进行递归版面分析。
    与旧方法的区别：
    - 不再假设图片是16:9
    - 支持任意尺寸和分辨率
    - 递归分析图片中的子图和图表
    - 更智能的坐标映射和元素提取
    - 不需要 ai_service（使用 ImageEditabilityService 和 MinerU）

    Args:
        task_id: 任务ID
        project_id: 项目ID
        filename: 输出文件名
        file_service: 文件服务实例
        page_ids: 可选的页面ID列表（如果提供，只导出这些页面）
        max_depth: 最大递归深度
        max_workers: 并发处理数
        export_extractor_method: 组件提取方法 ('mineru' 或 'hybrid')
        export_inpaint_method: 背景修复方法 ('generative', 'baidu', 'hybrid')
        app: Flask应用实例
    """
    logger.info(f"🚀 Task {task_id} started: export_editable_pptx_with_recursive_analysis (project={project_id}, depth={max_depth}, workers={max_workers}, extractor={export_extractor_method}, inpaint={export_inpaint_method})")

    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        import os
        from datetime import datetime
        from PIL import Image
        from models import Project
        from services.export_service import ExportService, ExportError
        from services.task_watchdog import touch_task

        logger.info(f"开始递归分析导出任务 {task_id} for project {project_id}")

        current_stage = "准备"

        def persist_export_failure(failure: ExportError):
            """Persist a terminal backend failure without discarding the last real progress."""
            failed_task = Task.query.get(task_id)
            if not failed_task:
                return

            previous_progress = failed_task.get_progress()
            previous_messages = previous_progress.get('messages') or []
            display_stage = {
                'style_extraction': '样式提取',
                'export': '导出',
            }.get(failure.stage, failure.stage)
            failed_task.status = 'FAILED'
            failed_task.error_message = failure.message
            failed_task.completed_at = datetime.utcnow()
            failed_task.set_progress({
                **previous_progress,
                "total": previous_progress.get('total', 100),
                "completed": previous_progress.get('completed', previous_progress.get('percent', 0)),
                "failed": 1,
                "current_step": f"{display_stage}失败",
                "percent": previous_progress.get('percent', 0),
                "messages": [*previous_messages, f"[{display_stage}] {failure.message}"][-10:],
                "backend_status": "FAILED",
                "error_code": failure.error_code,
                "error_type": failure.error_type,
                "error_stage": failure.stage,
                "error_details": failure.details,
                "help_text": failure.help_text,
            })
            db.session.commit()

        try:
            # Get project
            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f'Project {project_id} not found')

            # 读取项目的导出设置：是否允许返回半成品
            export_allow_partial = project.export_allow_partial or False
            fail_fast = not export_allow_partial
            logger.info(f"导出设置: export_allow_partial={export_allow_partial}, fail_fast={fail_fast}")

            # IMPORTANT: Expire cached objects to ensure fresh data from database
            # This prevents reading stale generated_image_path after page regeneration
            db.session.expire_all()

            # Get pages (filtered by page_ids if provided)
            pages = get_filtered_pages(project_id, page_ids)
            if not pages:
                raise ValueError('No pages found for project')

            image_paths = []
            for page in pages:
                if page.generated_image_path:
                    img_path = file_service.get_absolute_path(page.generated_image_path)
                    if os.path.exists(img_path):
                        image_paths.append(img_path)

            if not image_paths:
                raise ValueError('No generated images found for project')

            logger.info(f"找到 {len(image_paths)} 张图片")

            # 初始化任务进度（包含消息日志）
            task = Task.query.get(task_id)
            task.set_progress({
                "total": 100,  # 使用百分比
                "completed": 0,
                "failed": 0,
                "current_step": "准备中...",
                "percent": 0,
                "messages": ["开始导出可编辑PPTX..."],  # 消息日志
            })
            db.session.commit()

            # 进度回调函数 - 更新数据库中的进度
            progress_messages = ["开始导出可编辑PPTX..."]
            max_messages = 10  # 最多保留最近10条消息

            def progress_callback(step: str, message: str, percent: int):
                """更新任务进度到数据库"""
                nonlocal progress_messages, current_stage
                try:
                    current_stage = step
                    # 心跳：既更新内存看门狗，也写入数据库，
                    # 这样重启后能判断任务是否真的还在跑（见 services/task_watchdog.py）
                    touch_task(task_id, step)
                    # 添加新消息到日志
                    new_message = f"[{step}] {message}"
                    progress_messages.append(new_message)
                    # 只保留最近的消息
                    if len(progress_messages) > max_messages:
                        progress_messages = progress_messages[-max_messages:]

                    # 更新数据库
                    task = Task.query.get(task_id)
                    if task:
                        task.set_progress({
                            "total": 100,
                            "completed": percent,
                            "failed": 0,
                            "current_step": message,
                            "percent": percent,
                            "messages": progress_messages.copy(),
                        })
                        db.session.commit()
                except Exception as e:
                    logger.warning(f"更新进度失败: {e}")

            def heartbeat_callback(step: str):
                """仅更新内存心跳（不写库），用于元素级细粒度进度。"""
                touch_task(task_id, step)

            # Step 1: 准备工作
            logger.info("Step 1: 准备工作...")
            progress_callback("准备", f"找到 {len(image_paths)} 张幻灯片图片", 2)

            # 准备输出路径
            exports_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports')
            os.makedirs(exports_dir, exist_ok=True)

            # Handle filename collision
            if not filename.endswith('.pptx'):
                filename += '.pptx'

            output_path = os.path.join(exports_dir, filename)
            if os.path.exists(output_path):
                base_name = filename.rsplit('.', 1)[0]
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                filename = f"{base_name}_{timestamp}.pptx"
                output_path = os.path.join(exports_dir, filename)
                logger.info(f"文件名冲突，使用新文件名: {filename}")

            # 获取第一张图片的尺寸作为参考
            first_img = Image.open(image_paths[0])
            slide_width, slide_height = first_img.size
            first_img.close()

            logger.info(f"幻灯片尺寸: {slide_width}x{slide_height}")
            logger.info(f"递归深度: {max_depth}, 并发数: {max_workers}")
            progress_callback("准备", f"幻灯片尺寸: {slide_width}×{slide_height}", 3)

            # Step 2: 创建文字属性提取器
            from services.image_editability import TextAttributeExtractorFactory
            text_attribute_extractor = TextAttributeExtractorFactory.create_caption_model_extractor()
            progress_callback("准备", "文字属性提取器已初始化", 5)

            # Step 3: 调用导出方法（使用项目的导出设置）
            logger.info(f"Step 3: 创建可编辑PPTX (extractor={export_extractor_method}, inpaint={export_inpaint_method}, fail_fast={fail_fast})...")
            progress_callback("配置", f"提取方法: {export_extractor_method}, 背景修复: {export_inpaint_method}", 6)

            _, export_warnings = ExportService.create_editable_pptx_with_recursive_analysis(
                image_paths=image_paths,
                output_file=output_path,
                slide_width_pixels=slide_width,
                slide_height_pixels=slide_height,
                max_depth=max_depth,
                max_workers=max_workers,
                text_attribute_extractor=text_attribute_extractor,
                progress_callback=progress_callback,
                heartbeat_callback=heartbeat_callback,
                export_extractor_method=export_extractor_method,
                export_inpaint_method=export_inpaint_method,
                fail_fast=fail_fast
            )

            logger.info(f"✓ 可编辑PPTX已创建: {output_path}")

            # Step 4: 标记任务完成
            download_path = f"/files/{project_id}/exports/{filename}"

            # 添加完成消息
            progress_messages.append("导出完成！")

            # 添加警告信息（如果有）
            warning_messages = []
            if export_warnings and export_warnings.has_warnings():
                warning_messages = export_warnings.to_summary()
                progress_messages.extend(warning_messages)
                logger.warning(f"导出有 {len(warning_messages)} 条警告")

            task = Task.query.get(task_id)
            if task:
                # 注意：如果该任务已被看门狗判为失败，Task.status 的校验器
                # 会保持 FAILED 终态，但下面的产物信息仍会写入进度。
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                touch_task(task_id, "完成")
                task.set_progress({
                    "total": 100,
                    "completed": 100,
                    "failed": 0,
                    "current_step": "导出完成",
                    "percent": 100,
                    "messages": progress_messages,
                    "download_url": download_path,
                    "filename": filename,
                    "method": "recursive_analysis",
                    "max_depth": max_depth,
                    "warnings": warning_messages,  # 单独的警告列表
                    "warning_details": export_warnings.to_dict() if export_warnings else {}  # 详细警告信息
                })
                db.session.commit()
                if task.status == 'COMPLETED':
                    logger.info(f"✓ 任务 {task_id} 完成 - 递归分析导出成功（深度={max_depth}）")
                else:
                    logger.warning(
                        f"任务 {task_id} 在看门狗判失败后仍完成了导出，保持 FAILED 终态，"
                        f"产物: {filename}"
                    )

        except ExportError as e:
            # 导出错误（fail_fast 模式下的详细错误）
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"✗ 任务 {task_id} 导出失败: {e.message}")
            logger.error(f"错误类型: {e.error_type}, 详情: {e.details}")

            persist_export_failure(e)

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"✗ 任务 {task_id} 失败: {error_detail}")

            persist_export_failure(
                ExportService._build_unexpected_export_error(str(e), current_stage)
            )


def export_pptx_task(
    task_id: str,
    project_id: str,
    filename: str,
    file_service,
    page_ids: list = None,
    app=None
):
    """
    Background task for exporting PPTX with progress updates.
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        from datetime import datetime
        from services.export_service import ExportService
        from models import Project

        task = Task.query.get(task_id)
        if not task:
            logger.error(f"Task {task_id} not found")
            return

        try:
            progress_messages = ["🚀 开始导出PPTX..."]
            last_percent = -1
            last_message = ""

            def update_progress(step: str, message: str, percent: int, force: bool = False):
                nonlocal last_percent, last_message, progress_messages
                if not force and percent == last_percent:
                    return
                if message:
                    tagged = f"[{step}] {message}" if step else message
                    if not progress_messages or progress_messages[-1] != tagged:
                        progress_messages.append(tagged)
                        if len(progress_messages) > 10:
                            progress_messages = progress_messages[-10:]
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.set_progress({
                        "total": 100,
                        "completed": percent,
                        "failed": 0,
                        "current_step": message,
                        "percent": percent,
                        "messages": progress_messages
                    })
                    db.session.commit()
                last_percent = percent
                last_message = message

            task.status = 'PROCESSING'
            db.session.commit()
            update_progress("准备", "初始化导出任务", 0, force=True)

            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            update_progress("准备", "加载页面数据", 5, force=True)

            pages = get_filtered_pages(project_id, page_ids)
            if not pages:
                raise ValueError('No pages found for project')

            image_paths = []
            for page in pages:
                if page.generated_image_path:
                    abs_path = file_service.get_absolute_path(page.generated_image_path)
                    if os.path.exists(abs_path):
                        image_paths.append(abs_path)

            if not image_paths:
                raise ValueError('No generated images found for project')

            update_progress("准备", f"找到 {len(image_paths)} 张图片", 10, force=True)

            exports_dir = file_service._get_exports_dir(project_id)
            if not filename.endswith('.pptx'):
                filename += '.pptx'
            output_path = os.path.join(exports_dir, filename)
            if os.path.exists(output_path):
                base_name = filename.rsplit('.', 1)[0]
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                filename = f"{base_name}_{timestamp}.pptx"
                output_path = os.path.join(exports_dir, filename)

            update_progress("压缩", "准备压缩图片", 20, force=True)

            compress_enabled = bool(project.export_compress_enabled)

            def compress_progress(idx: int, total: int, _src: str):
                if total <= 0:
                    return
                percent = 20 + int((idx / total) * 40)
                update_progress("压缩", f"压缩图片 {idx}/{total}", percent)

            if not compress_enabled:
                update_progress("压缩", "未开启压缩，跳过", 60, force=True)

            with maybe_compress_export_images(
                project,
                image_paths,
                allow_webp=False,
                progress_cb=compress_progress if compress_enabled else None
            ) as export_paths:
                update_progress("生成", "正在生成PPTX...", 70, force=True)
                ExportService.create_pptx_from_images(export_paths, output_file=output_path, aspect_ratio=project.image_aspect_ratio)

            download_path = f"/files/{project_id}/exports/{filename}"

            update_progress("整理", "生成下载链接", 90, force=True)

            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 100,
                "completed": 100,
                "failed": 0,
                "current_step": "✓ 导出完成",
                "percent": 100,
                "messages": progress_messages + ["✅ 导出完成"],
                "download_url": download_path,
                "filename": filename
            })
            db.session.commit()

        except Exception as e:
            logger.error(f"✗ 任务 {task_id} 失败: {e}", exc_info=True)
            task.status = 'FAILED'
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            db.session.commit()


def export_video_task(
    task_id: str,
    project_id: str,
    filename: str,
    file_service,
    voice: str = 'zh-CN-XiaoxiaoNeural',
    rate: str = '+0%',
    speed: float = 1.0,
    generate_narration: bool = True,
    enable_ken_burns: bool = False,
    include_no_image_pages: bool = False,
    page_ids: list = None,
    language: str = 'zh',
    narration_config: dict | None = None,
    app=None,
):
    """
    后台任务：导出 TTS 播报视频 (MP4)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        import os
        from models import Project, Settings
        from services.tts_video_service import (
            generate_narration_video,
            check_ffmpeg_available,
            check_ffmpeg_ass_filter_available,
            create_placeholder_frame,
        )

        _settings = Settings.get_settings()
        elevenlabs_config = None
        if _settings.elevenlabs_enabled and _settings.elevenlabs_api_key:
            elevenlabs_config = {
                'api_key': _settings.elevenlabs_api_key,
                'voice_id': voice,
            }
        logger.info(f"[export_video] voice={voice!r} elevenlabs_enabled={_settings.elevenlabs_enabled} elevenlabs_config={'set' if elevenlabs_config else 'None'}")

        progress_messages = ["开始导出讲解视频..."]
        max_messages = 10

        def progress_callback(step: str, message: str, percent: int):
            nonlocal progress_messages
            try:
                new_message = f"[{step}] {message}"
                progress_messages.append(new_message)
                if len(progress_messages) > max_messages:
                    progress_messages = progress_messages[-max_messages:]

                mapped_pct = int(20 + percent * 0.75)
                mapped_pct = min(mapped_pct, 95)

                task = Task.query.get(task_id)
                if task:
                    task.set_progress({
                        "total": 100,
                        "completed": mapped_pct,
                        "failed": 0,
                        "current_step": message,
                        "percent": mapped_pct,
                        "messages": progress_messages.copy(),
                    })
                    db.session.commit()
            except Exception as e:
                logger.warning(f"更新进度失败: {e}")

        try:
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return

            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            export_allow_partial = project.export_allow_partial or False
            fail_fast = not export_allow_partial
            logger.info(f"视频导出设置: export_allow_partial={export_allow_partial}, fail_fast={fail_fast}")

            task.status = 'PROCESSING'
            task.set_progress({
                "total": 100,
                "completed": 0,
                "failed": 0,
                "current_step": "准备中...",
                "percent": 0,
                "messages": progress_messages,
            })
            db.session.commit()

            ffmpeg_path = app.config.get('FFMPEG_PATH', 'ffmpeg')
            if not check_ffmpeg_available(ffmpeg_path):
                raise RuntimeError("FFmpeg 未安装或不在 PATH 中。请安装 FFmpeg 以使用视频导出功能。")

            progress_callback("准备", "FFmpeg 可用", 2)
            if not check_ffmpeg_ass_filter_available(ffmpeg_path):
                progress_callback("准备", "当前 FFmpeg 缺少 ASS 字幕滤镜，若需字幕请先安装带 libass 的版本", 3)

            pages = get_filtered_pages(project_id, page_ids)
            if not pages:
                raise ValueError("没有找到可导出的页面")

            valid_pages = []
            placeholder_dir = None
            if include_no_image_pages:
                video_width = app.config.get('VIDEO_OUTPUT_WIDTH', 1920)
                video_height = app.config.get('VIDEO_OUTPUT_HEIGHT', 1080)
                placeholder_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports', f'_placeholder_{task_id}')
                os.makedirs(placeholder_dir, exist_ok=True)

            for page in pages:
                if page.generated_image_path:
                    img_path = file_service.get_absolute_path(page.generated_image_path)
                    if os.path.exists(img_path):
                        valid_pages.append((page, img_path))
                        continue

                if include_no_image_pages:
                    outline_content = page.get_outline_content() or {}
                    title = outline_content.get('title', f'Page {page.order_index + 1}')
                    placeholder_path = os.path.join(placeholder_dir, f'placeholder_{page.order_index:03d}.png')
                    try:
                        create_placeholder_frame(
                            placeholder_path, title=title,
                            width=video_width, height=video_height,
                            ffmpeg_path=ffmpeg_path,
                        )
                        valid_pages.append((page, placeholder_path))
                    except Exception as e:
                        logger.warning(f"生成占位帧失败 (page {page.id}): {e}")

            if not valid_pages:
                raise ValueError("没有找到可导出的页面（无图片且未启用占位帧）")

            progress_callback("准备", f"找到 {len(valid_pages)} 页幻灯片", 5)

            if generate_narration:
                from services.prompts import (
                    get_narration_generation_prompt,
                    normalize_narration_generation_config,
                    parse_narration_generation_result,
                )
                from services.ai_service_manager import get_ai_service

                ai_service = get_ai_service()
                narration_generated = 0
                project_topic = (project.idea_prompt or '').strip() if project else ''
                normalized_narration_config = normalize_narration_generation_config(
                    narration_config,
                    fallback_topic=project_topic,
                )
                image_prompt_field_names = get_image_prompt_field_names()

                pages_needing_narration = []
                for i, (page, _) in enumerate(valid_pages):
                    desc_content = page.get_description_content()
                    desc_text = ''
                    if desc_content:
                        desc_text = desc_content.get('text', '')
                        if not desc_text and desc_content.get('text_content'):
                            tc = desc_content.get('text_content', [])
                            desc_text = '\n'.join(tc) if isinstance(tc, list) else str(tc)
                        desc_text = _append_extra_fields(desc_text, desc_content, image_prompt_field_names)

                    outline_content = page.get_outline_content() or {}
                    if not desc_text:
                        title = outline_content.get('title', '')
                        points = outline_content.get('points', [])
                        if title or points:
                            desc_text = f'{title}\n' + '\n'.join(f'- {p}' for p in points)

                    if not desc_text:
                        if fail_fast:
                            raise RuntimeError(
                                f"第 {page.order_index + 1} 页缺少可生成旁白的描述内容，当前项目未开启“允许返回半成品”，无法导出视频。"
                            )
                        continue

                    pages_needing_narration.append((page, i + 1, outline_content, desc_text))

                if pages_needing_narration:
                    progress_callback("旁白", f"正在生成 {len(pages_needing_narration)} 页旁白...", 5)
                    try:
                        prompt_pages = [
                            {
                                'page_index': seq,
                                'title': outline.get('title', ''),
                                'points': outline.get('points', []),
                                'description_text': desc_text,
                            }
                            for _, seq, outline, desc_text in pages_needing_narration
                        ]
                        prompt = get_narration_generation_prompt(
                            prompt_pages,
                            language=language,
                            config=normalized_narration_config,
                        )
                        result = ai_service.text_provider.generate_text(prompt)
                        parsed = parse_narration_generation_result(result)

                        for page, seq, _, _ in pages_needing_narration:
                            narration = parsed.get(seq, '')
                            if narration:
                                page.set_narration_text(narration)
                                narration_generated += 1
                            elif fail_fast:
                                raise RuntimeError(
                                    f"第 {page.order_index + 1} 页旁白生成结果为空，当前项目未开启“允许返回半成品”，已停止导出。"
                                )
                        db.session.commit()
                    except RuntimeError:
                        raise
                    except Exception as e:
                        if fail_fast:
                            raise RuntimeError(f"旁白生成失败，已停止导出: {e}") from e
                        logger.warning(f"批量生成旁白失败: {e}")

                progress_callback("旁白", f"已生成 {narration_generated} 页旁白", 20)

            progress_callback("旁白", "旁白准备完成", 20)

            pages_data = []
            missing_narration_pages = []
            for page, img_path in valid_pages:
                db.session.refresh(page)
                narration = page.narration_text
                if not narration or not narration.strip():
                    missing_narration_pages.append(page.order_index + 1)
                pages_data.append({
                    'image_path': img_path,
                    'narration_text': narration,
                    'page_index': page.order_index,
                })

            if missing_narration_pages and fail_fast:
                pages = '、'.join(str(idx) for idx in missing_narration_pages)
                raise RuntimeError(
                    f"以下页面缺少旁白文本：第 {pages} 页。当前项目未开启“允许返回半成品”，已停止导出。"
                )

            exports_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports')
            os.makedirs(exports_dir, exist_ok=True)

            if not filename.endswith('.mp4'):
                filename += '.mp4'

            output_path = os.path.join(exports_dir, filename)
            if os.path.exists(output_path):
                base_name = filename.rsplit('.', 1)[0]
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                filename = f"{base_name}_{timestamp}.mp4"
                output_path = os.path.join(exports_dir, filename)

            video_width = app.config.get('VIDEO_OUTPUT_WIDTH', 1920)
            video_height = app.config.get('VIDEO_OUTPUT_HEIGHT', 1080)
            video_fps = app.config.get('VIDEO_FPS', 25)
            silent_duration = app.config.get('DEFAULT_SILENT_CLIP_DURATION', 3.0)

            generate_narration_video(
                pages_data=pages_data,
                output_path=output_path,
                voice=voice,
                rate=rate,
                width=video_width,
                height=video_height,
                fps=video_fps,
                enable_ken_burns=enable_ken_burns,
                ffmpeg_path=ffmpeg_path,
                progress_callback=progress_callback,
                silent_duration=silent_duration,
                fail_fast=fail_fast,
                elevenlabs_config=elevenlabs_config,
                speed=speed,
            )

            download_path = f"/files/{project_id}/exports/{filename}"
            progress_messages.append("视频导出完成！")

            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    "total": 100,
                    "completed": 100,
                    "failed": 0,
                    "current_step": "导出完成",
                    "percent": 100,
                    "messages": progress_messages,
                    "download_url": download_path,
                    "filename": filename,
                })
                db.session.commit()

        except Exception as e:
            logger.error(f"✗ 视频导出任务 {task_id} 失败: {e}", exc_info=True)
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()
        finally:
            if placeholder_dir and os.path.exists(placeholder_dir):
                import shutil
                shutil.rmtree(placeholder_dir, ignore_errors=True)

def export_pdf_task(
    task_id: str,
    project_id: str,
    filename: str,
    file_service,
    page_ids: list = None,
    app=None
):
    """
    Background task for exporting PDF with progress updates.
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        from datetime import datetime
        from services.export_service import ExportService
        from models import Project

        task = Task.query.get(task_id)
        if not task:
            logger.error(f"Task {task_id} not found")
            return

        try:
            progress_messages = ["🚀 开始导出PDF..."]
            last_percent = -1
            last_message = ""

            def update_progress(step: str, message: str, percent: int, force: bool = False):
                nonlocal last_percent, last_message, progress_messages
                if not force and percent == last_percent:
                    return
                if message:
                    tagged = f"[{step}] {message}" if step else message
                    if not progress_messages or progress_messages[-1] != tagged:
                        progress_messages.append(tagged)
                        if len(progress_messages) > 10:
                            progress_messages = progress_messages[-10:]
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.set_progress({
                        "total": 100,
                        "completed": percent,
                        "failed": 0,
                        "current_step": message,
                        "percent": percent,
                        "messages": progress_messages
                    })
                    db.session.commit()
                last_percent = percent
                last_message = message

            task.status = 'PROCESSING'
            db.session.commit()
            update_progress("准备", "初始化导出任务", 0, force=True)

            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            update_progress("准备", "加载页面数据", 5, force=True)

            pages = get_filtered_pages(project_id, page_ids)
            if not pages:
                raise ValueError('No pages found for project')

            image_paths = []
            for page in pages:
                if page.generated_image_path:
                    abs_path = file_service.get_absolute_path(page.generated_image_path)
                    if os.path.exists(abs_path):
                        image_paths.append(abs_path)

            if not image_paths:
                raise ValueError('No generated images found for project')

            update_progress("准备", f"找到 {len(image_paths)} 张图片", 10, force=True)

            exports_dir = file_service._get_exports_dir(project_id)
            if not filename.endswith('.pdf'):
                filename += '.pdf'
            output_path = os.path.join(exports_dir, filename)
            if os.path.exists(output_path):
                base_name = filename.rsplit('.', 1)[0]
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                filename = f"{base_name}_{timestamp}.pdf"
                output_path = os.path.join(exports_dir, filename)

            update_progress("压缩", "准备压缩图片", 20, force=True)

            compress_enabled = bool(project.export_compress_enabled)

            def compress_progress(idx: int, total: int, _src: str):
                if total <= 0:
                    return
                percent = 20 + int((idx / total) * 40)
                update_progress("压缩", f"压缩图片 {idx}/{total}", percent)

            if not compress_enabled:
                update_progress("压缩", "未开启压缩，跳过", 60, force=True)

            with maybe_compress_export_images(
                project,
                image_paths,
                allow_webp=False,
                progress_cb=compress_progress if compress_enabled else None
            ) as export_paths:
                update_progress("生成", "正在生成PDF...", 70, force=True)
                ExportService.create_pdf_from_images(export_paths, output_file=output_path, aspect_ratio=project.image_aspect_ratio)

            download_path = f"/files/{project_id}/exports/{filename}"

            update_progress("整理", "生成下载链接", 90, force=True)

            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 100,
                "completed": 100,
                "failed": 0,
                "current_step": "✓ 导出完成",
                "percent": 100,
                "messages": progress_messages + ["✅ 导出完成"],
                "download_url": download_path,
                "filename": filename
            })
            db.session.commit()

        except Exception as e:
            logger.error(f"✗ 任务 {task_id} 失败: {e}", exc_info=True)
            task.status = 'FAILED'
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            db.session.commit()


def export_images_task(
    task_id: str,
    project_id: str,
    file_service,
    page_ids: list = None,
    app=None
):
    """
    Background task for exporting images (single or ZIP) with progress updates.
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        from datetime import datetime
        import zipfile
        import shutil
        from models import Project

        task = Task.query.get(task_id)
        if not task:
            logger.error(f"Task {task_id} not found")
            return

        try:
            progress_messages = ["🚀 开始导出图片..."]
            last_percent = -1
            last_message = ""

            def update_progress(step: str, message: str, percent: int, force: bool = False):
                nonlocal last_percent, last_message, progress_messages
                if not force and percent == last_percent:
                    return
                if message:
                    tagged = f"[{step}] {message}" if step else message
                    if not progress_messages or progress_messages[-1] != tagged:
                        progress_messages.append(tagged)
                        if len(progress_messages) > 10:
                            progress_messages = progress_messages[-10:]
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.set_progress({
                        "total": 100,
                        "completed": percent,
                        "failed": 0,
                        "current_step": message,
                        "percent": percent,
                        "messages": progress_messages
                    })
                    db.session.commit()
                last_percent = percent
                last_message = message

            task.status = 'PROCESSING'
            db.session.commit()
            update_progress("准备", "初始化导出任务", 0, force=True)

            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            update_progress("准备", "加载页面数据", 5, force=True)

            pages = get_filtered_pages(project_id, page_ids)
            if not pages:
                raise ValueError('No pages found for project')

            image_items = []
            for page in pages:
                if page.generated_image_path:
                    abs_path = file_service.get_absolute_path(page.generated_image_path)
                    if os.path.exists(abs_path):
                        image_items.append((page, abs_path))

            if not image_items:
                raise ValueError('No generated images found for project')

            update_progress("准备", f"找到 {len(image_items)} 张图片", 10, force=True)

            exports_dir = file_service._get_exports_dir(project_id)
            timestamp = int(datetime.utcnow().timestamp())

            update_progress("压缩", "准备压缩图片", 20, force=True)

            compress_enabled = bool(project.export_compress_enabled)

            def compress_progress(idx: int, total: int, _src: str):
                if total <= 0:
                    return
                percent = 20 + int((idx / total) * 40)
                update_progress("压缩", f"压缩图片 {idx}/{total}", percent)

            if not compress_enabled:
                update_progress("压缩", "未开启压缩，跳过", 60, force=True)

            with maybe_compress_export_images(
                project,
                [p for _, p in image_items],
                allow_webp=True,
                progress_cb=compress_progress if compress_enabled else None
            ) as export_paths:
                export_items = list(zip([p for p, _ in image_items], export_paths))
                if len(export_items) == 1:
                    update_progress("打包", "导出单张图片", 80, force=True)
                    page, path = export_items[0]
                    ext = os.path.splitext(path)[1] or '.png'
                    filename = build_export_filename(project.project_title, ext, 'presentation')
                    output_path = os.path.join(exports_dir, filename)
                    if os.path.exists(output_path):
                        filename = f'{Path(filename).stem}_{timestamp}{ext}'
                        output_path = os.path.join(exports_dir, filename)
                    shutil.copy2(path, output_path)
                else:
                    total_items = len(export_items)
                    filename = build_export_filename(project.project_title, '.zip', 'presentation')
                    output_path = os.path.join(exports_dir, filename)
                    if os.path.exists(output_path):
                        filename = f'{Path(filename).stem}_{timestamp}.zip'
                        output_path = os.path.join(exports_dir, filename)
                    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                        for idx, (page, path) in enumerate(export_items, start=1):
                            percent = 60 + int((idx / total_items) * 30)
                            update_progress("打包", f"写入压缩包 {idx}/{total_items}", percent)
                            ext = os.path.splitext(path)[1] or '.png'
                            zf.write(path, f'slide_{page.order_index + 1:03d}{ext}')

            download_path = f"/files/{project_id}/exports/{filename}"

            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 100,
                "completed": 100,
                "failed": 0,
                "current_step": "✓ 导出完成",
                "percent": 100,
                "messages": progress_messages + ["✅ 导出完成"],
                "download_url": download_path,
                "filename": filename
            })
            db.session.commit()

        except Exception as e:
            logger.error(f"✗ 任务 {task_id} 失败: {e}", exc_info=True)
            task.status = 'FAILED'
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            db.session.commit()


# ============================================================================
# Per-page template tasks
# ============================================================================


def _set_task_processing(task_id: str) -> None:
    task = Task.query.get(task_id)
    if task and task.status == 'PENDING':
        task.status = 'PROCESSING'
        db.session.commit()


def process_template_pdf_split_task(task_id: str, project_id: str,
                                    pdf_relpath: str, file_service, app):
    """SPLIT_TEMPLATE_PDF — render each page as PNG, import into asset library.

    Each successful page becomes a `ProjectTemplateAsset(source='pdf_split')`
    and triggers its own `analyze_template_task`. Per-page failures are kept
    in `progress.failed` but do not abort the whole task.
    """
    if app is None:
        raise ValueError('Flask app instance must be provided')

    from services.pdf_image_service import pdf_to_page_images
    from services.ai_service import AIService

    with app.app_context():
        task = Task.query.get(task_id)
        if not task:
            return

        try:
            _set_task_processing(task_id)

            pdf_abs = file_service.get_absolute_path(pdf_relpath)
            output_dir = file_service.get_template_pdf_temp_dir(project_id, task_id)

            try:
                renders = pdf_to_page_images(pdf_abs, str(output_dir))
            except ValueError as exc:
                # E.g. > max_pages — fail the whole task
                task = Task.query.get(task_id)
                if task:
                    task.status = 'FAILED'
                    task.error_message = str(exc)
                    task.completed_at = datetime.utcnow()
                    db.session.commit()
                return

            total = len(renders)
            completed = 0
            failed = 0
            created_asset_ids = []

            # Determine starting sort_order so PDF-imported assets append cleanly
            base_sort = (
                db.session.query(func.coalesce(func.max(ProjectTemplateAsset.sort_order), -1))
                .filter(ProjectTemplateAsset.project_id == project_id)
                .scalar()
            ) + 1

            ai_service = AIService()

            task = Task.query.get(task_id)
            if task:
                task.set_progress({
                    'total': total,
                    'completed': 0,
                    'failed': 0,
                    'created_asset_ids': [],
                })
                db.session.commit()

            for render in renders:
                page_index = render['index']
                src_path = render.get('path')
                if not src_path:
                    failed += 1
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                    continue

                asset_id = str(uuid.uuid4())
                try:
                    image_path, thumb_path = file_service.save_template_asset_from_path(
                        src_path, project_id, asset_id
                    )
                    asset = ProjectTemplateAsset(
                        id=asset_id,
                        project_id=project_id,
                        image_path=image_path,
                        thumb_path=thumb_path,
                        source='pdf_split',
                        source_pdf_id=task_id,
                        source_page_index=page_index,
                        analysis_status='pending',
                        sort_order=base_sort + page_index - 1,
                    )
                    db.session.add(asset)
                    db.session.commit()
                    created_asset_ids.append(asset_id)
                    completed += 1
                except Exception as exc:
                    logger.warning('Failed to import PDF page %s as asset: %s',
                                   page_index, exc)
                    db.session.rollback()
                    failed += 1
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                    continue

                task = Task.query.get(task_id)
                if task:
                    progress = task.get_progress()
                    progress.update({
                        'total': total,
                        'completed': completed,
                        'failed': failed,
                        'created_asset_ids': list(created_asset_ids),
                    })
                    task.set_progress(progress)
                    db.session.commit()

                # Fire per-asset analyze task. Failure here is non-fatal.
                try:
                    sub_task = Task(
                        project_id=project_id,
                        task_type='ANALYZE_TEMPLATE',
                        status='PENDING',
                    )
                    sub_task.set_progress({'asset_id': asset_id, 'stage': 'queued'})
                    db.session.add(sub_task)
                    db.session.commit()
                except Exception as exc:
                    logger.warning('Failed to enqueue analyze for asset %s: %s',
                                   asset_id, exc)
                    # Roll back so a failed commit doesn't poison the session and
                    # break the remaining iterations of this loop.
                    db.session.rollback()
                    continue

                try:
                    task_manager.submit_task(
                        sub_task.id,
                        analyze_template_task,
                        project_id,
                        asset_id,
                        ai_service,
                        file_service,
                        app,
                    )
                except Exception as exc:
                    # The PENDING row is already committed; if submission fails
                    # mark it FAILED so it can't hang as "analyzing" forever.
                    logger.warning('Failed to submit analyze task for asset %s: %s',
                                   asset_id, exc)
                    try:
                        sub_task.status = 'FAILED'
                        sub_task.error_message = f'Task submission failed: {exc}'
                        db.session.commit()
                    except Exception as commit_exc:
                        logger.error(
                            'Failed to commit FAILED status for sub_task %s: %s',
                            sub_task.id,
                            commit_exc,
                        )
                        db.session.rollback()

            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED' if failed < total else 'FAILED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    'total': total,
                    'completed': completed,
                    'failed': failed,
                    'created_asset_ids': created_asset_ids,
                })
                if failed >= total:
                    task.error_message = 'All PDF pages failed to render'
                db.session.commit()

        except Exception as exc:
            db.session.rollback()
            import traceback
            logger.error('SPLIT_TEMPLATE_PDF task %s crashed: %s',
                         task_id, traceback.format_exc())
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(exc)
                task.completed_at = datetime.utcnow()
                db.session.commit()
        finally:
            # Always remove the PDF scratch dir, even if rendering crashed.
            file_service.cleanup_template_pdf_temp(project_id, task_id)


def analyze_template_task(task_id: str, project_id: str, asset_id: str,
                          ai_service, file_service, app):
    """ANALYZE_TEMPLATE — call ai_service.analyze_template, persist 9-field
    schema (PRD §5.3). Decision 2: AI-declared not_a_slide → analysis_status
    = 'failed', asset stays manual-only.
    """
    if app is None:
        raise ValueError('Flask app instance must be provided')
    with app.app_context():
        task = Task.query.get(task_id)
        if not task:
            return
        with task_scope(task_id), text_resource_limiter.slot(label=f'analyze_template:{asset_id}'):
            try:
                _set_task_processing(task_id)
                task.set_progress({'asset_id': asset_id, 'stage': 'calling_ai'})
                db.session.commit()

                asset = ProjectTemplateAsset.query.get(asset_id)
                if not asset:
                    raise ValueError(f'Asset {asset_id} no longer exists')

                asset.analysis_status = 'processing'
                _commit_with_retry()

                image_abs_path = file_service.get_absolute_path(asset.image_path)
                language = (app.config.get('OUTPUT_LANGUAGE') or 'zh').lower()

                result = ai_service.analyze_template(image_abs_path, language=language)

                asset = ProjectTemplateAsset.query.get(asset_id)
                if isinstance(result, dict) and result.get('error') == 'not_a_slide':
                    asset.analysis_status = 'failed'
                    asset.analysis_error = 'not_a_slide'
                    asset.analysis_json = None
                    asset.analysis_notes = None
                else:
                    asset.set_analysis(result)
                    asset.analysis_notes = (result or {}).get('notes')
                    asset.analysis_status = 'completed'
                    asset.analysis_error = None
                _commit_with_retry()

                task = Task.query.get(task_id)
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({'asset_id': asset_id, 'stage': 'done',
                                   'analysis_status': asset.analysis_status})
                _commit_with_retry()
            except Exception as exc:
                # Clear any poisoned session state from a failed commit so the
                # FAILED-status writes below can actually go through.
                db.session.rollback()
                import traceback
                logger.error('ANALYZE_TEMPLATE task %s crashed: %s',
                             task_id, traceback.format_exc())
                asset = ProjectTemplateAsset.query.get(asset_id)
                if asset:
                    asset.analysis_status = 'failed'
                    asset.analysis_error = str(exc)[:500]
                    db.session.commit()
                task = Task.query.get(task_id)
                if task:
                    task.status = 'FAILED'
                    task.error_message = str(exc)[:500]
                    task.completed_at = datetime.utcnow()
                    task.set_progress({'asset_id': asset_id, 'stage': 'failed'})
                    db.session.commit()


def auto_match_templates_task(task_id: str, project_id: str,
                              page_id: Optional[str],
                              overwrite_existing: bool,
                              preserve_non_empty: bool,
                              ai_service, app):
    """AUTO_MATCH_TEMPLATES — calls ai_service.auto_match_templates and
    writes per-page template_asset_id / style_text / match metadata.

    Decision 5: batching is inside ai_service. Decision 7: writes are
    bulk-by-page, no project-level fields touched. PRD §8.4: undecided
    rows null out template_asset_id when overwrite_existing=True.
    """
    if app is None:
        raise ValueError('Flask app instance must be provided')
    with app.app_context():
        task = Task.query.get(task_id)
        if not task:
            return
        with task_scope(task_id), text_resource_limiter.slot(label=f'auto_match:{project_id}'):
            try:
                _set_task_processing(task_id)
                language = (app.config.get('OUTPUT_LANGUAGE') or 'zh').lower()

                if page_id:
                    page = Page.query.filter_by(
                        id=page_id, project_id=project_id).first()
                    if not page:
                        raise ValueError(f'Page {page_id} not in project {project_id}')
                    desc = page.get_description_content()
                    if not desc:
                        raise ValueError('MISSING_DESCRIPTION')
                    templates = [t for t in ProjectTemplateAsset.query.filter_by(
                        project_id=project_id, analysis_status='completed').order_by(
                        ProjectTemplateAsset.sort_order.asc()).all()]
                    if not templates:
                        raise ValueError('NO_ANALYZED_TEMPLATES')
                    pages_payload = [ai_service._trim_page_for_match(page, desc)]
                    templates_payload = [ai_service._trim_template_for_match(t)
                                         for t in templates]
                    from .prompts import get_template_auto_match_prompt
                    prompt = get_template_auto_match_prompt(
                        templates=templates_payload, pages=pages_payload,
                        language=language)
                    results = ai_service.generate_json(prompt)
                    if isinstance(results, dict):
                        results = [results]
                    if not isinstance(results, list):
                        raise ValueError('auto_match: 期望返回列表')
                else:
                    results = ai_service.auto_match_templates(
                        project_id=project_id, language=language,
                        overwrite_existing=overwrite_existing,
                        preserve_non_empty=preserve_non_empty)

                matched = 0
                undecided = 0
                # Only completed templates were offered to the model, so only
                # they are valid auto-match targets.
                valid_template_ids = {t.id for t in
                                       ProjectTemplateAsset.query.filter_by(
                                           project_id=project_id,
                                           analysis_status='completed').all()}

                # Pre-load all project pages once to avoid an N+1 query per row.
                pages_by_id = {
                    p.id: p for p in
                    Page.query.filter_by(project_id=project_id).all()
                }
                for row in results:
                    if not isinstance(row, dict):
                        continue
                    pid = row.get('page_id')
                    if not pid:
                        continue
                    page = pages_by_id.get(pid)
                    if not page:
                        continue
                    if preserve_non_empty and page.template_asset_id:
                        continue

                    status = row.get('status', 'undecided')
                    chosen = row.get('template_asset_id')
                    if chosen and chosen not in valid_template_ids:
                        chosen = None
                        status = 'undecided'

                    if status == 'matched' and chosen:
                        page.template_asset_id = chosen
                        page.template_selection_source = 'auto'
                        page.template_match_reason = (row.get('reason') or '')[:500]
                        try:
                            page.template_match_confidence = float(
                                row.get('confidence') or 0.0)
                        except (TypeError, ValueError):
                            page.template_match_confidence = None
                        matched += 1
                    else:
                        if overwrite_existing:
                            page.template_asset_id = None
                            page.template_selection_source = None
                            page.template_match_reason = (row.get('reason') or '')[:500]
                            page.template_match_confidence = None
                        undecided += 1

                _commit_with_retry()

                task = Task.query.get(task_id)
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    'total_pages': len(results),
                    'matched': matched,
                    'undecided': undecided,
                    'scope': 'page' if page_id else 'project',
                })
                _commit_with_retry()
            except Exception as exc:
                db.session.rollback()
                import traceback
                logger.error('AUTO_MATCH_TEMPLATES task %s crashed: %s',
                             task_id, traceback.format_exc())
                task = Task.query.get(task_id)
                if task:
                    task.status = 'FAILED'
                    task.error_message = str(exc)[:500]
                    task.completed_at = datetime.utcnow()
                    db.session.commit()
