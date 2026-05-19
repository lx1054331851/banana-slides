import json
from types import SimpleNamespace

import pytest
from openai import InternalServerError

from services.ai_providers.image.openai_provider import ImageApiRequestError, OpenAIImageProvider
from services.ai_providers.openai_client import _normalize_openai_base_url


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


def test_chat_response_string_json_is_supported(monkeypatch):
    provider = _build_provider(monkeypatch, endpoint_mode="chat")
    encoded = "aGVsbG8="
    response = json.dumps(
        {
            "choices": [
                {
                    "message": {
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
                            }
                        ]
                    }
                }
            ]
        }
    )

    message = provider._extract_message_from_chat_response(response)

    assert isinstance(message, dict)
    assert message["content"][0]["type"] == "image_url"


def test_normalize_openai_base_url_appends_v1_for_bare_host():
    assert _normalize_openai_base_url("https://relay.example.com") == "https://relay.example.com/v1"
    assert _normalize_openai_base_url("https://relay.example.com/") == "https://relay.example.com/v1"


def test_image_endpoint_candidates_support_base_without_v1(monkeypatch):
    monkeypatch.setattr(
        "services.ai_providers.image.openai_provider.make_openai_client",
        lambda **_unused: object(),
    )
    provider = OpenAIImageProvider(
        api_key="image-key",
        api_base="https://relay.example.com",
        model="gpt-image-2",
    )

    assert provider._build_endpoint_candidates("generations") == [
        "https://relay.example.com/v1/image/generations",
        "https://relay.example.com/v1/images/generations",
    ]


def test_image_endpoint_candidates_do_not_duplicate_v1(monkeypatch):
    monkeypatch.setattr(
        "services.ai_providers.image.openai_provider.make_openai_client",
        lambda **_unused: object(),
    )
    provider = OpenAIImageProvider(
        api_key="image-key",
        api_base="https://relay.example.com/v1",
        model="gpt-image-2",
    )

    assert provider._build_endpoint_candidates("generations") == [
        "https://relay.example.com/v1/image/generations",
        "https://relay.example.com/v1/images/generations",
    ]


def test_chat_mode_retries_retryable_502_then_succeeds(monkeypatch):
    provider = _build_provider(monkeypatch, endpoint_mode="chat")
    sleep_calls = []
    sentinel = object()

    class _FakeCompletions:
        def __init__(self):
            self.calls = 0

        def create(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                response = SimpleNamespace(
                    headers={},
                    json=lambda: {"retry_after": 60},
                    request="req",
                    status_code=502,
                )
                raise InternalServerError("origin bad gateway", response=response, body={"retry_after": 60})
            return sentinel

    fake_completions = _FakeCompletions()
    provider.client = SimpleNamespace(chat=SimpleNamespace(completions=fake_completions))
    monkeypatch.setattr("services.ai_providers.image.openai_provider.time.sleep", lambda seconds: sleep_calls.append(seconds))
    monkeypatch.setattr(provider, "_extract_message_from_chat_response", lambda response: response)
    monkeypatch.setattr(provider, "_extract_image_from_chat_message", lambda message: message)

    assert provider.generate_image(prompt="p", aspect_ratio="16:9", resolution="4K") is sentinel
    assert fake_completions.calls == 2
    assert sleep_calls == [60.0]
