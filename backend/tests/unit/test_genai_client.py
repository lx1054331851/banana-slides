import os

from services.ai_providers.genai_client import _sanitize_no_proxy_for_httpx


def test_sanitize_no_proxy_removes_bare_ipv6_entries(monkeypatch):
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost,::1,127.0.0.0/8,::1/128")
    monkeypatch.setenv("no_proxy", "localhost,::1")

    _sanitize_no_proxy_for_httpx()

    assert os.environ["NO_PROXY"] == "127.0.0.1,localhost,127.0.0.0/8"
    assert os.environ["no_proxy"] == "localhost"
