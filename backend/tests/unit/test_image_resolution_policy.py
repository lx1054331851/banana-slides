"""Unit tests for image resolution policy by provider/model/channel."""

import pytest

from utils.image_resolution_policy import get_supported_image_resolutions, resolve_effective_image_resolution


def test_openai_gpt_image_2_supports_1k_2k_4k():
    resolutions = get_supported_image_resolutions("openai", "gpt-image-2")
    assert resolutions == ["1K", "2K", "4K"]


def test_147ai_channel_keeps_gpt_image_2_high_generic_resolution_support():
    """147AI capability should now rely on protocol adaptation, not hard-coded 1K downgrade."""
    resolutions = get_supported_image_resolutions("openai", "gpt-image-2-high", channel="147ai")
    assert resolutions == ["1K", "2K", "4K"]


def test_147ai_channel_keeps_gemini_31_flash_generic_resolution_support():
    """147AI capability should now rely on protocol adaptation, not hard-coded 1K downgrade."""
    resolutions = get_supported_image_resolutions("openai", "gemini-3.1-flash-image-preview", channel="147ai")
    assert resolutions == ["0.5K", "1K", "2K", "4K"]


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


def test_resolve_effective_image_resolution_accepts_4k_for_147ai_channel_after_adapter_fix():
    """147AI should accept 4K again once request payload is adapted to its documented protocol."""
    effective = resolve_effective_image_resolution(
        "openai",
        "gpt-image-2-high",
        channel="147ai",
        request_resolution="4K",
        project_resolution=None,
        global_resolution="1K",
    )
    assert effective == "4K"

def test_openai_gemini_3_pro_supports_1k_2k_4k():
    resolutions = get_supported_image_resolutions("openai", "gemini-3-pro-image-preview")
    assert resolutions == ["1K", "2K", "4K"]


def test_resolve_effective_image_resolution_accepts_4k_for_gemini_3_pro():
    effective = resolve_effective_image_resolution(
        "openai",
        "gemini-3-pro-image-preview",
        request_resolution="4K",
        project_resolution=None,
        global_resolution="1K",
    )
    assert effective == "4K"
