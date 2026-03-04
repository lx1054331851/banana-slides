import pytest

from utils.aspect_ratio_policy import (
    get_supported_aspect_ratios_for_model,
    is_aspect_ratio_supported_for_model,
)
from utils.validators import normalize_aspect_ratio


@pytest.mark.unit
def test_normalize_accepts_new_extreme_ratios():
    assert normalize_aspect_ratio("1:8") == "1:8"
    assert normalize_aspect_ratio("8:1") == "8:1"


@pytest.mark.unit
def test_gemini_31_flash_image_gets_extra_ratios():
    ratios = set(get_supported_aspect_ratios_for_model("gemini-3.1-flash-image-preview"))
    assert "1:4" in ratios
    assert "4:1" in ratios
    assert "1:8" in ratios
    assert "8:1" in ratios


@pytest.mark.unit
def test_non_gemini_31_model_keeps_original_ratio_set():
    ratios = set(get_supported_aspect_ratios_for_model("gemini-2.5-flash-image"))
    assert "1:4" not in ratios
    assert "4:1" not in ratios
    assert "1:8" not in ratios
    assert "8:1" not in ratios
    assert "16:9" in ratios


@pytest.mark.unit
def test_support_check_by_model():
    assert is_aspect_ratio_supported_for_model("gemini-3.1-flash-image-preview", "1:8")
    assert not is_aspect_ratio_supported_for_model("gemini-2.5-flash-image", "1:8")
