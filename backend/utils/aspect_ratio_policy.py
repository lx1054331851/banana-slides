"""
Aspect ratio support policy by image model.
"""

from typing import List, Set

# Original system-wide preset ratios
BASE_ASPECT_RATIOS: Set[str] = {
    "16:9",
    "21:9",
    "4:3",
    "3:2",
    "5:4",
    "1:1",
    "4:5",
    "2:3",
    "3:4",
    "9:16",
}

# Extra ratios supported by gemini-3.1-flash-image-preview family
GEMINI_31_EXTRA_ASPECT_RATIOS: Set[str] = {
    "1:4",
    "4:1",
    "1:8",
    "8:1",
}


def _normalize_model_name(model_name: str) -> str:
    return (model_name or "").strip().lower()


def is_gemini_31_flash_image_model(model_name: str) -> bool:
    """
    True for gemini-3.1-flash-image-preview family:
      - gemini-3.1-flash-image-preview
      - gemini-3.1-flash-image-preview-0.5k / -2k / -4k
    """
    model = _normalize_model_name(model_name)
    return model.startswith("gemini-3.1-flash-image-preview")


def get_supported_aspect_ratios_for_model(model_name: str) -> List[str]:
    ratios = set(BASE_ASPECT_RATIOS)
    if is_gemini_31_flash_image_model(model_name):
        ratios.update(GEMINI_31_EXTRA_ASPECT_RATIOS)
    return sorted(ratios, key=lambda x: (float(x.split(":")[0]) / float(x.split(":")[1]), x))


def is_aspect_ratio_supported_for_model(model_name: str, aspect_ratio: str) -> bool:
    return aspect_ratio in set(get_supported_aspect_ratios_for_model(model_name))

