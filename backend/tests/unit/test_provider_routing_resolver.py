import json

import pytest

from services.provider_routing import resolve_provider_route, resolve_routing_bundle


def _clear_env(monkeypatch):
    keys = [
        "AI_PROVIDER_FORMAT",
        "TEXT_MODEL_SOURCE",
        "IMAGE_MODEL_SOURCE",
        "IMAGE_CAPTION_MODEL_SOURCE",
        "TEXT_MODEL",
        "IMAGE_MODEL",
        "IMAGE_CAPTION_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_API_BASE",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_API_VERSION",
        "GOOGLE_API_KEY",
        "GOOGLE_API_BASE",
        "PROVIDER_PROFILES_JSON",
        "PROVIDER_ROUTING_STRICT",
        "PROVIDER_ADAPTER_DEFAULT",
        "IMAGE_API_KEY",
    ]
    for key in keys:
        monkeypatch.delenv(key, raising=False)


def test_request_override_has_highest_priority(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("AI_PROVIDER_FORMAT", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-key")
    monkeypatch.setenv("OPENAI_API_BASE", "https://api.test/v1")

    route = resolve_provider_route(
        "image",
        generation_override={"image": {"source": "openai", "model": "gpt-image-1"}},
    )

    assert route.provider == "openai"
    assert route.model == "gpt-image-1"
    assert route.api_key == "openai-key"
    assert route.api_base == "https://api.test/v1"


def test_project_defaults_override_settings(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("AI_PROVIDER_FORMAT", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-key")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")

    project = {
        "presentation_meta": json.dumps(
            {
                "_ai_generation_defaults_v1": {
                    "image": {
                        "source": "gemini",
                        "model": "gemini-3.1-flash-image-preview",
                    }
                }
            }
        )
    }
    route = resolve_provider_route("image", project=project)

    assert route.provider == "gemini"
    assert route.model == "gemini-3.1-flash-image-preview"
    assert route.api_key == "google-key"


def test_profile_source_and_adapter_options(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("PROVIDER_ROUTING_STRICT", "true")
    monkeypatch.setenv("IMAGE_API_KEY", "profile-image-key")
    monkeypatch.setenv(
        "PROVIDER_PROFILES_JSON",
        json.dumps(
            [
                {
                    "id": "openai_img",
                    "provider": "openai",
                    "api_base": "https://relay.example.com/v1",
                    "api_key_env": "IMAGE_API_KEY",
                    "adapter": "openai_image_compat",
                    "adapter_options": {
                        "endpoint_mode": "images",
                        "path_style": "singular",
                    },
                    "capabilities": ["image"],
                }
            ]
        ),
    )

    route = resolve_provider_route(
        "image",
        generation_override={"image": {"source": "profile:openai_img"}},
    )

    assert route.provider == "openai"
    assert route.api_key == "profile-image-key"
    assert route.api_base == "https://relay.example.com/v1"
    assert route.adapter == "openai_image_compat"
    assert route.adapter_options["endpoint_mode"] == "images"
    assert route.adapter_options["path_style"] == "singular"


def test_profile_adapter_options_parse_string_booleans(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("PROVIDER_ROUTING_STRICT", "true")
    monkeypatch.setenv("IMAGE_API_KEY", "profile-image-key")
    monkeypatch.setenv(
        "PROVIDER_PROFILES_JSON",
        json.dumps(
            [
                {
                    "id": "openai_img",
                    "provider": "openai",
                    "api_base": "https://relay.example.com/v1",
                    "api_key_env": "IMAGE_API_KEY",
                    "adapter": "openai_image_compat",
                    "adapter_options": {
                        "chat_fallback": "false",
                        "strict_params": "false",
                    },
                    "capabilities": ["image"],
                }
            ]
        ),
    )

    route = resolve_provider_route(
        "image",
        generation_override={"image": {"source": "profile:openai_img"}},
    )

    assert route.adapter_options["chat_fallback"] is False
    assert route.adapter_options["strict_params"] is False


def test_profile_capability_mismatch_raises_when_strict(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("PROVIDER_ROUTING_STRICT", "true")
    monkeypatch.setenv(
        "PROVIDER_PROFILES_JSON",
        json.dumps(
            [
                {
                    "id": "only_image",
                    "provider": "gemini",
                    "api_key_env": "GOOGLE_API_KEY",
                    "capabilities": ["image"],
                }
            ]
        ),
    )

    with pytest.raises(ValueError, match="does not support role"):
        resolve_provider_route(
            "text",
            generation_override={"text": {"source": "profile:only_image"}},
        )


def test_bundle_fingerprint_changes_with_override(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("AI_PROVIDER_FORMAT", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")
    bundle_a = resolve_routing_bundle()
    bundle_b = resolve_routing_bundle(generation_override={"image": {"model": "gemini-3.1-flash-image-preview"}})
    bundle_c = resolve_routing_bundle(generation_override={"image": {"model": "gemini-2.5-flash-image-preview"}})

    assert bundle_a.bundle_fingerprint == bundle_b.bundle_fingerprint
    assert bundle_a.bundle_fingerprint != bundle_c.bundle_fingerprint
