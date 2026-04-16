"""Shared retry helpers for transient upstream model/network failures."""

from __future__ import annotations

import logging
import os
import socket
import time
from typing import Callable, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def is_transient_upstream_network_error(exc: Exception) -> bool:
    """Heuristically detect transient network/TLS failures for upstream model calls."""
    text = f"{type(exc).__name__}: {exc}".lower()
    markers = (
        "connecterror",
        "connectionerror",
        "connection error",
        "readtimeout",
        "writetimeout",
        "timeout",
        "remoteprotocolerror",
        "unexpected_eof_while_reading",
        "ssl:",
        "eof occurred in violation of protocol",
        "temporarily unavailable",
        "connection reset",
        "broken pipe",
    )
    return any(marker in text for marker in markers)


def has_proxy_env() -> bool:
    return bool(os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY"))


def enable_local_proxy_if_available(proxy_url: str = "http://127.0.0.1:7897") -> bool:
    """Best-effort local proxy fallback for unstable upstream network."""
    if has_proxy_env():
        return False

    try:
        parsed = urlparse(proxy_url)
        host = parsed.hostname
        port = parsed.port
        if not host or not port:
            return False

        with socket.create_connection((host, port), timeout=0.5):
            pass

        os.environ["HTTP_PROXY"] = proxy_url
        os.environ["HTTPS_PROXY"] = proxy_url
        logger.info("Enabled local proxy for upstream calls: %s", proxy_url)
        return True
    except Exception:
        return False


def call_with_transient_retry(
    *,
    fn: Callable[[], object],
    description: str,
    max_attempts: int = 3,
    on_proxy_enabled: Optional[Callable[[], None]] = None,
):
    """Retry transient upstream/network failures with exponential backoff."""
    attempts = max(1, int(max_attempts))
    last_error = None
    auto_proxy_enabled = False

    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            last_error = exc
            transient = is_transient_upstream_network_error(exc)
            if transient and not has_proxy_env() and not auto_proxy_enabled:
                auto_proxy_enabled = enable_local_proxy_if_available()
                if auto_proxy_enabled and on_proxy_enabled:
                    try:
                        on_proxy_enabled()
                    except Exception:
                        logger.warning("Failed to rebuild client after enabling proxy", exc_info=True)
            if transient and attempt < attempts:
                sleep_s = min(2 ** (attempt - 1), 8)
                logger.warning(
                    "Transient upstream error, retrying: step=%s attempt=%s/%s sleep=%ss err=%s",
                    description, attempt, attempts, sleep_s, str(exc)
                )
                time.sleep(sleep_s)
                continue
            if transient:
                if auto_proxy_enabled:
                    hint = "已自动启用本地代理后仍失败，请检查代理可用性或上游服务状态。"
                elif not has_proxy_env():
                    hint = "建议配置 HTTP_PROXY/HTTPS_PROXY（例如 http://127.0.0.1:7897）后重试。"
                else:
                    hint = "请检查当前代理和网络可用性。"
                raise RuntimeError(
                    "上游模型连接失败，请稍后重试。%s 原始错误: %s" % (hint, str(exc))
                ) from exc
            raise

    if last_error:
        raise last_error
    raise RuntimeError(f"{description} failed")
