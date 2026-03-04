"""Provider profile loading and validation."""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from flask import current_app


def _get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    try:
        if current_app and hasattr(current_app, "config"):
            val = current_app.config.get(key)
            if val is not None:
                return str(val)
    except RuntimeError:
        pass
    return os.getenv(key, default)


def is_routing_strict() -> bool:
    raw = (_get_setting("PROVIDER_ROUTING_STRICT", "true") or "true").strip().lower()
    return raw in {"1", "true", "yes", "y", "on"}


def get_default_adapter_name() -> str:
    return (_get_setting("PROVIDER_ADAPTER_DEFAULT", "native") or "native").strip() or "native"


def _normalize_profile(raw: Dict[str, Any]) -> Dict[str, Any]:
    profile = dict(raw or {})
    profile_id = str(profile.get("id") or "").strip()
    provider = str(profile.get("provider") or "").strip().lower()
    if not profile_id:
        raise ValueError("Profile missing required field: id")
    if provider not in {"openai", "gemini"}:
        raise ValueError(f"Profile '{profile_id}' has unsupported provider='{provider}'")

    capabilities = profile.get("capabilities") or ["text", "image", "image_caption"]
    if not isinstance(capabilities, list) or not capabilities:
        capabilities = ["text", "image", "image_caption"]

    adapter = str(profile.get("adapter") or get_default_adapter_name()).strip() or "native"
    adapter_options = profile.get("adapter_options") or {}
    if not isinstance(adapter_options, dict):
        adapter_options = {}

    return {
        "id": profile_id,
        "provider": provider,
        "api_base": str(profile.get("api_base") or "").strip() or None,
        "api_key_env": str(profile.get("api_key_env") or "").strip() or None,
        "adapter": adapter,
        "adapter_options": adapter_options,
        "capabilities": [str(c).strip().lower() for c in capabilities if str(c).strip()],
        "model_defaults": profile.get("model_defaults") if isinstance(profile.get("model_defaults"), dict) else {},
    }


def load_provider_profiles() -> Dict[str, Dict[str, Any]]:
    raw = _get_setting("PROVIDER_PROFILES_JSON", "[]") or "[]"
    try:
        payload = json.loads(raw)
    except Exception as e:
        if is_routing_strict():
            raise ValueError(f"Invalid PROVIDER_PROFILES_JSON: {e}") from e
        payload = []

    if not isinstance(payload, list):
        if is_routing_strict():
            raise ValueError("PROVIDER_PROFILES_JSON must be a JSON array")
        payload = []

    profiles: Dict[str, Dict[str, Any]] = {}
    for item in payload:
        if not isinstance(item, dict):
            if is_routing_strict():
                raise ValueError("Each profile in PROVIDER_PROFILES_JSON must be an object")
            continue
        normalized = _normalize_profile(item)
        pid = normalized["id"]
        if pid in profiles and is_routing_strict():
            raise ValueError(f"Duplicate profile id: {pid}")
        profiles[pid] = normalized
    return profiles


def get_profile(profile_id: str) -> Optional[Dict[str, Any]]:
    if not profile_id:
        return None
    return load_provider_profiles().get(profile_id)


def list_provider_profiles_redacted() -> List[Dict[str, Any]]:
    profiles = load_provider_profiles()
    output: List[Dict[str, Any]] = []
    for item in profiles.values():
        api_key_env = item.get("api_key_env")
        output.append(
            {
                "id": item.get("id"),
                "provider": item.get("provider"),
                "api_base": item.get("api_base"),
                "api_key_env": api_key_env,
                "api_key_present": bool(api_key_env and os.getenv(api_key_env)),
                "adapter": item.get("adapter"),
                "adapter_options": item.get("adapter_options") or {},
                "capabilities": item.get("capabilities") or [],
                "model_defaults": item.get("model_defaults") or {},
            }
        )
    return output
