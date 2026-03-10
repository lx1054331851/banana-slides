"""Style preview config defaults tests."""

import importlib

import config


def test_style_preview_initial_workers_default_is_conservative(monkeypatch):
    monkeypatch.delenv('STYLE_PREVIEW_INITIAL_WORKERS', raising=False)
    monkeypatch.setenv('MAX_IMAGE_WORKERS', '8')

    reloaded = importlib.reload(config)

    try:
        assert reloaded.Config.STYLE_PREVIEW_INITIAL_WORKERS == 2
    finally:
        importlib.reload(reloaded)


def test_style_preview_initial_workers_can_be_overridden(monkeypatch):
    monkeypatch.setenv('STYLE_PREVIEW_INITIAL_WORKERS', '5')

    reloaded = importlib.reload(config)

    try:
        assert reloaded.Config.STYLE_PREVIEW_INITIAL_WORKERS == 5
    finally:
        importlib.reload(reloaded)
