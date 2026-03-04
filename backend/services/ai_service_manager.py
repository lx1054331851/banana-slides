"""
AIService singleton manager for optimizing provider initialization

This module provides a singleton pattern implementation for AIService to avoid
repeated initialization of AI providers (TextProvider and ImageProvider) on every request.

Benefits:
- Reuses AI provider instances across requests
- Reduces initialization overhead
- Better resource management
- Thread-safe for Flask multi-threaded environment

Usage:
    from services.ai_service_manager import get_ai_service
    
    # In your controller
    ai_service = get_ai_service()
    outline = ai_service.generate_outline(project_context)
"""

import logging
from threading import Lock
from typing import Optional
from flask import current_app, has_app_context
from .ai_service import AIService
from .ai_providers import get_text_provider, get_image_provider, get_caption_provider, TextProvider, ImageProvider
from services.provider_routing.types import RoutingBundle, ResolvedProviderRoute

logger = logging.getLogger(__name__)

# Global singleton instance
_ai_service_instance: Optional[AIService] = None
_lock = Lock()

# Provider cache to avoid re-initialization when models don't change
_text_provider_cache: dict = {}
_image_provider_cache: dict = {}
_caption_provider_cache: dict = {}
_routing_ai_service_cache: dict = {}
_cache_lock = Lock()


def _provider_cache_key(model: str, route: Optional[ResolvedProviderRoute]) -> str:
    if route and route.fingerprint:
        return route.fingerprint
    return f"model::{model}"


def _get_cached_text_provider(model: str, route: Optional[ResolvedProviderRoute] = None) -> TextProvider:
    """
    Get or create a cached text provider instance
    
    Args:
        model: Model name to use
        
    Returns:
        Cached or new TextProvider instance
    """
    with _cache_lock:
        key = _provider_cache_key(model, route)
        if key not in _text_provider_cache:
            logger.info(f"Creating new TextProvider cache entry: {key}")
            _text_provider_cache[key] = get_text_provider(model=model, route=route)
        else:
            logger.debug(f"Reusing cached TextProvider: {key}")
        return _text_provider_cache[key]


def _get_cached_image_provider(model: str, route: Optional[ResolvedProviderRoute] = None) -> ImageProvider:
    """
    Get or create a cached image provider instance
    
    Args:
        model: Model name to use
        
    Returns:
        Cached or new ImageProvider instance
    """
    with _cache_lock:
        key = _provider_cache_key(model, route)
        if key not in _image_provider_cache:
            logger.info(f"Creating new ImageProvider cache entry: {key}")
            _image_provider_cache[key] = get_image_provider(model=model, route=route)
        else:
            logger.debug(f"Reusing cached ImageProvider: {key}")
        return _image_provider_cache[key]


def _get_cached_caption_provider(model: str, route: Optional[ResolvedProviderRoute] = None) -> TextProvider:
    """Get or create a cached caption provider instance"""
    with _cache_lock:
        key = _provider_cache_key(model, route)
        if key not in _caption_provider_cache:
            logger.info(f"Creating new CaptionProvider cache entry: {key}")
            _caption_provider_cache[key] = get_caption_provider(model=model, route=route)
        return _caption_provider_cache[key]


def get_ai_service(force_new: bool = False, routing_bundle: Optional[RoutingBundle] = None) -> AIService:
    """
    Get the singleton AIService instance with optimized provider caching
    
    This function creates and returns a singleton AIService instance that reuses
    AI providers (TextProvider and ImageProvider) across requests, significantly
    reducing initialization overhead.
    
    Args:
        force_new: If True, forces creation of a new instance (useful for testing)
        
    Returns:
        AIService singleton instance with cached providers
        
    Note:
        The providers are cached per model name. If TEXT_MODEL or IMAGE_MODEL
        changes in Flask config, new providers will be created automatically.
    """
    global _ai_service_instance
    
    if force_new and routing_bundle is None:
        with _lock:
            logger.info("Force creating new AIService instance")
            _ai_service_instance = None

    if routing_bundle is not None:
        bundle_key = routing_bundle.bundle_fingerprint
        with _lock:
            if force_new and bundle_key in _routing_ai_service_cache:
                _routing_ai_service_cache.pop(bundle_key, None)
            cached = _routing_ai_service_cache.get(bundle_key)
            if cached is not None:
                logger.debug("Reusing routed AIService bundle cache: %s", bundle_key)
                return cached

            text_model = routing_bundle.text.model
            image_model = routing_bundle.image.model
            caption_model = routing_bundle.image_caption.model
            text_provider = _get_cached_text_provider(text_model, routing_bundle.text)
            image_provider = _get_cached_image_provider(image_model, routing_bundle.image)
            caption_provider = _get_cached_caption_provider(caption_model, routing_bundle.image_caption)
            routed_service = AIService(
                text_provider=text_provider,
                image_provider=image_provider,
                caption_provider=caption_provider,
                routing_bundle=routing_bundle,
            )
            _routing_ai_service_cache[bundle_key] = routed_service
            logger.info(
                "Routed AIService created bundle=%s text=%s image=%s caption=%s",
                bundle_key,
                text_model,
                image_model,
                caption_model,
            )
            return routed_service

    if _ai_service_instance is None:
        with _lock:
            # Double-check locking pattern
            if _ai_service_instance is None:
                logger.info("Initializing AIService singleton with provider caching")
                
                # Get model names from Flask config or use defaults
                from config import get_config
                config = get_config()
                
                if has_app_context() and current_app and hasattr(current_app, "config"):
                    text_model = current_app.config.get("TEXT_MODEL", config.TEXT_MODEL)
                    image_model = current_app.config.get("IMAGE_MODEL", config.IMAGE_MODEL)
                    caption_model = current_app.config.get("IMAGE_CAPTION_MODEL", config.IMAGE_CAPTION_MODEL)
                else:
                    text_model = config.TEXT_MODEL
                    image_model = config.IMAGE_MODEL
                    caption_model = config.IMAGE_CAPTION_MODEL

                # Get cached providers
                text_provider = _get_cached_text_provider(text_model)
                image_provider = _get_cached_image_provider(image_model)
                caption_provider = _get_cached_caption_provider(caption_model)

                # Create AIService with cached providers
                _ai_service_instance = AIService(
                    text_provider=text_provider,
                    image_provider=image_provider,
                    caption_provider=caption_provider
                )

                logger.info(f"AIService singleton created with models: text={text_model}, image={image_model}, caption={caption_model}")
    
    return _ai_service_instance


def clear_ai_service_cache():
    """
    Clear the AIService singleton and provider cache
    
    This is useful when:
    - Configuration changes (API keys, endpoints, models)
    - Testing scenarios requiring fresh instances
    - Memory cleanup needed
    
    Note:
    - Uses nested locks to ensure atomic cache clearing operation
    - Prevents race conditions where new instances could be created
      with stale cached providers during the clearing process
    """
    global _ai_service_instance
    
    with _lock:
        _ai_service_instance = None
        logger.info("AIService singleton cache cleared")
        with _cache_lock:
            _text_provider_cache.clear()
            _image_provider_cache.clear()
            _caption_provider_cache.clear()
            _routing_ai_service_cache.clear()
            logger.info("Provider cache cleared")


def get_provider_cache_info() -> dict:
    """
    Get information about cached providers (for debugging/monitoring)
    
    Returns:
        Dictionary with cache statistics
    """
    with _cache_lock:
        return {
            "text_providers": list(_text_provider_cache.keys()),
            "image_providers": list(_image_provider_cache.keys()),
            "caption_providers": list(_caption_provider_cache.keys()),
            "routed_ai_services": list(_routing_ai_service_cache.keys()),
            "total_cached": (
                len(_text_provider_cache)
                + len(_image_provider_cache)
                + len(_caption_provider_cache)
                + len(_routing_ai_service_cache)
            ),
        }
