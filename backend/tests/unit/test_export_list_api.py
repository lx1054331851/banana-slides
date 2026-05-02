"""
导出文件列表 API 回归测试。
"""

import os

from conftest import assert_success_response


def test_list_exports_returns_files(client, sample_project, app):
    """测试列出项目 exports 目录下已生成的导出文件。"""
    project_id = sample_project["project_id"]
    exports_dir = os.path.join(app.config["UPLOAD_FOLDER"], project_id, "exports")
    os.makedirs(exports_dir, exist_ok=True)
    output_path = os.path.join(exports_dir, "demo.pptx")
    with open(output_path, "wb") as f:
        f.write(b"pptx")

    response = client.get(f"/api/projects/{project_id}/exports")

    data = assert_success_response(response)
    files = data["data"]["files"]
    assert len(files) == 1
    assert files[0]["filename"] == "demo.pptx"
    assert files[0]["type"] == "pptx"
    assert files[0]["size"] == 4
    assert files[0]["modified_at"]
    assert files[0]["download_url"] == f"/files/{project_id}/exports/demo.pptx"
