"""Typed structures for provider routing resolution."""
from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
from typing import Any, Dict, List, Optional


def _hash_secret(value: Optional[str]) -> str:
    if not value:
        return ""
    return sha256(value.encode("utf-8")).hexdigest()[:12]


def build_route_fingerprint(parts: List[str], api_key: Optional[str]) -> str:
    safe_parts = [p for p in parts if p]
    safe_parts.append(f"key:{_hash_secret(api_key)}")
    raw = "|".join(safe_parts)
    return sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class ResolvedProviderRoute:
    role: str
    provider: str
    source: str
    model: str
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    azure_endpoint: Optional[str] = None
    azure_api_version: Optional[str] = None
    adapter: str = "native"
    adapter_options: Dict[str, Any] = field(default_factory=dict)
    source_trace: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    fingerprint: str = ""

    def finalize_fingerprint(self) -> None:
        parts = [
            f"role:{self.role}",
            f"provider:{self.provider}",
            f"source:{self.source}",
            f"model:{self.model}",
            f"api_base:{self.api_base or ''}",
            f"azure_endpoint:{self.azure_endpoint or ''}",
            f"azure_api_version:{self.azure_api_version or ''}",
            f"adapter:{self.adapter}",
            f"adapter_opts:{sorted(self.adapter_options.items())}",
            f"meta:{sorted(self.metadata.items())}",
        ]
        self.fingerprint = build_route_fingerprint(parts, self.api_key)


@dataclass
class RoutingBundle:
    text: ResolvedProviderRoute
    image: ResolvedProviderRoute
    image_caption: ResolvedProviderRoute
    source_trace: List[str] = field(default_factory=list)
    bundle_fingerprint: str = ""

    def finalize_fingerprint(self) -> None:
        raw = "|".join(
            [
                self.text.fingerprint,
                self.image.fingerprint,
                self.image_caption.fingerprint,
            ]
        )
        self.bundle_fingerprint = sha256(raw.encode("utf-8")).hexdigest()


GenerationOverride = Dict[str, Dict[str, Any]]
