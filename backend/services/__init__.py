"""Services package with lazy exports to avoid heavy import side effects in tests."""

from importlib import import_module
from typing import Any

__all__ = ['AIService', 'ProjectContext', 'FileService', 'ExportService', 'ImageCompressionService']

_LAZY_EXPORTS = {
    'AIService': ('services.ai_service', 'AIService'),
    'ProjectContext': ('services.ai_service', 'ProjectContext'),
    'FileService': ('services.file_service', 'FileService'),
    'ExportService': ('services.export_service', 'ExportService'),
    'ImageCompressionService': ('services.image_compression_service', 'ImageCompressionService'),
}


def __getattr__(name: str) -> Any:
    """Resolve service exports on first access so lightweight tests can import submodules safely."""
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module 'services' has no attribute {name!r}")
    module_name, attr_name = target
    module = import_module(module_name)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value
