from services.prompt_template_service import (
    PROMPT_TEMPLATE_DEFINITIONS,
    get_effective_prompt,
    list_prompt_templates,
    reset_prompt_template,
    save_prompt_template,
)


def test_effective_prompt_returns_default_without_override(client):
    """未配置覆盖时返回本次渲染出的默认提示词。"""
    prompt = get_effective_prompt("image_generation", "默认图片提示词")
    assert prompt == "默认图片提示词"


def test_enabled_override_replaces_default_prompt(client):
    """启用自定义覆盖后，有效提示词使用自定义内容。"""
    save_prompt_template("image_generation", "自定义图片提示词", True)
    prompt = get_effective_prompt("image_generation", "默认图片提示词")
    assert prompt == "自定义图片提示词"


def test_disabled_override_is_kept_but_not_used(client):
    """关闭覆盖时保留草稿内容，但运行时回退默认提示词。"""
    save_prompt_template("image_generation", "暂存图片提示词", False)
    prompt = get_effective_prompt("image_generation", "默认图片提示词")
    item = next(t for t in list_prompt_templates() if t["key"] == "image_generation")
    assert prompt == "默认图片提示词"
    assert item["custom_content"] == "暂存图片提示词"
    assert item["enabled"] is False


def test_reset_prompt_template_clears_custom_content(client):
    """恢复默认会清空自定义内容并关闭覆盖。"""
    save_prompt_template("image_generation", "自定义图片提示词", True)
    reset = reset_prompt_template("image_generation")
    prompt = get_effective_prompt("image_generation", "默认图片提示词")
    assert reset["custom_content"] == ""
    assert reset["enabled"] is False
    assert prompt == "默认图片提示词"


def test_registered_prompt_templates_are_listed(client):
    """清单接口包含所有注册提示词定义。"""
    templates = list_prompt_templates()
    keys = {item["key"] for item in templates}
    assert set(PROMPT_TEMPLATE_DEFINITIONS) <= keys


def test_image_generation_prompt_uses_enabled_override(client):
    """图片生成提示词函数使用启用中的数据库覆盖。"""
    from services.prompts import get_image_generation_prompt

    save_prompt_template("image_generation", "自定义图片提示词", True)
    prompt = get_image_generation_prompt(
        page_desc="页面描述",
        outline_text="完整大纲",
        current_section="第一部分",
        aspect_ratio="16:9",
        page_index=1,
    )
    assert prompt == "自定义图片提示词"
