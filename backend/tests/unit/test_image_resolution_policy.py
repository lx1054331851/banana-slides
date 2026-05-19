"""Unit tests for image resolution policy by provider/model/channel."""

import pytest

from utils.image_resolution_policy import get_supported_image_resolutions, resolve_effective_image_resolution


def test_openai_gpt_image_2_supports_1k_2k_4k():
    resolutions = get_supported_image_resolutions("openai", "gpt-image-2")
    assert resolutions == ["1K", "2K", "4K"]


def test_147ai_channel_limits_gpt_image_2_high_to_1k():
    """147AI relay currently only supports 1K for gpt-image-2-high."""
    resolutions = get_supported_image_resolutions("openai", "gpt-image-2-high", channel="147ai")
    assert resolutions == ["1K"]


def test_147ai_channel_limits_gemini_31_flash_to_1k():
    """147AI relay currently only supports 1K for gemini-3.1-flash-image-preview."""
    resolutions = get_supported_image_resolutions("openai", "gemini-3.1-flash-image-preview", channel="147ai")
    assert resolutions == ["1K"]


def test_openai_non_gpt_image_2_defaults_to_1k():
    resolutions = get_supported_image_resolutions("openai", "gpt-image-1")
    assert resolutions == ["1K"]


def test_openai_gemini_3_pro_stable_only_supports_1k():
    resolutions = get_supported_image_resolutions("openai", "gemini-3-pro-image-preview-stable")
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


def test_resolve_effective_image_resolution_rejects_4k_for_gemini_3_pro_stable():
    with pytest.raises(ValueError, match="Allowed values: 1K"):
        resolve_effective_image_resolution(
            "openai",
            "gemini-3-pro-image-preview-stable",
            request_resolution="4K",
            project_resolution=None,
            global_resolution="1K",
        )


def test_resolve_effective_image_resolution_rejects_4k_for_147ai_channel():
    """Channel-specific capability should override generic model capability."""
    with pytest.raises(ValueError, match="Allowed values: 1K"):
        resolve_effective_image_resolution(
            "openai",
            "gpt-image-2-high",
            channel="147ai",
            request_resolution="4K",
            project_resolution=None,
            global_resolution="1K",
        )
