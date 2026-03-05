import pytest

from services.ai_providers.image.openai_provider import ImageApiRequestError, OpenAIImageProvider


def _build_provider(monkeypatch, **kwargs) -> OpenAIImageProvider:
    monkeypatch.setattr(
        "services.ai_providers.image.openai_provider.make_openai_client",
        lambda **_unused: object(),
    )
    return OpenAIImageProvider(
        api_key="image-key",
        api_base="https://relay.example.com/v1",
        model="gemini-3.1-flash-image-preview",
        **kwargs,
    )


def test_auto_mode_falls_back_to_chat_on_image_api_5xx(monkeypatch):
    provider = _build_provider(monkeypatch, endpoint_mode="auto", chat_fallback=True)
    sentinel = object()

    def _raise_image_api_error(*_args, **_kwargs):
        raise ImageApiRequestError(
            "upstream failed",
            status_code=500,
            response_text="upstream internal error",
            url="https://relay.example.com/v1/images/generations",
        )

    monkeypatch.setattr(provider, "_call_via_image_api_generations", _raise_image_api_error)
    monkeypatch.setattr(provider, "_call_via_chat_completions", lambda *_args, **_kwargs: sentinel)

    assert provider.generate_image(prompt="p", aspect_ratio="16:9", resolution="4K") is sentinel


def test_auto_mode_does_not_fallback_when_disabled(monkeypatch):
    provider = _build_provider(monkeypatch, endpoint_mode="auto", chat_fallback=False)
    called = {"chat": False}

    def _raise_image_api_error(*_args, **_kwargs):
        raise ImageApiRequestError(
            "upstream failed",
            status_code=500,
            response_text="upstream internal error",
            url="https://relay.example.com/v1/images/generations",
        )

    def _chat_should_not_run(*_args, **_kwargs):
        called["chat"] = True
        return object()

    monkeypatch.setattr(provider, "_call_via_image_api_generations", _raise_image_api_error)
    monkeypatch.setattr(provider, "_call_via_chat_completions", _chat_should_not_run)

    with pytest.raises(Exception, match="Error generating image with OpenAI"):
        provider.generate_image(prompt="p", aspect_ratio="16:9", resolution="4K")
    assert called["chat"] is False


def test_provider_parses_string_bool_options(monkeypatch):
    provider = _build_provider(
        monkeypatch,
        endpoint_mode="auto",
        chat_fallback="false",
        strict_params="false",
    )
    assert provider.chat_fallback is False
    assert provider.strict_params is False
