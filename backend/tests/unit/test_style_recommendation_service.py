from services.style_recommendation_service import generate_style_recommendation_json


class _FakeAIService:
    def __init__(self):
        self.calls = []

    def generate_json_stream(self, prompt, thinking_budget=0):
        self.calls.append((prompt, thinking_budget))
        if len(self.calls) == 1:
            raise RuntimeError("upstream timeout")
        return {"recommendations": [{"name": "ok", "style_json": {}, "sample_pages": {}}]}


def test_generate_style_recommendation_json_falls_back_to_minimal_prompt():
    ai_service = _FakeAIService()

    result = generate_style_recommendation_json(
        ai_service=ai_service,
        project_dict={
            "idea_prompt": "A" * 3000,
            "outline_text": "B" * 3000,
            "description_text": "C" * 3000,
        },
        reference_files_content=[{"filename": "a.md", "content": "X" * 4000}],
        template_json_text='{"layout":"minimal"}' * 300,
        style_requirements="科技蓝",
        language="zh",
        thinking_budget=0,
    )

    assert result["recommendations"][0]["name"] == "ok"
    assert len(ai_service.calls) == 2
    assert len(ai_service.calls[1][0]) < len(ai_service.calls[0][0])


def test_generate_style_recommendation_json_respects_single_recommendation_prompt():
    class _ImmediateAIService:
        def __init__(self):
            self.prompt = None

        def generate_json_stream(self, prompt, thinking_budget=0):
            self.prompt = prompt
            return {"recommendations": [{"name": "single", "style_json": {}, "sample_pages": {}}]}

    ai_service = _ImmediateAIService()
    generate_style_recommendation_json(
        ai_service=ai_service,
        project_dict={},
        reference_files_content=[],
        template_json_text='{"layout":"minimal"}',
        style_requirements="科技蓝",
        language="zh",
        recommendation_count=1,
        thinking_budget=0,
    )

    assert ai_service.prompt is not None
    assert "recommendations 必须刚好 1 个" in ai_service.prompt
