from unittest.mock import MagicMock

from services.ai_service import AIService, ProjectContext


def _build_service(response_text: str) -> AIService:
    text_provider = MagicMock()
    text_provider.generate_text.return_value = response_text
    return AIService(
        text_provider=text_provider,
        image_provider=MagicMock(),
        caption_provider=MagicMock(),
    )


def test_generate_page_description_returns_markdown_text_and_extra_fields():
    service = _build_service(
        "# 页面标题\n"
        "供应链协同提升运营效率\n\n"
        "## 核心结论\n"
        "- 先统一口径，再压缩协同损耗\n\n"
        "## 页面内容\n"
        "- 统一订单字段，减少反复确认\n"
        "- 建立跨部门节奏，缩短处理周期\n\n"
        "排版建议：上标题下双栏要点\n"
        "视觉建议：以桥梁连接两端信息孤岛，体现协同打通，整体风格克制理性，重点突出连接路径\n"
        "备注：处理周期为定性判断，暂不填精确数据\n"
    )
    ctx = ProjectContext({"creation_type": "idea", "idea_prompt": "示例主题"})

    result = service.generate_page_description(
        project_context=ctx,
        outline=[{"title": "供应链协同", "points": ["统一订单字段", "建立跨部门节奏"]}],
        page_outline={"title": "供应链协同", "points": ["统一订单字段", "建立跨部门节奏"]},
        page_index=1,
        language='zh',
    )

    assert "# 页面标题" in result["text"]
    assert "排版建议：" not in result["text"]
    assert result["extra_fields"]["排版建议"] == "上标题下双栏要点"
    assert "桥梁连接两端信息孤岛" in result["extra_fields"]["视觉建议"]
    assert result["extra_fields"]["备注"] == "处理周期为定性判断，暂不填精确数据"
