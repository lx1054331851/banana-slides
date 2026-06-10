"""gpt-image-2 parameter compatibility tests for OpenAIImageProvider."""

import pytest
from PIL import Image

from services.ai_providers.image.openai_provider import OpenAIImageProvider
from services.ai_providers.image.openai_provider import ImageApiRequestError


def _provider(monkeypatch, strict_params=True):
    monkeypatch.setattr(
        "services.ai_providers.image.openai_provider.make_openai_client",
        lambda **_kwargs: object(),
    )
    return OpenAIImageProvider(
        api_key="image-key",
        api_base="https://relay.example.com/v1",
        model="gpt-image-2",
        strict_params=strict_params,
    )


def test_gpt_image2_uses_size_not_aspect_ratio(monkeypatch):
    provider = _provider(monkeypatch, strict_params=True)
    params = provider._build_image_api_params("gpt-image-2-high", "16:9", "4K", True)

    assert "aspect_ratio" not in params
    assert params["size"] == "3840x2160"
    assert params["quality"] == "high"


def test_gpt_image2_clamps_oversized_square(monkeypatch):
    provider = _provider(monkeypatch, strict_params=True)
    params = provider._build_image_api_params("gpt-image-2", "1:1", "4K", True)

    # 3840x3840 exceeds pixel budget; expect clamp to the largest valid square.
    assert params["size"] == "2880x2880"


def test_gpt_image2_4k_wide_maps_to_3072x1024_when_ratio_exceeds_catalog(monkeypatch):
    provider = _provider(monkeypatch, strict_params=True)
    params = provider._build_image_api_params("gpt-image-2", "21:9", "4K", True)

    assert params["size"] == "3840x1648"


def test_gpt_image2_rejects_ratio_over_3_when_strict(monkeypatch):
    provider = _provider(monkeypatch, strict_params=True)

    with pytest.raises(ValueError, match="only supports aspect ratios between 1:1 and 3:1"):
        provider._build_image_api_params("gpt-image-2", "8:1", "1K", True)


def test_azure_image_endpoint_uses_deployment_route(monkeypatch):
    provider = _provider(monkeypatch, strict_params=True)
    provider.azure_endpoint = "https://example-resource.openai.azure.com"
    provider.azure_api_version = "2025-04-01-preview"

    urls = provider._build_endpoint_candidates("generations")

    assert urls == [
        "https://example-resource.openai.azure.com/openai/deployments/gpt-image-2/images/generations"
        "?api-version=2025-04-01-preview"
    ]


def test_image_edits_json_fallback_uses_images_array(monkeypatch):
    provider = _provider(monkeypatch, strict_params=True)

    captured_payload = {}

    def fake_post(endpoint_kind, *, json_payload=None, form_data=None, files=None):
        if form_data is not None:
            raise ImageApiRequestError(
                "multipart rejected",
                status_code=400,
                response_text="Duplicate parameter: 'image'",
                url="https://example.com/edits",
            )
        captured_payload.update(json_payload or {})
        return {"data": [{"b64_json": provider._encode_image_to_base64(Image.new("RGB", (2, 2), "white"))}]}

    monkeypatch.setattr(provider, "_post_image_api", fake_post)

    result = provider._call_via_image_api_edits(
        "edit prompt",
        [Image.new("RGB", (2, 2), "black"), Image.new("RGB", (2, 2), "white")],
        "1:1",
        "1K",
    )

    assert result.size == (2, 2)
    assert "images" in captured_payload
    assert isinstance(captured_payload["images"], list)
    assert len(captured_payload["images"]) == 2
    assert "image" not in captured_payload
