"""
项目管理API单元测试
"""

import pytest
from unittest.mock import patch
from conftest import assert_success_response, assert_error_response


class TestProjectCreate:
    """项目创建测试"""
    
    def test_create_project_idea_mode(self, client):
        """测试从想法创建项目"""
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '生成一份关于AI的PPT'
        })
        
        data = assert_success_response(response, 201)
        assert 'project_id' in data['data']
        assert data['data']['status'] == 'DRAFT'
    
    def test_create_project_outline_mode(self, client):
        """测试从大纲创建项目"""
        response = client.post('/api/projects', json={
            'creation_type': 'outline',
            'outline': [
                {'title': '第一页', 'points': ['要点1']},
                {'title': '第二页', 'points': ['要点2']}
            ]
        })
        
        data = assert_success_response(response, 201)
        assert 'project_id' in data['data']
    
    def test_create_project_missing_type(self, client):
        """测试缺少creation_type参数"""
        response = client.post('/api/projects', json={
            'idea_prompt': '测试'
        })
        
        # 应该返回错误
        assert response.status_code in [400, 422]
    
    def test_create_project_invalid_type(self, client):
        """测试无效的creation_type"""
        response = client.post('/api/projects', json={
            'creation_type': 'invalid_type',
            'idea_prompt': '测试'
        })
        
        assert response.status_code in [400, 422]


class TestProjectGet:
    """项目获取测试"""
    
    def test_get_project_success(self, client, sample_project):
        """测试获取项目成功"""
        if not sample_project:
            pytest.skip("项目创建失败")
        
        project_id = sample_project['project_id']
        response = client.get(f'/api/projects/{project_id}')
        
        data = assert_success_response(response)
        assert data['data']['project_id'] == project_id
    
    def test_get_project_not_found(self, client):
        """测试获取不存在的项目"""
        response = client.get('/api/projects/non-existent-id')
        
        assert response.status_code == 404
    
    def test_get_project_invalid_id_format(self, client):
        """测试无效的项目ID格式"""
        response = client.get('/api/projects/invalid!@#$%id')
        
        # 可能返回404或400
        assert response.status_code in [400, 404]

    def test_get_project_recovers_stale_generating_pages(self, client, sample_project):
        """测试获取项目时会恢复服务重启后卡住的生成状态"""
        if not sample_project:
            pytest.skip("项目创建失败")

        project_id = sample_project['project_id']

        from models import db, Page, Task, Project

        project = Project.query.get(project_id)
        assert project is not None

        page = Page(
            project_id=project_id,
            order_index=0,
            status='GENERATING',
        )
        page.set_outline_content({'title': '测试页', 'points': ['要点']})
        page.set_description_content({'text': '描述'})
        db.session.add(page)

        task = Task(
            project_id=project_id,
            task_type='GENERATE_IMAGES',
            status='PROCESSING',
        )
        db.session.add(task)
        db.session.commit()

        # 模拟服务重启：任务在数据库中是处理中，但进程内无活跃任务
        with patch('controllers.project_controller.task_manager.is_task_active', return_value=False):
            response = client.get(f'/api/projects/{project_id}')

        data = assert_success_response(response)
        pages = data['data'].get('pages') or []
        assert len(pages) == 1
        assert pages[0]['status'] == 'FAILED'

        refreshed_task = Task.query.get(task.id)
        assert refreshed_task is not None
        assert refreshed_task.status == 'FAILED'

    def test_get_project_keeps_generating_when_task_active(self, client, sample_project):
        """测试任务仍活跃时，不应错误恢复页面状态"""
        if not sample_project:
            pytest.skip("项目创建失败")

        project_id = sample_project['project_id']

        from models import db, Page, Task, Project

        project = Project.query.get(project_id)
        assert project is not None

        page = Page(
            project_id=project_id,
            order_index=0,
            status='GENERATING',
        )
        page.set_outline_content({'title': '测试页', 'points': ['要点']})
        page.set_description_content({'text': '描述'})
        db.session.add(page)

        task = Task(
            project_id=project_id,
            task_type='GENERATE_IMAGES',
            status='PROCESSING',
        )
        db.session.add(task)
        db.session.commit()

        with patch('controllers.project_controller.task_manager.is_task_active', return_value=True):
            response = client.get(f'/api/projects/{project_id}')

        data = assert_success_response(response)
        pages = data['data'].get('pages') or []
        assert len(pages) == 1
        assert pages[0]['status'] == 'GENERATING'

        refreshed_task = Task.query.get(task.id)
        assert refreshed_task is not None
        assert refreshed_task.status == 'PROCESSING'

    def test_get_project_recovers_generating_with_image_to_completed(self, client, sample_project):
        """测试卡住状态下，已有图片的页面恢复为 COMPLETED"""
        if not sample_project:
            pytest.skip("项目创建失败")

        project_id = sample_project['project_id']

        from models import db, Page, Task, Project

        project = Project.query.get(project_id)
        assert project is not None

        page = Page(
            project_id=project_id,
            order_index=0,
            status='GENERATING',
            generated_image_path=f'uploads/generated/{project_id}/p1.png',
            cached_image_path=f'uploads/generated/{project_id}/p1_cached.jpg',
        )
        page.set_outline_content({'title': '测试页', 'points': ['要点']})
        page.set_description_content({'text': '描述'})
        db.session.add(page)

        task = Task(
            project_id=project_id,
            task_type='GENERATE_IMAGES',
            status='PROCESSING',
        )
        db.session.add(task)
        db.session.commit()

        with patch('controllers.project_controller.task_manager.is_task_active', return_value=False):
            response = client.get(f'/api/projects/{project_id}')

        data = assert_success_response(response)
        pages = data['data'].get('pages') or []
        assert len(pages) == 1
        assert pages[0]['status'] == 'COMPLETED'

        refreshed_task = Task.query.get(task.id)
        assert refreshed_task is not None
        assert refreshed_task.status == 'FAILED'


class TestProjectUpdate:
    """项目更新测试"""
    
    def test_update_project_status(self, client, sample_project):
        """测试更新项目状态"""
        if not sample_project:
            pytest.skip("项目创建失败")
        
        project_id = sample_project['project_id']
        response = client.put(f'/api/projects/{project_id}', json={
            'status': 'GENERATING'
        })
        
        # 状态更新应该成功
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is True


class TestProjectDelete:
    """项目删除测试"""
    
    def test_delete_project_success(self, client, sample_project):
        """测试删除项目成功"""
        if not sample_project:
            pytest.skip("项目创建失败")
        
        project_id = sample_project['project_id']
        response = client.delete(f'/api/projects/{project_id}')
        
        data = assert_success_response(response)
        
        # 确认项目已删除
        get_response = client.get(f'/api/projects/{project_id}')
        assert get_response.status_code == 404
    
    def test_delete_project_not_found(self, client):
        """测试删除不存在的项目"""
        response = client.delete('/api/projects/non-existent-id')
        
        assert response.status_code == 404



class TestGlobalStyleRecommendationWorkflow:
    """全局 JSON 模版风格推荐链路测试"""

    @patch('controllers.project_controller.task_manager.submit_task')
    @patch('controllers.project_controller.resolve_routing_bundle')
    def test_start_global_style_recommendations(self, mock_resolve_routing_bundle, mock_submit_task, client):
        mock_resolve_routing_bundle.return_value = object()

        response = client.post('/api/projects/global/style/recommendations', json={
            'template_json': '{"layout":"minimal"}',
            'style_requirements': '科技发布会',
            'generate_previews': True,
        })

        data = assert_success_response(response, 202)
        assert data['data']['status'] == 'PROCESSING'
        assert data['data']['task_id']
        mock_resolve_routing_bundle.assert_called_once()
        mock_submit_task.assert_called_once()

    @patch('controllers.project_controller.task_manager.submit_task')
    @patch('controllers.project_controller.resolve_routing_bundle')
    def test_regenerate_global_style_previews(self, mock_resolve_routing_bundle, mock_submit_task, client):
        mock_resolve_routing_bundle.return_value = object()

        response = client.post('/api/projects/global/style/recommendations/rec-1/previews', json={
            'style_json': {'palette': 'orange'},
            'sample_pages': {
                'cover': '封面',
                'toc': '目录',
                'detail': '详情',
                'ending': '结尾',
            }
        })

        data = assert_success_response(response, 202)
        assert data['data']['status'] == 'PROCESSING'
        assert data['data']['task_id']
        mock_resolve_routing_bundle.assert_called_once()
        mock_submit_task.assert_called_once()
