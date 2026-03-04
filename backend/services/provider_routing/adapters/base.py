"""Adapter interface and registry."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, Type

from services.provider_routing.types import ResolvedProviderRoute


class ProviderRouteAdapter(ABC):
    name = "base"

    @abstractmethod
    def apply(self, route: ResolvedProviderRoute) -> ResolvedProviderRoute:
        raise NotImplementedError


_REGISTRY: Dict[str, Type[ProviderRouteAdapter]] = {}


def register_adapter(adapter_cls: Type[ProviderRouteAdapter]) -> None:
    _REGISTRY[adapter_cls.name] = adapter_cls


def get_adapter(name: str) -> ProviderRouteAdapter | None:
    cls = _REGISTRY.get(name)
    return cls() if cls else None


def list_adapters() -> list[str]:
    return sorted(_REGISTRY.keys())
