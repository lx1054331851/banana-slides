"""Native adapter - no transformation."""
from __future__ import annotations

from services.provider_routing.adapters.base import ProviderRouteAdapter, register_adapter
from services.provider_routing.types import ResolvedProviderRoute


class NativeAdapter(ProviderRouteAdapter):
    name = "native"

    def apply(self, route: ResolvedProviderRoute) -> ResolvedProviderRoute:
        return route


register_adapter(NativeAdapter)
