from unittest.mock import MagicMock, patch

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