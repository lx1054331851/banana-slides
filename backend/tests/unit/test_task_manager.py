from unittest.mock import MagicMock

from PIL import Image

from models import Page, Project, Task, db
import services.task_manager as task_manager_module
from types import SimpleNamespace

from services.task_manager import (
    _build_resolution_mismatch_warning_message,
    _build_image_request_snapshot,
    _get_existing_page_image_path,
    _load_page_generation_snapshot,
    _resolve_image_model_label,
    edit_page_image_task,
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


def test_generate_single_page_image_task_retries_failed_generation(app):
    with app.app_context():
        project = Project(creation_type='idea', status='DRAFT')
        db.session.add(project)
        db.session.flush()

        page = Page(project_id=project.id, order_index=0, status='DRAFT')
        page.set_outline_content({'title': '首页'})
        page.set_description_content({'text': '封面描述'})
        db.session.add(page)

        task = Task(project_id=project.id, task_type='GENERATE_PAGE_IMAGE', status='PENDING')
        db.session.add(task)
        db.session.commit()

        task_id = task.id
        page_id = page.id
        project_id = project.id

    ai_service = MagicMock()
    ai_service.extract_image_urls_from_markdown.return_value = []
    ai_service.generate_image_prompt.return_value = 'prompt'

    attempts = {'count': 0}

    def generate_image(*_args, **_kwargs):
        attempts['count'] += 1
        if attempts['count'] < 3:
            raise RuntimeError(f'upstream failed #{attempts["count"]}')
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

        assert attempts['count'] == 3
        assert task.status == 'COMPLETED'
        assert task.get_progress() == {'total': 1, 'completed': 1, 'failed': 0}
        assert page.status == 'COMPLETED'


def test_edit_page_image_task_prefers_image_edit_mode_for_reference_only_updates(app):
    with app.app_context():
        project = Project(creation_type='idea', status='DRAFT')
        db.session.add(project)
        db.session.flush()

        page = Page(project_id=project.id, order_index=0, status='DRAFT')
        page.set_outline_content({'title': '首页'})
        page.set_description_content({'text': '这段页面内容不应该进入截图编辑上下文'})
        page.generated_image_path = 'uploads/project/page.png'
        db.session.add(page)

        task = Task(project_id=project.id, task_type='EDIT_PAGE_IMAGE', status='PENDING')
        db.session.add(task)
        db.session.commit()

        task_id = task.id
        page_id = page.id
        project_id = project.id

    ai_service = MagicMock()
    ai_service.generate_image.return_value = Image.new('RGB', (1920, 1080), color='blue')

    file_service = MagicMock()
    file_service.upload_folder = app.config['UPLOAD_FOLDER']
    file_service.get_template_path.return_value = None
    file_service.get_absolute_path.return_value = 'D:/tmp/current-page.png'
    file_service.save_generated_image.side_effect = (
        lambda image, project_id, page_id, version_number, image_format='PNG':
        f'{project_id}/pages/{page_id}_v{version_number}.png'
    )
    file_service.save_cached_image.side_effect = (
        lambda image, project_id, page_id, version_number, quality=85:
        f'{project_id}/pages/{page_id}_v{version_number}.jpg'
    )

    edit_page_image_task(
        task_id=task_id,
        project_id=project_id,
        page_id=page_id,
        edit_instruction='',
        ai_service=ai_service,
        file_service=file_service,
        additional_ref_images=['https://example.com/reference.png'],
        app=app,
    )

    ai_service.generate_image_prompt.assert_not_called()
    ai_service.extract_image_urls_from_markdown.assert_not_called()
    generate_args, generate_kwargs = ai_service.generate_image.call_args
    assert generate_args[1] == 'D:/tmp/current-page.png'
    assert generate_kwargs['additional_ref_images'] == ['https://example.com/reference.png']
    assert '请参考附加图片修改当前页 PPT 图片。' in generate_args[0]

    with app.app_context():
        task = db.session.get(Task, task_id)
        page = db.session.get(Page, page_id)

        assert task.status == 'COMPLETED'
        assert page.status == 'COMPLETED'
        assert page.generated_image_path.endswith('.png')
        assert page.cached_image_path.endswith('.jpg')


def test_build_image_request_snapshot_omits_page_context_for_edit_operation():
    snapshot = _build_image_request_snapshot(
        operation_type='edit',
        aspect_ratio='16:9',
        resolution='4K',
        prompt_text='只保留修改指令',
        primary_reference='uploads/demo/current.png',
        additional_references=['uploads/demo/ref1.png'],
        original_description='这段原始页面描述不应出现',
        extra_requirements='这段风格要求也不应出现',
        edit_instruction='把标题改成蓝色',
    )

    assert '原始页面描述' not in snapshot
    assert '后端追加要求' not in snapshot
    assert '这段原始页面描述不应出现' not in snapshot
    assert '这段风格要求也不应出现' not in snapshot
    assert '用户修改指令' in snapshot
    assert '把标题改成蓝色' in snapshot


def test_build_image_request_snapshot_contains_image_model_label():
    snapshot = _build_image_request_snapshot(
        operation_type='generate',
        aspect_ratio='16:9',
        resolution='2K',
        prompt_text='prompt',
        image_model='provider=openai, source=azure, model=gpt-image-1',
    )

    assert '本次图片模型：provider=openai, source=azure, model=gpt-image-1' in snapshot


def test_resolve_image_model_label_prefers_routing_bundle_route():
    ai_service = SimpleNamespace(
        image_model='fallback-image-model',
        routing_bundle=SimpleNamespace(
            image=SimpleNamespace(
                provider='openai',
                source='azure',
                model='gpt-image-1',
            )
        ),
    )

    label = _resolve_image_model_label(ai_service)
    assert label == 'provider=openai, source=azure, model=gpt-image-1'


def test_build_resolution_mismatch_warning_message_suggests_gemini_for_non_gemini_route():
    ai_service = SimpleNamespace(
        routing_bundle=SimpleNamespace(
            image=SimpleNamespace(
                provider='openai',
                source='azure',
                model='gpt-image-1',
            )
        ),
    )

    warning = _build_resolution_mismatch_warning_message(
        ai_service,
        requested_resolution='2K',
        actual_resolution='1K',
        image_size=(1536, 864),
    )

    assert '请求 2K' in warning
    assert '实际判定 1K' in warning
    assert '实际尺寸 1536x864' in warning
    assert '可尝试切换到 Gemini 格式' in warning


def test_build_resolution_mismatch_warning_message_skips_gemini_suggestion_for_gemini_route():
    ai_service = SimpleNamespace(
        routing_bundle=SimpleNamespace(
            image=SimpleNamespace(
                provider='gemini',
                source='gemini',
                model='gemini-3.1-flash-image-preview',
            )
        ),
    )

    warning = _build_resolution_mismatch_warning_message(
        ai_service,
        requested_resolution='4K',
        actual_resolution='2K',
        image_size=(2304, 1296),
    )

    assert '请求 4K' in warning
    assert '实际判定 2K' in warning
    assert '实际尺寸 2304x1296' in warning
    assert '调整分辨率后重试' in warning
    assert '切换到 Gemini 格式' not in warning


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
