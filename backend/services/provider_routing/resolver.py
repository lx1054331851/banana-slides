"""Provider configuration resolver.

Priority: request override > project defaults > app settings/env > defaults.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Tuple

from flask import current_app

from services.provider_routing.adapters.base import get_adapter
from services.provider_routing.adapters import (  # noqa: F401
    gemini_generate_content_compat as _gemini_generate_content_compat_adapter,
)
from services.provider_routing.adapters import native as _native_adapter  # noqa: F401
from services.provider_routing.adapters import openai_image_compat as _openai_image_compat_adapter  # noqa: F401
from services.provider_routing.profiles import (
    get_default_adapter_name,
    get_profile,
    is_routing_strict,
)
from services.provider_routing.types import (
    GenerationOverride,
    ResolvedProviderRoute,
    RoutingBundle,
)

LAZYLLM_VENDORS = {"qwen", "doubao", "deepseek", "glm", "siliconflow", "sensenova", "minimax", "kimi"}
MODEL_PREFIX = {
    "text": "TEXT",
    "image": "IMAGE",
    "image_caption": "IMAGE_CAPTION",
}
MODEL_DEFAULTS = {
    "text": "gemini-3-flash-preview",
    "image": "gemini-3.1-flash-image-preview",
    "image_caption": "gemini-3-flash-preview",
}


def _get_config(key: str) -> Optional[Any]:
    try:
        if current_app and hasattr(current_app, "config") and key in current_app.config:
            return current_app.config.get(key)
    except RuntimeError:
        pass
    return None


def _resolve_setting(key: str, fallback: Optional[str] = None) -> Optional[str]:
    val = _get_config(key)
    if val is not None:
        return str(val)
    env_val = os.getenv(key)
    if env_val is not None:
        return env_val
    return fallback


def _resolve_setting_with_source(key: str, fallback: Optional[str] = None) -> Tuple[Optional[str], str]:
    val = _get_config(key)
    if val is not None:
        return str(val), f"app:{key}"
    env_val = os.getenv(key)
    if env_val is not None:
        return env_val, f"env:{key}"
    return fallback, f"default:{key}"


def _normalize_model_source(value: Optional[str]) -> str:
    source = (value or "").strip()
    if not source:
        return ""
    return source.lower()


def _extract_project_generation_defaults(project: Any) -> Dict[str, Any]:
    if not project:
        return {}
    raw_meta = None
    if hasattr(project, "presentation_meta"):
        raw_meta = project.presentation_meta
    elif isinstance(project, dict):
        raw_meta = project.get("presentation_meta")
    if not raw_meta:
        return {}
    try:
        meta = json.loads(raw_meta) if isinstance(raw_meta, str) else dict(raw_meta)
        if not isinstance(meta, dict):
            return {}
        defaults = meta.get("_ai_generation_defaults_v1") or {}
        return defaults if isinstance(defaults, dict) else {}
    except Exception:
        return {}


def _pick_source(role: str, override: Dict[str, Any], project_defaults: Dict[str, Any], traces: list[str]) -> str:
    override_source = _normalize_model_source((override or {}).get("source"))
    if override_source:
        traces.append(f"request:{role}.source")
        return override_source

    project_source = _normalize_model_source((project_defaults.get(role) or {}).get("source"))
    if project_source:
        traces.append(f"project:{role}.source")
        return project_source

    prefix = MODEL_PREFIX[role]
    per_model_source, source_key = _resolve_setting_with_source(f"{prefix}_MODEL_SOURCE")
    per_model_source = _normalize_model_source(per_model_source)
    if per_model_source:
        traces.append(source_key)
        return per_model_source

    global_fmt, fmt_key = _resolve_setting_with_source("AI_PROVIDER_FORMAT", "gemini")
    traces.append(fmt_key)
    return _normalize_model_source(global_fmt) or "gemini"


def _pick_model(role: str, override: Dict[str, Any], project_defaults: Dict[str, Any], traces: list[str]) -> str:
    model = (override or {}).get("model")
    if model:
        traces.append(f"request:{role}.model")
        return str(model)
    project_model = (project_defaults.get(role) or {}).get("model")
    if project_model:
        traces.append(f"project:{role}.model")
        return str(project_model)
    prefix = MODEL_PREFIX[role]
    setting_model, model_source = _resolve_setting_with_source(f"{prefix}_MODEL", MODEL_DEFAULTS[role])
    traces.append(model_source)
    return str(setting_model or MODEL_DEFAULTS[role])


def _resolve_openai_credentials(role: str, override: Dict[str, Any], traces: list[str]) -> Dict[str, Optional[str]]:
    prefix = MODEL_PREFIX[role]
    model_api_key = _resolve_setting(f"{prefix}_API_KEY")
    model_api_base = _resolve_setting(f"{prefix}_API_BASE")
    model_azure_endpoint = _resolve_setting(f"{prefix}_AZURE_OPENAI_ENDPOINT")
    model_azure_api_version = _resolve_setting(f"{prefix}_AZURE_OPENAI_API_VERSION")

    override_api_key = (override or {}).get("api_key")
    override_api_base = (override or {}).get("api_base_url")

    api_base = (override_api_base or model_api_base or _resolve_setting("OPENAI_API_BASE", "https://aihubmix.com/v1"))

    if model_azure_endpoint:
        azure_endpoint = model_azure_endpoint
        azure_api_version = model_azure_api_version or _resolve_setting("AZURE_OPENAI_API_VERSION")
    elif model_api_key or model_api_base or override_api_key or override_api_base:
        azure_endpoint = None
        azure_api_version = None
    else:
        azure_endpoint = _resolve_setting("AZURE_OPENAI_ENDPOINT")
        azure_api_version = _resolve_setting("AZURE_OPENAI_API_VERSION")

    if override_api_key:
        api_key = str(override_api_key)
        traces.append(f"request:{role}.api_key")
    elif model_api_key:
        api_key = model_api_key
    elif azure_endpoint:
        api_key = (
            _resolve_setting("AZURE_OPENAI_API_KEY")
            or _resolve_setting("OPENAI_API_KEY")
            or _resolve_setting("GOOGLE_API_KEY")
        )
    elif model_api_base or override_api_base:
        api_key = (
            _resolve_setting("OPENAI_API_KEY")
            or _resolve_setting("GOOGLE_API_KEY")
            or _resolve_setting("AZURE_OPENAI_API_KEY")
        )
    else:
        api_key = (
            _resolve_setting("AZURE_OPENAI_API_KEY")
            or _resolve_setting("OPENAI_API_KEY")
            or _resolve_setting("GOOGLE_API_KEY")
        )

    return {
        "api_key": api_key,
        "api_base": api_base,
        "azure_endpoint": azure_endpoint,
        "azure_api_version": azure_api_version,
    }


def _resolve_gemini_credentials(role: str, override: Dict[str, Any], traces: list[str]) -> Dict[str, Optional[str]]:
    prefix = MODEL_PREFIX[role]
    override_api_key = (override or {}).get("api_key")
    override_api_base = (override or {}).get("api_base_url")

    if override_api_key:
        traces.append(f"request:{role}.api_key")
    api_key = str(override_api_key) if override_api_key else (
        _resolve_setting(f"{prefix}_API_KEY") or _resolve_setting("GOOGLE_API_KEY")
    )
    api_base = str(override_api_base) if override_api_base else (
        _resolve_setting(f"{prefix}_API_BASE") or _resolve_setting("GOOGLE_API_BASE")
    )
    return {"api_key": api_key, "api_base": api_base}


def _resolve_route_from_profile(
    role: str,
    source: str,
    model: str,
    override: Dict[str, Any],
    traces: list[str],
) -> ResolvedProviderRoute:
    profile_id = source.split(":", 1)[1].strip()
    profile = get_profile(profile_id)
    strict = is_routing_strict()
    if not profile:
        if strict:
            raise ValueError(f"Unknown provider profile: {profile_id}")
        provider = "gemini"
        route = ResolvedProviderRoute(role=role, provider=provider, source=source, model=model, source_trace=traces)
        route.finalize_fingerprint()
        return route

    caps = set(profile.get("capabilities") or [])
    if role not in caps and strict:
        raise ValueError(f"Profile '{profile_id}' does not support role '{role}'")

    provider = profile["provider"]
    api_key_env = profile.get("api_key_env")
    api_key = str((override or {}).get("api_key") or "") or (os.getenv(api_key_env) if api_key_env else None)
    api_base = (override or {}).get("api_base_url") or profile.get("api_base")

    adapter = (override or {}).get("adapter") or profile.get("adapter") or get_default_adapter_name()
    adapter_options = dict(profile.get("adapter_options") or {})
    adapter_options.update((override or {}).get("adapter_options") or {})

    route = ResolvedProviderRoute(
        role=role,
        provider=provider,
        source=source,
        model=model,
        api_key=api_key,
        api_base=api_base,
        adapter=adapter,
        adapter_options=adapter_options,
        source_trace=traces + [f"profile:{profile_id}"],
    )
    return _apply_adapter_and_finalize(route)


def _apply_adapter_and_finalize(route: ResolvedProviderRoute) -> ResolvedProviderRoute:
    adapter_name = route.adapter or "native"
    strict = is_routing_strict()
    adapter = get_adapter(adapter_name)
    if not adapter:
        if strict:
            raise ValueError(f"Unknown adapter: {adapter_name}")
        route.adapter = "native"
        adapter = get_adapter("native")
    if adapter:
        route = adapter.apply(route)
    route.finalize_fingerprint()
    return route


def resolve_provider_route(
    role: str,
    *,
    project: Any = None,
    generation_override: Optional[GenerationOverride] = None,
) -> ResolvedProviderRoute:
    role = role.strip().lower()
    if role not in MODEL_PREFIX:
        raise ValueError(f"Unsupported route role: {role}")

    override = (generation_override or {}).get(role) or {}
    if not isinstance(override, dict):
        override = {}

    project_defaults = _extract_project_generation_defaults(project)
    traces: list[str] = []
    source = _pick_source(role, override, project_defaults, traces)
    model = _pick_model(role, override, project_defaults, traces)

    if source.startswith("profile:"):
        return _resolve_route_from_profile(role, source, model, override, traces)

    if source in {"vertex"}:
        # Keep vertex compatibility path by mapping it to gemini route metadata.
        route = ResolvedProviderRoute(
            role=role,
            provider="gemini",
            source=source,
            model=model,
            adapter=(override or {}).get("adapter") or get_default_adapter_name(),
            adapter_options=(override or {}).get("adapter_options") or {},
            source_trace=traces,
            metadata={
                "vertexai": True,
                "project_id": _resolve_setting("VERTEX_PROJECT_ID"),
                "location": _resolve_setting("VERTEX_LOCATION", "us-central1"),
            },
        )
        return _apply_adapter_and_finalize(route)

    if source in {"openai", "gemini"}:
        if source == "openai":
            creds = _resolve_openai_credentials(role, override, traces)
            route = ResolvedProviderRoute(
                role=role,
                provider="openai",
                source=source,
                model=model,
                api_key=creds["api_key"],
                api_base=creds["api_base"],
                azure_endpoint=creds["azure_endpoint"],
                azure_api_version=creds["azure_api_version"],
                adapter=(override or {}).get("adapter") or get_default_adapter_name(),
                adapter_options=(override or {}).get("adapter_options") or {},
                source_trace=traces,
            )
        else:
            creds = _resolve_gemini_credentials(role, override, traces)
            route = ResolvedProviderRoute(
                role=role,
                provider="gemini",
                source=source,
                model=model,
                api_key=creds["api_key"],
                api_base=creds["api_base"],
                adapter=(override or {}).get("adapter") or get_default_adapter_name(),
                adapter_options=(override or {}).get("adapter_options") or {},
                source_trace=traces,
            )
        return _apply_adapter_and_finalize(route)

    if source in LAZYLLM_VENDORS or source == "lazyllm":
        vendor = source if source in LAZYLLM_VENDORS else _normalize_model_source(_resolve_setting(f"{MODEL_PREFIX[role]}_MODEL_SOURCE", "deepseek"))
        route = ResolvedProviderRoute(
            role=role,
            provider="lazyllm",
            source=source,
            model=model,
            adapter="native",
            source_trace=traces + [f"legacy-lazyllm:{vendor}"],
            metadata={"lazyllm_source": vendor},
        )
        return _apply_adapter_and_finalize(route)

    # Unknown source fallback.
    strict = is_routing_strict()
    if strict:
        raise ValueError(f"Unsupported model source '{source}' for role '{role}'")
    fallback = ResolvedProviderRoute(
        role=role,
        provider="gemini",
        source=source,
        model=model,
        api_key=_resolve_setting("GOOGLE_API_KEY"),
        api_base=_resolve_setting("GOOGLE_API_BASE"),
        adapter="native",
        source_trace=traces + [f"fallback:gemini:{source}"],
    )
    return _apply_adapter_and_finalize(fallback)


def resolve_routing_bundle(
    *,
    project: Any = None,
    generation_override: Optional[GenerationOverride] = None,
) -> RoutingBundle:
    text_route = resolve_provider_route("text", project=project, generation_override=generation_override)
    image_route = resolve_provider_route("image", project=project, generation_override=generation_override)
    caption_route = resolve_provider_route("image_caption", project=project, generation_override=generation_override)

    bundle = RoutingBundle(
        text=text_route,
        image=image_route,
        image_caption=caption_route,
        source_trace=text_route.source_trace + image_route.source_trace + caption_route.source_trace,
    )
    bundle.finalize_fingerprint()
    return bundle
