"""
Image resolution support policy by provider/model.
"""

from __future__ import annotations

import json
from typing import Any, List, Optional

BASE_RESOLUTIONS: List[str] = ["1K", "2K", "4K"]
GEMINI_31_FLASH_RESOLUTIONS: List[str] = ["0.5K", "1K", "2K", "4K"]
OPENAI_RESOLUTIONS: List[str] = ["1K"]

_RESOLUTION_NORMALIZE_MAP = {
    "0.5k": "0.5K",
    "512": "0.5K",
    "512px": "0.5K",
    "1k": "1K",
    "1024": "1K",
    "1024px": "1K",
    "2k": "2K",
    "2048": "2K",
    "2048px": "2K",
    "4k": "4K",
    "4096": "4K",
    "4096px": "4K",
}


def _normalize_model_name(model_name: str) -> str:
    return (model_name or "").strip().lower()


def _normalize_provider_name(provider: Optional[str]) -> str:
    return (provider or "").strip().lower()


def normalize_image_resolution(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        raise ValueError("Image resolution cannot be empty")
    normalized = _RESOLUTION_NORMALIZE_MAP.get(raw.lower())
    if not normalized:
        raise ValueError(
            "Unsupported image resolution. Allowed values: 0.5K, 1K, 2K, 4K"
        )
    return normalized


def get_supported_image_resolutions(provider: Optional[str], model_name: str) -> List[str]:
    provider_name = _normalize_provider_name(provider)
    model = _normalize_model_name(model_name)

    if provider_name == "openai":
        return OPENAI_RESOLUTIONS
    if model.startswith("gemini-3.1-flash-image-preview"):
        return GEMINI_31_FLASH_RESOLUTIONS
    return BASE_RESOLUTIONS


def _model_default_resolution(provider: Optional[str], model_name: str) -> str:
    supported = get_supported_image_resolutions(provider, model_name)
    if "4K" in supported:
        return "4K"
    return supported[-1]


def resolve_effective_image_resolution(
    provider: Optional[str],
    model_name: str,
    *,
    request_resolution: Optional[str],
    project_resolution: Optional[str],
    global_resolution: str,
) -> str:
    supported = set(get_supported_image_resolutions(provider, model_name))
    default_for_model = _model_default_resolution(provider, model_name)

    if request_resolution and str(request_resolution).strip():
        normalized_request = normalize_image_resolution(str(request_resolution))
        if normalized_request not in supported:
            raise ValueError(
                f"Resolution '{normalized_request}' is not supported by image model '{model_name}'. "
                f"Allowed values: {', '.join(get_supported_image_resolutions(provider, model_name))}"
            )
        return normalized_request

    if project_resolution and str(project_resolution).strip():
        try:
            normalized_project = normalize_image_resolution(str(project_resolution))
        except ValueError:
            normalized_project = None
        if normalized_project and normalized_project in supported:
            return normalized_project
        return default_for_model

    try:
        normalized_global = normalize_image_resolution(str(global_resolution))
    except ValueError:
        normalized_global = None

    if normalized_global and normalized_global in supported:
        return normalized_global
    return default_for_model


def get_project_default_image_resolution(project: Any) -> Optional[str]:
    if not project:
        return None

    raw_meta = getattr(project, "presentation_meta", None)
    if not raw_meta:
        return None

    try:
        meta = json.loads(raw_meta) if isinstance(raw_meta, str) else dict(raw_meta)
        if not isinstance(meta, dict):
            return None
        defaults = meta.get("_ai_generation_defaults_v1") or {}
        if not isinstance(defaults, dict):
            return None
        image_defaults = defaults.get("image") or {}
        if not isinstance(image_defaults, dict):
            return None
        value = image_defaults.get("resolution")
        return str(value).strip() if value is not None else None
    except Exception:
        return None
