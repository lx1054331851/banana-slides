from services.ai_service_manager import clear_ai_service_cache, get_ai_service, get_provider_cache_info
from services.provider_routing.types import ResolvedProviderRoute, RoutingBundle


class _DummyProvider:
    def __init__(self, name: str):
        self.name = name


def _build_bundle(image_base: str) -> RoutingBundle:
    text = ResolvedProviderRoute(
        role="text",
        provider="gemini",
        source="gemini",
        model="gemini-3-flash-preview",
        api_key="k1",
        api_base="https://gemini.test",
    )
    text.finalize_fingerprint()

    image = ResolvedProviderRoute(
        role="image",
        provider="openai",
        source="openai",
        model="gemini-3.1-flash-image-preview",
        api_key="k2",
        api_base=image_base,
        adapter="openai_image_compat",
        adapter_options={"endpoint_mode": "images"},
    )
    image.finalize_fingerprint()

    caption = ResolvedProviderRoute(
        role="image_caption",
        provider="gemini",
        source="gemini",
        model="gemini-3-flash-preview",
        api_key="k3",
        api_base="https://gemini.test",
    )
    caption.finalize_fingerprint()

    bundle = RoutingBundle(text=text, image=image, image_caption=caption)
    bundle.finalize_fingerprint()
    return bundle


def test_routed_service_cache_isolated_by_bundle_fingerprint(monkeypatch):
    clear_ai_service_cache()

    created = {"text": 0, "image": 0, "caption": 0}

    def fake_text_provider(model: str, route=None):
        created["text"] += 1
        return _DummyProvider(f"text:{model}:{route.fingerprint if route else 'none'}")

    def fake_image_provider(model: str, route=None):
        created["image"] += 1
        return _DummyProvider(f"image:{model}:{route.fingerprint if route else 'none'}")

    def fake_caption_provider(model: str, route=None):
        created["caption"] += 1
        return _DummyProvider(f"caption:{model}:{route.fingerprint if route else 'none'}")

    monkeypatch.setattr("services.ai_service_manager.get_text_provider", fake_text_provider)
    monkeypatch.setattr("services.ai_service_manager.get_image_provider", fake_image_provider)
    monkeypatch.setattr("services.ai_service_manager.get_caption_provider", fake_caption_provider)

    bundle_a = _build_bundle("https://relay-a.example.com/v1")
    bundle_b = _build_bundle("https://relay-b.example.com/v1")

    service_a1 = get_ai_service(routing_bundle=bundle_a)
    service_a2 = get_ai_service(routing_bundle=bundle_a)
    service_b = get_ai_service(routing_bundle=bundle_b)

    assert service_a1 is service_a2
    assert service_a1 is not service_b
    assert created["image"] == 2

    cache_info = get_provider_cache_info()
    assert len(cache_info["routed_ai_services"]) >= 2
