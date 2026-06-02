from services.ai_providers import get_image_provider
from services.ai_providers.image.openai_provider import OpenAIImageProvider
from services.provider_routing.types import ResolvedProviderRoute


def test_gemini_profile_with_openai_image_compat_uses_openai_provider():
    route = ResolvedProviderRoute(
        role='image',
        provider='gemini',
        source='profile:test-gemini-relay',
        model='gemini-3.1-flash-image-preview',
        channel='test-gemini-relay',
        api_key='test-key',
        api_base='https://relay.example.com/v1',
        adapter='openai_image_compat',
        adapter_options={
            'endpoint_mode': 'chat',
            'extra_body_mode': 'google_image_config',
        },
        source_trace=['profile:test-gemini-relay', 'adapter:openai_image_compat'],
    )

    provider = get_image_provider(route=route)

    assert isinstance(provider, OpenAIImageProvider)
    assert provider.model == 'gemini-3.1-flash-image-preview'
    assert provider.endpoint_mode == 'chat'
    assert provider.extra_body_mode == 'google_image_config'
