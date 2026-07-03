"""
OpenAI / Azure OpenAI client factory.

The repo supports "openai" provider format for text + image calls. When using Azure OpenAI,
the OpenAI Python SDK requires using AzureOpenAI with an azure_endpoint + api_version.

This module centralizes that decision to avoid duplicating logic across providers/services.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Optional
from urllib.parse import urlparse


def _infer_azure_endpoint(api_base: Optional[str]) -> Optional[str]:
    """
    If api_base looks like an Azure OpenAI base/endpoint URL, infer azure_endpoint.

    Accepts values like:
      - https://{resource}.openai.azure.com
      - https://{resource}.openai.azure.com/anything
      - https://{resource}.openai.azure.com.cn/anything

    Returns normalized endpoint: scheme://netloc
    """
    if not api_base:
        return None
    try:
        parsed = urlparse(api_base)
    except Exception:
        return None

    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None

    host = parsed.netloc.lower()
    if host.endswith("openai.azure.com") or host.endswith("openai.azure.com.cn"):
        return f"{parsed.scheme}://{parsed.netloc}"

    return None


def _normalize_azure_endpoint(endpoint: Optional[str]) -> Optional[str]:
    """
    Normalize Azure OpenAI endpoint value.

    Users often paste endpoints with extra path segments such as `/openai/v1`.
    The OpenAI SDK expects `azure_endpoint` to be just the scheme + host
    (no trailing path).

    Examples:
      - https://{resource}.openai.azure.com/openai/v1   -> https://{resource}.openai.azure.com
      - https://{resource}.cognitiveservices.azure.com/openai/v1 -> https://{resource}.cognitiveservices.azure.com
    """
    if not endpoint:
        return None

    endpoint = endpoint.strip()
    if not endpoint:
        return None

    try:
        parsed = urlparse(endpoint)
    except Exception:
        return endpoint

    if parsed.scheme in ("http", "https") and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"

    return endpoint


def _normalize_openai_base_url(api_base: Optional[str]) -> Optional[str]:
    """
    Normalize OpenAI-compatible base URLs.

    To keep config simpler, allow users to provide a bare host like
    `https://relay.example.com` and append `/v1` automatically for the standard
    OpenAI-compatible path. If the URL already has a non-root path, preserve it.
    """
    if not api_base:
        return None

    api_base = api_base.strip()
    if not api_base:
        return None

    try:
        parsed = urlparse(api_base)
    except Exception:
        return api_base

    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return api_base

    path = (parsed.path or "").rstrip("/")
    if not path:
        return f"{parsed.scheme}://{parsed.netloc}/v1"

    return api_base.rstrip("/")


def _sanitize_no_proxy_value(value: Optional[str]) -> Optional[str]:
    """
    Normalize NO_PROXY entries so IPv6 literals do not confuse httpx.

    Current httpx URL pattern parsing rejects common IPv6 loopback entries such as
    `::1` and `::1/128`, which otherwise raises
    `InvalidURL: Invalid port ':1'` during client initialization.
    """
    if value is None:
        return None

    sanitized_entries: list[str] = []
    for raw_entry in value.split(","):
        entry = raw_entry.strip()
        if not entry:
            continue

        host, _, _ = entry.partition("/")
        if host.count(":") >= 2:
            continue

        sanitized_entries.append(entry)

    return ",".join(sanitized_entries)


@contextmanager
def _sanitized_proxy_env():
    """
    Temporarily sanitize proxy bypass environment variables for SDK startup.
    """
    original_values = {}
    changed_keys = []

    for key in ("NO_PROXY", "no_proxy"):
        original = os.environ.get(key)
        original_values[key] = original
        sanitized = _sanitize_no_proxy_value(original)
        if sanitized is not None and sanitized != original:
            os.environ[key] = sanitized
            changed_keys.append(key)

    try:
        yield
    finally:
        for key in changed_keys:
            original = original_values[key]
            if original is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original


def make_openai_client(
    *,
    api_key: str,
    api_base: Optional[str] = None,
    azure_endpoint: Optional[str] = None,
    azure_api_version: Optional[str] = None,
    timeout: Optional[float] = None,
    max_retries: Optional[int] = None,
):
    """
    Create an OpenAI SDK client.

    - If *azure_endpoint* is set, returns AzureOpenAI(client).
    - Otherwise returns OpenAI(client) with optional base_url.
    """
    from openai import OpenAI, AzureOpenAI

    azure_endpoint = _normalize_azure_endpoint(azure_endpoint) or _infer_azure_endpoint(api_base)

    if azure_endpoint:
        with _sanitized_proxy_env():
            return AzureOpenAI(
                api_key=api_key,
                azure_endpoint=azure_endpoint,
                api_version=azure_api_version,
                timeout=timeout,
                max_retries=max_retries,
            )

    with _sanitized_proxy_env():
        return OpenAI(
            api_key=api_key,
            base_url=_normalize_openai_base_url(api_base),
            timeout=timeout,
            max_retries=max_retries,
        )
