from unittest.mock import MagicMock

from PIL import Image

from models import Page, Project, Task, db
import services.task_manager as task_manager_module
from types import SimpleNamespace

from services.task_manager import (
    _get_existing_page_image_path,
    _load_page_generation_snapshot,
    generate_single_page_image_task,
    get_renovation_page_sources,
)


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


def test_load_page_generation_snapshot_returns_plain_fields(app):
    with app.app_context():
        project = Project(creation_type='idea', status='DRAFT')
        db.session.add(project)
        db.session.flush()

        page = Page(project_id=project.id, order_index=0, part='封面', status='DRAFT')
        page.set_outline_content({'title': '首页'})
        page.set_description_content({'text': '封面描述'})
        page.generated_image_path = 'uploads/project/page.png'
        db.session.add(page)
        db.session.commit()

        snapshot = _load_page_generation_snapshot(page.id, project.id)

        assert snapshot['description_content'] == {'text': '封面描述'}
        assert snapshot['page_data'] == {'title': '首页', 'part': '封面'}
        assert snapshot['order_index'] == 0
        assert snapshot['current_image_rel_path'] == 'uploads/project/page.png'


def test_generate_single_page_image_task_releases_session_before_ai_call(app, monkeypatch):
    removals = []
    original_remove = task_manager_module._remove_scoped_session

    def tracked_remove():
        removals.append('removed')
        return original_remove()

    monkeypatch.setattr(task_manager_module, '_remove_scoped_session', tracked_remove)

    with app.app_context():
        project = Project(creation_type='idea', status='DRAFT')
        db.session.add(project)
        db.session.flush()

        page = Page(project_id=project.id, order_index=0, status='DRAFT')
        page.set_outline_content({'title': '首页'})
        page.set_description_content({'text': '封面描述'})
        db.session.add(page)

        task = Task(project_id=project.id, task_type='GENERATE_IMAGES', status='PENDING')
        db.session.add(task)
        db.session.commit()

        task_id = task.id
        page_id = page.id
        project_id = project.id

    ai_service = MagicMock()
    ai_service.extract_image_urls_from_markdown.return_value = []
    ai_service.generate_image_prompt.return_value = 'prompt'

    def generate_image(*args, **kwargs):
        assert removals, "expected db session to be released before the long-running AI call"
        return Image.new('RGB', (1920, 1080), color='blue')

    ai_service.generate_image.side_effect = generate_image

    file_service = MagicMock()
    file_service.get_template_path.return_value = None
    file_service.save_generated_image.side_effect = (
        lambda image, project_id, page_id, version_number, image_format='PNG':
        f'{project_id}/pages/{page_id}_v{version_number}.png'
    )
    file_service.save_cached_image.side_effect = (
        lambda image, project_id, page_id, version_number, quality=85:
        f'{project_id}/pages/{page_id}_v{version_number}.jpg'
    )

    generate_single_page_image_task(
        task_id=task_id,
        project_id=project_id,
        page_id=page_id,
        ai_service=ai_service,
        file_service=file_service,
        outline=[{'title': '首页'}],
        use_template=False,
        app=app,
    )

    with app.app_context():
        task = db.session.get(Task, task_id)
        page = db.session.get(Page, page_id)

        assert task.status == 'COMPLETED'
        assert page.status == 'COMPLETED'
        assert page.generated_image_path.endswith('.png')
        assert page.cached_image_path.endswith('.jpg')


def test_get_renovation_page_sources_reuses_existing_split_pages(tmp_path):
    project_dir = tmp_path / 'project-1'
    split_dir = project_dir / 'split_pages'
    split_dir.mkdir(parents=True)

    page2 = split_dir / 'page_2.pdf'
    page1 = split_dir / 'page_1.pdf'
    page2.write_bytes(b'%PDF-1.4 page2')
    page1.write_bytes(b'%PDF-1.4 page1')

    result = get_renovation_page_sources(project_dir)

    assert result == [str(page1), str(page2)]


def test_get_renovation_page_sources_falls_back_to_original_page_images(tmp_path):
    project_dir = tmp_path / 'project-2'
    pages_dir = project_dir / 'pages'
    pages_dir.mkdir(parents=True)

    page10 = pages_dir / 'page_10_original.png'
    page2 = pages_dir / 'page_2_original.png'
    page1 = pages_dir / 'page_1_original.png'
    page10.write_bytes(b'img10')
    page2.write_bytes(b'img2')
    page1.write_bytes(b'img1')

    result = get_renovation_page_sources(project_dir)

    assert result == [str(page1), str(page2), str(page10)]
