"""Shared GenAI client factory used by both text and image providers."""

import logging

from google import genai
from google.genai import types

from config import get_config

logger = logging.getLogger(__name__)


def is_transient_genai_network_error(exc: Exception) -> bool:
    """Heuristically detect transient network / TLS failures for GenAI calls."""
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
def make_genai_client(
    *,
    vertexai: bool,
    api_key: str = None,
    api_base: str = None,
    project_id: str = None,
    location: str = None,
) -> genai.Client:
    """Construct a ``genai.Client`` for either AI Studio or Vertex AI."""
    timeout_ms = int(get_config().GENAI_TIMEOUT * 1000)

    if vertexai:
        logger.info("Creating GenAI client (Vertex AI) — project=%s, location=%s", project_id, location)
        return genai.Client(
            vertexai=True,
            project=project_id,
            location=location or "us-central1",
            http_options=types.HttpOptions(timeout=timeout_ms),
        )

    opts = types.HttpOptions(timeout=timeout_ms, base_url=api_base)
    return genai.Client(http_options=opts, api_key=api_key)
