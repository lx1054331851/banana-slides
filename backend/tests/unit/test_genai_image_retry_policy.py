import pytest

from services.ai_providers.image.genai_provider import (
    GenAIImageProvider,
    _should_retry_genai_image_exception,
)
from services.ai_providers.genai_client import is_transient_genai_network_error


@pytest.mark.unit
def test_retry_policy_non_retry_on_proxy_overload_429():
    err = Exception(
        "ClientError: 429 None. {'error': {'message': '当前分组上游负载已饱和，请稍后再试', "
        "'type': 'shell_api_error'}}"
    )
    assert _should_retry_genai_image_exception(err) is False


@pytest.mark.unit
def test_retry_policy_retry_on_generic_server_error():
    err = Exception("ServerError: 500 Internal Server Error")
    assert _should_retry_genai_image_exception(err) is True


@pytest.mark.unit
def test_transient_network_error_detects_ssl_eof():
    err = Exception("ConnectError: [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol")
    assert is_transient_genai_network_error(err) is True


@pytest.mark.unit
def test_image_provider_rebuilds_client_after_transient_error(monkeypatch):
    created_clients = []

    class _Models:
        def generate_content(self, **_kwargs):
            return None

    class _Client:
        def __init__(self, name):
            self.name = name
            self.models = _Models()

    def _fake_make_client(**_kwargs):
        client = _Client(f"client-{len(created_clients) + 1}")
        created_clients.append(client)
        return client

    monkeypatch.setattr("services.ai_providers.image.genai_provider.make_genai_client", _fake_make_client)

    provider = GenAIImageProvider(api_key="test-key")
    first_client = provider.client

    rebuilt = provider._rebuild_client_after_transient_error()

    assert rebuilt is True
    assert provider.client is not first_client
    assert len(created_clients) == 2
