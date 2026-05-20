"""OpenAI image compatibility adapter for non-standard relays."""
from __future__ import annotations

from services.provider_routing.adapters.base import ProviderRouteAdapter, register_adapter
from services.provider_routing.types import ResolvedProviderRoute


class OpenAIImageCompatAdapter(ProviderRouteAdapter):
    name = "openai_image_compat"

    @staticmethod
    def _to_bool(value):
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        text = str(value or "").strip().lower()
        if text in {"1", "true", "yes", "y", "on"}:
            return True
        if text in {"0", "false", "no", "n", "off", ""}:
            return False
        return bool(value)

    def apply(self, route: ResolvedProviderRoute) -> ResolvedProviderRoute:
        opts = dict(route.adapter_options or {})
        mapped = {}
        channel = str(route.channel or "").strip().lower()
        if "endpoint_mode" in opts:
            mapped["endpoint_mode"] = opts["endpoint_mode"]
        if "path_style" in opts:
            mapped["path_style"] = opts["path_style"]
        if "response_format" in opts:
            mapped["response_format"] = opts["response_format"]
        if "chat_fallback" in opts:
            mapped["chat_fallback"] = self._to_bool(opts["chat_fallback"])
        if "strict_params" in opts:
            mapped["strict_params"] = self._to_bool(opts["strict_params"])
        if "extra_body_mode" in opts:
            mapped["extra_body_mode"] = str(opts["extra_body_mode"]).strip()

        # 147AI documents a chat/completions image route that expects
        # extra_body.google.image_config instead of the generic payload shape.
        if channel == "147ai":
            mapped.setdefault("endpoint_mode", "chat")
            mapped.setdefault("extra_body_mode", "google_image_config")

        route.adapter_options = {**opts, **mapped}
        route.source_trace.append("adapter:openai_image_compat")
        return route


register_adapter(OpenAIImageCompatAdapter)
