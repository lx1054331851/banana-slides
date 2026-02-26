"""
OpenAI SDK implementation for text generation
"""
import logging
from .base import TextProvider, strip_think_tags
from config import get_config
from ..openai_client import make_openai_client

logger = logging.getLogger(__name__)


class OpenAITextProvider(TextProvider):
    """Text generation using OpenAI SDK (supports Azure OpenAI when configured)."""
    
    def __init__(self, api_key: str, api_base: str = None, model: str = "gemini-3-flash-preview"):
        """
        Initialize OpenAI text provider
        
        Args:
            api_key: API key
            api_base: API base URL (e.g., https://aihubmix.com/v1)
            model: Model name to use
        """
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
        self.model = model
    
    def generate_text(self, prompt: str, thinking_budget: int = 0) -> str:
        """
        Generate text using OpenAI SDK
        
        Args:
            prompt: The input prompt
            thinking_budget: Not used in OpenAI format, kept for interface compatibility (0 = default)
            
        Returns:
            Generated text
        """
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        return strip_think_tags(response.choices[0].message.content)

    def stream_text(self, prompt: str, thinking_budget: int = 0):
        """
        Stream text using OpenAI SDK
        """
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            stream=True
        )
        for chunk in response:
            if not chunk or not getattr(chunk, "choices", None):
                continue
            delta = chunk.choices[0].delta
            content = getattr(delta, "content", None)
            if content:
                yield content

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
