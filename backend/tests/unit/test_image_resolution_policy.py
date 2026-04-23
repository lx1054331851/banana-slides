"""Unit tests for image resolution policy by provider/model."""

from utils.image_resolution_policy import get_supported_image_resolutions, resolve_effective_image_resolution


def test_openai_gpt_image_2_supports_1k_2k_4k():
    resolutions = get_supported_image_resolutions("openai", "gpt-image-2")
    assert resolutions == ["1K", "2K", "4K"]


def test_openai_non_gpt_image_2_defaults_to_1k():
    resolutions = get_supported_image_resolutions("openai", "gpt-image-1")
    assert resolutions == ["1K"]


def test_resolve_effective_image_resolution_accepts_4k_for_gpt_image_2():
    effective = resolve_effective_image_resolution(
        "openai",
        "gpt-image-2",
        request_resolution="4K",
        project_resolution=None,
        global_resolution="1K",
    )
    assert effective == "4K"

