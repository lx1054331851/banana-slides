import pytest

from services.ai_providers.image.genai_provider import _should_retry_genai_image_exception


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
