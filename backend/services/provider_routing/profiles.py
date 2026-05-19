"""Provider profile loading and validation."""
from __future__ import annotations

import json
import os
from pathlib import Path
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


def _load_profiles_payload() -> List[Dict[str, Any]]:
    profiles_file = str(_get_setting("PROVIDER_PROFILES_FILE", "") or "").strip()
    if profiles_file:
        candidate = Path(profiles_file)
        if not candidate.is_absolute():
            project_root = Path(__file__).resolve().parents[3]
            candidate = (project_root / candidate).resolve()
        try:
            raw = candidate.read_text(encoding="utf-8")
            payload = json.loads(raw)
        except Exception as e:
            if is_routing_strict():
                raise ValueError(f"Invalid PROVIDER_PROFILES_FILE '{candidate}': {e}") from e
            return []
        if not isinstance(payload, list):
            if is_routing_strict():
                raise ValueError("PROVIDER_PROFILES_FILE must contain a JSON array")
            return []
        return payload

    raw = _get_setting("PROVIDER_PROFILES_JSON", "[]") or "[]"
    try:
        payload = json.loads(raw)
    except Exception as e:
        if is_routing_strict():
            raise ValueError(f"Invalid PROVIDER_PROFILES_JSON: {e}") from e
        return []

    if not isinstance(payload, list):
        if is_routing_strict():
            raise ValueError("PROVIDER_PROFILES_JSON must be a JSON array")
        return []
    return payload


def _normalize_profile(raw: Dict[str, Any]) -> Dict[str, Any]:
    profile = dict(raw or {})
    profile_id = str(profile.get("id") or "").strip()
    channel = str(profile.get("channel") or profile_id).strip() or profile_id
    label = str(profile.get("label") or profile_id).strip() or profile_id
    kind = str(profile.get("kind") or "relay").strip() or "relay"
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
        "channel": channel,
        "label": label,
        "kind": kind,
        "provider": provider,
        "api_base": str(profile.get("api_base") or "").strip() or None,
        "api_key_env": str(profile.get("api_key_env") or "").strip() or None,
        "adapter": adapter,
        "adapter_options": adapter_options,
        "capabilities": [str(c).strip().lower() for c in capabilities if str(c).strip()],
        "models": [str(model).strip() for model in (profile.get("models") or []) if str(model).strip()],
        "model_defaults": profile.get("model_defaults") if isinstance(profile.get("model_defaults"), dict) else {},
    }


def load_provider_profiles() -> Dict[str, Dict[str, Any]]:
    payload = _load_profiles_payload()

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
        api_key_present = bool(api_key_env and os.getenv(api_key_env))
        api_base = item.get("api_base")
        configured = bool(api_base and api_key_present)
        status = "configured" if configured else ("partial" if api_base or api_key_present else "missing")
        output.append(
            {
                "id": item.get("id"),
                "channel": item.get("channel"),
                "label": item.get("label"),
                "kind": item.get("kind"),
                "provider": item.get("provider"),
                "enabled": configured,
                "configured": configured,
                "config_status": status,
                "config_note": f"Profile channel via {api_key_env}" if api_key_env else "Profile channel",
                "api_base": api_base,
                "api_key_env": api_key_env,
                "api_key_present": api_key_present,
                "adapter": item.get("adapter"),
                "adapter_options": item.get("adapter_options") or {},
                "capabilities": item.get("capabilities") or [],
                "models": item.get("models") or [],
                "model_defaults": item.get("model_defaults") or {},
            }
        )
    return output
