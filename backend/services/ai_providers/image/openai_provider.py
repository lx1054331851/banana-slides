"""
OpenAI-compatible image provider.

Supports two request routes for IMAGE_MODEL_SOURCE=openai:
1) Dedicated image endpoints: /image(s)/generations and /image(s)/edits
2) Multimodal chat endpoint: /chat/completions

Endpoint strategy is controlled by environment variables:
  - IMAGE_OPENAI_ENDPOINT_MODE: auto | images | chat
  - IMAGE_OPENAI_PATH_STYLE: auto | singular | plural
  - IMAGE_OPENAI_RESPONSE_FORMAT: b64_json | url
  - IMAGE_OPENAI_CHAT_FALLBACK: true | false
  - IMAGE_OPENAI_STRICT_PARAMS: true | false
"""
import base64
import json
import logging
import math
import re
import time
from io import BytesIO
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests
from PIL import Image
from openai import APIConnectionError, APITimeoutError, APIStatusError, RateLimitError

from config import get_config
from ..openai_client import _normalize_openai_base_url, make_openai_client
from .base import ImageProvider

logger = logging.getLogger(__name__)


_GPT_IMAGE_SIZE_LONG_EDGE = {
    "1K": 1280,
    "2K": 2048,
    "4K": 3840,
}
_GPT_IMAGE_SIZE_MAX_EDGE = 3840
_GPT_IMAGE_SIZE_MULTIPLE = 16
_RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}


def _compute_gpt_image_size(aspect_ratio: str, resolution: str = "2K") -> str:
    """Compute a WxH size string for image requests from aspect ratio and target resolution."""
    parts = str(aspect_ratio or "").split(":")
    if len(parts) != 2:
        return "auto"
    try:
        ratio_w, ratio_h = int(parts[0]), int(parts[1])
    except ValueError:
        return "auto"
    if ratio_w <= 0 or ratio_h <= 0:
        return "auto"

    long_edge = _GPT_IMAGE_SIZE_LONG_EDGE.get(str(resolution or "").upper(), _GPT_IMAGE_SIZE_LONG_EDGE["2K"])
    if ratio_w >= ratio_h:
        width = long_edge
        height = round(width * ratio_h / ratio_w)
    else:
        height = long_edge
        width = round(height * ratio_w / ratio_h)

    width = min(width, _GPT_IMAGE_SIZE_MAX_EDGE)
    height = min(height, _GPT_IMAGE_SIZE_MAX_EDGE)
    width = max(_GPT_IMAGE_SIZE_MULTIPLE, round(width / _GPT_IMAGE_SIZE_MULTIPLE) * _GPT_IMAGE_SIZE_MULTIPLE)
    height = max(_GPT_IMAGE_SIZE_MULTIPLE, round(height / _GPT_IMAGE_SIZE_MULTIPLE) * _GPT_IMAGE_SIZE_MULTIPLE)
    return f"{width}x{height}"


def _is_retryable_openai_error(exc: Exception) -> bool:
    """Decide whether an OpenAI-compatible image error is safe to retry."""
    if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
        return True
    if isinstance(exc, APIStatusError):
        status_code = getattr(exc, "status_code", None)
        if isinstance(status_code, int):
            return status_code in _RETRYABLE_STATUS_CODES or status_code >= 500
    return False


def _extract_retry_after_seconds(exc: Exception) -> Optional[float]:
    """Extract a server-provided retry delay from OpenAI-compatible error payloads when present."""
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers:
        for key in ("retry-after", "Retry-After"):
            raw_value = headers.get(key)
            if raw_value is None:
                continue
            try:
                return max(float(raw_value), 0.0)
            except (TypeError, ValueError):
                pass

    body = getattr(response, "json_data", None)
    if body is None:
        try:
            json_method = getattr(response, "json", None)
            if callable(json_method):
                body = json_method()
        except Exception:
            body = None

    if isinstance(body, dict):
        raw_value = body.get("retry_after")
        if raw_value is not None:
            try:
                return max(float(raw_value), 0.0)
            except (TypeError, ValueError):
                return None
    return None


def _compute_backoff_seconds(attempt_number: int, exc: Exception) -> float:
    """Choose retry sleep time using upstream retry hints first, then capped exponential backoff."""
    retry_after = _extract_retry_after_seconds(exc)
    if retry_after is not None:
        return min(retry_after, 60.0)
    return min(8.0, 0.5 * (2 ** max(attempt_number - 1, 0)))


class ImageEndpointUnavailableError(Exception):
    """Raised when image endpoint itself is unavailable (404/405/unsupported route)."""


class ImageApiRequestError(Exception):
    """Raised when image endpoint returns an error response."""

    def __init__(self, message: str, *, status_code: Optional[int] = None, response_text: str = "", url: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.response_text = response_text
        self.url = url


class OpenAIImageProvider(ImageProvider):
    """Image generation using OpenAI SDK + direct image-endpoint HTTP calls."""

    _VALID_ENDPOINT_MODES = {"auto", "images", "chat"}
    _VALID_PATH_STYLES = {"auto", "singular", "plural"}
    _VALID_RESPONSE_FORMATS = {"b64_json", "url"}
    _VALID_RESOLUTIONS = {"1K", "2K", "4K"}
    _VALID_EXTRA_BODY_MODES = {"default", "google_image_config"}
    _GPT_IMAGE_2_MIN_PIXELS = 655_360
    _GPT_IMAGE_2_MAX_PIXELS = 8_294_400
    _GPT_IMAGE_2_MAX_EDGE = 3840
    _GPT_IMAGE_2_MULTIPLE = 16
    # gemini-2.5 / nano-banana pixel mapping (1K only)
    _GEMINI_25_SIZE_MAP = {
        "1:1": "1024x1024",
        "2:3": "832x1248",
        "3:2": "1248x832",
        "3:4": "864x1184",
        "4:3": "1184x864",
        "4:5": "896x1152",
        "5:4": "1152x896",
        "9:16": "768x1344",
        "16:9": "1344x768",
        "21:9": "1536x672",
    }

    def __init__(
        self,
        api_key: str,
        api_base: str = None,
        model: str = "gemini-3.1-flash-image-preview",
        azure_endpoint: str = None,
        azure_api_version: str = None,
        endpoint_mode: str = None,
        path_style: str = None,
        response_format: str = None,
        extra_body_mode: str = None,
        chat_fallback: bool = None,
        strict_params: bool = None,
        channel: str = None,
        source_trace: Optional[Sequence[str]] = None,
    ):
        cfg = get_config()
        azure_endpoint = (azure_endpoint or "").strip() or None
        azure_api_version = (azure_api_version or "").strip() or None

        self.client = make_openai_client(
            api_key=api_key,
            api_base=api_base,
            azure_endpoint=azure_endpoint,
            azure_api_version=azure_api_version,
            timeout=cfg.OPENAI_TIMEOUT,
            max_retries=cfg.OPENAI_MAX_RETRIES,
        )
        self.api_key = api_key
        self.api_base = (_normalize_openai_base_url(api_base) or "").rstrip("/")
        self.azure_endpoint = azure_endpoint.rstrip("/") if azure_endpoint else ""
        self.azure_api_version = azure_api_version or ""
        self.model = model
        self.timeout = cfg.OPENAI_TIMEOUT
        self.channel = str(channel or "").strip()
        self.source_trace = list(source_trace or [])

        self.endpoint_mode = self._normalize_enum(
            endpoint_mode if endpoint_mode is not None else cfg.IMAGE_OPENAI_ENDPOINT_MODE,
            self._VALID_ENDPOINT_MODES,
            "auto",
            "IMAGE_OPENAI_ENDPOINT_MODE",
        )
        self.path_style = self._normalize_enum(
            path_style if path_style is not None else cfg.IMAGE_OPENAI_PATH_STYLE,
            self._VALID_PATH_STYLES,
            "auto",
            "IMAGE_OPENAI_PATH_STYLE",
        )
        self.response_format = self._normalize_enum(
            response_format if response_format is not None else cfg.IMAGE_OPENAI_RESPONSE_FORMAT,
            self._VALID_RESPONSE_FORMATS,
            "b64_json",
            "IMAGE_OPENAI_RESPONSE_FORMAT",
        )
        self.extra_body_mode = self._normalize_enum(
            extra_body_mode if extra_body_mode is not None else getattr(cfg, "IMAGE_OPENAI_EXTRA_BODY_MODE", None),
            self._VALID_EXTRA_BODY_MODES,
            "default",
            "IMAGE_OPENAI_EXTRA_BODY_MODE",
        )
        self.chat_fallback = self._to_bool(chat_fallback, bool(cfg.IMAGE_OPENAI_CHAT_FALLBACK))
        self.strict_params = self._to_bool(strict_params, bool(cfg.IMAGE_OPENAI_STRICT_PARAMS))
        self.max_attempts = max(int(getattr(cfg, "OPENAI_MAX_RETRIES", 0)) + 1, 1)

    @staticmethod
    def _normalize_enum(raw_value: Any, valid_values: set, default: str, key: str) -> str:
        value = str(raw_value or "").strip().lower()
        if value in valid_values:
            return value
        if value:
            logger.warning("Invalid %s=%s, falling back to %s", key, raw_value, default)
        return default

    @staticmethod
    def _to_bool(raw_value: Any, default: bool) -> bool:
        if raw_value is None:
            return default
        if isinstance(raw_value, bool):
            return raw_value
        if isinstance(raw_value, (int, float)):
            return bool(raw_value)
        text = str(raw_value).strip().lower()
        if text in {"1", "true", "yes", "y", "on"}:
            return True
        if text in {"0", "false", "no", "n", "off", ""}:
            return False
        return bool(raw_value)

    def _build_extra_body(self, aspect_ratio: str, resolution: str) -> dict:
        resolution_upper = resolution.upper()
        if self.extra_body_mode == "google_image_config":
            return {
                "google": {
                    "image_config": {
                        "aspect_ratio": aspect_ratio,
                        "image_size": resolution_upper,
                    }
                }
            }
        return {
            "aspect_ratio": aspect_ratio,
            "resolution": resolution_upper,
            "generationConfig": {
                "imageConfig": {
                    "aspectRatio": aspect_ratio,
                    "imageSize": resolution_upper,
                }
            },
        }

    def _encode_image_to_base64(self, image: Image.Image) -> str:
        buffered = BytesIO()
        if image.mode in ("RGBA", "LA", "P"):
            image = image.convert("RGB")
        image.save(buffered, format="JPEG", quality=95)
        return base64.b64encode(buffered.getvalue()).decode("utf-8")

    def _encode_image_to_bytes(self, image: Image.Image) -> bytes:
        buffered = BytesIO()
        if image.mode in ("RGBA", "LA", "P"):
            image = image.convert("RGB")
        image.save(buffered, format="JPEG", quality=95)
        return buffered.getvalue()

    def _is_gemini3_or_nano_banana_pro(self, model: str) -> bool:
        m = (model or "").lower()
        return m.startswith("gemini-3") or m.startswith("nano-banana-pro")

    def _is_gemini25_or_nano_banana(self, model: str) -> bool:
        m = (model or "").lower()
        if m.startswith("nano-banana-pro"):
            return False
        return m.startswith("gemini-2.5") or m == "nano-banana"

    def _is_gpt_image_2(self, model: str) -> bool:
        normalized = (model or "").strip().lower()
        return normalized == "gpt-image-2" or normalized.startswith("gpt-image-2-")

    def _validate_aspect_ratio(self, aspect_ratio: str, strict: bool):
        if strict and not re.fullmatch(r"\d+:\d+", str(aspect_ratio or "").strip()):
            raise ValueError(f"Invalid aspect_ratio='{aspect_ratio}'. Expected format like 16:9")

    def _parse_aspect_ratio(self, aspect_ratio: str, strict: bool) -> Tuple[int, int]:
        raw = str(aspect_ratio or "").strip()
        match = re.fullmatch(r"(\d+):(\d+)", raw)
        if not match:
            if strict:
                raise ValueError(f"Invalid aspect_ratio='{aspect_ratio}'. Expected format like 16:9")
            return (16, 9)
        w = int(match.group(1))
        h = int(match.group(2))
        if w <= 0 or h <= 0:
            if strict:
                raise ValueError(f"Invalid aspect_ratio='{aspect_ratio}'. Width/height must be > 0")
            return (16, 9)
        return (w, h)

    def _round_to_multiple(self, value: float, multiple: int = 16, minimum: int = 16) -> int:
        rounded = int(round(float(value) / multiple) * multiple)
        return max(minimum, rounded)

    def _clamp_gpt_image_2_ratio(self, ratio_w: int, ratio_h: int, strict: bool) -> Tuple[int, int]:
        ratio = max(ratio_w, ratio_h) / max(1, min(ratio_w, ratio_h))
        if ratio <= 3:
            return ratio_w, ratio_h
        if strict:
            raise ValueError(
                f"gpt-image-2 only supports aspect ratios between 1:1 and 3:1 (or 1:3), got {ratio_w}:{ratio_h}"
            )
        if ratio_w >= ratio_h:
            return (3, 1)
        return (1, 3)

    def _compute_gpt_image_2_size(self, aspect_ratio: str, resolution: str, strict: bool) -> str:
        ratio_w, ratio_h = self._parse_aspect_ratio(aspect_ratio, strict)
        ratio_w, ratio_h = self._clamp_gpt_image_2_ratio(ratio_w, ratio_h, strict)

        resolution_upper = (resolution or "").upper()
        long_edge_map = {
            "1K": 1536,
            "2K": 2048,
            "4K": 3840,
        }
        target_long_edge = long_edge_map.get(resolution_upper, 1536)

        scale = target_long_edge / max(ratio_w, ratio_h)
        width = self._round_to_multiple(ratio_w * scale, self._GPT_IMAGE_2_MULTIPLE, self._GPT_IMAGE_2_MULTIPLE)
        height = self._round_to_multiple(ratio_h * scale, self._GPT_IMAGE_2_MULTIPLE, self._GPT_IMAGE_2_MULTIPLE)

        def _scale_dims(w: int, h: int, scale_factor: float) -> Tuple[int, int]:
            return (
                self._round_to_multiple(w * scale_factor, self._GPT_IMAGE_2_MULTIPLE, self._GPT_IMAGE_2_MULTIPLE),
                self._round_to_multiple(h * scale_factor, self._GPT_IMAGE_2_MULTIPLE, self._GPT_IMAGE_2_MULTIPLE),
            )

        max_edge = max(width, height)
        if max_edge > self._GPT_IMAGE_2_MAX_EDGE:
            width, height = _scale_dims(width, height, self._GPT_IMAGE_2_MAX_EDGE / max_edge)

        pixels = width * height
        if pixels > self._GPT_IMAGE_2_MAX_PIXELS:
            width, height = _scale_dims(width, height, math.sqrt(self._GPT_IMAGE_2_MAX_PIXELS / pixels))

        pixels = width * height
        if pixels < self._GPT_IMAGE_2_MIN_PIXELS:
            scale_up = math.sqrt(self._GPT_IMAGE_2_MIN_PIXELS / max(1, pixels))
            candidate_w, candidate_h = _scale_dims(width, height, scale_up)
            if max(candidate_w, candidate_h) <= self._GPT_IMAGE_2_MAX_EDGE:
                width, height = candidate_w, candidate_h
            elif strict:
                raise ValueError(
                    f"Unable to satisfy gpt-image-2 min pixels for aspect_ratio={aspect_ratio}; "
                    f"candidate={candidate_w}x{candidate_h}"
                )

        width = min(width, self._GPT_IMAGE_2_MAX_EDGE)
        height = min(height, self._GPT_IMAGE_2_MAX_EDGE)
        width = self._round_to_multiple(width, self._GPT_IMAGE_2_MULTIPLE, self._GPT_IMAGE_2_MULTIPLE)
        height = self._round_to_multiple(height, self._GPT_IMAGE_2_MULTIPLE, self._GPT_IMAGE_2_MULTIPLE)

        final_pixels = width * height
        if strict:
            if final_pixels < self._GPT_IMAGE_2_MIN_PIXELS or final_pixels > self._GPT_IMAGE_2_MAX_PIXELS:
                raise ValueError(
                    f"gpt-image-2 size out of range: {width}x{height}, pixels={final_pixels}, "
                    f"allowed=[{self._GPT_IMAGE_2_MIN_PIXELS},{self._GPT_IMAGE_2_MAX_PIXELS}]"
                )
            final_ratio = max(width, height) / max(1, min(width, height))
            if final_ratio > 3:
                raise ValueError(f"gpt-image-2 final ratio out of range: {width}x{height}")

        return f"{width}x{height}"

    def _select_gpt_image_2_quality(self, resolution: str) -> str:
        resolution_upper = (resolution or "").upper()
        if resolution_upper == "4K":
            return "high"
        if resolution_upper == "2K":
            return "medium"
        return "low"

    def _build_image_api_params(self, model: str, aspect_ratio: str, resolution: str, strict: bool) -> Dict[str, str]:
        self._validate_aspect_ratio(aspect_ratio, strict)
        resolution_upper = (resolution or "").upper()
        if strict and resolution_upper not in self._VALID_RESOLUTIONS:
            raise ValueError(
                f"Invalid resolution='{resolution}'. Allowed values: {sorted(self._VALID_RESOLUTIONS)}"
            )

        if self._is_gpt_image_2(model):
            return {
                "response_format": self.response_format,
                "size": self._compute_gpt_image_2_size(aspect_ratio, resolution_upper, strict),
                "quality": self._select_gpt_image_2_quality(resolution_upper),
            }

        params: Dict[str, str] = {
            "response_format": self.response_format,
            "aspect_ratio": aspect_ratio,
        }

        # gemini-3* / nano-banana-pro*: size uses 1K/2K/4K directly
        if self._is_gemini3_or_nano_banana_pro(model):
            if strict and resolution_upper not in self._VALID_RESOLUTIONS:
                raise ValueError(
                    f"Model {model} only allows resolution in {sorted(self._VALID_RESOLUTIONS)}, got {resolution}"
                )
            params["size"] = resolution_upper
            return params

        # gemini-2.5* / nano-banana: only 1K and fixed pixel size map
        if self._is_gemini25_or_nano_banana(model):
            if strict and resolution_upper != "1K":
                raise ValueError(f"Model {model} only supports resolution=1K, got {resolution}")
            mapped = self._GEMINI_25_SIZE_MAP.get(aspect_ratio)
            if strict and not mapped:
                raise ValueError(
                    f"Model {model} does not support aspect_ratio={aspect_ratio}. "
                    f"Allowed: {sorted(self._GEMINI_25_SIZE_MAP.keys())}"
                )
            params["size"] = mapped or resolution_upper
            return params

        # Generic fallback for other models.
        params["size"] = resolution_upper or "1K"
        return params

    def _resolve_api_base_for_image_endpoint(self) -> str:
        # For Azure OpenAI image endpoints, always prefer azure_endpoint over generic api_base.
        if self.azure_endpoint:
            return self.azure_endpoint.rstrip("/")
        if self.api_base:
            return self.api_base.rstrip("/")
        base_url = getattr(self.client, "base_url", None)
        if base_url:
            return str(base_url).rstrip("/")
        return ""

    def _build_endpoint_candidates(self, endpoint_kind: str) -> List[str]:
        # Build endpoint candidates for both OpenAI-compatible relays and Azure OpenAI routes.
        base = self._resolve_api_base_for_image_endpoint()
        if not base:
            raise ValueError("OPENAI API base URL is required for image endpoint mode")

        if self.azure_endpoint:
            if not self.azure_api_version:
                raise ValueError("AZURE_OPENAI_API_VERSION is required when using Azure OpenAI image endpoints")
            deployment = (self.model or "").strip()
            if not deployment:
                raise ValueError("Azure OpenAI image endpoints require model/deployment name")
            return [
                f"{base}/openai/deployments/{deployment}/images/{endpoint_kind}"
                f"?api-version={self.azure_api_version}"
            ]

        if self.path_style == "singular":
            prefixes = ["image"]
        elif self.path_style == "plural":
            prefixes = ["images"]
        else:
            prefixes = ["image", "images"]

        return [f"{base}/{prefix}/{endpoint_kind}" for prefix in prefixes]

    def _extract_response_error_text(self, response: requests.Response) -> str:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                err = payload.get("error")
                if isinstance(err, dict):
                    return str(err.get("message") or err)
                if err:
                    return str(err)
            return str(payload)[:500]
        except Exception:
            return (response.text or "")[:500]

    def _is_endpoint_unavailable(self, status_code: Optional[int], response_text: str) -> bool:
        if status_code in {404, 405, 501}:
            return True
        text = (response_text or "").lower()
        endpoint_keywords = (
            "endpoint",
            "not found",
            "unsupported",
            "not support",
            "no route",
            "does not exist",
            "unknown path",
            "method not allowed",
        )
        if status_code in {400, 422} and any(k in text for k in endpoint_keywords):
            return True
        return False

    def _is_model_unsupported_on_image_endpoint(
        self,
        status_code: Optional[int],
        response_text: str,
    ) -> bool:
        """
        Detect model/endpoint mismatch errors that should fall back to chat in auto mode.

        Some OpenAI-compatible gateways return HTTP 5xx with messages such as
        "not supported model for image generation" for /image(s)/generations even
        though the same model works via /chat/completions.
        """
        if status_code is not None and status_code < 400:
            return False

        text = (response_text or "").lower()
        if not text or "model" not in text:
            return False

        unsupported_markers = (
            "not supported model",
            "model not supported",
            "unsupported model",
            "model is not supported",
            "not support model",
            "model does not support",
            "invalid model",
            "unknown model",
            "model not found",
        )
        image_markers = (
            "image",
            "generation",
            "/images/",
            "/image/",
            "images/generations",
            "image endpoint",
        )
        return any(m in text for m in unsupported_markers) and any(m in text for m in image_markers)

    def _should_fallback_to_chat(self, err: "ImageApiRequestError") -> bool:
        if self._is_gpt_image_2(self.model):
            # gpt-image-2 relies on the dedicated image API to honor size/quality.
            # Falling back to chat/completions can silently drop the requested 4K size.
            return False
        if self._is_model_unsupported_on_image_endpoint(err.status_code, err.response_text):
            return True
        # Some OpenAI-compatible relays return generic HTTP 5xx for image endpoints
        # while the same model still works via chat/completions.
        return bool(err.status_code and err.status_code >= 500)

    def _post_image_api(
        self,
        endpoint_kind: str,
        *,
        json_payload: Optional[Dict[str, Any]] = None,
        form_data: Optional[Dict[str, Any]] = None,
        files: Optional[Sequence[Tuple[str, Tuple[str, bytes, str]]]] = None,
    ) -> Dict[str, Any]:
        candidates = self._build_endpoint_candidates(endpoint_kind)
        unavailable_errors: List[str] = []

        for url in candidates:
            # Azure image endpoints require api-key header; OpenAI-compatible relays use Bearer.
            headers = {"Accept": "application/json"}
            if self.azure_endpoint:
                headers["api-key"] = self.api_key
            else:
                headers["Authorization"] = f"Bearer {self.api_key}"
            if json_payload is not None:
                headers["Content-Type"] = "application/json"

            try:
                payload_summary = {
                    "endpoint_kind": endpoint_kind,
                    "url": url,
                    "model": self.model,
                    "channel": self.channel or "(none)",
                    "path_style": self.path_style,
                    "response_format": self.response_format,
                }
                if json_payload is not None:
                    payload_summary["payload_keys"] = sorted(json_payload.keys())
                    payload_summary["size"] = json_payload.get("size")
                    payload_summary["quality"] = json_payload.get("quality")
                    payload_summary["aspect_ratio"] = json_payload.get("aspect_ratio")
                else:
                    payload_summary["form_keys"] = sorted(form_data.keys()) if isinstance(form_data, dict) else []
                    payload_summary["size"] = form_data.get("size") if isinstance(form_data, dict) else None
                    payload_summary["quality"] = form_data.get("quality") if isinstance(form_data, dict) else None
                    payload_summary["aspect_ratio"] = form_data.get("aspect_ratio") if isinstance(form_data, dict) else None
                    payload_summary["file_count"] = len(files or [])
                logger.info("OpenAI image endpoint request: %s", payload_summary)
                if json_payload is not None:
                    response = requests.post(url, headers=headers, json=json_payload, timeout=self.timeout)
                else:
                    response = requests.post(url, headers=headers, data=form_data, files=files, timeout=self.timeout)
            except Exception as e:
                raise ImageApiRequestError(f"Request failed for endpoint={url}: {type(e).__name__}: {e}", url=url) from e

            if not response.ok:
                error_text = self._extract_response_error_text(response)
                if self._is_endpoint_unavailable(response.status_code, error_text):
                    unavailable_errors.append(f"{url} -> HTTP {response.status_code}: {error_text}")
                    continue
                raise ImageApiRequestError(
                    f"Image API error at endpoint={url}: HTTP {response.status_code}: {error_text}",
                    status_code=response.status_code,
                    response_text=error_text,
                    url=url,
                )

            try:
                return response.json()
            except Exception as e:
                # Some gateways may return HTML/plain text for unsupported endpoint variants.
                # In auto path-style mode, keep trying the next candidate endpoint.
                content_type = (response.headers.get("Content-Type") or "").lower()
                body_preview = (response.text or "")[:500]
                unavailable_errors.append(
                    f"{url} -> non-JSON response (content-type={content_type or 'unknown'}): "
                    f"{type(e).__name__}: {e}; body={body_preview}"
                )
                continue

        raise ImageEndpointUnavailableError(
            f"Image endpoint unavailable for {endpoint_kind}. Tried: {'; '.join(unavailable_errors)}"
        )

    def _extract_image_from_image_api_response(
        self, payload: Dict[str, Any], endpoint_name: str, model: str, aspect_ratio: str, resolution: str
    ) -> Image.Image:
        try:
            data = payload.get("data")
            if not isinstance(data, list) or not data:
                raise ValueError(f"Missing/empty 'data' field, payload keys={list(payload.keys())}")

            item = data[0] if isinstance(data[0], dict) else {}
            b64_data = item.get("b64_json")
            if b64_data:
                image_bytes = base64.b64decode(b64_data)
                image = Image.open(BytesIO(image_bytes))
                image.load()
                return image

            image_url = item.get("url")
            if image_url:
                response = requests.get(image_url, timeout=self.timeout, stream=True)
                response.raise_for_status()
                image = Image.open(BytesIO(response.content))
                image.load()
                return image

            raise ValueError(f"No b64_json/url found in data[0], keys={list(item.keys())}")
        except Exception as e:
            summary = {
                "endpoint": endpoint_name,
                "model": model,
                "aspect_ratio": aspect_ratio,
                "resolution": resolution,
                "response_format": self.response_format,
            }
            raise ValueError(f"Failed to parse image API response: {summary}, error={type(e).__name__}: {e}") from e

    def _call_via_image_api_generations(self, prompt: str, aspect_ratio: str, resolution: str) -> Image.Image:
        params = self._build_image_api_params(self.model, aspect_ratio, resolution, self.strict_params)
        payload: Dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            **params,
        }
        response_payload = self._post_image_api("generations", json_payload=payload)
        return self._extract_image_from_image_api_response(
            response_payload, "/image(s)/generations", self.model, aspect_ratio, resolution
        )

    def _call_via_image_api_edits(
        self,
        prompt: str,
        ref_images: List[Image.Image],
        aspect_ratio: str,
        resolution: str,
    ) -> Image.Image:
        if not ref_images:
            raise ValueError("Image edits endpoint requires at least one reference image")

        params = self._build_image_api_params(self.model, aspect_ratio, resolution, self.strict_params)
        form_data: Dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            **params,
        }
        files: List[Tuple[str, Tuple[str, bytes, str]]] = []
        for idx, ref_img in enumerate(ref_images[:6]):
            files.append(
                (
                    "image",
                    (f"ref_{idx}.jpg", self._encode_image_to_bytes(ref_img), "image/jpeg"),
                )
            )

        try:
            response_payload = self._post_image_api("edits", form_data=form_data, files=files)
        except ImageApiRequestError as e:
            # Some proxies only support JSON for edits. Retry once with data URLs.
            text_lower = (e.response_text or "").lower()
            if e.status_code in {400, 415} or "content-type" in text_lower:
                image_data_urls = [f"data:image/jpeg;base64,{self._encode_image_to_base64(img)}" for img in ref_images[:6]]
                json_payload: Dict[str, Any] = {
                    "model": self.model,
                    "prompt": prompt,
                    "image": image_data_urls,
                    **params,
                }
                response_payload = self._post_image_api("edits", json_payload=json_payload)
            else:
                raise

        return self._extract_image_from_image_api_response(
            response_payload, "/image(s)/edits", self.model, aspect_ratio, resolution
        )

    def _extract_image_from_chat_message(self, message: Any) -> Optional[Image.Image]:
        # Parse image payload from either SDK message objects or dict-based responses.
        if isinstance(message, dict):
            multi_mod_content = message.get("multi_mod_content")
            if multi_mod_content:
                for part in multi_mod_content:
                    if isinstance(part, dict) and "inline_data" in part:
                        image_data = base64.b64decode(part["inline_data"]["data"])
                        image = Image.open(BytesIO(image_data))
                        image.load()
                        return image
            content = message.get("content")
        else:
            content = getattr(message, "content", None)

        if hasattr(message, "multi_mod_content") and message.multi_mod_content:
            for part in message.multi_mod_content:
                if "inline_data" in part:
                    image_data = base64.b64decode(part["inline_data"]["data"])
                    image = Image.open(BytesIO(image_data))
                    image.load()
                    return image

        if content:
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "image_url":
                        image_url = part.get("image_url", {}).get("url", "")
                        if image_url.startswith("data:image"):
                            b64_data = image_url.split(",", 1)[1]
                            image_data = base64.b64decode(b64_data)
                            image = Image.open(BytesIO(image_data))
                            image.load()
                            return image
                    elif hasattr(part, "type") and part.type == "image_url":
                        image_url = getattr(part, "image_url", {})
                        url = image_url.get("url", "") if isinstance(image_url, dict) else getattr(image_url, "url", "")
                        if url.startswith("data:image"):
                            b64_data = url.split(",", 1)[1]
                            image_data = base64.b64decode(b64_data)
                            image = Image.open(BytesIO(image_data))
                            image.load()
                            return image

            elif isinstance(content, str):
                content_str = content

                markdown_matches = re.findall(r"!\[.*?\]\((https?://[^\s\)]+)\)", content_str)
                if markdown_matches:
                    image_url = markdown_matches[0]
                    response = requests.get(image_url, timeout=self.timeout, stream=True)
                    response.raise_for_status()
                    image = Image.open(BytesIO(response.content))
                    image.load()
                    return image

                url_matches = re.findall(
                    r"(https?://[^\s\)\]]+\.(?:png|jpg|jpeg|gif|webp|bmp)(?:\?[^\s\)\]]*)?)",
                    content_str,
                    re.IGNORECASE,
                )
                if url_matches:
                    image_url = url_matches[0]
                    response = requests.get(image_url, timeout=self.timeout, stream=True)
                    response.raise_for_status()
                    image = Image.open(BytesIO(response.content))
                    image.load()
                    return image

                base64_matches = re.findall(r"data:image/[^;]+;base64,([A-Za-z0-9+/=]+)", content_str)
                if base64_matches:
                    image_data = base64.b64decode(base64_matches[0])
                    image = Image.open(BytesIO(image_data))
                    image.load()
                    return image

        return None

    def _extract_message_from_chat_response(self, response: Any) -> Any:
        # Normalize chat completion responses from SDK objects, dicts, or JSON strings.
        if hasattr(response, "choices"):
            choices = getattr(response, "choices", None) or []
            if choices:
                return choices[0].message
            raise ValueError("Chat response has empty choices")

        payload = response
        if isinstance(response, str):
            try:
                payload = json.loads(response)
            except Exception as e:
                raise ValueError(
                    f"Chat response is string but not JSON (preview={response[:160]})"
                ) from e

        if isinstance(payload, dict):
            choices = payload.get("choices")
            if isinstance(choices, list) and choices:
                first = choices[0]
                if isinstance(first, dict):
                    return first.get("message") or {}
            raise ValueError(f"Chat response dict has no usable choices: keys={list(payload.keys())}")

        raise ValueError(f"Unsupported chat response type: {type(response).__name__}")

    def _call_via_chat_completions(
        self,
        prompt: str,
        ref_images: Optional[List[Image.Image]],
        aspect_ratio: str,
        resolution: str,
    ) -> Image.Image:
        """Call the chat-completions image route with retry for transient upstream failures."""
        content: List[Dict[str, Any]] = []
        if ref_images:
            for ref_img in ref_images:
                base64_image = self._encode_image_to_base64(ref_img)
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}",
                        },
                    }
                )
        content.append({"type": "text", "text": prompt})

        extra_body = self._build_extra_body(aspect_ratio, resolution)
        logger.info(
            "OpenAI image chat request: channel=%s model=%s refs=%s aspect_ratio=%s resolution=%s extra_body=%s",
            self.channel or "(none)",
            self.model,
            len(ref_images or []),
            aspect_ratio,
            resolution,
            extra_body,
        )
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": f"aspect_ratio={aspect_ratio}, resolution={resolution}"},
                        {"role": "user", "content": content},
                    ],
                    modalities=["text", "image"],
                    extra_body=extra_body,
                )
                break
            except Exception as exc:
                if _is_retryable_openai_error(exc) and attempt < self.max_attempts:
                    delay = _compute_backoff_seconds(attempt, exc)
                    logger.warning(
                        "OpenAI 图片 chat 请求失败，准备重试 (%s/%s)，等待 %.1fs，model=%s，aspect_ratio=%s，resolution=%s，error=%s",
                        attempt,
                        self.max_attempts,
                        delay,
                        self.model,
                        aspect_ratio,
                        resolution,
                        exc,
                    )
                    time.sleep(delay)
                    continue
                raise

        message = self._extract_message_from_chat_response(response)
        image = self._extract_image_from_chat_message(message)
        if image:
            return image

        raw_content = str(message.get("content", "N/A") if isinstance(message, dict) else getattr(message, "content", "N/A"))
        raise ValueError(
            "No valid image found in chat response. "
            f"content_type={type(message.get('content', None) if isinstance(message, dict) else getattr(message, 'content', None))}, "
            f"content_preview={raw_content[:300]}"
        )

    def generate_image(
        self,
        prompt: str,
        ref_images: Optional[List[Image.Image]] = None,
        aspect_ratio: str = "16:9",
        resolution: str = "2K",
        enable_thinking: bool = False,
        thinking_budget: int = 0,
    ) -> Optional[Image.Image]:
        """
        Generate image using OpenAI-compatible API routes.

        Note:
          - enable_thinking and thinking_budget are ignored for OpenAI-format calls.
        """
        del enable_thinking, thinking_budget
        refs = ref_images or []

        logger.debug(
            "OpenAI image call - channel=%s, mode=%s, path_style=%s, extra_body_mode=%s, model=%s, refs=%s, aspect_ratio=%s, resolution=%s, source_trace=%s",
            self.channel or "(none)",
            self.endpoint_mode,
            self.path_style,
            self.extra_body_mode,
            self.model,
            len(refs),
            aspect_ratio,
            resolution,
            self.source_trace,
        )

        try:
            if self.endpoint_mode == "chat":
                logger.info(
                    "OpenAI image route selected: route=chat channel=%s model=%s aspect_ratio=%s resolution=%s refs=%s",
                    self.channel or "(none)",
                    self.model,
                    aspect_ratio,
                    resolution,
                    len(refs),
                )
                return self._call_via_chat_completions(prompt, refs, aspect_ratio, resolution)

            # images or auto mode: prioritize dedicated image endpoints
            logger.info(
                "OpenAI image route selected: route=images channel=%s model=%s aspect_ratio=%s resolution=%s refs=%s endpoint_mode=%s",
                self.channel or "(none)",
                self.model,
                aspect_ratio,
                resolution,
                len(refs),
                self.endpoint_mode,
            )
            if refs:
                return self._call_via_image_api_edits(prompt, refs, aspect_ratio, resolution)
            return self._call_via_image_api_generations(prompt, aspect_ratio, resolution)

        except ImageEndpointUnavailableError as e:
            if self.endpoint_mode == "auto" and self.chat_fallback:
                logger.warning(
                    "OpenAI image fallback triggered: reason=endpoint_unavailable channel=%s model=%s aspect_ratio=%s resolution=%s error=%s",
                    self.channel or "(none)",
                    self.model,
                    aspect_ratio,
                    resolution,
                    e,
                )
                return self._call_via_chat_completions(prompt, refs, aspect_ratio, resolution)
            raise Exception(
                f"Image endpoint unavailable (mode={self.endpoint_mode}, model={self.model}, "
                f"aspect_ratio={aspect_ratio}, resolution={resolution}): {e}"
            ) from e
        except Exception as e:
            if (
                isinstance(e, ImageApiRequestError)
                and self.endpoint_mode == "auto"
                and self.chat_fallback
                and self._should_fallback_to_chat(e)
            ):
                logger.warning(
                    "OpenAI image fallback triggered: reason=request_error channel=%s model=%s "
                    "aspect_ratio=%s resolution=%s status=%s endpoint=%s error=%s",
                    self.channel or "(none)",
                    self.model,
                    aspect_ratio,
                    resolution,
                    e.status_code,
                    e.url,
                    e.response_text,
                )
                return self._call_via_chat_completions(prompt, refs, aspect_ratio, resolution)

            error_detail = (
                f"Error generating image with OpenAI (model={self.model}, mode={self.endpoint_mode}, "
                f"aspect_ratio={aspect_ratio}, resolution={resolution}): {type(e).__name__}: {str(e)}"
            )
            logger.error(error_detail, exc_info=True)
            raise Exception(error_detail) from e
