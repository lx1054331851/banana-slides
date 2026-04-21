"""
AI Service Prompts - 集中管理所有 AI 服务的 prompt 模板

分区:
  1. 共享工具 & 常量    — 语言配置、格式化辅助、DRY 常量
  2. 大纲 Prompts       — 生成、解析、细化大纲
  3. 描述 Prompts       — 单页、流式、拆分、细化描述
  4. 图片生成 Prompts   — 文生图、图片编辑
  5. 图片处理 Prompts   — 背景提取、画质修复
  6. 内容提取 Prompts   — 文字属性、页面内容、排版分析、风格提取
"""
import json
import logging
import re
from textwrap import dedent
from typing import List, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from services.ai_service import ProjectContext

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. 共享工具 & 常量
# ═══════════════════════════════════════════════════════════════════════════════


# --- 常量 ---

LANGUAGE_CONFIG = {
    'zh': {
        'name': '中文',
        'instruction': '请使用全中文输出。',
        'ppt_text': 'PPT文字请使用全中文。'
    },
    'ja': {
        'name': '日本語',
        'instruction': 'すべて日本語で出力してください。',
        'ppt_text': 'PPTのテキストは全て日本語で出力してください。'
    },
    'en': {
        'name': 'English',
        'instruction': 'Please output all in English.',
        'ppt_text': 'Use English for PPT text.'
    },
    'auto': {
        'name': '自动',
        'instruction': '',
        'ppt_text': ''
    }
}

DETAIL_LEVEL_SPECS = {
    'concise': '文字极致地压缩和精简，每条要点用一个核心词语或数据代替，例如效率↑80%',
    'default': '清晰明了，每条要点控制在15-20字以内, 避免冗长的句子和复杂的表述',
    'detailed': '忠于原文的基础上做到内容详实，逻辑清晰。',
}

_OUTLINE_JSON_FORMAT = """\
1. Simple format (for short PPTs without major sections):
[{"title": "title1", "points": ["point1", "point2"]}, {"title": "title2", "points": ["point1", "point2"]}]

2. Part-based format (for longer PPTs with major sections):
[
    {
    "part": "Part 1: Introduction",
    "pages": [
        {"title": "Welcome", "points": ["point1", "point2"]},
        {"title": "Overview", "points": ["point1", "point2"]}
    ]
    },
    {
    "part": "Part 2: Main Content",
    "pages": [
        {"title": "Topic 1", "points": ["point1", "point2"]},
        {"title": "Topic 2", "points": ["point1", "point2"]}
    ]
    }
]"""

_PAGE_DETAIL_JSON_OUTPUT_FORMAT = """\
```json
{
  "outline": {
    "title": "动作标题",
    "points": ["要点1", "要点2", "要点3"]
  },
  "slide": {
    "type": "图文页",
    "title": "动作标题",
    "layout_suggestion": "多栏逻辑",
    "content": {
      "headline_summary": "20字内核心结论",
      "detailed_items": [
        {
          "sub_title": "分论点",
          "body": "先做订单字段识别与进度查询，再做跨系统问数，持续降低报表与对账工时。",
          "highlight_phrases": ["订单字段识别", "跨系统问数", "对账工时"]
        }
      ]
    },
    "visual_suggestion": "主体 + 隐喻 + 风格 + 重点",
    "note": "补充假设与边界"
  }
}
```
"""


# --- 辅助函数 ---

def _build_prompt(prompt_text: str, reference_files_content=None, *, tag: str = '') -> str:
    """Prepend reference files XML and log the final prompt."""
    files_xml = _format_reference_files_xml(reference_files_content)
    final = files_xml + prompt_text
    if tag:
        logger.debug(f"[{tag}] Final prompt:\n{final}")
    return final


def _get_original_input(project_context: 'ProjectContext') -> str:
    """Extract original user input from project context (shared across prompt builders)."""
    if project_context.creation_type == 'idea' and project_context.idea_prompt:
        return project_context.idea_prompt
    if project_context.creation_type == 'outline' and project_context.outline_text:
        return f"用户提供的大纲：\n{project_context.outline_text}"
    if project_context.creation_type == 'descriptions' and project_context.description_text:
        return f"用户提供的描述：\n{project_context.description_text}"
    return project_context.idea_prompt or ""


def _get_original_input_labeled(project_context: 'ProjectContext') -> str:
    """Build labeled original input section for refinement prompts."""
    text = "\n原始输入信息：\n"
    if project_context.creation_type == 'idea' and project_context.idea_prompt:
        text += f"- PPT构想：{project_context.idea_prompt}\n"
    elif project_context.creation_type == 'outline' and project_context.outline_text:
        text += f"- 用户提供的大纲文本：\n{project_context.outline_text}\n"
    elif project_context.creation_type == 'descriptions' and project_context.description_text:
        text += f"- 用户提供的页面描述文本：\n{project_context.description_text}\n"
    elif project_context.idea_prompt:
        text += f"- 用户输入：{project_context.idea_prompt}\n"
    return text


def _get_previous_requirements_text(previous_requirements: Optional[List[str]]) -> str:
    """Format previous modification history."""
    if not previous_requirements:
        return ""
    prev_list = "\n".join([f"- {req}" for req in previous_requirements])
    return f"\n\n之前用户提出的修改要求：\n{prev_list}\n"


def _format_extra_field_instructions(extra_fields: list | None) -> str:
    """将额外字段列表格式化为 prompt 中的输出要求。"""
    if not extra_fields:
        return ''
    parts = [f'{f}：[关于{f}的建议]' for f in extra_fields]
    return '\n'.join([''] + parts)  # 前导换行


def _format_reference_files_xml(reference_files_content: Optional[List[Dict[str, str]]]) -> str:
    """Format reference files content as XML structure."""
    if not reference_files_content:
        return ""
    xml_parts = ["<uploaded_files>"]
    for file_info in reference_files_content:
        filename = file_info.get('filename', 'unknown')
        content = file_info.get('content', '')
        xml_parts.append(f'  <file name="{filename}">')
        xml_parts.append('    <content>')
        xml_parts.append(content)
        xml_parts.append('    </content>')
        xml_parts.append('  </file>')
    xml_parts.append('</uploaded_files>')
    xml_parts.append('')  # Empty line after XML
    return '\n'.join(xml_parts)


def _get_page_detail_json_output_requirements() -> str:
    """返回“从大纲生成页面详情”所使用的标准化 JSON 输出要求文本。"""
    return dedent(f"""\
    # 输出格式（严格）
    {_PAGE_DETAIL_JSON_OUTPUT_FORMAT}

    # 硬约束
    - 只输出 JSON，不要 markdown 代码块，不要解释文字。
    - 顶层仅允许 `outline` 与 `slide` 两个键。
    - 所有字段尽量基于输入信息扩写，不臆造精确数据。
    - 不允许输出引用来源字段。
    - `visual_suggestion` 按需给出，用于解释抽象概念或增强情感共鸣；禁止平铺直叙的配图建议，优先使用视觉隐喻（如锁、迷雾晶体、桥梁、罗盘等意象）。
    - `visual_suggestion` 必须同时描述：画面主体、意境/隐喻意图、风格氛围、视觉重点；不能只写名词列表。
    - `highlight_phrases` 必须与对应正文严格对齐：图文页每个 `detailed_items[i].highlight_phrases[*]` 必须是该 `detailed_items[i].body` 的连续原文子串；图表页 `highlight_phrases[*]` 必须是 `key_takeaway` 的连续原文子串。
    - 禁止写入正文中未出现的概念同义词/泛化词（例如正文没有“订单跟踪”，就不能放进 `highlight_phrases`）。""")


def _try_extract_slide_like_json(text: str) -> Optional[Dict]:
    """尝试从文本中提取单页 slide JSON（兼容 ```json 包裹与数组/对象形式）。"""
    if not isinstance(text, str):
        return None

    raw = text.strip()
    if not raw:
        return None

    candidates = [raw]
    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw, re.IGNORECASE)
    if fenced_match:
        candidates.append(fenced_match.group(1).strip())

    first_obj = raw.find('{')
    last_obj = raw.rfind('}')
    if first_obj != -1 and last_obj != -1 and last_obj > first_obj:
        candidates.append(raw[first_obj:last_obj + 1])

    first_arr = raw.find('[')
    last_arr = raw.rfind(']')
    if first_arr != -1 and last_arr != -1 and last_arr > first_arr:
        candidates.append(raw[first_arr:last_arr + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue

        if isinstance(parsed, dict):
            slide_obj = parsed.get('slide') if isinstance(parsed.get('slide'), dict) else parsed
            if slide_obj.get('type') and isinstance(slide_obj.get('content'), dict):
                return slide_obj

        if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
            first = parsed[0]
            if first.get('type') and isinstance(first.get('content'), dict):
                return first

    return None


def _format_requirements(requirements: str, context: str = "outline") -> str:
    """格式化用户提供的生成要求，返回可直接拼接到 prompt 中的文本段。

    context: "outline" 或 "description"，用于生成对应的结构标记示例。
    """
    if requirements and requirements.strip():
        if context == "description":
            marker_example = (
                "For example, if the user asks to avoid certain symbols, "
                "do NOT use them in the page content, but still use structural markers "
                "like '页面文字：', '图片素材：', and '<!-- PAGE_END -->' as-is."
            )
        else:
            marker_example = (
                "For example, if the user asks to avoid '#' symbols, "
                "do NOT use '#' in the page content, but still use '## Title' as "
                "the structural heading delimiter between pages."
            )
        return (
            "<user_requirements>\n"
            f"{requirements.strip()}\n"
            "</user_requirements>\n"
            "Note: The requirements above apply to the generated content of each page and "
            "take precedence over other content-related instructions. The required output format "
            f"and structural markers must still be used as-is. {marker_example}\n\n"
        )
    return ""


def get_default_output_language() -> str:
    """获取环境变量中配置的默认输出语言"""
    from config import Config
    return getattr(Config, 'OUTPUT_LANGUAGE', 'zh')


def get_language_instruction(language: str = None) -> str:
    """获取语言限制指令文本"""
    lang = language if language else get_default_output_language()
    config = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG['zh'])
    return config['instruction']


def get_ppt_language_instruction(language: str = None) -> str:
    """获取PPT文字语言限制指令"""
    lang = language if language else get_default_output_language()
    config = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG['zh'])
    return config['ppt_text']


# ═══════════════════════════════════════════════════════════════════════════════
# 2. 大纲 Prompts — 生成、解析、细化大纲
# ═══════════════════════════════════════════════════════════════════════════════


def get_outline_generation_prompt(project_context: 'ProjectContext', language: str = None) -> str:
    """生成 PPT 大纲的 prompt（JSON 输出）"""
    idea_prompt = project_context.idea_prompt or ""

    prompt = (f"""\
You are a helpful assistant that generates an outline for a ppt.

You can organize the content in two ways:

{_OUTLINE_JSON_FORMAT}

Choose the format that best fits the content. Use parts when the PPT has clear major sections.
Unless otherwise specified, the first page should be kept simplest, containing only the title, subtitle, and presenter information.

The user's request: {idea_prompt}.
{_format_requirements(project_context.outline_requirements)}Now generate the outline, don't include any other text.
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_generation_prompt')


def get_outline_generation_prompt_markdown(project_context: 'ProjectContext', language: str = None) -> str:
    """生成 PPT 大纲的 prompt（Markdown 输出，用于流式生成）"""
    idea_prompt = project_context.idea_prompt or ""

    prompt = (f"""\
You are a helpful assistant that generates an outline for a ppt.

You can organize the content in two ways:

1. Simple format (for short PPTs without major sections):
## title1
- point1
- point2

## title2
- point1
- point2

2. Part-based format (for longer PPTs with major sections):
# Part 1: Introduction
## Welcome
- point1
- point2

## Overview
- point1
- point2

# Part 2: Main Content
## Topic 1
- point1
- point2

## Topic 2
- point1
- point2

Constraints:
- Title should not contain page number.
- Choose the format that best fits the content. Use parts when the PPT has clear major sections.
- Unless otherwise specified, the first page should be kept simplest, containing only the title, subtitle, and presenter information.

The user's request: {idea_prompt}.
{_format_requirements(project_context.outline_requirements)}Now generate the outline, strictly follow the format provided above, don't include any other text. Output `<!-- END -->` on the last line when finished.
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_generation_prompt_markdown')


def get_outline_parsing_prompt(project_context: 'ProjectContext', language: str = None) -> str:
    """解析用户提供的大纲文本的 prompt（JSON 输出）"""
    outline_text = project_context.outline_text or ""

    prompt = (f"""\
You are a helpful assistant that parses a user-provided PPT outline text into a structured format.

The user has provided the following outline text:

{outline_text}

Your task is to analyze this text and convert it into a structured JSON format WITHOUT modifying any of the original text content.
You should only reorganize and structure the existing content, preserving all titles, points, and text exactly as provided.

You can organize the content in two ways:

{_OUTLINE_JSON_FORMAT}

Important rules:
- DO NOT modify, rewrite, or change any text from the original outline
- DO NOT add new content that wasn't in the original text
- DO NOT remove any content from the original text
- Only reorganize the existing content into the structured format
- Preserve all titles, bullet points, and text exactly as they appear
- If the text has clear sections/parts, use the part-based format
- Extract titles and points from the original text, keeping them exactly as written

Now parse the outline text above into the structured format. Return only the JSON, don't include any other text.
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_parsing_prompt')


def get_outline_parsing_prompt_markdown(project_context: 'ProjectContext', language: str = None) -> str:
    """解析用户提供的大纲文本的 prompt（Markdown 输出，用于流式生成）"""
    outline_text = project_context.outline_text or ""

    prompt = (f"""\
You are a helpful assistant that parses a user-provided PPT outline text into a structured Markdown format.

The user has provided the following outline text:

{outline_text}

Your task is to analyze this text and convert it into a structured Markdown outline WITHOUT modifying any of the original text content.

Output rules:
- Use `# Part Name` for major sections (only if the text has clear parts/chapters)
- Use `## Page Title` for each page
- Use `- ` bullet points for key points under each page
- Preserve all titles, points, and text exactly as provided
- Do NOT wrap in code blocks or add any extra text

Now parse the outline text above into the Markdown format. Output `<!-- END -->` on the last line when finished.
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_parsing_prompt_markdown')


def get_description_to_outline_prompt(project_context: 'ProjectContext', language: str = None) -> str:
    """从描述文本解析出大纲的 prompt（JSON 输出）"""
    description_text = project_context.description_text or ""

    prompt = (f"""\
You are a helpful assistant that analyzes a user-provided PPT description text and extracts the outline structure from it.

The user has provided the following description text:

{description_text}

Your task is to analyze this text and extract the outline structure (titles and key points) for each page.
You should identify:
1. How many pages are described
2. The title for each page
3. The key points or content structure for each page

You can organize the content in two ways:

{_OUTLINE_JSON_FORMAT}

Important rules:
- Extract the outline structure from the description text
- Identify page titles and key points
- If the text has clear sections/parts, use the part-based format
- Preserve the logical structure and organization from the original text
- The points should be concise summaries of the main content for each page

Now extract the outline structure from the description text above. Return only the JSON, don't include any other text.
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_description_to_outline_prompt')


def get_description_to_outline_prompt_markdown(project_context: 'ProjectContext', language: str = None) -> str:
    """从描述文本解析出大纲的 prompt（Markdown 输出，用于流式生成）"""
    description_text = project_context.description_text or ""

    prompt = (f"""\
You are a helpful assistant that analyzes a user-provided PPT description text and extracts the outline structure.

The user has provided the following description text:

{description_text}

Your task is to extract the outline structure (titles and key points) for each page.

Output rules:
- Use `# Part Name` for major sections (only if the text has clear parts/chapters)
- Use `## Page Title` for each page
- Use `- ` bullet points for key points under each page
- Preserve the logical structure from the original text
- Do NOT wrap in code blocks or add any extra text

Now extract the outline structure from the description text above. Output `<!-- END -->` on the last line when finished.
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_description_to_outline_prompt_markdown')


def get_outline_refinement_prompt(current_outline: List[Dict], user_requirement: str,
                                   project_context: 'ProjectContext',
                                   previous_requirements: Optional[List[str]] = None,
                                   language: str = None) -> str:
    """根据用户要求修改已有大纲的 prompt"""
    if not current_outline or len(current_outline) == 0:
        outline_text = "(当前没有内容)"
    else:
        outline_text = json.dumps(current_outline, ensure_ascii=False, indent=2)

    prompt = (f"""\
You are a helpful assistant that modifies PPT outlines based on user requirements.
{_get_original_input_labeled(project_context)}
当前的 PPT 大纲结构如下：

{outline_text}
{_get_previous_requirements_text(previous_requirements)}
**用户现在提出新的要求：{user_requirement}**

请根据用户的要求修改和调整大纲。你可以：
- 添加、删除或重新排列页面
- 修改页面标题和要点
- 调整页面的组织结构
- 添加或删除章节（part）
- 合并或拆分页面
- 根据用户要求进行任何合理的调整
- 如果当前没有内容，请根据用户要求和原始输入信息创建新的大纲

输出格式可以选择：

1. 简单格式（适用于没有主要章节的短 PPT）：
[{{"title": "title1", "points": ["point1", "point2"]}}, {{"title": "title2", "points": ["point1", "point2"]}}]

2. 基于章节的格式（适用于有明确主要章节的长 PPT）：
[
    {{
    "part": "第一部分：引言",
    "pages": [
        {{"title": "欢迎", "points": ["point1", "point2"]}},
        {{"title": "概述", "points": ["point1", "point2"]}}
    ]
    }},
    {{
    "part": "第二部分：主要内容",
    "pages": [
        {{"title": "主题1", "points": ["point1", "point2"]}},
        {{"title": "主题2", "points": ["point1", "point2"]}}
    ]
    }}
]

选择最适合内容的格式。当 PPT 有清晰的主要章节时使用章节格式。

现在请根据用户要求修改大纲，只输出 JSON 格式的大纲，不要包含其他文字。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_refinement_prompt')


# ═══════════════════════════════════════════════════════════════════════════════
# 3. 描述 Prompts — 单页、流式、拆分、细化描述
# ═══════════════════════════════════════════════════════════════════════════════


def get_page_description_prompt(project_context: 'ProjectContext', outline: list,
                                page_outline: dict, page_index: int,
                                part_info: str = "",
                                language: str = None,
                                detail_level: str = "default",
                                extra_fields: list = None) -> str:
    """生成单个页面描述的 prompt"""
    original_input = _get_original_input(project_context)

    # 单页版使用简短的 concise 描述（与流式版略有不同）
    detail_level_specs = {
        'concise': '文字极致地压缩和精简',
        'default': '清晰明了，每条要点控制在15-20字以内, 避免冗长的句子和复杂的表述',
        'detailed': '忠于原文的基础上做到内容详实，逻辑清晰。',
    }

    prompt = (f"""\
我们正在为PPT的每一页生成内容描述。
用户的原始需求是：\n{original_input}\n
我们已经有了完整的大纲：\n{outline}\n{part_info}
{_format_requirements(project_context.description_requirements, "description")}现在请为第 {page_index} 页生成描述：
{page_outline}
{"**除非特殊要求，第一页的内容需要保持极简，只放标题副标题以及演讲人等（输出到标题后）, 不添加任何素材。**" if page_index == 1 else ""}
## 重要提示
生成的"页面文字"部分会直接渲染到PPT页面上，因此请务必不要包含任何额外的说明性文字或注释。

## 输出格式

页面文字：

[此处使用markdown直接放置正文文字, 细致程度要求：{detail_level_specs[detail_level]}\n\n, 可包含latex公式、表格等内容, 不要重复添加]

图片素材:
[如果文件中存在图片请积极添加； 否则忽略图片素材字段]
{_format_extra_field_instructions(extra_fields)}

## 关于图片
如果参考文件中包含以 /files/ 开头的本地文件URL图片（例如 /files/mineru/xxx/image.png），请将这些图片以markdown格式输出，例如：![图片描述](/files/mineru/xxx/image.png)。这些图片会被包含在PPT页面中。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_page_description_prompt')


def get_page_description_json_prompt(project_context: 'ProjectContext', outline: list,
                                     page_outline: dict, page_index: int,
                                     part_info: str = "",
                                     language: str = None,
                                     detail_level: str = "default") -> str:
    """为文本生成场景产出结构化单页 JSON（与翻新链路对齐）。"""
    original_input = _get_original_input(project_context)
    outline_text = json.dumps(outline or [], ensure_ascii=False, indent=2)
    page_outline_text = json.dumps(page_outline or {}, ensure_ascii=False, indent=2)
    style_json = getattr(project_context, 'template_style_json', None)
    style_block = ""
    if isinstance(style_json, str) and style_json.strip():
        style_block = (
            "## 风格指导 JSON（可选）\n"
            "以下 JSON 是项目风格约束，若与内容不冲突请尽量吸收其语气/版式倾向：\n"
            f"{style_json.strip()}\n"
        )

    first_page_constraint = (
        "- 当前页是第 1 页，优先作为封面页：内容极简，只保留标题/副标题/汇报信息，不堆砌正文。\n"
        if page_index == 1 else
        ""
    )

    prompt = f"""\
# Role
你是一位麦肯锡/BCG风格的高级商业分析师兼PPT架构师。你的任务是基于大纲与上下文，生成可直接渲染的单页结构化 JSON。

# 输入上下文
原始需求：
{original_input}

完整大纲：
{outline_text}
{part_info}

当前页（第 {page_index} 页）：
{page_outline_text}

{_format_requirements(project_context.description_requirements, "description")}
{style_block}
# 目标
1. 输出一个 JSON 对象，且只能包含 `outline` 与 `slide` 两个顶层键。
2. 必须根据当前页标题与要点“扩写并丰富内容”，不是仅改字段格式。
3. 内容要体现结论先行、论据支撑、可执行表达。
4. 每页必须输出 `type`、`layout_suggestion`、`content`、`visual_suggestion`、`note`。
5. `type` 必须使用中文值：封面页/目录页/章节页/图表页/图文页/结尾页。
6. 无法判断时，默认使用图文页。
{first_page_constraint}

# 详细程度
当前详细程度要求：{DETAIL_LEVEL_SPECS.get(detail_level, DETAIL_LEVEL_SPECS['default'])}

# 类型要求
- 图文页：必须提供 `headline_summary` 与 `detailed_items[]`（每项含 `sub_title`、`body`、`highlight_phrases`）。
- 图表页：必须提供 `chart_type`、`chart_data`、`key_takeaway`、`highlight_phrases`。
- 封面页：优先使用 `headline`、`sub_headline`、`presenter_info`。
- 结尾页：优先使用 `final_conclusion`、`vision`、`slogan`。
- `highlight_phrases` 取值必须“可回指”：每个短语都要能在对应 `body`（图文页）或 `key_takeaway`（图表页）中逐字匹配到，不得改写、概括或替换同义词。
- `visual_suggestion` 优先使用视觉隐喻，不要平铺直叙；并且必须写清主体、意境、风格、画面重点。

{_get_page_detail_json_output_requirements()}
{get_language_instruction(language)}
"""
    return _build_prompt(prompt, project_context.reference_files_content, tag='get_page_description_json_prompt')


def get_all_descriptions_stream_prompt(project_context: 'ProjectContext',
                                       outline: list,
                                       flat_pages: list,
                                       language: str = None,
                                       detail_level: str = "default",
                                       extra_fields: list = None) -> str:
    """一次性生成所有页面描述的 prompt（用于流式生成）"""
    original_input = _get_original_input(project_context)

    # 构建页面大纲列表
    outline_lines = []
    for i, page in enumerate(flat_pages):
        part_str = f"  [章节: {page['part']}]" if page.get('part') else ""
        points_str = ", ".join(page.get('points', []))
        outline_lines.append(f"第 {i + 1} 页：{page.get('title', '')}{part_str}\n  要点：{points_str}")
    pages_outline_text = "\n".join(outline_lines)

    prompt = (f"""\
我们正在为PPT的每一页生成内容描述。
用户的原始需求是：\n{original_input}\n
完整大纲如下：
{pages_outline_text}

{_format_requirements(project_context.description_requirements, "description")}请为每一页依次生成描述。先输出 `<!-- BEGIN -->` 标记开始，然后逐页输出内容，每页用 `<!-- PAGE_END -->` 结束，全部完成后输出 `<!-- END -->`。

## 重要提示
- 生成的页面文字会直接渲染到PPT页面上，请务必不要包含任何额外的说明性文字或注释。
- **第一页（封面页）保持极简**，只放标题、副标题、演讲人等信息，不添加任何素材。
- 细致程度要求：{DETAIL_LEVEL_SPECS[detail_level]}

## 输出格式
每页默认包含"页面文字"和"图片素材"两个部分。图片素材用于引用参考文件中的图片（以 /files/ 开头的本地路径），如果参考文件中没有相关图片则省略该部分。
```
<!-- BEGIN -->
页面文字：
[第1页文字内容，可包含标题、副标题、要点、latex公式、表格等，根据实际需求选择，避免堆砌和重复]

图片素材：
[如果参考文件中存在相关图片，以markdown格式引用，如 ![描述](/files/xxx/image.png)；否则省略此部分。如果用户上传了图片素材请积极地添加]
{_format_extra_field_instructions(extra_fields)}
<!-- PAGE_END -->
页面文字：
[第2页文字内容]

图片素材：
[同上]
{_format_extra_field_instructions(extra_fields)}
<!-- PAGE_END -->
...
<!-- END -->
```

现在请开始生成，严格按照上述格式输出。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_all_descriptions_stream_prompt')


def get_description_split_prompt(project_context: 'ProjectContext',
                                 outline: List[Dict],
                                 language: str = None) -> str:
    """从描述文本切分出每页描述的 prompt"""
    outline_json = json.dumps(outline, ensure_ascii=False, indent=2)
    description_text = project_context.description_text or ""

    prompt = (f"""\
You are a helpful assistant that splits a complete PPT description text into individual page descriptions.

The user has provided a complete description text:

{description_text}

We have already extracted the outline structure:

{outline_json}

Your task is to split the description text into individual page descriptions based on the outline structure.
For each page in the outline, extract the corresponding description from the original text.

Return a JSON array where each element corresponds to a page in the outline (in the same order).
Each element should be a string containing the page description in the following format:

页面标题：[页面标题]

页面文字：
- [要点1]
- [要点2]
...

其他页面素材（如果有排版、风格、素材等细节）

Example output format:
[
    "页面标题：人工智能的诞生\\n页面文字：\\n- 1950 年，图灵提出"图灵测试"\\n- 奠定了AI的理论基础\\n\\n其他页面素材：\\n排版：标题居中，大字号\\n风格：科技感蓝色背景",
    "页面标题：AI 的发展历程\\n页面文字：\\n- 1950年代：符号主义...",
    ...
]

Important rules:
- Split the description text according to the outline structure
- Each page description should match the corresponding page in the outline
- Preserve all important content from the original text, including layout details (排版细节), style requirements (风格要求), material specifications (素材说明), and any other design requirements
- If the user described layout, style, or materials for a page, include them in the "其他页面素材" section
- Keep the format consistent with the example above
- If a page in the outline doesn't have a clear description in the text, create a reasonable description based on the outline

Now split the description text into individual page descriptions. Return only the JSON array, don't include any other text.
{get_language_instruction(language)}
""")

    logger.debug(f"[get_description_split_prompt] Final prompt:\n{prompt}")
    return prompt


def get_descriptions_refinement_prompt(current_descriptions: List[Dict], user_requirement: str,
                                       project_context: 'ProjectContext',
                                       outline: List[Dict] = None,
                                       previous_requirements: Optional[List[str]] = None,
                                       language: str = None) -> str:
    """根据用户要求修改已有页面描述的 prompt"""
    is_renovation_project = getattr(project_context, 'creation_type', None) == 'ppt_renovation'

    # 构建大纲文本
    outline_text = ""
    if outline:
        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)
        outline_text = f"\n\n完整的 PPT 大纲：\n{outline_json}\n"

    # 构建所有页面描述的汇总
    all_descriptions_text = "当前所有页面的描述：\n\n"
    has_any_description = False
    structured_pages: List[Dict] = []
    structured_count = 0
    for desc in current_descriptions:
        page_num = desc.get('index', 0) + 1
        title = desc.get('title', '未命名')
        content = desc.get('description_content', '')
        if isinstance(content, dict):
            content = content.get('text', '')
        if not isinstance(content, str):
            content = str(content or '')

        parsed_slide = _try_extract_slide_like_json(content) if content else None
        if parsed_slide is not None:
            structured_count += 1
            structured_pages.append({
                "page_number": page_num,
                "outline_title": title,
                "current_slide": parsed_slide,
            })
        else:
            structured_pages.append({
                "page_number": page_num,
                "outline_title": title,
                "current_slide": None,
                "current_text": content.strip(),
            })

        if content:
            has_any_description = True
            all_descriptions_text += f"--- 第 {page_num} 页：{title} ---\n{content}\n\n"
        else:
            all_descriptions_text += f"--- 第 {page_num} 页：{title} ---\n(当前没有内容)\n\n"

    if not has_any_description:
        all_descriptions_text = "当前所有页面的描述：\n\n(当前没有内容，需要基于大纲生成新的描述)\n\n"

    # 单页 AI 文本优化默认走结构化 JSON 模式，和“从大纲生成页面详情”的输出要求保持一致。
    force_structured_for_single_page = len(current_descriptions or []) == 1
    structured_mode = (
        is_renovation_project
        and structured_count > 0
        and structured_count >= max(1, (len(current_descriptions) + 1) // 2)
    ) or force_structured_for_single_page

    if structured_mode:
        mckinsey_guidance_block = """【麦肯锡表达约束（统一后端管理）】
1. 结论先行（Pyramid Principle）：每个层级先给结论，再给支撑信息。
2. 结构 MECE：同层级避免重复、交叉和遗漏，维度要并列且互斥穷尽。
3. 采用 SCQA 压缩表达：背景-冲突-问题-回答，优先体现在 title/headline_summary/body。
4. 行动导向：措辞强调可执行性与经营含义，避免空泛口号。

【页面类型自适应】
1. 先判断页面性质：问题分析页 / 方案页 / 总结页。
2. 若为问题分析页（标题或内容含“问题/痛点/挑战/现状/原因/瓶颈/风险/诊断”等），采用“诊断结论先行”：先给本质判断与影响，再给证据链。
3. 若为方案页或路径页，采用“行动结论先行”：先给策略结论，再给抓手与落地路径。
4. 若为总结/结尾页，采用“主张先行”：先给统一主张（slogan 级），再给 2-3 条收束要点。
5. 若无法判断类型，默认结论先行，但禁止臆断与虚构。"""

        structured_pages_json = json.dumps(structured_pages, ensure_ascii=False, indent=2)
        prompt = (f"""\
你是“PPT 页面 JSON 优化器”。目标：在不丢失业务语义的前提下，优化每页结构化 JSON，使其可直接渲染。
{_get_original_input_labeled(project_context)}{outline_text}
当前页面 JSON（按页面顺序）：
{structured_pages_json}
{_get_previous_requirements_text(previous_requirements)}
**用户现在提出新的要求：{user_requirement}**

【数组级硬约束】
1. 只输出合法 JSON 数组，不要 Markdown，不要解释文字。
2. 数组长度必须等于输入页面数（{len(current_descriptions)}），顺序保持一致。
3. 每个元素必须满足“从大纲生成页面详情”的 JSON 输出要求（单页对象顶层仅 `outline` + `slide`）。
4. 专业术语与品牌名必须保留（例如 OpenClaw、Agent、低代码、经营协同平台）。
5. 禁止无故降级结构：不要把已存在的结构化 JSON 改成纯文本描述。
6. `highlight_phrases` 不能整页清空；若原有为空，可按正文补充 2-4 个关键词；所有高亮词必须是对应 `body` 或 `key_takeaway` 的连续原文子串，禁止新增正文里不存在的概念词。
7. `visual_suggestion` 不能无故置空，应保留或增强为“主体 + 隐喻 + 风格 + 重点”；禁止退化为平铺直叙的配图名词。

{mckinsey_guidance_block}

【结尾页强化规则（当页面本身是结尾页，或用户要求出现“结尾/收尾/总结/slogan/closing”时必须执行）】
1. 该页 `type` 必须保持结尾语义（`closing` 或 `结尾页`），不得改为普通详情类型。
2. 标题需具备收束感与号召感。
3. 内容必须体现“1句可上屏 slogan + 3条以内总结要点（战略/路径/行动）”。
4. 每条总结保持精简有力，避免长段论证。

【输出要求】
1. 返回一个 JSON 数组，数组每个元素是优化后的单页 JSON 对象（不是字符串）。
2. 每个元素都必须符合以下单页 JSON 要求：
{_get_page_detail_json_output_requirements()}
3. 如果某页输入缺失 `current_slide`，可基于 `outline_title` 和用户要求补全为合理结构化 JSON。

现在开始优化，只输出 JSON 数组。
{get_language_instruction(language)}
""")
        return _build_prompt(prompt, project_context.reference_files_content, tag='get_descriptions_refinement_prompt')

    prompt = (f"""\
You are a helpful assistant that modifies PPT page descriptions based on user requirements.
{_get_original_input_labeled(project_context)}{outline_text}
{all_descriptions_text}
{_get_previous_requirements_text(previous_requirements)}
**用户现在提出新的要求：{user_requirement}**

请根据用户的要求修改和调整所有页面的描述。你可以：
- 修改页面标题和内容
- 调整页面文字的详细程度
- 添加或删除要点
- 调整描述的结构和表达
- 确保所有页面描述都符合用户的要求
- 如果当前没有内容，请根据大纲和用户要求创建新的描述

请为每个页面生成修改后的描述，格式如下：

页面标题：[页面标题]

页面文字：
- [要点1]
- [要点2]
...
其他页面素材（如果有请加上，包括markdown图片链接等）

提示：如果参考文件中包含以 /files/ 开头的本地文件URL图片（例如 /files/mineru/xxx/image.png），请将这些图片以markdown格式输出，例如：![图片描述](/files/mineru/xxx/image.png)，而不是作为普通文本。

请返回一个 JSON 数组，每个元素是一个字符串，对应每个页面的修改后描述（按页面顺序）。

示例输出格式：
[
    "页面标题：人工智能的诞生\\n页面文字：\\n- 1950 年，图灵提出\\"图灵测试\\"...",
    "页面标题：AI 的发展历程\\n页面文字：\\n- 1950年代：符号主义...",
    ...
]

现在请根据用户要求修改所有页面描述，只输出 JSON 数组，不要包含其他文字。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_descriptions_refinement_prompt')


# ═══════════════════════════════════════════════════════════════════════════════
# 4. 图片生成 Prompts — 文生图、图片编辑
# ═══════════════════════════════════════════════════════════════════════════════


def get_image_generation_prompt(page_desc: str, outline_text: str,
                                current_section: str,
                                has_material_images: bool = False,
                                extra_requirements: str = None,
                                language: str = None,
                                has_template: bool = True,
                                page_index: int = 1,
                                aspect_ratio: str = "16:9") -> str:
    """生成图片生成 prompt"""
    material_images_note = ""
    if has_material_images:
        material_images_note = (
            "\n\n提示：" + ("除了模板参考图片（用于风格参考）外，还提供了额外的素材图片。" if has_template else "用户提供了额外的素材图片。") +
            "这些素材图片是可供挑选和使用的元素，你可以从这些素材图片中选择合适的图片、图标、图表或其他视觉元素"
            "直接整合到生成的PPT页面中。请根据页面内容的需要，智能地选择和组合这些素材图片中的元素。"
        )

    extra_req_text = ""
    if extra_requirements and extra_requirements.strip():
        extra_req_text = f"\n\n额外要求（请务必遵循）：\n{extra_requirements}\n"

    template_style_guideline = "- 配色和设计语言和模板图片严格相似。" if has_template else "- 严格按照风格描述进行设计。"
    forbidden_template_text_guidline = "- 只参考风格设计，禁止出现模板中的文字。\n" if has_template else ""

    prompt = (f"""\
你是一位专家级UI UX演示设计师，专注于生成设计良好的PPT页面。
当前PPT页面的页面描述如下:
<page_description>
{page_desc}
</page_description>

<design_guidelines>
- 要求文字清晰锐利, 画面为4K分辨率，{aspect_ratio}比例。
{template_style_guideline}
- 根据内容和要求自动设计最完美的构图，不重不漏地渲染"页面文字"段落中的文本。
- 如果输入中存在 `note` 字段，其内容仅用于生成参考，禁止渲染到页面可见文字中。
- 如非必要，禁止出现 markdown 格式符号（如 # 和 * 等）。
{forbidden_template_text_guidline}
</design_guidelines>
{get_ppt_language_instruction(language)}
{material_images_note}{extra_req_text}

{"**注意：当前页面为ppt的封面页，请你采用专业的封面设计美学技巧，务必凸显出页面标题，分清主次，确保一下就能抓住观众的注意力。**" if page_index == 1 else ""}
""")

    logger.debug(f"[get_image_generation_prompt] Final prompt:\n{prompt}")
    return prompt


def get_image_edit_prompt(
    edit_instruction: str,
    original_description: str = None,
    reference_image_count: int = 1,
) -> str:
    """生成图片编辑 prompt"""
    ref_count = max(1, int(reference_image_count or 1))
    image_lines = [
        "图片1：原始需要优化的 PPT 页面图，请以这张图为主进行编辑。"
    ]
    for index in range(2, ref_count + 1):
        image_lines.append(
            f"图片{index}：用户补充的截图、局部框选或插入图片，请结合它理解具体修改区域和修改方式。"
        )

    prompt = (
        "请根据提供的图片顺序完成这张 PPT 页面图片编辑。\n"
        f"{chr(10).join(image_lines)}\n\n"
        f"修改要求：\n{edit_instruction.strip()}\n\n"
        "不要额外引入新的风格提示词、页面描述或模板设定。"
        "只依据这些图片和修改要求完成编辑，并尽量保持原页面主体结构与版式逻辑。"
    )

    logger.debug(f"[get_image_edit_prompt] Final prompt:\n{prompt}")
    return prompt


# ═══════════════════════════════════════════════════════════════════════════════
# 5. 图片处理 Prompts — 背景提取、画质修复
# ═══════════════════════════════════════════════════════════════════════════════


def get_cover_ending_fields_detect_prompt(cover_text: str,
                                          ending_text: str,
                                          language: str = None) -> str:
    """
    检测封面/结尾页是否包含关键信息字段（以及是否为占位符）的 prompt

    Returns:
        JSON 对象，格式：
        {
          "fields": [
            {
              "key": "company_name",
              "page_role": "cover|ending",
              "present": true|false,
              "value": "xxx",
              "is_placeholder": true|false,
              "placeholders": ["某某公司", "Company Name"],
              "confidence": 0.0-1.0
            }
          ]
        }
    """
    prompt = dedent(f"""\
你是一位专业的 PPT 内容审校助手。请检查封面页与结尾页的页面描述，判断以下字段是否已经包含真实信息，或只是占位符/示例文本。

需要检测的字段（共 10 项）：
1. logo
2. company_name
3. project_name
4. presenter
5. presenter_title
6. date
7. location
8. phone
9. website_or_email（网址或邮箱其一即可）
10. thanks_or_slogan（仅用于结尾页）

请注意：
- 只要描述中出现明确真实信息即可认为 present=true。
- 如果仅出现“占位符/示例/泛指”文字（如“Company Name”、“某某公司”、“Your Name”、“2024-01-01”、“example.com”、“your@email.com”、“XXX”等），请标记 is_placeholder=true，present 可以为 true，但必须明确它是占位符。
- website_or_email：只要出现网址或邮箱之一即可算 present=true。
- logo：如果明确出现图片链接（例如 ![logo](/files/xxx.png) 或 http/https 图片），或明确指定品牌 Logo（且非占位符）即可算 present=true。

请严格输出 JSON，不要包含任何解释性文字。

封面页描述：
<<<COVER_TEXT>>>

结尾页描述：
<<<ENDING_TEXT>>>

输出 JSON 示例：
{{
  "fields": [
    {{
      "key": "company_name",
      "page_role": "cover",
      "present": false,
      "value": "",
      "is_placeholder": false,
      "placeholders": [],
      "confidence": 0.6
    }}
  ]
}}
{get_language_instruction(language)}
""")
    prompt = prompt.replace("<<<COVER_TEXT>>>", cover_text or "")
    prompt = prompt.replace("<<<ENDING_TEXT>>>", ending_text or "")
    logger.debug(f"[get_cover_ending_fields_detect_prompt] Final prompt:\n{prompt}")
    return prompt


def get_long_report_split_prompt(report_text: str,
                                 reference_files_content: Optional[List[Dict[str, str]]] = None) -> str:
    """
    将长篇分析报告拆解为结构化PPT JSON的 prompt

    Args:
        report_text: 原始报告文本
        reference_files_content: 参考文件内容（可选）

    Returns:
        格式化后的 prompt 字符串
    """
    files_xml = _format_reference_files_xml(reference_files_content)
    prompt = dedent("""\
# Role
你是一位麦肯锡/BCG风格的高级商业分析师兼PPT架构师。你擅长将深度、晦涩的【长篇分析报告】转化为逻辑严密、结论先行、视觉化友好的【结构化PPT JSON数据】。

# Core Objective
将文稿转化为“主张驱动（Assertion-Driven）”的演示文稿。
**核心原则：**
1. **深度覆盖**：篇幅预设 20-40 页。宁可页数多，绝不漏掉核心论据（遇到子章节如1.1, 1.2必须独立成页）。
2. **结论先行**：每页标题必须是一个**有观点的句子**（Action Title），而非简单的名词标签。

# ⚡️ MCK-Style Deconstruction Rules (咨询级拆解法则 - 必须严格遵守)

## 1. 标题逻辑：从“标签”转向“主张”
- **禁止使用**：标签式标题（如“3.2 市场规模分析”）。
- **强制使用**：动作标题（如“3.2 全球固态电池市场预计在2026年进入爆发期”）。
- **逻辑测试**：只读标题，观众应能理解整份报告的核心叙事。

## 2. 严控过渡页泛滥与强制模块化 (Strict Structure)
- **模块化聚合**：将报告在逻辑上整合为 3-4 个核心大模块（Part），只在这些大模块切换时使用 `section_header`（全篇 3-5 张内）。
- **强制首尾结构**：必须有封面 `cover`、目录 `catalog`、以及包含愿景的结尾页 `closing`。

## 3. “So What?” 深度挖掘与图表数据化 (Insight & Chart Logic)
- **洞察提取**：必须自问“这个数据说明了什么？”，将“事实描述”转化为“洞察结论”，写入 `headline_summary` 或 `key_takeaway`。
- **图表结构化**：若有趋势/对比/占比数据，优先使用 `detail_chart`，并输出标准 `chart_data.labels + datasets`。

## 4. 文本纯净度与专业词汇保护 (Cleanliness & Entities)
- **彻底去除引用标记**：删除 ``, `[1]`, `(作者, 年份)` 等标记；来源信息写入 `note`。
- **专业名词保护**：技术术语、法律条款、品牌名必须 1:1 还原。

## 5. 视觉层级与高亮映射 (Visual Hierarchy)
- **Highlight Phrases**：提取关键数字、核心动词、关键名词写入 `highlight_phrases` 数组。
- **逻辑分块**：列表保持逻辑平行，避免长段落。

## 6. 文案语态：专业务实，拒绝空泛 (Pragmatic & Professional Tone)
- 用商业短句表达，拒绝空洞术语；每条内容要有明确动作、数据或案例支撑。

## 7. 布局策略：逻辑与视觉对齐 (Layout Strategy)
- 每一页必须输出 `layout_suggestion`，按内容逻辑选择：
  - `split_comparison`: 左右对比（竞品、优劣势、前后变化）
  - `multi_column_logic`: 三/四栏并列（策略拆解、路径分工）
  - `dashboard_style`: 数据看板（左结论右数据图）
  - `pyramid_hierarchy`: 金字塔/层级结构（机制、架构、能力分层）

## 8. 视觉隐喻：以形传神 (Visual Metaphor & Imagery)
- 按需给出 `visual_suggestion`，用于解释抽象概念或增强情感共鸣。
- 禁止平铺直叙的配图建议，优先使用“视觉隐喻”（例如锁、迷雾晶体、桥梁、罗盘等意象）。
- `visual_suggestion` 要描述主体、意境、风格与画面重点，不要只写名词。

## 9. 页面类型选择策略 (Type Selection)
- 可选类型只允许：`封面页`、`目录页`、`章节页`、`图表页`、`图文页`、`结尾页`。
- 返回时优先使用中文值；系统会自动兼容英文值。
- **不要固定默认类型**。应根据每页内容自动判断并返回最合适的 `type`。
- 若信息不足无法判断时，才使用`图文页`作为兜底类型。

## 10. 交互限制 (No Follow-up Questions)
- 禁止向用户追问“请补充文本/上传文件”等问题，必须一次性完成输出。

以下是需要拆解的报告原文：
<<<REPORT_TEXT>>>

# Output Format (JSON Structure)
请严格按以下结构输出，不可随意更改 key 名：

```json
{
  "meta": {
    "report_title": "报告主标题",
    "consulting_logic": "叙事主线描述（电梯演讲）",
    "total_pages_estimate": "25-35",
    "primary_color_theme": "Consulting Blue"
  },
  "slides": [
    {
      "id": 1,
      "type": "cover",
      "title": "封面",
      "layout_suggestion": "dashboard_style",
      "content": {
        "headline": "主标题：有力、宏观的主张",
        "sub_headline": "副标题：研究范围与核心视角",
        "presenter_info": "汇报人 | 机构 | 日期"
      },
      "visual_suggestion": "场景化、高质感的背景图描述"
    },
    {
      "id": 2,
      "type": "catalog",
      "title": "目录 / AGENDA",
      "layout_suggestion": "multi_column_logic",
      "content": {
        "sections": [
          "Part 1: [结论导向的大模块1]",
          "Part 2: [结论导向的大模块2]",
          "Part 3: [结论导向的大模块3]"
        ]
      }
    },
    {
      "id": "N",
      "type": "图文页",
      "title": "【动作标题】通过‘去污名化’三步走策略，品牌可有效降低用户心理门槛",
      "layout_suggestion": "multi_column_logic",
      "content": {
        "headline_summary": "核心逻辑概述：语言重构是第一步，物理感官修正是个中关键。",
        "detailed_items": [
          {
            "sub_title": "策略1：语义重构",
            "body": "使用‘韧皮纤维’替代‘大麻’，利用亚麻的正向认知进行对冲。",
            "highlight_phrases": ["语义重构", "对冲"]
          }
        ]
      },
      "visual_suggestion": "一张展示词汇转换的对比图，背景是低透明度显微镜纤维结构，传递专业与科学感。",
      "note": "备注..."
    },
    {
      "id": "LAST",
      "type": "closing",
      "title": "总结与展望",
      "layout_suggestion": "pyramid_hierarchy",
      "content": {
        "final_conclusion": "总结文字",
        "vision": "愿景描述",
        "slogan": "重塑认知，引领未来",
        "qa_text": "Q&A",
        "contact_info": "email@example.com"
      },
      "visual_suggestion": "意境深远的自然与科技融合远景图，体现未来感"
    }
  ]
}
```

Task:
- 必须包含目录页和结尾愿景页。
- 必须清除引用标记。
- 每一页都必须给出具体 `layout_suggestion`。
- 在逻辑关键页给出具象化且有意境的 `visual_suggestion`。
- 文案务实，杜绝空洞词，标题必须是动作主张句。
- 只返回 JSON，不要额外解释。
""")
    prompt = prompt.replace("<<<REPORT_TEXT>>>", report_text)
    final_prompt = files_xml + prompt
    logger.debug(f"[get_long_report_split_prompt] Final prompt:\n{final_prompt}")
    return final_prompt


def get_clean_background_prompt() -> str:
    """生成纯背景图的 prompt（去除文字和插画）"""
    prompt = """\
你是一位专业的图片文字&图片擦除专家。你的任务是从原始图片中移除文字和配图，输出一张无任何文字和图表内容、干净纯净的底板图。
<requirements>
- 彻底移除页面中的所有文字、插画、图表。必须确保所有文字都被完全去除。
- 保持原背景设计的完整性（包括渐变、纹理、图案、线条、色块等）。保留原图的文本框和色块。
- 对于被前景元素遮挡的背景区域，要智能填补，使背景保持无缝和完整，就像被移除的元素从来没有出现过。
- 输出图片的尺寸、风格、配色必须和原图完全一致。
- 请勿新增任何元素。
</requirements>

注意，**任意位置的, 所有的**文字和图表都应该被彻底移除，**输出不应该包含任何文字和图表。**
"""
    logger.debug(f"[get_clean_background_prompt] Final prompt:\n{prompt}")
    return prompt


def get_quality_enhancement_prompt(inpainted_regions: list = None) -> str:
    """生成画质提升的 prompt（用于百度图像修复后的画质修复）"""
    regions_info = ""
    if inpainted_regions and len(inpainted_regions) > 0:
        regions_json = json.dumps(inpainted_regions, ensure_ascii=False, indent=2)
        regions_info = f"""
以下是被抹除工具处理过的具体区域（共 {len(inpainted_regions)} 个矩形区域），请重点修复这些位置：

```json
{regions_json}
```

坐标说明（所有数值都是相对于图片宽高的百分比，范围0-100%）：
- left: 区域左边缘距离图片左边缘的百分比
- top: 区域上边缘距离图片上边缘的百分比
- right: 区域右边缘距离图片左边缘的百分比
- bottom: 区域下边缘距离图片上边缘的百分比
- width_percent: 区域宽度占图片宽度的百分比
- height_percent: 区域高度占图片高度的百分比

例如：left=10 表示区域从图片左侧10%的位置开始。
"""

    prompt = f"""\
你是一位专业的图像修复专家。这张ppt页面图片刚刚经过了文字/对象抹除操作，抹除工具在指定区域留下了一些修复痕迹，包括：
- 色块不均匀、颜色不连贯
- 模糊的斑块或涂抹痕迹
- 与周围背景不协调的区域，比如不和谐的渐变色块
- 可能的纹理断裂或图案不连续
{regions_info}
你的任务是修复这些抹除痕迹，让图片看起来像从未有过对象抹除操作一样自然。

要求：
- **重点修复上述标注的区域**：这些区域刚刚经过抹除处理，需要让它们与周围背景完美融合
- 保持纹理、颜色、图案的连续性
- 提升整体画质，消除模糊、噪点、伪影
- 保持图片的原始构图、布局、色调风格
- 禁止添加任何文字、图表、插画、图案、边框等元素
- 除了上述区域，其他区域不要做任何修改，保持和原图像素级别地一致。
- 输出图片的尺寸必须与原图一致

请输出修复后的高清ppt页面背景图片，不要遗漏修复任何一个被涂抹的区域。
"""
    return prompt


# ═══════════════════════════════════════════════════════════════════════════════
# 6. 内容提取 Prompts — 文字属性、页面内容、排版分析、风格提取
# ═══════════════════════════════════════════════════════════════════════════════


def get_text_attribute_extraction_prompt(content_hint: str = "") -> str:
    """生成文字属性提取的 prompt（提取文字内容、颜色、公式等信息）"""
    prompt = """你的任务是精确识别这张图片中的文字内容和样式，返回JSON格式的结果。

{content_hint}

## 核心任务
请仔细观察图片，精确识别：
1. **文字内容** - 输出你实际看到的文字符号。
2. **颜色** - 每个字/词的实际颜色
3. **空格** - 精确识别文本中空格的位置和数量
4. **公式** - 如果是数学公式，输出 LaTeX 格式

## 注意事项
- **空格识别**：必须精确还原空格数量，多个连续空格要完整保留，不要合并或省略
- **颜色分割**：一行文字可能有多种颜色，按颜色分割成片段，一般来说只有两种颜色。
- **公式识别**：如果片段是数学公式，设置 is_latex=true 并用 LaTeX 格式输出
- **相邻合并**：相同颜色的相邻普通文字应合并为一个片段

## 输出格式
- colored_segments: 文字片段数组，每个片段包含：
  - text: 文字内容（公式时为 LaTeX 格式，如 "x^2"、"\\sum_{{i=1}}^n"）
  - color: 颜色，十六进制格式 "#RRGGBB"
  - is_latex: 布尔值，true 表示这是一个 LaTeX 公式片段（可选，默认 false）

只返回JSON对象，不要包含任何其他文字。
示例输出：
```json
{{
    "colored_segments": [
        {{"text": "·  创新合成", "color": "#000000"}},
        {{"text": "1827个任务环境", "color": "#26397A"}},
        {{"text": "与", "color": "#000000"}},
        {{"text": "8.5万提示词", "color": "#26397A"}},
        {{"text": "突破数据瓶颈", "color": "#000000"}},
        {{"text": "x^2 + y^2 = z^2", "color": "#FF0000", "is_latex": true}}
    ]
}}
```
""".format(content_hint=content_hint)

    return prompt


def get_batch_text_attribute_extraction_prompt(text_elements_json: str) -> str:
    """生成批量文字属性提取的 prompt（给模型全图 + 所有文本元素的 bbox）"""
    prompt = f"""你是一位专业的 PPT/文档排版分析专家。请分析这张图片中所有标注的文字区域的样式属性。

我已经从图片中提取了以下文字元素及其位置信息：

```json
{text_elements_json}
```

请仔细观察图片，对比每个文字区域在图片中的实际视觉效果，为每个元素分析以下属性：

1. **font_color**: 字体颜色的十六进制值，格式为 "#RRGGBB"
   - 请仔细观察文字的实际颜色，不要只返回黑色
   - 常见颜色如：白色 "#FFFFFF"、蓝色 "#0066CC"、红色 "#FF0000" 等

2. **is_bold**: 是否为粗体 (true/false)
   - 观察笔画粗细，标题通常是粗体

3. **is_italic**: 是否为斜体 (true/false)

4. **is_underline**: 是否有下划线 (true/false)

5. **text_alignment**: 文字对齐方式
   - "left": 左对齐
   - "center": 居中对齐
   - "right": 右对齐
   - "justify": 两端对齐
   - 如果无法判断，根据文字在其区域内的位置推测

请返回一个 JSON 数组，数组中每个对象对应输入的一个元素（按相同顺序），包含以下字段：
- element_id: 与输入相同的元素ID
- text_content: 文字内容
- font_color: 颜色十六进制值
- is_bold: 布尔值
- is_italic: 布尔值
- is_underline: 布尔值
- text_alignment: 对齐方式字符串

只返回 JSON 数组，不要包含其他文字：
```json
[
    {{
        "element_id": "xxx",
        "text_content": "文字内容",
        "font_color": "#RRGGBB",
        "is_bold": true/false,
        "is_italic": true/false,
        "is_underline": true/false,
        "text_alignment": "对齐方式"
    }},
    ...
]
```
"""

    return prompt


def get_ppt_page_content_extraction_prompt(markdown_text: str, language: str = None) -> str:
    """从 fileparser 解析出的 markdown 文本中提取翻新页结构（outline + slide JSON）"""
    prompt = f"""\
# Role
你是一位麦肯锡/BCG风格的高级商业分析师兼PPT翻新架构师。你的任务是把单页解析文本转成“主张驱动（Assertion-Driven）”的结构化页面 JSON，用于 PPT 翻新。

# Input
下面是从单页 PPT/PDF 提取的 Markdown 内容：
<slide_content>
{markdown_text}
</slide_content>

# Core Objective (PPT翻新场景)
1. 输出一个可直接落库、可直接渲染的单页 JSON，不要输出多页结构。
2. 标题必须是“有结论的动作句”，不能是标签式名词。
3. 如果原文有趋势/对比/占比数据，优先输出“图表页（detail_chart）”，并补全 `labels + datasets`。
4. 如果原文主要是观点和论据，使用“图文页”，并给出分块论据。
5. 每页都必须给出 `layout_suggestion`，并在关键逻辑页提供具象化 `visual_suggestion`。

# MCK-Style Rules（翻新版）
1. 结论先行：标题要回答 “So what?”，让管理层一眼看懂本页结论。
2. 内容纯净：删除引用标记、脚注符号、学术引用格式；专业术语/品牌名/法规名必须 1:1 保留。
3. 高亮映射：提取关键数字、核心动词、关键名词到 `highlight_phrases`。
4. 可执行表达：用短句表达业务动作与结果，避免空话套话。
5. 不追问用户：禁止要求“补充材料/上传文件/提供更多信息”，缺失信息用审慎默认值继续输出。

# Type Decision
只允许以下 `type`：
- 封面页（cover）
- 目录页（catalog）
- 章节页（section_header）
- 图表页（detail_chart）
- 图文页
- 结尾页（closing）

返回时优先使用中文值（如“图文页”）；系统会自动兼容英文值。
不要固定默认类型，应根据页面内容自动判断后返回最合适的 `type`。
若无法明确判断，才使用“图文页”兜底。

# Layout Strategy
`layout_suggestion` 仅允许以下枚举：
- 左右对比（split_comparison）
- 多栏逻辑（multi_column_logic）
- 看板布局（dashboard_style）
- 金字塔层级（pyramid_hierarchy）

返回时优先使用中文值（如“多栏逻辑”）；系统会自动兼容英文值。

# Visual Metaphor
`visual_suggestion` 不是简单名词，必须描述：
- 画面主体
- 隐喻意图
- 风格氛围
- 视觉重点
- 禁止平铺直叙的配图建议，优先使用具象视觉隐喻（如锁、桥梁、罗盘等）。

# Output Schema（严格遵守）
返回一个 JSON 对象，且只能有两个顶层键：`outline` 和 `slide`。

```json
{{
  "outline": {{
    "title": "动作标题（可作为侧边栏页名）",
    "points": ["要点1", "要点2", "要点3"]
  }},
  "slide": {{
    "type": "图文页",
    "title": "动作标题",
    "layout_suggestion": "多栏逻辑",
    "content": {{
      "headline_summary": "20字内核心论点",
      "detailed_items": [
        {{
          "sub_title": "分论点标题",
          "body": "业务动作 + 证据/数据 + 结果",
          "highlight_phrases": ["关键短语1", "关键短语2"]
        }}
      ]
    }},
    "visual_suggestion": "使用具象视觉隐喻解释抽象概念，包含主体、意境与风格",
    "note": "来源与假设说明"
  }}
}}
```

# Content Requirements by Type
- 图表页（`detail_chart`）必须包含：
  - `chart_type`
  - `chart_data.labels`
  - `chart_data.datasets[]`（含 `label` 与 `data`）
  - `key_takeaway`
  - `highlight_phrases`
- 图文页必须包含：
  - `headline_summary`
  - `detailed_items[]`（每项含 `sub_title`、`body`、`highlight_phrases`）
- 其他类型按语义填充合理字段（如 cover 的 headline/sub_headline，closing 的 final_conclusion/vision）。
- 所有类型都必须有 `layout_suggestion`。

# Hard Constraints
- 只返回 JSON，不要 Markdown 代码块，不要解释文字。
- 不得输出多余顶层字段。
- 所有字段值尽量基于输入内容，不臆造具体数据。
{get_language_instruction(language)}
"""
    logger.debug(f"[get_ppt_page_content_extraction_prompt] Final prompt:\n{prompt}")
    return prompt


def get_ppt_page_content_extraction_from_image_prompt(page_outline: Optional[Dict] = None, language: str = None) -> str:
    """从单页原始图片提取翻新页结构（outline + slide JSON）"""
    prompt = f"""\
# Role
你是一位麦肯锡/BCG风格的高级商业分析师兼PPT翻新架构师。你会直接阅读输入的“原始PPT页面图片”，并输出结构化单页 JSON。

# Input
你将收到 1 张页面原图（不是 OCR 文本）。请基于图中真实视觉与语义信息完成提取。

# Core Objective
1. 不依赖 OCR 文本，完全以图片内容为主进行语义理解。
2. 输出单页结构化 JSON（`outline` + `slide`），用于直接渲染和编辑。
3. 标题必须是动作主张句（结论先行）。
4. 每页必须输出 `layout_suggestion` 与 `visual_suggestion`。

# Type Decision
可选 `type` 仅允许：
- 封面页（cover）
- 目录页（catalog）
- 章节页（section_header）
- 图表页（detail_chart）
- 图文页
- 结尾页（closing）

返回时优先使用中文值（如“图文页”）；系统会自动兼容英文值。
根据页面内容自动判断类型；无法判断时使用“图文页”兜底。

# Layout Strategy
`layout_suggestion` 仅允许以下枚举：
- 左右对比（split_comparison）
- 多栏逻辑（multi_column_logic）
- 看板布局（dashboard_style）
- 金字塔层级（pyramid_hierarchy）

返回时优先使用中文值（如“多栏逻辑”）；系统会自动兼容英文值。

# Visual Metaphor
`visual_suggestion` 必须描述主体、隐喻意图、风格氛围、视觉重点，不能只写名词。
- 禁止平铺直叙的配图建议，优先使用具象视觉隐喻（如锁、桥梁、罗盘等）。

# Output Schema（严格遵守）
返回一个 JSON 对象，且只能有两个顶层键：`outline` 和 `slide`。

```json
{{
  "outline": {{
    "title": "动作标题（可作为侧边栏页名）",
    "points": ["要点1", "要点2", "要点3"]
  }},
  "slide": {{
    "type": "图文页",
    "title": "动作标题",
    "layout_suggestion": "多栏逻辑",
    "content": {{
      "headline_summary": "20字内核心论点",
      "detailed_items": [
        {{
          "sub_title": "分论点标题",
          "body": "业务动作 + 证据/数据 + 结果",
          "highlight_phrases": ["关键短语1", "关键短语2"]
        }}
      ]
    }},
    "visual_suggestion": "使用具象视觉隐喻解释抽象概念，包含主体、意境与风格",
    "note": "来源与假设说明"
  }}
}}
```

# Hard Constraints
- 只返回 JSON，不要 Markdown 代码块，不要解释文字。
- 不得输出多余顶层字段。
- 仅基于图片内容生成，不要引入任何外部文本提示信息（含 OCR 文本/大纲文本）。
{get_language_instruction(language)}
"""
    logger.debug(f"[get_ppt_page_content_extraction_from_image_prompt] Final prompt:\n{prompt}")
    return prompt


def get_layout_caption_prompt() -> str:
    """描述 PPT 页面的排版布局（给 caption model 用）"""
    prompt = """\
You are a professional PPT layout analyst. Describe the visual layout and composition of this PPT slide image in detail.

Focus on:
1. **Overall layout**: How elements are arranged (e.g., title at top, content in two columns, image on the right)
2. **Text placement**: Where text blocks are positioned, their relative sizes, alignment
3. **Visual elements**: Position and size of images, charts, icons, decorative elements
4. **Spacing and proportions**: How space is distributed between elements

Output a concise layout description in Chinese that can be used to recreate a similar layout. Format:

排版布局：
- 整体结构：[描述]
- 标题位置：[描述]
- 内容区域：[描述]
- 视觉元素：[描述]

Only describe the layout and spatial arrangement. Do not describe colors, text content, or style.
"""
    logger.debug(f"[get_layout_caption_prompt] Final prompt:\n{prompt}")
    return prompt


def get_style_extraction_prompt() -> str:
    """从图片中提取风格描述（通用，可复用于所有创建模式）"""
    prompt = """\
You are a professional PPT design analyst. Analyze this image and extract a detailed style description that can be used to generate PPT slides with a similar visual style.

Focus on:
1. **Color palette**: Primary colors, secondary colors, accent colors, background colors
2. **Typography style**: Font style impression (serif/sans-serif, weight, size hierarchy)
3. **Design elements**: Decorative patterns, shapes, icons style, borders, shadows
4. **Overall mood**: Professional, playful, minimalist, corporate, creative, etc.
5. **Layout tendencies**: How content is typically arranged, spacing preferences

Output a concise style description in Chinese that can be directly used as a style prompt for PPT generation. Write it as a single paragraph, not a list. Example:

"采用浅灰与钴蓝的高可读配色，标题使用深色粗体，正文以中灰文字呈现。整体风格简约商务，网格清晰、留白充足，局部以低饱和强调色点亮关键数据，视觉层次分明。"

Only output the style description text, no other content.
"""
    logger.debug(f"[get_style_extraction_prompt] Final prompt:\n{prompt}")
    return prompt


def get_style_recommendations_prompt(project_dict: Dict,
                                     reference_files_content: Optional[List[Dict[str, str]]],
                                     template_json_text: str,
                                     style_requirements: str = "",
                                     language: str = None) -> str:
    """
    基于原始内容 + 用户提供的风格模板 JSON 骨架 + 附加风格要求，推荐 3 组风格指导 JSON，并为每组给出 4 个样例页面描述。

    Returns:
        一段用于文本模型的 prompt（要求只输出 JSON，不带代码块）。
    """
    def _truncate(text: str, limit: int) -> str:
        if not text:
            return ""
        s = str(text)
        if len(s) <= limit:
            return s
        return s[:limit] + f"\n...(内容过长，已截断，原长度={len(s)})"

    # Limit uploaded files content to avoid huge prompts causing timeouts.
    # Keep structure compatible with other prompts (uploaded_files XML), but truncate aggressively.
    files_xml = ""
    if reference_files_content:
        max_total = 24000
        max_per_file = 6000
        total = 0
        parts = ["<uploaded_files>"]
        for file_info in reference_files_content:
            if total >= max_total:
                break
            filename = file_info.get('filename', 'unknown')
            content = file_info.get('content', '') or ''
            truncated = _truncate(content, max_per_file)
            # guard total length
            remain = max_total - total
            if len(truncated) > remain:
                truncated = _truncate(truncated, remain)
            parts.append(f'  <file name="{filename}">')
            parts.append('    <content>')
            parts.append(truncated)
            parts.append('    </content>')
            parts.append('  </file>')
            total += len(truncated)
        parts.append('</uploaded_files>')
        parts.append('')
        files_xml = '\n'.join(parts)

    creation_type = (project_dict.get('creation_type') or '').strip()
    idea_prompt = _truncate(project_dict.get('idea_prompt') or "", 4000)
    outline_text = _truncate(project_dict.get('outline_text') or "", 8000)
    description_text = _truncate(project_dict.get('description_text') or "", 8000)

    style_req = (style_requirements or "").strip()

    prompt = f"""\
你是一位顶级 PPT 视觉设计总监 + 风格系统设计师。你的任务是：
1) 阅读用户的原始内容（主题/大纲/描述/上传文件内容）
2) 阅读用户提供的「风格模板 JSON 骨架」
3) 结合用户的「附加风格要求」
4) 输出 3 组不同但都适配内容的「风格指导 JSON」（必须严格遵循模板骨架的结构与字段）
5) 为每组风格提供 4 个用于预览的 PPT 页面描述（封面/目录/详情/结尾），用于生成样例图片

<project_context>
creation_type: {creation_type}
idea_prompt:
{idea_prompt}

outline_text:
{outline_text}

description_text:
{description_text}
</project_context>

<style_template_json_skeleton>
{template_json_text}
</style_template_json_skeleton>

<style_requirements>
{style_req}
</style_requirements>

输出必须是一个 JSON 对象，且只输出 JSON（不要 markdown，不要解释文字），格式如下：
{{
  "recommendations": [
    {{
      "name": "风格名称（短）",
      "rationale": "为什么适配本内容（短）",
      "style_json": {{ /* 必须严格遵循模板骨架结构（同 key / 同层级），填满占位符/空值 */ }},
      "sample_pages": {{
        "cover": "封面页页面描述（含标题/副标题/演讲者信息等文字要求）",
        "toc": "目录页页面描述（含目录结构文字要求）",
        "detail": "详情页页面描述（含若干要点/图表/布局说明等文字要求）",
        "ending": "结尾页页面描述（致谢/Q&A/联系方式等文字要求）"
      }}
    }}
  ]
}}

强约束：
- recommendations 必须刚好 3 个。
- 每个 style_json 必须是合法 JSON 对象，且结构必须与模板骨架完全一致（字段不能少，不能多，不能改名）。
- 模板骨架中的“示例值/演示值”（如“示例”“example”“Tech_Performance_Dark”等）仅用于说明字段含义，禁止机械照抄；必须结合当前内容与风格要求重新生成字段值。
- 禁止 3 组推荐出现同质化配色：在未被用户明确要求“统一暗色”时，至少 1 组为浅色或高亮背景，且至少 2 组在主色相与明度上显著不同。
- 若 style_requirements 为空或含糊，不要默认落入“黑金/暗色科技发布会”风格，应优先生成“中性商务亮色 + 信息可读性优先”的方案作为其中一组。
- sample_pages 必须包含 cover/toc/detail/ending 四个键，值为中文页面描述文本，且要能直接用于生成 PPT 页面。
- 只输出 JSON。
{get_language_instruction(language)}
"""

    final_prompt = files_xml + prompt
    logger.debug(f"[get_style_recommendations_prompt] Final prompt:\n{final_prompt}")
    return final_prompt
