def test_prompt_templates_list_endpoint(client):
    """列表接口返回注册的提示词模板。"""
    response = client.get("/api/prompt-templates")
    data = response.get_json()
    assert response.status_code == 200
    assert data["success"] is True
    assert any(item["key"] == "image_generation" for item in data["data"]["templates"])


def test_prompt_template_update_endpoint(client):
    """更新接口保存并启用自定义提示词。"""
    response = client.put(
        "/api/prompt-templates/image_generation",
        json={"custom_content": "自定义图片提示词", "enabled": True},
    )
    item = response.get_json()["data"]
    assert response.status_code == 200
    assert item["custom_content"] == "自定义图片提示词"
    assert item["enabled"] is True


def test_prompt_template_rejects_empty_enabled_content(client):
    """启用覆盖时拒绝空自定义内容。"""
    response = client.put(
        "/api/prompt-templates/image_generation",
        json={"custom_content": "  ", "enabled": True},
    )
    assert response.status_code == 400


def test_prompt_template_reset_endpoint(client):
    """恢复默认接口清空覆盖并关闭启用状态。"""
    client.put(
        "/api/prompt-templates/image_generation",
        json={"custom_content": "自定义图片提示词", "enabled": True},
    )
    response = client.post("/api/prompt-templates/image_generation/reset")
    item = response.get_json()["data"]
    assert response.status_code == 200
    assert item["custom_content"] == ""
    assert item["enabled"] is False
