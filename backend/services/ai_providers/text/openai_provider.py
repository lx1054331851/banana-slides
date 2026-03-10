"""
OpenAI SDK implementation for text generation
"""
import logging
from typing import Generator
from .base import TextProvider, strip_think_tags
from config import get_config
from ..openai_client import make_openai_client

logger = logging.getLogger(__name__)


def _rewrite_openai_text_error(exc: Exception, *, azure_endpoint: str | None, model: str) -> Exception:
    text = str(exc)
    normalized = text.lower()
    if azure_endpoint and 'invalid_prompt' in normalized and 'internal error' in normalized:
        return RuntimeError(
            "Azure OpenAI 文本生成失败：当前 deployment 在 chat.completions 调用下返回了上游异常，"
            "这不是业务 prompt 特有问题；我们已确认连极短 prompt 也会同样失败。"
            f" 当前 TEXT_MODEL={model}，endpoint={azure_endpoint}。请检查该 deployment 的健康状态、API 兼容性，以及是否允许 chat.completions 调用。原始错误: {text}"
        )
    return exc


class OpenAITextProvider(TextProvider):
    """Text generation using OpenAI SDK (supports Azure OpenAI when configured)."""
    
    def __init__(
        self,
        api_key: str,
        api_base: str = None,
        model: str = "gemini-3-flash-preview",
        azure_endpoint: str = None,
        azure_api_version: str = None,
    ):
        """
        Initialize OpenAI text provider
        
        Args:
            api_key: API key
            api_base: API base URL (e.g., https://aihubmix.com/v1)
            model: Model name to use
        """
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
        self.model = model
        self.azure_endpoint = azure_endpoint
    
    def generate_text(self, prompt: str, thinking_budget: int = 0) -> str:
        """
        Generate text using OpenAI SDK
        
        Args:
            prompt: The input prompt
            thinking_budget: Not used in OpenAI format, kept for interface compatibility (0 = default)
            
        Returns:
            Generated text
        """
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            return strip_think_tags(response.choices[0].message.content)
        except Exception as exc:
            raise _rewrite_openai_text_error(exc, azure_endpoint=self.azure_endpoint, model=self.model) from exc

    def generate_text_stream(self, prompt: str, thinking_budget: int = 0) -> Generator[str, None, None]:
        """Stream text using OpenAI SDK with stream=True."""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            )
            for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
        except Exception as exc:
            raise _rewrite_openai_text_error(exc, azure_endpoint=self.azure_endpoint, model=self.model) from exc

    def stream_text(self, prompt: str, thinking_budget: int = 0) -> Generator[str, None, None]:
        """Backward-compatible alias for legacy call sites."""
        yield from self.generate_text_stream(prompt, thinking_budget=thinking_budget)

    def generate_with_image(self, prompt: str, image_path: str, thinking_budget: int = 0) -> str:
        """
        Generate text with image input using OpenAI-compatible chat completions.

        Works with OpenAI and Azure OpenAI (vision-capable deployments) when the endpoint supports
        image content in chat messages.
        """
        import base64
        from io import BytesIO
        from PIL import Image

        image = Image.open(image_path)
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)

        buffered = BytesIO()
        if image.mode in ('RGBA', 'LA', 'P'):
            image = image.convert('RGB')
        image.save(buffered, format="JPEG", quality=95)
        base64_image = base64.b64encode(buffered.getvalue()).decode('utf-8')

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}},
                    {"type": "text", "text": prompt},
                ],
            }],
            temperature=0.3,
        )
        return strip_think_tags(response.choices[0].message.content or "")
