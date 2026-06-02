from types import SimpleNamespace

import pytest

from services.ai_providers.image.genai_provider import GenAIImageProvider


class _FakeModels:
    def __init__(self):
        self.calls = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        raise Exception("unsupported field: image_size")


class _FakeClient:
    def __init__(self):
        self.models = _FakeModels()


def _build_provider(monkeypatch):
    monkeypatch.setattr(
        'services.ai_providers.image.genai_provider.make_genai_client',
        lambda **_kwargs: _FakeClient(),
    )
    return GenAIImageProvider(model='gemini-3.1-flash-image-preview', api_key='test-key')


def test_high_resolution_rejects_silent_fallback_without_image_size(monkeypatch):
    provider = _build_provider(monkeypatch)

    with pytest.raises(Exception, match='不接受 image_size=4K'):
        provider.generate_image(prompt='test', aspect_ratio='16:9', resolution='4K', enable_thinking=False)

    assert len(provider.client.models.calls) == 1


def test_1k_can_retry_without_image_size(monkeypatch):
    provider = _build_provider(monkeypatch)
    call_counter = {"count": 0}

    def _generate_content(*, model, contents, config):
        call_counter["count"] += 1
        if call_counter["count"] == 1:
            raise Exception('unsupported field: image_size')
        return SimpleNamespace(parts=[])

    provider.client.models.generate_content = _generate_content

    with pytest.raises(Exception, match='No image found in API response'):
        provider.generate_image(prompt='test', aspect_ratio='16:9', resolution='1K', enable_thinking=False)

    assert call_counter['count'] == 2
