"""Helpers for resolving page-level style guide overrides."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

PAGE_STYLE_GUIDE_DEFAULT_BINDING = "__page_default__"


def build_style_guide_binding_key(image_version_id: Optional[str] = None) -> str:
    """Return binding key for an image version (or page-default when absent)."""
    if image_version_id:
        return f"image_version:{image_version_id}"
    return PAGE_STYLE_GUIDE_DEFAULT_BINDING


def normalize_style_guide_bindings(raw: Any) -> Dict[str, str]:
    """Keep only non-empty string key/value pairs."""
    if not isinstance(raw, dict):
        return {}

    normalized: Dict[str, str] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not isinstance(value, str):
            continue
        if not key.strip() or not value.strip():
            continue
        normalized[key] = value
    return normalized


def extract_style_guide_bindings(description_content: Any) -> Dict[str, str]:
    """Extract style_guide_bindings from page description content."""
    if not isinstance(description_content, dict):
        return {}
    return normalize_style_guide_bindings(description_content.get("style_guide_bindings"))


def resolve_page_style_guide_json(description_content: Any, image_version_id: Optional[str] = None) -> Optional[str]:
    """
    Resolve style guide JSON for a page with precedence:
    1) current image-version binding
    2) page-default binding
    """
    bindings = extract_style_guide_bindings(description_content)
    image_key = build_style_guide_binding_key(image_version_id)
    candidate = bindings.get(image_key)
    if isinstance(candidate, str) and candidate.strip():
        return candidate.strip()

    fallback = bindings.get(PAGE_STYLE_GUIDE_DEFAULT_BINDING)
    if isinstance(fallback, str) and fallback.strip():
        return fallback.strip()
    return None


def build_combined_style_requirements(
    *,
    extra_requirements: Optional[str] = None,
    style_json: Optional[str] = None,
    style_text: Optional[str] = None,
) -> str:
    """Build prompt-side requirements with page-level style JSON support."""
    parts = []
    if extra_requirements and extra_requirements.strip():
        parts.append(extra_requirements.strip())
    if style_json and style_json.strip():
        parts.append(f"ppt页面风格指导(JSON)：\n<style_json>\n{style_json.strip()}\n</style_json>")
    if style_text and style_text.strip():
        parts.append(f"附加风格要求：\n{style_text.strip()}")
    return "\n\n".join(parts).strip()


def _try_parse_style_json(style_json: Optional[str]) -> Optional[Dict[str, Any]]:
    if not isinstance(style_json, str) or not style_json.strip():
        return None
    try:
        parsed = json.loads(style_json)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _slugify_page_key(text: str) -> str:
    value = re.sub(r'[^a-z0-9]+', '_', str(text or '').strip().lower())
    value = re.sub(r'_+', '_', value).strip('_')
    return value or 'page'


def extract_style_template_page_slots(style_json: Optional[str]) -> List[Dict[str, Any]]:
    """
    Extract ordered page-slot metadata from design_system_spec.slide_templates.

    Returns items shaped like:
    {
      "sample_key": "brand_overview_page",
      "preview_key": "brand_overview_page_url",
      "page_index": 1,
      "title": "品牌概览页",
      "template_key": "brand_overview_page",
      "page_type": "品牌概览页",
    }
    """
    parsed = _try_parse_style_json(style_json)
    if not parsed:
        return []

    design_system = parsed.get("design_system_spec")
    if not isinstance(design_system, dict):
        return []

    slide_templates = design_system.get("slide_templates")
    if not isinstance(slide_templates, dict):
        return []

    slots: List[Dict[str, Any]] = []
    for index, (template_key, template_value) in enumerate(slide_templates.items(), start=1):
        if not isinstance(template_value, dict):
            continue
        page_type = str(template_value.get("page_type") or template_key or "").strip() or f"页面{index}"
        sample_key = _slugify_page_key(str(template_key or page_type))
        slots.append({
            "sample_key": sample_key,
            "preview_key": f"{sample_key}_url",
            "page_index": index,
            "title": page_type,
            "template_key": str(template_key),
            "page_type": page_type,
        })
    return slots


def build_preview_style_json_for_page_type(
    style_json: Optional[str],
    *,
    page_type_key: Optional[str] = None,
) -> Optional[str]:
    """
    Reduce a full style JSON to only:
    1) global design_system_spec fields
    2) the matching slide_templates node for the requested page type

    If parsing fails or the expected structure is missing, fall back to the
    original style_json text so current behavior remains compatible.
    """
    parsed = _try_parse_style_json(style_json)
    if not parsed:
        return style_json

    design_system = parsed.get("design_system_spec")
    if not isinstance(design_system, dict):
        return style_json

    slide_templates = design_system.get("slide_templates")
    if not isinstance(slide_templates, dict):
        return style_json

    requested_key = _slugify_page_key(page_type_key or "")
    matched_template_key = None
    matched_template_value = None

    if requested_key:
        for template_key, template_value in slide_templates.items():
            if not isinstance(template_value, dict):
                continue
            page_type = str(template_value.get("page_type") or "").strip()
            if (
                _slugify_page_key(page_type) == requested_key
                or _slugify_page_key(str(template_key)) == requested_key
            ):
                matched_template_key = template_key
                matched_template_value = template_value
                break

    if matched_template_key is None or matched_template_value is None:
        return style_json

    reduced_design_system: Dict[str, Any] = {}
    for key, value in design_system.items():
        if key == "slide_templates":
            reduced_design_system[key] = {matched_template_key: matched_template_value}
        else:
            reduced_design_system[key] = value

    return json.dumps({"design_system_spec": reduced_design_system}, ensure_ascii=False)
