import importlib.util
from pathlib import Path


PROMPTS_PATH = Path(__file__).resolve().parents[2] / 'services' / 'prompts.py'
spec = importlib.util.spec_from_file_location('prompts_module_under_test', PROMPTS_PATH)
prompts = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(prompts)


def test_style_recommendation_prompt_can_be_slimmed():
    project_dict = {
        'creation_type': 'description',
        'idea_prompt': 'A' * 3000,
        'outline_text': 'B' * 6000,
        'description_text': 'C' * 6000,
    }
    reference_files = [{'filename': 'a.md', 'content': 'X' * 8000}]
    template_json = '{"layout":"minimal"}' * 200

    full_prompt = prompts.get_style_recommendations_prompt(
        project_dict=project_dict,
        reference_files_content=reference_files,
        template_json_text=template_json,
        style_requirements='科技蓝',
        language='zh',
    )
    slim_prompt = prompts.get_style_recommendations_prompt(
        project_dict=project_dict,
        reference_files_content=[],
        template_json_text=template_json,
        style_requirements='科技蓝',
        language='zh',
        max_total_file_chars=0,
        max_file_chars=0,
        max_idea_chars=1500,
        max_outline_chars=3000,
        max_description_chars=3000,
        max_template_chars=12000,
    )
    minimal_prompt = prompts.get_style_recommendations_prompt_minimal(
        project_dict=project_dict,
        template_json_text=template_json,
        style_requirements='科技蓝',
        language='zh',
        max_context_chars=2500,
        max_template_chars=6000,
    )

    assert '<uploaded_files>' in full_prompt
    assert '<uploaded_files>' not in slim_prompt
    assert len(slim_prompt) < len(full_prompt)
    assert len(minimal_prompt) < len(slim_prompt)
    assert 'style_json": {{ /*' not in minimal_prompt


def test_style_recommendation_prompt_truncates_large_template_json():
    template_json = '{"k":"v"}' * 5000
    prompt = prompts.get_style_recommendations_prompt(
        project_dict={},
        reference_files_content=[],
        template_json_text=template_json,
        max_template_chars=100,
    )
    minimal = prompts.get_style_recommendations_prompt_minimal(
        project_dict={},
        template_json_text=template_json,
        max_template_chars=100,
    )

    assert '...(内容过长，已截断' in prompt
    assert '...(内容过长，已截断' in minimal
