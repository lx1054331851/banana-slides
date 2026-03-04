"""Regression tests for per-model OpenAI config isolation from global Azure settings."""

from services.ai_providers import _get_model_type_provider_config
from services.ai_providers.image.openai_provider import OpenAIImageProvider


def _clear_relevant_env(monkeypatch):
    for key in (
        "AI_PROVIDER_FORMAT",
        "OPENAI_API_KEY",
        "OPENAI_API_BASE",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_API_VERSION",
        "IMAGE_MODEL_SOURCE",
        "IMAGE_API_KEY",
        "IMAGE_API_BASE",
        "IMAGE_AZURE_OPENAI_ENDPOINT",
        "IMAGE_AZURE_OPENAI_API_VERSION",
    ):
        monkeypatch.delenv(key, raising=False)


def test_image_model_specific_openai_base_does_not_inherit_global_azure(monkeypatch):
    _clear_relevant_env(monkeypatch)
    monkeypatch.setenv("IMAGE_MODEL_SOURCE", "openai")
    monkeypatch.setenv("IMAGE_API_KEY", "image-key")
    monkeypatch.setenv("IMAGE_API_BASE", "https://api.viviai.cc/v1")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "azure-key")
    monkeypatch.setenv(
        "AZURE_OPENAI_ENDPOINT", "https://example.cognitiveservices.azure.com"
    )
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2024-10-21")

    config = _get_model_type_provider_config("image")

    assert config["format"] == "openai"
    assert config["api_key"] == "image-key"
    assert config["api_base"] == "https://api.viviai.cc/v1"
    assert config["azure_endpoint"] is None
    assert config["azure_api_version"] is None


def test_image_openai_uses_global_azure_when_no_image_specific_override(monkeypatch):
    _clear_relevant_env(monkeypatch)
    monkeypatch.setenv("IMAGE_MODEL_SOURCE", "openai")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "azure-key")
    monkeypatch.setenv(
        "AZURE_OPENAI_ENDPOINT", "https://example.cognitiveservices.azure.com"
    )
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2024-10-21")

    config = _get_model_type_provider_config("image")

    assert config["format"] == "openai"
    assert config["api_key"] == "azure-key"
    assert config["azure_endpoint"] == "https://example.cognitiveservices.azure.com"
    assert config["azure_api_version"] == "2024-10-21"


def test_openai_image_provider_uses_only_explicit_azure_params(monkeypatch):
    captured = {}

    def fake_make_openai_client(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "azure-key")
    monkeypatch.setenv(
        "AZURE_OPENAI_ENDPOINT", "https://example.cognitiveservices.azure.com"
    )
    monkeypatch.setattr(
        "services.ai_providers.image.openai_provider.make_openai_client",
        fake_make_openai_client,
    )

    OpenAIImageProvider(
        api_key="image-key",
        api_base="https://api.viviai.cc/v1",
        model="gemini-3.1-flash-image-preview",
        azure_endpoint=None,
        azure_api_version=None,
    )

    assert captured["api_key"] == "image-key"
    assert captured["api_base"] == "https://api.viviai.cc/v1"
    assert captured["azure_endpoint"] is None
    assert captured["azure_api_version"] is None
