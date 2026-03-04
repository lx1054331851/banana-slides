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
import logging
import re
from io import BytesIO
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests
from PIL import Image

from config import get_config
from ..openai_client import make_openai_client
from .base import ImageProvider

logger = logging.getLogger(__name__)


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

    def __init__(self, api_key: str, api_base: str = None, model: str = "gemini-3.1-flash-image-preview"):
        cfg = get_config()
        azure_endpoint = (cfg.AZURE_OPENAI_ENDPOINT or "").strip() or None
        azure_key = (cfg.AZURE_OPENAI_API_KEY or "").strip() or None
        azure_api_version = (cfg.AZURE_OPENAI_API_VERSION or "").strip() or None

        self.client = make_openai_client(
            api_key=(azure_key or api_key),
            api_base=api_base,
            azure_endpoint=azure_endpoint,
            azure_api_version=azure_api_version,
            timeout=cfg.OPENAI_TIMEOUT,
            max_retries=cfg.OPENAI_MAX_RETRIES,
        )
        self.api_key = azure_key or api_key
        self.api_base = (api_base or "").rstrip("/")
        self.model = model
        self.timeout = cfg.OPENAI_TIMEOUT

        self.endpoint_mode = self._normalize_enum(
            cfg.IMAGE_OPENAI_ENDPOINT_MODE, self._VALID_ENDPOINT_MODES, "auto", "IMAGE_OPENAI_ENDPOINT_MODE"
        )
        self.path_style = self._normalize_enum(
            cfg.IMAGE_OPENAI_PATH_STYLE, self._VALID_PATH_STYLES, "auto", "IMAGE_OPENAI_PATH_STYLE"
        )
        self.response_format = self._normalize_enum(
            cfg.IMAGE_OPENAI_RESPONSE_FORMAT, self._VALID_RESPONSE_FORMATS, "b64_json", "IMAGE_OPENAI_RESPONSE_FORMAT"
        )
        self.chat_fallback = bool(cfg.IMAGE_OPENAI_CHAT_FALLBACK)
        self.strict_params = bool(cfg.IMAGE_OPENAI_STRICT_PARAMS)

    @staticmethod
    def _normalize_enum(raw_value: Any, valid_values: set, default: str, key: str) -> str:
        value = str(raw_value or "").strip().lower()
        if value in valid_values:
            return value
        if value:
            logger.warning("Invalid %s=%s, falling back to %s", key, raw_value, default)
        return default

    def _build_extra_body(self, aspect_ratio: str, resolution: str) -> dict:
        resolution_upper = resolution.upper()
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

    def _validate_aspect_ratio(self, aspect_ratio: str, strict: bool):
        if strict and not re.fullmatch(r"\d+:\d+", str(aspect_ratio or "").strip()):
            raise ValueError(f"Invalid aspect_ratio='{aspect_ratio}'. Expected format like 16:9")

    def _build_image_api_params(self, model: str, aspect_ratio: str, resolution: str, strict: bool) -> Dict[str, str]:
        self._validate_aspect_ratio(aspect_ratio, strict)
        resolution_upper = (resolution or "").upper()
        if strict and resolution_upper not in self._VALID_RESOLUTIONS:
            raise ValueError(
                f"Invalid resolution='{resolution}'. Allowed values: {sorted(self._VALID_RESOLUTIONS)}"
            )

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
        if self.api_base:
            return self.api_base.rstrip("/")
        base_url = getattr(self.client, "base_url", None)
        if base_url:
            return str(base_url).rstrip("/")
        return ""

    def _build_endpoint_candidates(self, endpoint_kind: str) -> List[str]:
        base = self._resolve_api_base_for_image_endpoint()
        if not base:
            raise ValueError("OPENAI API base URL is required for image endpoint mode")

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
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Accept": "application/json",
            }
            if json_payload is not None:
                headers["Content-Type"] = "application/json"

            try:
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
                raise ImageApiRequestError(
                    f"Image API returned non-JSON response at endpoint={url}: {type(e).__name__}: {e}",
                    status_code=response.status_code,
                    response_text=(response.text or "")[:500],
                    url=url,
                ) from e

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
        if hasattr(message, "multi_mod_content") and message.multi_mod_content:
            for part in message.multi_mod_content:
                if "inline_data" in part:
                    image_data = base64.b64decode(part["inline_data"]["data"])
                    image = Image.open(BytesIO(image_data))
                    image.load()
                    return image

        if hasattr(message, "content") and message.content:
            if isinstance(message.content, list):
                for part in message.content:
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

            elif isinstance(message.content, str):
                content_str = message.content

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

    def _call_via_chat_completions(
        self,
        prompt: str,
        ref_images: Optional[List[Image.Image]],
        aspect_ratio: str,
        resolution: str,
    ) -> Image.Image:
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
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": f"aspect_ratio={aspect_ratio}, resolution={resolution}"},
                {"role": "user", "content": content},
            ],
            modalities=["text", "image"],
            extra_body=extra_body,
        )

        message = response.choices[0].message
        image = self._extract_image_from_chat_message(message)
        if image:
            return image

        raw_content = str(getattr(message, "content", "N/A"))
        raise ValueError(
            "No valid image found in chat response. "
            f"content_type={type(getattr(message, 'content', None))}, "
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
            "OpenAI image call - mode=%s, path_style=%s, model=%s, refs=%s, aspect_ratio=%s, resolution=%s",
            self.endpoint_mode,
            self.path_style,
            self.model,
            len(refs),
            aspect_ratio,
            resolution,
        )

        try:
            if self.endpoint_mode == "chat":
                return self._call_via_chat_completions(prompt, refs, aspect_ratio, resolution)

            # images or auto mode: prioritize dedicated image endpoints
            if refs:
                return self._call_via_image_api_edits(prompt, refs, aspect_ratio, resolution)
            return self._call_via_image_api_generations(prompt, aspect_ratio, resolution)

        except ImageEndpointUnavailableError as e:
            if self.endpoint_mode == "auto" and self.chat_fallback:
                logger.warning("Image endpoint unavailable, falling back to chat/completions: %s", e)
                return self._call_via_chat_completions(prompt, refs, aspect_ratio, resolution)
            raise Exception(
                f"Image endpoint unavailable (mode={self.endpoint_mode}, model={self.model}, "
                f"aspect_ratio={aspect_ratio}, resolution={resolution}): {e}"
            ) from e
        except Exception as e:
            error_detail = (
                f"Error generating image with OpenAI (model={self.model}, mode={self.endpoint_mode}, "
                f"aspect_ratio={aspect_ratio}, resolution={resolution}): {type(e).__name__}: {str(e)}"
            )
            logger.error(error_detail, exc_info=True)
            raise Exception(error_detail) from e
