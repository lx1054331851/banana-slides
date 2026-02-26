"""
OpenAI / Azure OpenAI client factory.

The repo supports "openai" provider format for text + image calls. When using Azure OpenAI,
the OpenAI Python SDK requires using AzureOpenAI with an azure_endpoint + api_version.

This module centralizes that decision to avoid duplicating logic across providers/services.
"""

from __future__ import annotations

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
        return AzureOpenAI(
            api_key=api_key,
            azure_endpoint=azure_endpoint,
            api_version=azure_api_version,
            timeout=timeout,
            max_retries=max_retries,
        )

    return OpenAI(
        api_key=api_key,
        base_url=api_base,
        timeout=timeout,
        max_retries=max_retries,
    )
