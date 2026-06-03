"""Image resolution support policy by provider/model/channel."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from services.provider_routing.profiles import load_provider_profiles

BASE_RESOLUTIONS: List[str] = ["1K", "2K", "4K"]
GEMINI_31_FLASH_RESOLUTIONS: List[str] = ["0.5K", "1K", "2K", "4K"]
GEMINI_3_PRO_RESOLUTIONS: List[str] = ["1K", "2K", "4K"]
GEMINI_3_PRO_STABLE_RESOLUTIONS: List[str] = ["1K"]
OPENAI_RESOLUTIONS: List[str] = ["1K"]
OPENAI_GPT_IMAGE_2_RESOLUTIONS: List[str] = ["1K", "2K", "4K"]

CHANNEL_MODEL_RESOLUTION_OVERRIDES: Dict[str, Dict[str, List[str]]] = {}

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


def _normalize_channel_name(channel: Optional[str]) -> str:
    return (channel or "").strip().lower()


def _get_profile_supported_image_resolutions(
    channel: Optional[str],
    model_name: str,
) -> Optional[List[str]]:
    normalized_channel = _normalize_channel_name(channel)
    normalized_model = _normalize_model_name(model_name)
    if not normalized_channel or not normalized_model:
        return None

    try:
        profiles = load_provider_profiles()
    except Exception:
        return None

    for profile in profiles.values():
        profile_id = _normalize_channel_name(profile.get("id"))
        profile_channel = _normalize_channel_name(profile.get("channel"))
        if normalized_channel not in {profile_id, profile_channel}:
            continue
        supported_map = profile.get("supported_resolutions") or {}
        if not isinstance(supported_map, dict):
            return None
        raw_supported = None
        for supported_model, supported_values in supported_map.items():
            if _normalize_model_name(str(supported_model)) == normalized_model:
                raw_supported = supported_values
                break
        if not isinstance(raw_supported, list):
            return None
        normalized_values: List[str] = []
        for item in raw_supported:
            try:
                normalized_values.append(normalize_image_resolution(str(item)))
            except ValueError:
                continue
        return normalized_values or None
    return None


def _is_gpt_image_2_model(model_name: str) -> bool:
    model = _normalize_model_name(model_name)
    return model == "gpt-image-2" or model.startswith("gpt-image-2-")


def _is_openai_gemini_31_flash_image_model(model_name: str) -> bool:
    return _normalize_model_name(model_name).startswith("gemini-3.1-flash-image-preview")


def _is_openai_gemini_3_pro_image_model(model_name: str) -> bool:
    return _normalize_model_name(model_name) == "gemini-3-pro-image-preview"


def _is_gemini_3_pro_stable_model(model_name: str) -> bool:
    return _normalize_model_name(model_name) == "gemini-3-pro-image-preview-stable"


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


def get_supported_image_resolutions(
    provider: Optional[str],
    model_name: str,
    *,
    channel: Optional[str] = None,
) -> List[str]:
    normalized_channel = _normalize_channel_name(channel)
    model = _normalize_model_name(model_name)
    channel_override = CHANNEL_MODEL_RESOLUTION_OVERRIDES.get(normalized_channel, {}).get(model)
    if channel_override:
        return channel_override

    profile_supported = _get_profile_supported_image_resolutions(normalized_channel, model)
    if profile_supported:
        return profile_supported

    provider_name = _normalize_provider_name(provider)

    if provider_name == "openai":
        if _is_gpt_image_2_model(model):
            return OPENAI_GPT_IMAGE_2_RESOLUTIONS
        if _is_openai_gemini_31_flash_image_model(model):
            return GEMINI_31_FLASH_RESOLUTIONS
        if _is_openai_gemini_3_pro_image_model(model):
            return GEMINI_3_PRO_RESOLUTIONS
        if _is_gemini_3_pro_stable_model(model):
            return GEMINI_3_PRO_STABLE_RESOLUTIONS
        return OPENAI_RESOLUTIONS
    if model.startswith("gemini-3.1-flash-image-preview"):
        return GEMINI_31_FLASH_RESOLUTIONS
    if model == "gemini-3-pro-image-preview":
        return GEMINI_3_PRO_RESOLUTIONS
    return BASE_RESOLUTIONS


def _model_default_resolution(
    provider: Optional[str],
    model_name: str,
    *,
    channel: Optional[str] = None,
) -> str:
    supported = get_supported_image_resolutions(provider, model_name, channel=channel)
    if "4K" in supported:
        return "4K"
    return supported[-1]


def resolve_effective_image_resolution(
    provider: Optional[str],
    model_name: str,
    *,
    channel: Optional[str] = None,
    request_resolution: Optional[str],
    project_resolution: Optional[str],
    global_resolution: str,
) -> str:
    supported_list = get_supported_image_resolutions(provider, model_name, channel=channel)
    supported = set(supported_list)
    default_for_model = _model_default_resolution(provider, model_name, channel=channel)

    if request_resolution and str(request_resolution).strip():
        normalized_request = normalize_image_resolution(str(request_resolution))
        if normalized_request not in supported:
            raise ValueError(
                f"Resolution '{normalized_request}' is not supported by image model '{model_name}'. "
                f"Allowed values: {', '.join(supported_list)}"
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
