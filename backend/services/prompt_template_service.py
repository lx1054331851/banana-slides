"""Prompt template registry and override resolution."""
from dataclasses import dataclass
from typing import Dict, Iterable

from models import PromptTemplate, db


@dataclass(frozen=True)
class PromptTemplateDefinition:
    """Describe one editable prompt stage exposed in the manager."""
    key: str
    mode: str
    stage: str
    title: str
    description: str


_DEFINITIONS: Iterable[PromptTemplateDefinition] = (
    PromptTemplateDefinition('outline_generation', 'outline', 'generate', '大纲生成', '从一句话构想生成结构化 PPT 大纲。'),
    PromptTemplateDefinition('outline_generation_markdown', 'outline', 'stream', '大纲流式生成', '以 Markdown 流式生成 PPT 大纲。'),
    PromptTemplateDefinition('outline_parsing', 'outline', 'parse', '大纲解析', '将用户粘贴的大纲解析为结构化页面。'),
    PromptTemplateDefinition('outline_parsing_markdown', 'outline', 'parse_stream', '大纲流式解析', '以 Markdown 流式解析用户大纲。'),
    PromptTemplateDefinition('description_to_outline', 'description', 'parse_outline', '描述转大纲', '从完整页面描述中抽取 PPT 大纲。'),
    PromptTemplateDefinition('description_to_outline_markdown', 'description', 'parse_outline_stream', '描述转大纲流式', '以 Markdown 流式从描述生成大纲。'),
    PromptTemplateDefinition('outline_refinement', 'outline', 'refine', '大纲润色', '根据用户要求修改现有大纲。'),
    PromptTemplateDefinition('page_description_json', 'description', 'page_json', '单页描述 JSON', '从单页大纲生成结构化页面描述。'),
    PromptTemplateDefinition('all_descriptions_stream', 'description', 'stream', '全量描述流式', '一次性流式生成全部页面描述。'),
    PromptTemplateDefinition('description_split', 'description', 'split', '描述拆分', '将长描述拆分为逐页描述。'),
    PromptTemplateDefinition('descriptions_refinement', 'description', 'refine', '描述润色', '根据用户要求修改页面描述。'),
    PromptTemplateDefinition('image_generation', 'image', 'generate', '图片生成', '根据页面描述、大纲和素材字段生成图片提示词。'),
    PromptTemplateDefinition('image_edit', 'image', 'edit', '图片编辑', '根据自然语言要求编辑当前页面图片。'),
    PromptTemplateDefinition('long_report_split', 'description', 'split_report', '长文拆分', '将长文档拆分为演示文稿页面描述。'),
)

PROMPT_TEMPLATE_DEFINITIONS: Dict[str, PromptTemplateDefinition] = {
    definition.key: definition for definition in _DEFINITIONS
}


def _get_definition(key: str) -> PromptTemplateDefinition:
    """Return a registered prompt definition or raise KeyError."""
    if key not in PROMPT_TEMPLATE_DEFINITIONS:
        raise KeyError(f"Unknown prompt template key: {key}")
    return PROMPT_TEMPLATE_DEFINITIONS[key]


def _get_or_create_template(key: str, default_content: str = '') -> PromptTemplate:
    """Fetch or create the database row for a registered prompt template."""
    definition = _get_definition(key)
    template = PromptTemplate.query.filter_by(key=key).first()
    if template is None:
        template = PromptTemplate(
            key=definition.key,
            mode=definition.mode,
            stage=definition.stage,
            title=definition.title,
            description=definition.description,
            default_content=default_content or '',
            custom_content='',
            enabled=False,
        )
        db.session.add(template)
        db.session.flush()
    else:
        template.mode = definition.mode
        template.stage = definition.stage
        template.title = definition.title
        template.description = definition.description
        if default_content is not None:
            template.default_content = default_content or ''
    return template


def sync_prompt_templates() -> None:
    """Ensure every registered prompt has a database row."""
    for key in PROMPT_TEMPLATE_DEFINITIONS:
        _get_or_create_template(key)
    registered_keys = list(PROMPT_TEMPLATE_DEFINITIONS.keys())
    stale_templates = PromptTemplate.query.filter(
        PromptTemplate.key.notin_(registered_keys)
    ).all()
    for template in stale_templates:
        db.session.delete(template)
    db.session.commit()


def list_prompt_templates():
    """List registered prompt templates with database override state."""
    sync_prompt_templates()
    templates = PromptTemplate.query.order_by(
        PromptTemplate.mode.asc(),
        PromptTemplate.stage.asc(),
        PromptTemplate.key.asc(),
    ).all()
    return [template.to_dict() for template in templates]


def get_prompt_template(key: str):
    """Return one prompt template as a serialized dict."""
    _get_definition(key)
    template = _get_or_create_template(key)
    db.session.commit()
    return template.to_dict()


def get_effective_prompt(key: str, default_content: str) -> str:
    """Return the active prompt text for a key and rendered default content."""
    template = _get_or_create_template(key, default_content)
    db.session.commit()
    custom = template.custom_content or ''
    if template.enabled and custom.strip():
        return custom
    return default_content


def resolve_prompt_template(key: str, default_content: str) -> str:
    """Resolve a prompt template, falling back safely outside app contexts."""
    try:
        return get_effective_prompt(key, default_content)
    except Exception:
        return default_content


def save_prompt_template(key: str, custom_content: str, enabled: bool):
    """Persist a custom prompt override and enabled state."""
    if enabled and not (custom_content or '').strip():
        raise ValueError("custom_content is required when enabled is true")
    template = _get_or_create_template(key)
    template.custom_content = custom_content or ''
    template.enabled = bool(enabled)
    db.session.commit()
    return template.to_dict()


def reset_prompt_template(key: str):
    """Clear a custom prompt override and disable it."""
    template = _get_or_create_template(key)
    template.custom_content = ''
    template.enabled = False
    db.session.commit()
    return template.to_dict()
