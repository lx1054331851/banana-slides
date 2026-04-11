import importlib
import os
from types import SimpleNamespace


def _load_module():
    return importlib.import_module("services.style_preview_service")


def test_transient_retry_eventually_succeeds(monkeypatch):
    svc = _load_module()
    monkeypatch.setattr(svc.time, "sleep", lambda _s: None)

    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("Connection error")
        return "ok"

    result = svc._call_with_transient_retry(
        fn=flaky,
        description="unit.test",
        max_attempts=2,
    )
    assert result == "ok"
    assert calls["n"] == 2


def test_enable_local_proxy_if_available_sets_env(monkeypatch):
    svc = _load_module()
    monkeypatch.delenv("HTTP_PROXY", raising=False)
    monkeypatch.delenv("HTTPS_PROXY", raising=False)

    class _Conn:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(svc.socket, "create_connection", lambda *_args, **_kwargs: _Conn())

    enabled = svc._enable_local_proxy_if_available("http://127.0.0.1:7897")
    assert enabled is True
    assert os.environ.get("HTTP_PROXY") == "http://127.0.0.1:7897"
    assert os.environ.get("HTTPS_PROXY") == "http://127.0.0.1:7897"

