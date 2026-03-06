"""Text normalization helpers for user-provided prompts and requirements."""

from __future__ import annotations

from typing import Iterable, List


_ZERO_WIDTH_CHARS = {
    ord('\u200b'): None,
    ord('\u200c'): None,
    ord('\u200d'): None,
    ord('\u2060'): None,
    ord('\ufeff'): None,
}


def normalize_user_text(value: object) -> str:
    """Remove invisible separators and surrounding whitespace from user input."""
    if not isinstance(value, str):
        return ''

    normalized = value.replace('\r\n', '\n').replace('\r', '\n')
    normalized = normalized.translate(_ZERO_WIDTH_CHARS)
    return normalized.strip()


def normalize_user_text_list(values: object) -> List[str]:
    """Normalize a list of user-provided strings and drop empty items."""
    if not isinstance(values, Iterable) or isinstance(values, (str, bytes, dict)):
        return []

    normalized_values: List[str] = []
    for value in values:
        normalized = normalize_user_text(value)
        if normalized:
            normalized_values.append(normalized)
    return normalized_values