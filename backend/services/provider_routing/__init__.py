"""Provider routing public API with lazy imports for lightweight test environments."""

from importlib import import_module
from typing import Any

from .types import GenerationOverride, ResolvedProviderRoute, RoutingBundle

__all__ = [
    "GenerationOverride",
    "ResolvedProviderRoute",
    "RoutingBundle",
    "get_default_adapter_name",
    "get_profile",
    "is_routing_strict",
    "list_provider_profiles_redacted",
    "load_provider_profiles",
    "resolve_provider_route",
    "resolve_routing_bundle",
]

_LAZY_EXPORTS = {
    "get_default_adapter_name": ("services.provider_routing.profiles", "get_default_adapter_name"),
    "get_profile": ("services.provider_routing.profiles", "get_profile"),
    "is_routing_strict": ("services.provider_routing.profiles", "is_routing_strict"),
    "list_provider_profiles_redacted": ("services.provider_routing.profiles", "list_provider_profiles_redacted"),
    "load_provider_profiles": ("services.provider_routing.profiles", "load_provider_profiles"),
    "resolve_provider_route": ("services.provider_routing.resolver", "resolve_provider_route"),
    "resolve_routing_bundle": ("services.provider_routing.resolver", "resolve_routing_bundle"),
}


def __getattr__(name: str) -> Any:
    """Resolve routing helpers on demand so tests can import typed submodules without Flask installed."""
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module 'services.provider_routing' has no attribute {name!r}")
    module_name, attr_name = target
    module = import_module(module_name)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value
