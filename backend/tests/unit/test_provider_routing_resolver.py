import json

import pytest

from services.ai_providers import _get_model_type_provider_config
from services.provider_routing import list_provider_profiles_redacted, resolve_provider_route, resolve_routing_bundle


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
        "IMAGE_API_BASE",
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


def test_profile_azure_image_channel_sets_azure_route(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("PROVIDER_ROUTING_STRICT", "true")
    monkeypatch.setenv("AZURE_SWEDEN_API_KEY", "azure-image-key")
    monkeypatch.setenv("AZURE_SWEDEN_ENDPOINT", "https://example-resource.openai.azure.com")
    monkeypatch.setenv(
        "PROVIDER_PROFILES_JSON",
        json.dumps(
            [
                {
                    "id": "azure_sweden",
                    "channel": "azure-sweden",
                    "label": "Azure Sweden",
                    "kind": "cloud",
                    "provider": "openai",
                    "api_key_env": "AZURE_SWEDEN_API_KEY",
                    "azure_endpoint_env": "AZURE_SWEDEN_ENDPOINT",
                    "azure_api_version": "2025-04-01-preview",
                    "capabilities": ["image"],
                    "models": ["gpt-image-2"],
                    "model_defaults": {"image": "gpt-image-2"},
                }
            ]
        ),
    )

    route = resolve_provider_route(
        "image",
        generation_override={"image": {"source": "profile:azure_sweden", "model": "gpt-image-2"}},
    )

    assert route.provider == "openai"
    assert route.channel == "azure-sweden"
    assert route.api_key == "azure-image-key"
    assert route.azure_endpoint == "https://example-resource.openai.azure.com"
    assert route.azure_api_version == "2025-04-01-preview"


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


def test_profile_model_capability_is_attached_to_route_metadata(monkeypatch):
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
                    "capabilities": ["image"],
                    "models": ["gpt-image-2-high", "gemini-3.1-flash-image-preview"],
                    "model_capabilities": {
                        "gpt-image-2-high": {
                            "request_mode": "openai-images",
                            "resolution_family": "gpt-image-2",
                        },
                        "gemini-3.1-flash-image-preview": {
                            "request_mode": "openai-compat-google-chat",
                            "resolution_family": "gemini-3.1-flash-image-preview",
                            "aspect_ratio_family": "gemini-3.1-flash-image-preview",
                        },
                    },
                }
            ]
        ),
    )

    route = resolve_provider_route(
        "image",
        generation_override={"image": {"source": "profile:openai_img", "model": "gemini-3.1-flash-image-preview"}},
    )

    assert route.metadata["model_capability"]["request_mode"] == "openai-compat-google-chat"
    assert route.metadata["model_capability"]["aspect_ratio_family"] == "gemini-3.1-flash-image-preview"


def test_profile_model_capability_normalizes_variant_metadata(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("PROVIDER_ROUTING_STRICT", "true")
    monkeypatch.setenv("IMAGE_API_KEY", "profile-image-key")
    monkeypatch.setenv(
        "PROVIDER_PROFILES_JSON",
        json.dumps(
            [
                {
                    "id": "relay_x",
                    "provider": "openai",
                    "api_base": "https://relay.example.com/v1",
                    "api_key_env": "IMAGE_API_KEY",
                    "adapter": "openai_image_compat",
                    "capabilities": ["image"],
                    "models": ["openai-image-v2-ultra"],
                    "model_capabilities": {
                        "openai-image-v2-ultra": {
                            "schema": "gpt-image-2",
                            "request_mode": "openai-images",
                            "normalized_model": " gpt-image-2 ",
                            "display_label": " gpt-image-2（质量：高） ",
                            "variant_label": " 渠道变体：openai-image-v2-ultra ",
                            "locked_params": {
                                "gpt_image_quality": "HIGH"
                            }
                        }
                    },
                }
            ]
        ),
    )

    profiles = list_provider_profiles_redacted()
    assert profiles[0]["model_capabilities"]["openai-image-v2-ultra"] == {
        "schema": "gpt-image-2",
        "request_mode": "openai-images",
        "normalized_model": "gpt-image-2",
        "display_label": "gpt-image-2（质量：高）",
        "variant_label": "渠道变体：openai-image-v2-ultra",
        "locked_params": {
            "gpt_image_quality": "high",
        },
    }

    route = resolve_provider_route(
        "image",
        generation_override={"image": {"source": "profile:relay_x", "model": "openai-image-v2-ultra"}},
    )

    assert route.metadata["model_capability"]["normalized_model"] == "gpt-image-2"
    assert route.metadata["model_capability"]["display_label"] == "gpt-image-2（质量：高）"
    assert route.metadata["model_capability"]["variant_label"] == "渠道变体：openai-image-v2-ultra"
    assert route.metadata["model_capability"]["locked_params"]["gpt_image_quality"] == "high"


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


def test_gpt_image2_prefers_azure_even_if_image_api_base_exists(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("IMAGE_MODEL_SOURCE", "openai")
    monkeypatch.setenv("IMAGE_MODEL", "gpt-image-2")
    monkeypatch.setenv("IMAGE_API_BASE", "https://api.viviai.cc/v1")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example-resource.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2025-04-01-preview")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "azure-key")

    route = resolve_provider_route("image")

    assert route.provider == "openai"
    assert route.model == "gpt-image-2"
    assert route.api_base == "https://api.viviai.cc/v1"
    assert route.azure_endpoint == "https://example-resource.openai.azure.com"
    assert route.azure_api_version == "2025-04-01-preview"
    assert route.api_key == "azure-key"


def test_azure_openai_source_alias_routes_to_openai_provider(monkeypatch):
    _clear_env(monkeypatch)
    route = resolve_provider_route(
        "image",
        generation_override={"image": {"source": "azure-openai", "model": "gpt-image-2"}},
    )

    assert route.provider == "openai"
    assert route.source == "azure-openai"


def test_text_model_profile_source_resolves_to_openai_config(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("TEXT_MODEL_SOURCE", "profile:text_relay")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-key")
    monkeypatch.setenv(
        "PROVIDER_PROFILES_JSON",
        json.dumps(
            [
                {
                    "id": "text_relay",
                    "provider": "openai",
                    "api_base": "https://relay.example.com/v1",
                    "capabilities": ["text"],
                }
            ]
        ),
    )

    config = _get_model_type_provider_config("text")

    assert config["format"] == "openai"
    assert config["api_key"] == "openai-key"
    assert config["api_base"] == "https://relay.example.com/v1"


def test_text_model_profile_source_rejects_image_only_profile(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("TEXT_MODEL_SOURCE", "profile:147ai")
    monkeypatch.setenv(
        "PROVIDER_PROFILES_JSON",
        json.dumps(
            [
                {
                    "id": "147ai",
                    "provider": "openai",
                    "api_base": "https://relay.example.com/v1",
                    "capabilities": ["image"],
                }
            ]
        ),
    )

    with pytest.raises(ValueError, match="does not support role 'text'"):
        _get_model_type_provider_config("text")
