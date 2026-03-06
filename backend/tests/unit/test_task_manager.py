from types import SimpleNamespace

from services.task_manager import _get_existing_page_image_path


def test_get_existing_page_image_path_prefers_generated_image():
    page = SimpleNamespace(
        generated_image_path='uploads/project/page.png',
        cached_image_path='uploads/project/page-cache.jpg',
        preview_image_path='/files/project/page-cache.jpg',
    )

    assert _get_existing_page_image_path(page) == 'uploads/project/page.png'


def test_get_existing_page_image_path_falls_back_to_cached_image():
    page = SimpleNamespace(
        generated_image_path=None,
        cached_image_path='uploads/project/page-cache.jpg',
    )

    assert _get_existing_page_image_path(page) == 'uploads/project/page-cache.jpg'


def test_get_existing_page_image_path_supports_legacy_preview_attr():
    page = SimpleNamespace(
        generated_image_path=None,
        cached_image_path=None,
        preview_image_path='/files/project/page-cache.jpg',
    )

    assert _get_existing_page_image_path(page) == '/files/project/page-cache.jpg'


def test_get_existing_page_image_path_returns_none_without_any_image():
    page = SimpleNamespace(
        generated_image_path=None,
        cached_image_path=None,
    )

    assert _get_existing_page_image_path(page) is None