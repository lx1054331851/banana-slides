import logging
from typing import Any

from services.prompts import (
    get_style_recommendations_prompt,
    get_style_recommendations_prompt_minimal,
)

logger = logging.getLogger(__name__)


def generate_style_recommendation_json(
    *,
    ai_service,
    project_dict: dict,
    reference_files_content: list[dict[str, str]] | None,
    template_json_text: str,
    style_requirements: str = "",
    language: str | None = None,
    thinking_budget: int = 0,
) -> Any:
    full_prompt = get_style_recommendations_prompt(
        project_dict=project_dict,
        reference_files_content=reference_files_content or [],
        template_json_text=template_json_text,
        style_requirements=style_requirements,
        language=language,
    )

    try:
        return ai_service.generate_json(full_prompt, thinking_budget=thinking_budget)
    except Exception as exc:
        minimal_prompt = get_style_recommendations_prompt_minimal(
            project_dict=project_dict,
            template_json_text=template_json_text,
            style_requirements=style_requirements,
            language=language,
        )
        logger.warning(
            "Style recommendation full prompt failed, retrying with minimal prompt: "
            "error=%s full_prompt_chars=%s minimal_prompt_chars=%s",
            exc,
            len(full_prompt),
            len(minimal_prompt),
        )
        return ai_service.generate_json(minimal_prompt, thinking_budget=thinking_budget)
