"""Provider profile loading and validation."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from flask import current_app
except ModuleNotFoundError:  # pragma: no cover - exercised in lightweight test environments
    current_app = None


def _get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    env_val = os.getenv(key)
    try:
        if current_app and hasattr(current_app, "config"):
            val = current_app.config.get(key)
            if val is not None:
                text = str(val)
                # Let explicit environment profile settings override config defaults
                # like "" / "[]" that were loaded from Config at app startup.
                if env_val is not None:
                    normalized = text.strip()
                    if normalized == "" or (key == "PROVIDER_PROFILES_JSON" and normalized == "[]"):
                        return env_val
                return str(val)
    except RuntimeError:
        pass
    return env_val if env_val is not None else default


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


def _normalize_model_capabilities(raw: Any) -> Dict[str, Dict[str, Any]]:
    """Normalize declared model capability metadata into a stable shape for frontend/backend consumers."""
    if not isinstance(raw, dict):
        return {}

    normalized: Dict[str, Dict[str, Any]] = {}
    for raw_model, raw_capability in raw.items():
        model_name = str(raw_model or "").strip()
        if not model_name or not isinstance(raw_capability, dict):
            continue

        capability = dict(raw_capability)
        normalized_capability: Dict[str, Any] = {}
        for key in (
            "schema",
            "request_mode",
            "resolution_family",
            "aspect_ratio_family",
            "normalized_model",
            "display_label",
            "variant_label",
        ):
            value = capability.get(key)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                normalized_capability[key] = text

        locked_params = capability.get("locked_params")
        if isinstance(locked_params, dict):
            normalized_locked_params: Dict[str, Any] = {}
            quality = str(locked_params.get("gpt_image_quality") or "").strip().lower()
            if quality in {"low", "medium", "high"}:
                normalized_locked_params["gpt_image_quality"] = quality
            if normalized_locked_params:
                normalized_capability["locked_params"] = normalized_locked_params

        for key, value in capability.items():
            if key in normalized_capability or key == "locked_params":
                continue
            normalized_capability[key] = value

        normalized[model_name] = normalized_capability

    return normalized


def _normalize_profile(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize one provider profile payload into the internal routing format."""
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
        "azure_endpoint": str(profile.get("azure_endpoint") or "").strip() or None,
        "azure_endpoint_env": str(profile.get("azure_endpoint_env") or "").strip() or None,
        "azure_api_version": str(profile.get("azure_api_version") or "").strip() or None,
        "azure_api_version_env": str(profile.get("azure_api_version_env") or "").strip() or None,
        "adapter": adapter,
        "adapter_options": adapter_options,
        "capabilities": [str(c).strip().lower() for c in capabilities if str(c).strip()],
        "models": [str(model).strip() for model in (profile.get("models") or []) if str(model).strip()],
        "supported_resolutions": profile.get("supported_resolutions") if isinstance(profile.get("supported_resolutions"), dict) else {},
        "model_defaults": profile.get("model_defaults") if isinstance(profile.get("model_defaults"), dict) else {},
        "model_capabilities": _normalize_model_capabilities(profile.get("model_capabilities")),
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
        azure_endpoint_env = item.get("azure_endpoint_env")
        azure_endpoint = item.get("azure_endpoint") or (os.getenv(azure_endpoint_env) if azure_endpoint_env else None)
        azure_api_version_env = item.get("azure_api_version_env")
        azure_api_version = item.get("azure_api_version") or (os.getenv(azure_api_version_env) if azure_api_version_env else None)
        uses_azure = bool(azure_endpoint)
        configured = bool(api_key_present and ((azure_endpoint and azure_api_version) or api_base))
        status = "configured" if configured else (
            "partial" if api_base or api_key_present or azure_endpoint or azure_api_version else "missing"
        )
        if uses_azure:
            if configured:
                note = f"Azure profile via {api_key_env}"
            elif not azure_endpoint:
                note = f"Missing Azure endpoint ({azure_endpoint_env or 'inline azure_endpoint'})"
            elif not azure_api_version:
                note = f"Missing Azure API version ({azure_api_version_env or 'inline azure_api_version'})"
            else:
                note = f"Missing API key ({api_key_env})"
        else:
            note = f"Profile channel via {api_key_env}" if api_key_env else "Profile channel"
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
                "config_note": note,
                "api_base": api_base,
                "api_key_env": api_key_env,
                "api_key_present": api_key_present,
                "azure_endpoint_env": azure_endpoint_env,
                "azure_api_version_env": azure_api_version_env,
                "adapter": item.get("adapter"),
                "adapter_options": item.get("adapter_options") or {},
                "capabilities": item.get("capabilities") or [],
                "models": item.get("models") or [],
                "supported_resolutions": item.get("supported_resolutions") or {},
                "model_defaults": item.get("model_defaults") or {},
                "model_capabilities": item.get("model_capabilities") or {},
            }
        )
    return output
