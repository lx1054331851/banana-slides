"""Helpers for resolving page-level style guide overrides."""
from __future__ import annotations

from typing import Any, Dict, Optional

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
