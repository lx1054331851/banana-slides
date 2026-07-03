import os

import openai

from services.ai_providers.openai_client import (
    _sanitize_no_proxy_value,
    make_openai_client,
)


def test_sanitize_no_proxy_value_wraps_bare_ipv6_entries():
    value = "127.0.0.1,localhost,::1,127.0.0.0/8,::1/128"

    assert _sanitize_no_proxy_value(value) == (
        "127.0.0.1,localhost,[::1],127.0.0.0/8,[::1]/128"
    )


def test_make_openai_client_sanitizes_no_proxy_only_during_client_init(monkeypatch):
    captured = {}

    def fake_openai(**kwargs):
        captured["no_proxy"] = os.environ.get("NO_PROXY")
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(openai, "OpenAI", fake_openai)
    monkeypatch.setattr(openai, "AzureOpenAI", lambda **kwargs: object())
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost,::1,::1/128")

    make_openai_client(api_key="test-key", api_base="https://relay.example.com")

    assert captured["no_proxy"] == "127.0.0.1,localhost,[::1],[::1]/128"
    assert captured["kwargs"]["base_url"] == "https://relay.example.com/v1"
    assert os.environ["NO_PROXY"] == "127.0.0.1,localhost,::1,::1/128"
