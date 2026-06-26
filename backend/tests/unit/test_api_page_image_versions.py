"""页面图片历史版本删除与恢复接口测试。"""

from conftest import assert_success_response


def _create_page_with_versions(project_id: str):
    from models import Page, PageImageVersion, db

    page = Page(
        project_id=project_id,
        order_index=0,
        status='COMPLETED',
        generated_image_path=f'{project_id}/pages/page_v2.png',
        cached_image_path=f'{project_id}/pages/page_v2_thumb.jpg',
    )
    page.set_outline_content({'title': '测试页', 'points': ['要点']})
    db.session.add(page)
    db.session.flush()

    v1 = PageImageVersion(
        page_id=page.id,
        image_path=f'{project_id}/pages/page_v1.png',
        version_number=1,
        is_current=False,
        operation_type='generate',
    )
    v2 = PageImageVersion(
        page_id=page.id,
        image_path=f'{project_id}/pages/page_v2.png',
        version_number=2,
        is_current=True,
        operation_type='edit',
    )
    db.session.add_all([v1, v2])
    db.session.commit()
    return page, v1, v2


def test_delete_current_image_version_switches_to_latest_active_version(client, sample_project):
    project_id = sample_project['project_id']

    from models import db

    page, v1, v2 = _create_page_with_versions(project_id)

    response = client.delete(
        f'/api/projects/{project_id}/pages/{page.id}/image-versions/{v2.id}'
    )

    data = assert_success_response(response)
    versions = {item['version_id']: item for item in data['data']['image_versions']}

    assert versions[v2.id]['is_deleted'] is True
    assert versions[v2.id]['is_current'] is False
    assert versions[v1.id]['is_current'] is True

    db.session.refresh(page)
    db.session.refresh(v1)
    db.session.refresh(v2)
    assert page.generated_image_path == v1.image_path
    assert v1.is_current is True
    assert v2.is_deleted is True


def test_restore_deleted_image_version_sets_it_back_to_current(client, sample_project):
    project_id = sample_project['project_id']

    from models import db

    page, v1, v2 = _create_page_with_versions(project_id)
    v1.is_deleted = True
    db.session.commit()

    response = client.post(
        f'/api/projects/{project_id}/pages/{page.id}/image-versions/{v1.id}/restore'
    )

    data = assert_success_response(response)
    versions = {item['version_id']: item for item in data['data']['image_versions']}

    assert versions[v1.id]['is_deleted'] is False
    assert versions[v1.id]['is_current'] is True
    assert versions[v2.id]['is_current'] is False

    db.session.refresh(v1)
    db.session.refresh(v2)
    db.session.refresh(page)
    assert v1.is_current is True
    assert v1.is_deleted is False
    assert page.generated_image_path == v1.image_path


def test_delete_last_active_image_version_clears_page_image(client, sample_project):
    project_id = sample_project['project_id']

    from models import Page, PageImageVersion, db

    page = Page(
        project_id=project_id,
        order_index=0,
        status='COMPLETED',
        generated_image_path=f'{project_id}/pages/page_v1.png',
        cached_image_path=f'{project_id}/pages/page_v1_thumb.jpg',
    )
    page.set_outline_content({'title': '测试页', 'points': ['要点']})
    page.set_description_content({'text': '已有描述'})
    db.session.add(page)
    db.session.flush()

    version = PageImageVersion(
        page_id=page.id,
        image_path=f'{project_id}/pages/page_v1.png',
        version_number=1,
        is_current=True,
        operation_type='generate',
    )
    db.session.add(version)
    db.session.commit()

    response = client.delete(
        f'/api/projects/{project_id}/pages/{page.id}/image-versions/{version.id}'
    )

    data = assert_success_response(response)
    only_version = data['data']['image_versions'][0]

    assert only_version['is_deleted'] is True
    assert only_version['is_current'] is False

    db.session.refresh(page)
    assert page.generated_image_path is None
    assert page.cached_image_path is None
    assert page.status == 'DESCRIPTION_GENERATED'
