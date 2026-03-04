"""Gemini generateContent compatibility adapter for proxy quirks."""
from __future__ import annotations

from services.provider_routing.adapters.base import ProviderRouteAdapter, register_adapter
from services.provider_routing.types import ResolvedProviderRoute


class GeminiGenerateContentCompatAdapter(ProviderRouteAdapter):
    name = "gemini_generate_content_compat"

    def apply(self, route: ResolvedProviderRoute) -> ResolvedProviderRoute:
        opts = dict(route.adapter_options or {})
        # Common proxy compatibility knobs:
        # - omit_image_size: force request without image_size
        # - image_size_field: custom field name if provider requires one
        if "omit_image_size" in opts:
            opts["omit_image_size"] = bool(opts["omit_image_size"])
        if "image_size_field" in opts:
            opts["image_size_field"] = str(opts["image_size_field"])
        route.adapter_options = opts
        route.source_trace.append("adapter:gemini_generate_content_compat")
        return route


register_adapter(GeminiGenerateContentCompatAdapter)
