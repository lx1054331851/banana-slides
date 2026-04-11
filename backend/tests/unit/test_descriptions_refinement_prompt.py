import json
import importlib.util
from pathlib import Path

PROMPTS_PATH = Path(__file__).resolve().parents[2] / 'services' / 'prompts.py'
spec = importlib.util.spec_from_file_location('prompts_module_under_test_refine_desc', PROMPTS_PATH)
prompts = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(prompts)


class _DummyProjectContext:
    def __init__(self, creation_type: str):
        self.creation_type = creation_type
        self.idea_prompt = "测试需求"
        self.outline_text = ""
        self.description_text = ""
        self.reference_files_content = []


def test_refinement_prompt_uses_structured_json_mode_for_renovation():
    project_context = _DummyProjectContext(creation_type='ppt_renovation')
    slide = {
        "source_ref": "单页：数字化不是选择题",
        "type": "结尾页",
        "title": "把数字化做成经营升级引擎",
        "layout_suggestion": "pyramid_hierarchy",
        "content": {
            "headline_summary": "数字化是经营升级题",
            "detailed_items": [
                {"sub_title": "要点1", "body": "数字化不是选择题", "highlight_phrases": ["数字化", "经营升级"]},
            ],
        },
        "visual_suggestion": "三层金字塔",
        "note": "测试",
    }
    current_descriptions = [{
        "index": 0,
        "title": "结尾页",
        "description_content": {"text": json.dumps(slide, ensure_ascii=False)},
    }]

    prompt = prompts.get_descriptions_refinement_prompt(
        current_descriptions=current_descriptions,
        user_requirement="这是结尾页，需要精简、slogan、总结",
        project_context=project_context,
        outline=[{"title": "结尾页", "points": ["总结"]}],
        previous_requirements=[],
        language='zh',
    )

    assert "你是“PPT 页面 JSON 优化器”" in prompt
    assert "结尾页强化规则" in prompt
    assert "数组长度必须等于输入页面数（1）" in prompt
    assert "current_slide" in prompt


def test_refinement_prompt_keeps_legacy_mode_for_non_renovation():
    project_context = _DummyProjectContext(creation_type='idea')
    current_descriptions = [{
        "index": 0,
        "title": "普通页",
        "description_content": {"text": "页面标题：普通页\n页面文字：\n- 要点A"},
    }]

    prompt = prompts.get_descriptions_refinement_prompt(
        current_descriptions=current_descriptions,
        user_requirement="精简一点",
        project_context=project_context,
        outline=[{"title": "普通页", "points": ["要点A"]}],
        previous_requirements=[],
        language='zh',
    )

    assert "You are a helpful assistant that modifies PPT page descriptions based on user requirements." in prompt
    assert "你是“PPT 页面 JSON 优化器”" not in prompt
