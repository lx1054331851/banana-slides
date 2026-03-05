import json
from unittest.mock import MagicMock

from services.ai_service import AIService, ProjectContext


def _build_service() -> AIService:
    return AIService(
        text_provider=MagicMock(),
        image_provider=MagicMock(),
        caption_provider=MagicMock(),
    )


def test_passthrough_uses_raw_slide_json():
    service = _build_service()
    slides = [
        {
            "id": 1,
            "type": "cover",
            "title": "封面",
            "content": {"headline": "主标题", "sub_headline": "副标题"},
        },
        {
            "id": 2,
            "type": "detail_text_split",
            "title": "详情",
            "content": {
                "headline_summary": "核心观点",
                "detailed_items": [{"sub_title": "要点", "body": "正文"}],
            },
            "note": "备注信息",
        },
    ]
    payload = {"meta": {"report_title": "测试报告"}, "slides": slides}
    ctx = ProjectContext({"creation_type": "descriptions", "description_text": json.dumps(payload, ensure_ascii=False)})

    descriptions = service.parse_description_to_page_descriptions(ctx, outline=[])

    assert len(descriptions) == 2
    assert json.loads(descriptions[0]) == slides[0]
    assert json.loads(descriptions[1]) == slides[1]


def test_passthrough_preserves_order():
    service = _build_service()
    slides = [
        {"id": 10, "type": "detail_chart", "title": "第二页", "content": {"chart_data": {"labels": ["A"], "datasets": []}}},
        {"id": 3, "type": "catalog", "title": "第一页", "content": {"sections": ["S1"]}},
    ]
    ctx = ProjectContext({"creation_type": "descriptions", "description_text": json.dumps({"slides": slides}, ensure_ascii=False)})

    descriptions = service.parse_description_to_page_descriptions(ctx, outline=[])

    assert json.loads(descriptions[0])["id"] == 10
    assert json.loads(descriptions[1])["id"] == 3


def test_passthrough_does_not_call_model_split():
    service = _build_service()
    service.generate_json = MagicMock(side_effect=AssertionError("generate_json should not be called for structured slides"))
    slides = [
        {"id": 1, "type": "cover", "title": "封面", "content": {"headline": "主标题"}}
    ]
    ctx = ProjectContext({"creation_type": "descriptions", "description_text": json.dumps({"slides": slides}, ensure_ascii=False)})

    descriptions = service.parse_description_to_page_descriptions(ctx, outline=[])

    assert len(descriptions) == 1
    assert service.generate_json.call_count == 0


def test_fallback_still_works_for_plain_text():
    service = _build_service()
    service.generate_json = MagicMock(return_value=["desc page 1", "desc page 2"])
    plain_text = "这是普通描述文本，不是结构化 JSON。"
    ctx = ProjectContext({"creation_type": "descriptions", "description_text": plain_text})
    outline = [{"title": "P1", "points": []}, {"title": "P2", "points": []}]

    descriptions = service.parse_description_to_page_descriptions(ctx, outline=outline)

    assert descriptions == ["desc page 1", "desc page 2"]
    service.generate_json.assert_called_once()
    _, kwargs = service.generate_json.call_args
    assert kwargs.get("thinking_budget") == 1000
