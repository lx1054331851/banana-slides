from unittest.mock import MagicMock, patch
from types import SimpleNamespace

from conftest import assert_error_response, assert_success_response


def _create_project_with_page(app):
    from models import db, Page, Project

    with app.app_context():
        project = Project(creation_type='idea', idea_prompt='测试 refine 输入清洗')
        db.session.add(project)
        db.session.flush()

        page = Page(project_id=project.id, order_index=0, status='DRAFT')
        page.set_outline_content({'title': '价格段分布', 'points': ['价格段', '见解']})
        page.set_description_content({'text': '当前描述'})
        db.session.add(page)
        db.session.commit()

        return project.id, page.id


def test_single_page_refine_normalizes_invisible_whitespace(client, app):
    project_id, page_id = _create_project_with_page(app)
    mock_service = MagicMock()
    mock_service.refine_descriptions.return_value = ['优化后的页面描述']

    with patch('controllers.page_controller.get_ai_service', return_value=mock_service):
        response = client.post(
            f'/api/projects/{project_id}/pages/{page_id}/description/refine',
            json={
                'user_requirement': '以下为日本官网商品数据，生成见解和建议\u200b ',
                'current_description': '当前描述',
                'outline_content': {'title': '价格段分布', 'points': ['价格段', '见解']},
                'previous_requirements': [' 第一版 ', '', '\u200b', '补充建议\ufeff'],
            },
        )

    data = assert_success_response(response)
    assert data['data']['refined_description'] == '优化后的页面描述'

    _, kwargs = mock_service.refine_descriptions.call_args
    assert kwargs['user_requirement'] == '以下为日本官网商品数据，生成见解和建议'
    assert kwargs['previous_requirements'] == ['第一版', '补充建议']


def test_project_refine_descriptions_rejects_invisible_only_requirement(client, sample_project):
    project_id = sample_project['project_id']

    response = client.post(
        f'/api/projects/{project_id}/refine/descriptions',
        json={'user_requirement': ' \u200b\ufeff '},
    )

    data = assert_error_response(response, 400)
    assert data['error']['message'] == 'user_requirement is required'


def test_normalize_user_text_removes_hidden_control_chars():
    from utils.text_normalization import normalize_user_text

    raw = '\u200b\u0000 第一行\r\n第二行\u2028第三行\u0085第四行\ufeff '
    assert normalize_user_text(raw) == '第一行\n第二行\n第三行\n第四行'


def test_edit_page_image_normalizes_invisible_edit_instruction(client, app):
    project_id, page_id = _create_project_with_page(app)

    mock_service = MagicMock()
    routing_bundle = SimpleNamespace(
        image=SimpleNamespace(provider='gemini', model='gemini-3.1-flash-image-preview')
    )

    with patch('controllers.page_controller.resolve_routing_bundle', return_value=routing_bundle), \
         patch('controllers.page_controller.get_ai_service', return_value=mock_service), \
         patch('controllers.page_controller.task_manager.submit_task') as mock_submit_task:
        response = client.post(
            f'/api/projects/{project_id}/pages/{page_id}/edit/image',
            json={
                'edit_instruction': '\u200b\u0000把标题改成蓝色\r',
                'context_images': {'use_template': False, 'desc_image_urls': []},
            },
        )

    assert_success_response(response, 202)
    submit_args, _ = mock_submit_task.call_args
    assert submit_args[4] == '把标题改成蓝色'


def test_single_page_refine_fallbacks_to_first_when_multiple_descriptions_returned(client, app):
    project_id, page_id = _create_project_with_page(app)
    mock_service = MagicMock()
    mock_service.refine_descriptions.return_value = ['第一条优化结果', '第二条优化结果']

    with patch('controllers.page_controller.get_ai_service', return_value=mock_service):
        response = client.post(
            f'/api/projects/{project_id}/pages/{page_id}/description/refine',
            json={
                'user_requirement': '把描述改得更商务',
                'current_description': '当前描述',
                'outline_content': {'title': '价格段分布', 'points': ['价格段', '见解']},
            },
        )

    data = assert_success_response(response)
    assert data['data']['refined_description'] == '第一条优化结果'
