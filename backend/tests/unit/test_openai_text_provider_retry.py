from types import SimpleNamespace

import pytest

from services.ai_providers.text.openai_provider import OpenAITextProvider


class _FakeCompletions:
    def __init__(self, behaviors):
        self.behaviors = list(behaviors)
        self.calls = 0

    def create(self, **_kwargs):
        self.calls += 1
        behavior = self.behaviors.pop(0)
        if isinstance(behavior, Exception):
            raise behavior
        return behavior


class _FakeClient:
    def __init__(self, behaviors):
        self.chat = SimpleNamespace(completions=_FakeCompletions(behaviors))
        self.responses = SimpleNamespace(create=_FakeCompletions(behaviors).create)


def _make_text_response(text: str):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))]
    )


def _make_stream_chunk(text: str):
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=text))]
    )


def _build_provider(monkeypatch, behaviors):
    fake_client = _FakeClient(behaviors)
    monkeypatch.setattr(
        "services.ai_providers.text.openai_provider.make_openai_client",
        lambda **_kwargs: fake_client,
    )
    monkeypatch.setattr("services.ai_providers.text.openai_provider.time.sleep", lambda _s: None)
    provider = OpenAITextProvider(
        api_key="test-key",
        api_base="https://relay.example.com/v1",
        model="test-model",
    )
    return provider, fake_client


def test_generate_text_uses_responses_mode(monkeypatch):
    monkeypatch.setattr("services.ai_providers.text.openai_provider.time.sleep", lambda _s: None)
    monkeypatch.setattr(
        "services.ai_providers.text.openai_provider.make_openai_client",
        lambda **_kwargs: _FakeClient([SimpleNamespace(output_text='ok-from-responses')]),
    )
    monkeypatch.setattr("services.ai_providers.text.openai_provider.get_config", lambda: SimpleNamespace(
        OPENAI_TIMEOUT=30,
        OPENAI_MAX_RETRIES=0,
        OPENAI_TEXT_API_MODE="responses",
    ))

    provider = OpenAITextProvider(
        api_key="test-key",
        api_base="https://relay.example.com/v1",
        model="test-model",
    )

    assert provider.generate_text("hello") == "ok-from-responses"


def test_generate_text_retries_then_succeeds(monkeypatch):
    class FakeConnError(Exception):
        pass

    monkeypatch.setattr("services.ai_providers.text.openai_provider.APIConnectionError", FakeConnError)
    provider, fake_client = _build_provider(
        monkeypatch,
        [FakeConnError("net down"), _make_text_response("ok")],
    )

    assert provider.generate_text("hello") == "ok"
    assert fake_client.chat.completions.calls == 2


def test_generate_text_stream_retries_on_pre_first_chunk_failure(monkeypatch):
    class FakeConnError(Exception):
        pass

    monkeypatch.setattr("services.ai_providers.text.openai_provider.APIConnectionError", FakeConnError)
    provider, fake_client = _build_provider(
        monkeypatch,
        [FakeConnError("stream open failed"), [_make_stream_chunk("hello"), _make_stream_chunk(" world")]],
    )

    assert "".join(provider.generate_text_stream("hello")) == "hello world"
    assert fake_client.chat.completions.calls == 2


def test_generate_text_stream_does_not_retry_after_partial_output(monkeypatch):
    class FakeConnError(Exception):
        pass

    monkeypatch.setattr("services.ai_providers.text.openai_provider.APIConnectionError", FakeConnError)

    def broken_stream():
        yield _make_stream_chunk("hello")
        raise FakeConnError("stream interrupted")

    provider, fake_client = _build_provider(
        monkeypatch,
        [broken_stream(), [_make_stream_chunk(" retried")]],
    )

    stream = provider.generate_text_stream("hello")
    assert next(stream) == "hello"
    with pytest.raises(RuntimeError, match="连接失败"):
        next(stream)
    assert fake_client.chat.completions.calls == 1
