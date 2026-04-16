import importlib.util
import os
from pathlib import Path


def _load_module():
    module_path = Path(__file__).resolve().parents[2] / "services" / "upstream_retry.py"
    spec = importlib.util.spec_from_file_location("test_upstream_retry_module", module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_transient_retry_eventually_succeeds(monkeypatch):
    retry_mod = _load_module()
    monkeypatch.setattr(retry_mod.time, "sleep", lambda _s: None)

    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("Connection error")
        return "ok"

    result = retry_mod.call_with_transient_retry(
        fn=flaky,
        description="unit.test",
        max_attempts=2,
    )
    assert result == "ok"
    assert calls["n"] == 2


def test_enable_local_proxy_if_available_sets_env(monkeypatch):
    retry_mod = _load_module()
    monkeypatch.delenv("HTTP_PROXY", raising=False)
    monkeypatch.delenv("HTTPS_PROXY", raising=False)

    class _Conn:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(retry_mod.socket, "create_connection", lambda *_args, **_kwargs: _Conn())

    enabled = retry_mod.enable_local_proxy_if_available("http://127.0.0.1:7897")
    assert enabled is True
    assert os.environ.get("HTTP_PROXY") == "http://127.0.0.1:7897"
    assert os.environ.get("HTTPS_PROXY") == "http://127.0.0.1:7897"


def test_retry_rebuilds_client_after_enabling_proxy(monkeypatch):
    retry_mod = _load_module()
    monkeypatch.setattr(retry_mod.time, "sleep", lambda _s: None)
    monkeypatch.delenv("HTTP_PROXY", raising=False)
    monkeypatch.delenv("HTTPS_PROXY", raising=False)
    monkeypatch.setattr(retry_mod, "enable_local_proxy_if_available", lambda *_args, **_kwargs: True)

    calls = {"n": 0}
    rebuilt = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("ReadTimeout")
        return "ok"

    result = retry_mod.call_with_transient_retry(
        fn=flaky,
        description="unit.proxy",
        max_attempts=2,
        on_proxy_enabled=lambda: rebuilt.__setitem__("n", rebuilt["n"] + 1),
    )

    assert result == "ok"
    assert rebuilt["n"] == 1
