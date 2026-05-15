"""
AI Service Prompts - 集中管理所有 AI 服务的 prompt 模板

分区:
  1. 共享工具 & 常量    — 语言配置、格式化辅助、DRY 常量
  2. 大纲 Prompts       — 生成、解析、细化大纲
  3. 描述 Prompts       — 单页、流式、拆分、细化描述
  4. 图片生成 Prompts   — 文生图、图片编辑
  5. 图片处理 Prompts   — 背景提取、画质修复
  6. 内容提取 Prompts   — 文字属性、页面内容、排版分析、风格提取
  7. 旁白 Prompts        — TTS 播报视频旁白生成
"""
import json
import logging
import re
from textwrap import dedent
from typing import List, Dict, Optional, TYPE_CHECKING

from services.prompt_template_service import (
    prompt_template_overrides_enabled,
    resolve_prompt_template,
)

if TYPE_CHECKING:
    from services.ai_service import ProjectContext

logger = logging.getLogger(__name__)

_PROMPT_TEMPLATE_TAG_KEYS = {
    'get_outline_generation_prompt': 'outline_generation',
    'get_outline_generation_prompt_markdown': 'outline_generation_markdown',
    'get_outline_parsing_prompt': 'outline_parsing',
    'get_outline_parsing_prompt_markdown': 'outline_parsing_markdown',
    'get_description_to_outline_prompt': 'description_to_outline',
    'get_description_to_outline_prompt_markdown': 'description_to_outline_markdown',
    'get_outline_refinement_prompt': 'outline_refinement',
    'get_page_description_json_prompt': 'page_description_json',
    'get_all_descriptions_stream_prompt': 'all_descriptions_stream',
    'get_descriptions_refinement_prompt': 'descriptions_refinement',
}


def _resolve_prompt_override(tag: str, prompt: str) -> str:
    """Resolve a registered prompt override for a prompt builder tag."""
    key = _PROMPT_TEMPLATE_TAG_KEYS.get(tag)
    if not key or not prompt_template_overrides_enabled():
        return prompt
    return resolve_prompt_template(key, prompt)


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
    final = _resolve_prompt_override(tag, files_xml + prompt_text)
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
You are a helpful assistant that generates a PPT outline.

Your task is to define the structure, narrative flow, and intended content of each slide.
Do not write final slide copy. Describe what each slide should cover at the outline level.

Output formats:

1. Simple format, for short PPTs without major sections:

## Slide title
One concise sentence describing what this slide should cover. The sentence may include the slide’s role, main idea, key supporting points, examples, data, or transition logic when relevant.

## Slide title
One concise sentence describing what this slide should cover.

2. Part-based format, for longer PPTs with clear major sections:

# Part 1: Section name

## Slide title
One concise sentence describing what this slide should cover.

## Slide title
One concise sentence describing what this slide should cover.

# Part 2: Section name

## Slide title
One concise sentence describing what this slide should cover.

Constraints:
- Title should not contain page number.
- Choose the format that best fits the content. Use parts when the PPT has clear major sections.
- Unless otherwise specified, the first page should be kept simplest, containing only the title, subtitle, and presenter information.
- Keep content at the outline level: focus on intent, topic, and logic, not polished final wording.
- Each outline page will eventually be converted into an actual slide. Therefore, if a slide should not appear in the final deck, do not output that page from the beginning.

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


def get_description_to_outline_prompt_markdown(project_context: 'ProjectContext',
                                               language: str = None,
                                               extra_fields: list = None) -> str:
    """从描述文本解析出逐页大纲和页面描述的 prompt（Markdown 输出，用于流式生成）"""
    description_text = project_context.description_text or ""
    detail_level = "default"
    description_format = f"""\
--- 页面文字 ---
[此处使用 markdown 直接放置正文文字，细致程度要求：{DETAIL_LEVEL_SPECS[detail_level]}。可包含 LaTeX 公式、表格等内容，不要重复添加页面标题，不要把用户的设计意图显式地放在页面文字中。]

--- 页面文字结束 ---

图片素材：
[如果参考文件或用户输入中存在相关图片素材，以 markdown 格式引用，如 ![描述](/files/xxx/image.png)；否则省略此部分。]
{_format_extra_field_instructions(extra_fields)}
"""

    prompt = (f"""\
You are a helpful assistant that analyzes a user-provided PPT description text and converts it into page-by-page slide structure.

The user has provided the following description text:

{description_text}

Your task is to first split the description into pages, then produce the outline and the page description for each page from that same split.
Each output page must contain both an outline-level narrative structure and the page description. The page count is defined by your page split; do not run a separate outline-only split.
The parser depends on the HTML comment markers below. Do not translate or modify them.

Output rules:
- Use `# Part Name` for major sections (only if the text has clear parts/chapters)
- Use `## Page Title` for each page
- Under each page, output `<!-- OUTLINE_POINTS -->` followed by one or two `- ` bullet points that describe what the slide should cover at the outline level
- Then output `<!-- PAGE_DESCRIPTION -->` followed by the corresponding page description text using this format:
{description_format}
- Preserve layout, style, material, and content details in the page description
- Keep the outline points at the same level as normal idea-generated outlines: focus on slide intent, narrative role, topic, logic, transition, or design purpose
- Do not put final slide copy, exact page text, long evidence lists, or detailed visual/layout instructions in the outline points
- Put concrete page text, data, examples, layout, style, and material details only in the page description section
- Use `<!-- PAGE_END -->` after each page
- Do NOT wrap in code blocks or add any extra text

Example:
## 市场机会概览
<!-- OUTLINE_POINTS -->
- Establish why this opportunity matters and how it connects the audience from macro trend to business relevance.
<!-- PAGE_DESCRIPTION -->
--- 页面文字 ---
- 过去三年目标市场保持高速增长
- 需求从单点工具转向端到端解决方案

--- 页面文字结束 ---

图片素材：
使用趋势图展示增长曲线，整体保持专业克制的商务风格
<!-- PAGE_END -->

Now split the description text above and output the page-by-page structure. Output `<!-- END -->` on the last line when finished.
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
生成的"页面文字"部分会直接渲染到PPT页面上，因此请务必不要包含任何额外的说明性文字或注释，也不要把用户的设计意图显式地放在页面文字中。

## 输出格式

--- 页面文字 ---

[此处使用markdown直接放置正文文字, 细致程度要求：{detail_level_specs[detail_level]}\n\n, 可包含latex公式、表格等内容, 不要重复添加]

--- 页面文字结束 ---

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

--- 页面文字 ---
[第1页文字内容，可包含标题、副标题、要点、latex公式、表格等，根据实际需求选择，避免堆砌和重复. 不要把用户的设计意图显式地放在页面文字中]

--- 页面文字结束 ---

图片素材：
[如果参考文件中存在相关图片，以markdown格式引用，如 ![描述](/files/xxx/image.png)；否则省略此部分。如果用户上传了图片素材请积极地添加]
{_format_extra_field_instructions(extra_fields)}
<!-- PAGE_END -->

--- 页面文字 ---
[第2页文字内容]

--- 页面文字结束 ---

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

    if prompt_template_overrides_enabled():
        prompt = resolve_prompt_template('description_split', prompt)
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

    if prompt_template_overrides_enabled():
        prompt = resolve_prompt_template('image_generation', prompt)
    logger.debug(f"[get_image_generation_prompt] Final prompt:\n{prompt}")
    return prompt



# Auxiliary prompt builders are split out to keep this core prompt module under the file-size limit.
from services.prompt_auxiliary_prompts import (  # noqa: E402,F401
    get_image_edit_prompt,
    get_long_report_split_prompt,
    get_clean_background_prompt,
    get_quality_enhancement_prompt,
    get_text_attribute_extraction_prompt,
    get_batch_text_attribute_extraction_prompt,
    get_ppt_page_content_extraction_prompt,
    get_ppt_page_content_extraction_from_image_prompt,
    get_layout_caption_prompt,
    get_style_extraction_prompt,
    get_style_recommendations_prompt,
    get_style_recommendations_prompt_minimal,
    get_default_narration_generation_config,
    normalize_narration_generation_config,
    parse_narration_generation_result,
    get_narration_generation_prompt,
)
