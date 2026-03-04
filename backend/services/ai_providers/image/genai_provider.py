"""
Google GenAI SDK — image generation provider

Operates in two authentication modes selected at construction time:
  * API-key mode  (Google AI Studio or compatible proxy)
  * Vertex AI mode (GCP service-account credentials via GOOGLE_APPLICATION_CREDENTIALS)
"""
import logging
from typing import Optional, List
from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
from .base import ImageProvider
from config import get_config
from ..genai_client import make_genai_client

logger = logging.getLogger(__name__)


def _should_retry_genai_image_exception(exception: Exception) -> bool:
    """
    Decide whether generate_image should be retried by tenacity.

    For proxy overload errors (429, shell_api_error), fail fast and do not retry.
    """
    message = str(exception or "").lower()
    non_retry_hints = (
        "clienterror: 429",
        "http 429",
        "shell_api_error",
        "当前分组上游负载已饱和",
        "负载已饱和",
        "too many requests",
    )
    if any(hint in message for hint in non_retry_hints):
        return False
    return True


class GenAIImageProvider(ImageProvider):
    """Image generation via Google GenAI SDK (AI Studio / Vertex AI)"""

    def __init__(
        self,
        model: str = "gemini-3.1-flash-image-preview",
        api_key: str = None,
        api_base: str = None,
        vertexai: bool = False,
        project_id: str = None,
        location: str = None,
        adapter_options: Optional[dict] = None,
    ):
        self.client = make_genai_client(
            vertexai=vertexai,
            api_key=api_key,
            api_base=api_base,
            project_id=project_id,
            location=location,
        )
        self.model = model
        self.adapter_options = adapter_options or {}

    @staticmethod
    def _should_retry_without_image_size(error: Exception) -> bool:
        """
        Some proxies reject/charge extra for image_size and may fail with
        provider-specific messages (e.g., "没有可用token").
        In that case retry once without image_size.
        """
        msg = str(error).lower()
        hints = (
            "没有可用token",
            "no available token",
            "image_size",
            "imagesize",
            "invalid_request_error",
            "unsupported",
        )
        return any(h in msg for h in hints)

    @staticmethod
    def _build_generate_config(aspect_ratio: str, resolution: str,
                               enable_thinking: bool, thinking_budget: int,
                               include_image_size: bool = True):
        image_config_kwargs = {"aspect_ratio": aspect_ratio}
        if include_image_size and resolution:
            image_config_kwargs["image_size"] = resolution

        config_params = {
            "response_modalities": ["TEXT", "IMAGE"],
            "image_config": types.ImageConfig(**image_config_kwargs),
        }

        if enable_thinking:
            # In Vertex AI (Gemini) Thinking mode, enabling include_thoughts=True
            # requires explicitly setting thinking_budget.
            config_params["thinking_config"] = types.ThinkingConfig(
                thinking_budget=thinking_budget,
                include_thoughts=True
            )

        return types.GenerateContentConfig(**config_params)

    @retry(
        stop=stop_after_attempt(get_config().GENAI_MAX_RETRIES + 1),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception(_should_retry_genai_image_exception),
        reraise=True
    )
    def generate_image(
        self,
        prompt: str,
        ref_images: Optional[List[Image.Image]] = None,
        aspect_ratio: str = "16:9",
        resolution: str = "2K",
        enable_thinking: bool = True,
        thinking_budget: int = 1024
    ) -> Optional[Image.Image]:
        """
        Generate image using Google GenAI SDK
        
        Args:
            prompt: The image generation prompt
            ref_images: Optional list of reference images
            aspect_ratio: Image aspect ratio
            resolution: Image resolution (supports "1K", "2K", "4K")
            enable_thinking: If True, enable thinking chain mode (may generate multiple images)
            thinking_budget: Thinking budget for the model
            
        Returns:
            Generated PIL Image object, or None if failed
        """
        try:
            # Build contents list with prompt and reference images
            contents = []
            
            # Add reference images first (if any)
            if ref_images:
                for ref_img in ref_images:
                    contents.append(ref_img)
            
            # Add text prompt
            contents.append(prompt)
            
            logger.debug(f"Calling GenAI API for image generation with {len(ref_images) if ref_images else 0} reference images...")
            logger.debug(f"Config - aspect_ratio: {aspect_ratio}, resolution: {resolution}, enable_thinking: {enable_thinking}")

            # First attempt: include image_size (for providers that support explicit size)
            include_image_size = not bool(self.adapter_options.get("omit_image_size"))
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=contents,
                    config=self._build_generate_config(
                        aspect_ratio=aspect_ratio,
                        resolution=resolution,
                        enable_thinking=enable_thinking,
                        thinking_budget=thinking_budget,
                        include_image_size=include_image_size,
                    )
                )
            except Exception as first_error:
                # Compatibility fallback: retry once without image_size.
                if self._should_retry_without_image_size(first_error):
                    logger.warning(
                        "GenAI image call failed with image_size=%s, retrying without image_size. "
                        "model=%s, aspect_ratio=%s, error=%s",
                        resolution, self.model, aspect_ratio, first_error
                    )
                    response = self.client.models.generate_content(
                        model=self.model,
                        contents=contents,
                        config=self._build_generate_config(
                            aspect_ratio=aspect_ratio,
                            resolution=resolution,
                            enable_thinking=enable_thinking,
                            thinking_budget=thinking_budget,
                            include_image_size=False,
                        )
                    )
                else:
                    raise

            logger.debug("GenAI API call completed")
            
            # Extract the final image from the response.
            # Earlier images are usually low resolution drafts 
            # Therefore, always use the last image found.
            last_image = None
            
            for i, part in enumerate(response.parts):
                if part.text is not None:
                    logger.debug(f"Part {i}: TEXT - {part.text[:100] if len(part.text) > 100 else part.text}")
                else:
                    try:
                        logger.debug(f"Part {i}: Attempting to extract image...")
                        image = part.as_image()
                        if image:
                            # as_image() should return PIL Image directly (official SDK)
                            # But proxy may return custom Image object, so we need fallbacks
                            if isinstance(image, Image.Image):
                                last_image = image
                            elif hasattr(image, 'image_bytes') and image.image_bytes:
                                last_image = Image.open(BytesIO(image.image_bytes))
                            elif hasattr(image, '_pil_image') and image._pil_image:
                                last_image = image._pil_image
                            else:
                                logger.warning(f"Part {i}: Image object type {type(image)} has no usable conversion method")
                                continue
                            logger.debug(f"Successfully extracted image from part {i}")
                    except Exception as e:
                        logger.warning(f"Part {i}: Failed to extract image - {type(e).__name__}: {str(e)}")
            
            # Return the last image found (highest quality in thinking chain scenarios)
            if last_image:
                return last_image
            
            # No image found in response
            error_msg = "No image found in API response. "
            if response.parts:
                error_msg += f"Response had {len(response.parts)} parts but none contained valid images."
            else:
                error_msg += "Response had no parts."
            
            raise ValueError(error_msg)
            
        except Exception as e:
            error_detail = f"Error generating image with GenAI: {type(e).__name__}: {str(e)}"
            logger.error(error_detail, exc_info=True)
            raise Exception(error_detail) from e
