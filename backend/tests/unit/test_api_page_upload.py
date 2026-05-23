"""页面图片上传接口测试。"""

import io

from PIL import Image

from conftest import assert_success_response


def _make_jpeg_bytes(color: str = "red") -> io.BytesIO:
    """构造一个内存中的 JPEG 文件用于上传测试。"""
    image = Image.new("RGB", (1600, 900), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    buffer.seek(0)
    return buffer


def test_upload_page_image_keeps_jpeg_for_photo_like_inputs(client, sample_project):
    """上传 JPEG 时应保留高效的有损格式，避免被强制转成 PNG。"""
    project_id = sample_project["project_id"]

    from models import Page, db

    page = Page(project_id=project_id, order_index=0, status="DRAFT")
    page.set_outline_content({"title": "封面", "points": ["要点"]})
    db.session.add(page)
    db.session.commit()

    response = client.post(
        f"/api/projects/{project_id}/pages/{page.id}/upload/image",
        data={"image": (_make_jpeg_bytes(), "photo.jpg")},
        content_type="multipart/form-data",
    )

    data = assert_success_response(response)
    payload = data["data"]

    assert payload["generated_image_url"].endswith(".jpeg")
    assert payload["preview_image_url"].endswith("_thumb.jpg")

    db.session.refresh(page)
    assert page.generated_image_path.endswith(".jpeg")
    assert page.cached_image_path.endswith("_thumb.jpg")
