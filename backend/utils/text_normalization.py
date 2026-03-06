"""Text normalization helpers for user-provided prompts and requirements."""

from __future__ import annotations

from typing import Iterable, List


_INVISIBLE_CHARS = {
    ord('\u200b'): None,
    ord('\u200c'): None,
    ord('\u200d'): None,
    ord('\u2060'): None,
    ord('\ufeff'): None,
}
_INVISIBLE_CHARS.update({codepoint: None for codepoint in range(0x00, 0x20) if codepoint not in (0x09, 0x0A)})
_INVISIBLE_CHARS.update({codepoint: None for codepoint in range(0x7F, 0xA0)})


def normalize_user_text(value: object) -> str:
    """Normalize line breaks and remove invisible/control chars from user input."""
    if not isinstance(value, str):
        return ''

    normalized = (
        value
        .replace('\r\n', '\n')
        .replace('\r', '\n')
        .replace('\u2028', '\n')
        .replace('\u2029', '\n')
        .replace('\u0085', '\n')
    )
    normalized = normalized.translate(_INVISIBLE_CHARS)
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
