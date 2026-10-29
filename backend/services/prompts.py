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
    'get_page_description_markdown_prompt': 'page_description_json',
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

2. Part-based format (for longer PPTs with major sections). The cover (and TOC, if any) are \
flat top-level entries — they belong to the deck as a whole, never inside a "part" group:
[
    {"title": "Welcome", "page_type": "封面页", "points": ["point1", "point2"]},
    {
    "part": "Part 1: Introduction",
    "pages": [
        {"title": "Overview", "page_type": "标准图文页", "points": ["point1", "point2"]}
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

_PPT_STANDARD_PAGE_TYPES = """\
标准页面类型清单（page_type 必须从中选择一个）：
- 封面页
- 目录页
- 章节过渡页
- 议程时间线页
- 标准图文页
- 要点列表页
- 对比页
- 流程页
- 框架矩阵页
- 图表页
- 案例展示页
- 结尾页
"""

_DATA_REPORT_STANDARD_PAGE_TYPES = """\
标准页面类型清单（page_type 必须从中选择一个）：
- 报告封面
- 执行摘要
- 目录
- 研究方法
- 章节页
- 品牌概览页
- 品牌历程页
- 品牌画像页
- 品牌定位页
- 核心指标总览页
- 市场概览页
- 品牌对标页
- 品类结构页
- 价格带分布页
- 渠道平台表现页
- 商品SKU诊断页
- 数据明细页
- 洞察图文页
- 洞察图表页
- 矩阵图谱页
- 时间轴生命周期页
- 人群画像页
- 策略建议页
- 封底页
"""

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

_PAGE_DETAIL_MARKDOWN_OUTPUT_FORMAT = """\
# 页面标题
一句与大纲严格对齐的页面主标题

## 核心结论
- 1条结论先行表述

## 页面内容
- 要点1的轻度扩写，保持原意不变
- 要点2的轻度扩写，保持原意不变
- 如有必要，补1条执行建议，但不得新增原大纲没有的核心判断

排版建议：建议使用的版式结构，如“上标题+下方双栏要点”
视觉建议：主体 + 隐喻 + 风格 + 重点
备注：补充假设、适用边界或需确认信息
"""


# --- 辅助函数 ---

def _build_prompt(prompt_text: str, reference_files_content=None, *, tag: str = '') -> str:
    """Prepend reference files XML and log the final prompt."""
    if tag in {'get_outline_generation_prompt', 'get_outline_generation_prompt_markdown', 'get_outline_refinement_prompt', 'get_description_to_outline_prompt', 'get_description_to_outline_prompt_markdown'}:
        if tag.startswith('get_description_to_outline'):
            prompt_text += "\nIf a page argues something, use a takeaway assertion found in or implied by the user's text. Functional pages are exempt; the cover and TOC belong to the deck as a whole, never to a part."
        else:
            prompt_text += '\n\n' + _OUTLINE_TAKEAWAY_RULE
    if tag == 'get_outline_generation_prompt_markdown':
        prompt_text += '\nDo not output a deck-level document title. Use H1 only for part headers; the cover is a regular H2 page.'
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


def _get_project_scenario(project_context: 'ProjectContext') -> str:
    scenario = getattr(project_context, 'scenario', None)
    if scenario == 'data_report':
        return 'data_report'
    return 'ppt'


def _get_standard_page_types_text(project_context: 'ProjectContext') -> str:
    return _DATA_REPORT_STANDARD_PAGE_TYPES if _get_project_scenario(project_context) == 'data_report' else _PPT_STANDARD_PAGE_TYPES


def _get_scenario_prompt_hint(project_context: 'ProjectContext') -> str:
    scenario = _get_project_scenario(project_context)
    if scenario == 'data_report':
        return dedent("""\
        当前项目场景是：数据报告（data_report）。
        你生成的大纲必须按“服装品牌线上数据分析报告”的逻辑组织内容，优先体现品牌认知、市场经营分析、专题洞察与策略输出。
        不要按演讲型 PPT 的节奏去写，不要把所有分析页都泛化成普通图文页。
        """)
    return dedent("""\
    当前项目场景是：PPT（ppt）。
    你生成的大纲必须按演讲/汇报型 PPT 的逻辑组织内容，强调叙事节奏、表达效率和页面角色分工。
    """)


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
    """将额外字段列表格式化为 prompt 中的输出要求。预置字段用定义好的指令，自定义/旧字段用通用格式。"""
    if not extra_fields:
        return ''
    parts = [
        EXTRA_FIELD_INSTRUCTIONS.get(f, f'{f}：[关于{f}的建议，只写其他字段未覆盖的信息]')
        for f in extra_fields
    ]
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

    standard_page_types = _get_standard_page_types_text(project_context)
    scenario_hint = _get_scenario_prompt_hint(project_context)

    prompt = (f"""\
你是一位擅长规划 PPT 结构的助手，请根据用户需求生成 PPT 大纲。

你可以用以下两种方式组织内容：

{_OUTLINE_JSON_FORMAT}

请选择最适合内容的格式。当 PPT 有清晰的主要章节时，使用章节格式。
除非用户另有说明，第一页应保持最简，只包含标题、副标题和汇报人信息。
{standard_page_types}
{scenario_hint}

每个页面对象都必须包含：
- title
- page_type
- points

page_type 的硬约束：
- 每一页都必须填写 `page_type`
- `page_type` 必须从上方标准页面类型清单中选择
- 所选 `page_type` 必须与该页的实际角色匹配
- 第一页通常应为 `封面页`
- 最后一页通常应为 `结尾页`，或其他有明确收束理由的结束页类型

用户需求：{idea_prompt}。
{_format_requirements(project_context.outline_requirements)}现在生成大纲，不要包含任何额外文字。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_generation_prompt')


def get_outline_generation_prompt_markdown(project_context: 'ProjectContext', language: str = None) -> str:
    """生成 PPT 大纲的 prompt（Markdown 输出，用于流式生成）"""
    idea_prompt = project_context.idea_prompt or ""

    standard_page_types = _get_standard_page_types_text(project_context)
    scenario_hint = _get_scenario_prompt_hint(project_context)

    prompt = (f"""\
你是一位擅长规划 PPT 结构的助手，请生成 Markdown 格式的 PPT 大纲。

你的任务是定义每页的结构、叙事流和内容意图。
不要撰写最终上屏文案，只在大纲层面描述每页应覆盖什么。

输出格式：

1. 简单格式，适用于没有主要章节的短 PPT：

## 页面标题
用一句简洁的话说明本页要覆盖的内容。可按需包含页面角色、核心观点、关键支撑点、示例、数据或转场逻辑。

## 页面标题
用一句简洁的话说明本页要覆盖的内容。

2. 章节格式，适用于有清晰主要章节的长 PPT：

# 第一部分：章节名称

## 页面标题
用一句简洁的话说明本页要覆盖的内容。

## 页面标题
用一句简洁的话说明本页要覆盖的内容。

# 第二部分：章节名称

## 页面标题
用一句简洁的话说明本页要覆盖的内容。

约束：
- 标题不要包含页码。
- 请选择最适合内容的格式。当 PPT 有清晰的主要章节时，使用章节格式。
- 除非用户另有说明，第一页应保持最简，只包含标题、副标题和汇报人信息。
- 内容保持在大纲层级：聚焦意图、主题和逻辑，不要写成最终精修文案。
- 每个大纲页最终都会转换为实际幻灯片。因此，如果某页不应出现在最终文稿中，一开始就不要输出该页。
- 每页都需要在 `## 页面标题` 之后紧跟一行 `Page Type: xxx`。
- `xxx` 必须从以下标准页面类型清单中选择：
{standard_page_types}
- 所选页面类型必须与该页的真实功能匹配。
{scenario_hint}

用户需求：{idea_prompt}。
{_format_requirements(project_context.outline_requirements)}现在生成大纲，严格遵循上述格式，不要包含任何额外文字。完成后最后一行输出 `<!-- END -->`。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_generation_prompt_markdown')


def get_outline_parsing_prompt(project_context: 'ProjectContext', language: str = None) -> str:
    """解析用户提供的大纲文本的 prompt（JSON 输出）"""
    outline_text = project_context.outline_text or ""

    standard_page_types = _get_standard_page_types_text(project_context)
    scenario_hint = _get_scenario_prompt_hint(project_context)

    prompt = (f"""\
你是一位擅长解析 PPT 大纲的助手，请把用户提供的大纲文本转换为结构化格式。

用户提供的大纲文本如下：

{outline_text}

你的任务是分析该文本并转换为结构化 JSON 格式，不能修改任何原始文本内容。
你只能重新组织和结构化已有内容，保留所有标题、要点和文字的原貌。

你可以用以下两种方式组织内容：

{_OUTLINE_JSON_FORMAT}

重要规则：
- 不要修改、改写或改变原大纲中的任何文字。
- 不要添加原文中不存在的新内容。
- 不要删除原文中的任何内容。
- 只把已有内容重新组织为结构化格式。
- 保留所有标题、项目符号和文字的原始写法。
- 如果文本有清晰章节，使用章节格式。
- 从原文提取标题和要点，并保持原文表述。
{standard_page_types}
{scenario_hint}

- 每个页面对象都必须增加必填的 `page_type` 字段。
- `page_type` 需要根据页面角色推断，并从上方标准页面类型清单中选择。

现在将上述大纲文本解析为结构化格式。只返回 JSON，不要包含任何额外文字。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_parsing_prompt')


def get_outline_parsing_prompt_markdown(project_context: 'ProjectContext', language: str = None) -> str:
    """解析用户提供的大纲文本的 prompt（Markdown 输出，用于流式生成）"""
    outline_text = project_context.outline_text or ""

    prompt = (f"""\
你是一位擅长解析 PPT 大纲的助手，请把用户提供的大纲文本转换为结构化 Markdown 格式。

用户提供的大纲文本如下：

{outline_text}

你的任务是分析该文本并转换为结构化 Markdown 大纲，不能修改任何原始文本内容。

输出规则：
- 对主要章节使用 `# 章节名称`（仅当文本中有清晰章节时使用）。
- 对每一页使用 `## 页面标题`。
- 每页下方使用 `- ` 项目符号列出关键要点。
- 保留所有标题、要点和文字的原始写法。
- 不要包裹代码块，不要添加任何额外文字。

现在将上述大纲文本解析为 Markdown 格式。完成后最后一行输出 `<!-- END -->`。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_outline_parsing_prompt_markdown')


def get_description_to_outline_prompt(project_context: 'ProjectContext', language: str = None) -> str:
    """从描述文本解析出大纲的 prompt（JSON 输出）"""
    description_text = project_context.description_text or ""
    standard_page_types = _get_standard_page_types_text(project_context)
    scenario_hint = _get_scenario_prompt_hint(project_context)

    prompt = (f"""\
你是一位擅长分析 PPT 描述文本的助手，请从用户提供的页面描述中提取大纲结构。

用户提供的描述文本如下：

{description_text}

你的任务是分析该文本，并提取每一页的大纲结构（标题和关键要点）。
你需要识别：
1. 文本描述了多少页。
2. 每页标题是什么。
3. 每页的关键要点或内容结构是什么。

你可以用以下两种方式组织内容：

{_OUTLINE_JSON_FORMAT}

重要规则：
- 从描述文本中提取大纲结构。
- 识别页面标题和关键要点。
- 如果文本有清晰章节，使用章节格式。
- 保留原文的逻辑结构与组织方式。
- 要点应是每页主要内容的简洁摘要。
{standard_page_types}
{scenario_hint}

- 每个页面对象都必须增加必填的 `page_type` 字段。
- `page_type` 需要根据页面角色推断，并从上方标准页面类型清单中选择。

现在从上述描述文本中提取大纲结构。只返回 JSON，不要包含任何额外文字。
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

{_format_extra_field_instructions(extra_fields)}
"""

    prompt = (f"""\
你是一位擅长分析 PPT 描述文本的助手，请把用户提供的描述文本转换为逐页幻灯片结构。

用户提供的描述文本如下：

{description_text}

你的任务是先将描述拆分为页面，再基于同一次拆分产出每页的大纲和页面描述。
每个输出页面都必须同时包含大纲层级的叙事结构和页面描述。页数由你的拆分结果决定，不要再单独做一次只含大纲的拆分。
解析器依赖下面的 HTML 注释标记。不要翻译或修改这些标记。

输出规则：
- 对主要章节使用 `# 章节名称`（仅当文本中有清晰章节时使用）。
- 对每一页使用 `## 页面标题`。
- 每页下方先输出 `<!-- OUTLINE_POINTS -->`，随后用一到两个 `- ` 要点说明该页在大纲层面应覆盖什么。
- 然后输出 `<!-- PAGE_DESCRIPTION -->`，并按以下格式给出对应页面描述：
{description_format}
- 在页面描述中保留版式、风格、素材和内容细节。
- 大纲要点保持在常规“构想生成大纲”的层级：聚焦页面意图、叙事角色、主题、逻辑、转场或设计目的。
- 不要把最终上屏文案、精确页面文字、长证据列表或详细视觉/版式说明放进大纲要点。
- 具体页面文字、数据、案例、版式、风格和素材细节只放在页面描述部分。
- 每页结束后使用 `<!-- PAGE_END -->`。
- 不要包裹代码块，不要添加任何额外文字。

示例：
## 市场机会概览
<!-- OUTLINE_POINTS -->
- 建立市场机会的重要性，并把宏观趋势自然连接到业务价值。
<!-- PAGE_DESCRIPTION -->
--- 页面文字 ---
- 过去三年目标市场保持高速增长
- 需求从单点工具转向端到端解决方案

--- 页面文字结束 ---

配图与素材：
使用趋势图展示增长曲线，整体保持专业克制的商务风格
<!-- PAGE_END -->

现在拆分上述描述文本，并输出逐页结构。完成后最后一行输出 `<!-- END -->`。
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
你是一位擅长根据用户要求修改 PPT 大纲的助手。
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

    prompt = (f"""\
我们正在为PPT的每一页生成内容描述。
用户的原始需求是：\n{original_input}\n
我们已经有了完整的大纲：\n{outline}\n{part_info}
{_format_requirements(project_context.description_requirements, "description")}现在请为第 {page_index} 页生成描述：
{page_outline}
{"**除非特殊要求，第一页的内容需要保持极简，只放标题副标题以及演讲人等（输出到标题后）, 不添加任何素材。**" if page_index == 1 else ""}
## 重要提示
- "页面文字"中的内容会被逐字渲染到 PPT 页面上：只写真正要出现在页面上的文字，不要包含任何说明性文字、注释或设计意图（设计意图写入下方对应字段）。
- 标题规则：内容页的标题优先写成论断句——一句话陈述本页结论（如"算力瓶颈才是历次 AI 寒冬的根因"），而不是话题短语（如"AI 寒冬回顾"）。大纲中该页的第一条 takeaway 要点是标题的首选来源。封面、目录、章节过渡等功能页保持简短标题。

## 输出格式

--- 页面文字 ---

[此处使用markdown直接放置正文文字, 细致程度要求：{DETAIL_LEVEL_SPECS[detail_level]}\n\n, 可包含latex公式、表格等内容, 不要重复添加]

--- 页面文字结束 ---
{_format_extra_field_instructions(extra_fields)}

## 关于素材图片
如果参考文件中包含以 /files/ 开头的本地文件URL图片（例如 /files/mineru/xxx/image.png），请以 markdown 格式引用（如 ![图片描述](/files/mineru/xxx/image.png)），写入"配图与素材"字段；若该字段未启用，则直接附在页面文字之后。这些图片会被包含在PPT页面中。
{get_language_instruction(language)}
""")

    return _build_prompt(prompt, project_context.reference_files_content, tag='get_page_description_prompt')



def get_page_description_markdown_prompt(project_context: 'ProjectContext', outline: list,
                                         page_outline: dict, page_index: int,
                                         part_info: str = "",
                                         language: str = None,
                                         detail_level: str = "default") -> str:
    """为文本生成场景产出忠于大纲的单页 Markdown 描述。"""
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
# 角色
你是一位严谨的商业演示文稿架构师。你的任务是基于大纲与上下文，生成可直接渲染的单页 Markdown 页面说明。

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
1. 输出 Markdown 页面说明，不要输出 JSON，不要输出代码块。
2. 必须以当前页标题与要点为内容边界，优先保持原意，仅做轻度扩写与结构化表达。
3. 不得改写原有结论方向、因果关系和主张，不得新增当前页要点中未出现的核心观点。
4. 内容要体现结论先行、论据支撑、可执行表达，但这些表达必须服务于原大纲，不得脱离原大纲自行发挥。
5. 若当前页要点本身已经较完整，允许少扩写，重点做清晰整理，而不是强行丰富。
6. 页面正文以 Markdown 小节和短要点呈现；补充信息统一写在文末字段中。
{first_page_constraint}

# 详细程度
当前详细程度要求：{DETAIL_LEVEL_SPECS.get(detail_level, DETAIL_LEVEL_SPECS['default'])}

# 写作要求
- 默认使用中文。
- 页面正文优先包含：页面标题、核心结论、页面内容。
- 封面页内容极简，只保留标题、副标题、汇报信息；不要补正文段落。
- 若页面适合图表表达，可在正文中说明“建议用图表呈现什么关系”，但不要伪造精确数据。
- `配图与素材` 优先使用视觉隐喻，不要平铺直叙；并且必须写清主体、意境、风格、画面重点。
- 文末必须保留以下三个字段名，单独成行：
  - `版式与重点：...`
  - `配图与素材：...`
  - `演讲者备注：...`

# 输出示例
{_PAGE_DETAIL_MARKDOWN_OUTPUT_FORMAT}

# 硬约束
- 只输出 Markdown 页面说明，不要解释，不要加围栏代码块。
- 不要复述“完整大纲”JSON。
- 不要写“根据以上内容”“如下所示”等提示语。
- 不得为了语言高级感而替换掉原要点的核心语义。
{get_language_instruction(language)}
"""
    return _build_prompt(prompt, project_context.reference_files_content, tag='get_page_description_markdown_prompt')


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
- "页面文字"中的内容会被逐字渲染到 PPT 页面上：只写真正要出现在页面上的文字，不要包含任何说明性文字、注释或设计意图（设计意图写入下方对应字段）。
- 标题规则：内容页的标题优先写成论断句——一句话陈述本页结论（如"算力瓶颈才是历次 AI 寒冬的根因"），而不是话题短语（如"AI 寒冬回顾"）。大纲中该页的第一条 takeaway 要点是标题的首选来源。封面、目录、章节过渡等功能页保持简短标题。
- **第一页（封面页）保持极简**，只放标题、副标题、演讲人等信息，不添加任何素材。
- 细致程度要求：{DETAIL_LEVEL_SPECS[detail_level]}

## 输出格式
每页包含"页面文字"与下列额外字段。素材图片（以 /files/ 开头的本地路径）以 markdown 格式引用，优先写入"配图与素材"字段。
```
<!-- BEGIN -->

--- 页面文字 ---
[第1页文字内容，可包含标题、副标题、要点、latex公式、表格等，根据实际需求选择，避免堆砌和重复. 不要把用户的设计意图显式地放在页面文字中。]

--- 页面文字结束 ---
{_format_extra_field_instructions(extra_fields)}
<!-- PAGE_END -->

--- 页面文字 ---
[第2页文字内容]

--- 页面文字结束 ---
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
你是一位擅长拆分 PPT 描述文本的助手，请把完整描述拆分为逐页描述。

用户提供的完整描述文本如下：

{description_text}

我们已经提取出大纲结构：

{outline_json}

你的任务是根据大纲结构，把描述文本拆分成每一页对应的页面描述。
请为大纲中的每一页，从原文中提取对应描述。

请返回一个 JSON 数组，数组中每个元素对应大纲中的一页（顺序保持一致）。
每个元素应是一个字符串，字符串中包含以下格式的页面描述：

页面标题：[页面标题]

页面文字：
- [要点1]
- [要点2]
...

其他页面素材（如果有排版、风格、素材等细节）

示例输出格式：
[
    "页面标题：人工智能的诞生\\n页面文字：\\n- 1950 年，图灵提出"图灵测试"\\n- 奠定了AI的理论基础\\n\\n其他页面素材：\\n排版：标题居中，大字号\\n风格：科技感蓝色背景",
    "页面标题：AI 的发展历程\\n页面文字：\\n- 1950年代：符号主义...",
    ...
]

重要规则：
- 根据大纲结构拆分描述文本。
- 每页描述应匹配大纲中的对应页面。
- 保留原文所有重要内容，包括排版细节、风格要求、素材说明以及其他设计要求。
- 如果用户为某页描述了版式、风格或素材，请放入“其他页面素材”部分。
- 保持与上方示例一致的格式。
- 如果大纲中的某页在原文中没有清晰描述，请基于大纲创建合理描述。

现在将描述文本拆分为逐页描述。只返回 JSON 数组，不要包含任何额外文字。
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
            extra_fields = content.get('extra_fields') or {}
            content = (content.get('text') or '') + '\n' + '\n'.join(f'{key}：{value}' for key, value in extra_fields.items() if value)
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
    force_structured_for_single_page = len(current_descriptions or []) == 1 and (structured_count > 0 or not any(isinstance(item.get('description_content'), dict) and item['description_content'].get('extra_fields') for item in current_descriptions))
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
你是一位擅长根据用户要求修改 PPT 页面描述的助手。
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
- 不要凭空删除已有的附加字段；仅按用户要求更新其内容
- 如果当前没有内容，请根据大纲和用户要求创建新的描述

请为每个页面生成修改后的描述，格式如下：

页面标题：[页面标题]

页面文字：
- [要点1]
- [要点2]
...
{_format_extra_field_instructions(list(EXTRA_FIELD_INSTRUCTIONS))}

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
                                aspect_ratio: str = "16:9",
                                page_style_text: str = None) -> str:
    """生成图片生成 prompt"""
    if page_style_text:
        extra_requirements = "\n\n".join(filter(None, [extra_requirements, "<page_style>\n" + page_style_text + "\n</page_style>"]))
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


def get_style_from_content_prompt(content: str, language: str = 'zh') -> str:
    """
    根据用户输入的 PPT 内容/大纲/主题，自动构思并建模生成专业的 PPT 风格描述。
    格式与范式参考 4 大经典预设风格（简约商务、现代科技、严谨学术、活泼创意等）。
    """
    is_zh = (language or 'zh').lower().startswith('zh')
    # 截断过长内容，避免不必要的 token 消耗
    trimmed_content = content.strip()[:3000]

    if is_zh:
        prompt = f"""\
你是一位拥有顶级视觉审美与专业幻灯片设计经验的资深 PPT 设计总监。
请根据用户提供的 PPT 主题、大纲或内容，深度分析其行业领域、受众群体、表达情绪与应用场景，为其量身打造一套最契合的 PPT 视觉风格建模描述。

【输入内容】：
{trimmed_content}

【风格建模设计规范】：
你生成的风格描述必须参照以下 4 个核心维度，输出为结构清晰、指令具体、可直接作为 AI 生图/设计 Prompt 的段落文本（请包含以下4个小标题段落，不要输出任何多余的前言、解释或总结）：

1. **视觉描述**：界定全局视觉语言与设计范式（如极致扁平、极简留白、未来科技流体、杂志排版、手绘亲和等），阐述整体设计氛围、光照环境（如均匀演播室漫射光、暗调霓虹辉光、自然漫射光等）与基调。
2. **配色与材质**：明确背景色（给出具体建议十六进制色值，如 #0B1F3B 或 #F8F7F2）、正文/标题文字色、核心强调色（注明占比限制，如不超过 3%~5%）及次要辅助色；明确材质表现（如平滑矢量色块、哑光纸质颗粒、玻璃拟态等）与阴影规则（如禁止阴影/极弱软阴影）。
3. **内容与排版**：明确网格对齐规范、页面分区结构（几何分区/模块化卡片/留白比例）、装饰线条与边框粗细色值，以及中英文字体调性（无衬线体、衬线体、圆体等字重与层级逻辑）。
4. **插图与渲染要求**：明确插画/图形资产形态（如统一白色线稿、2D扁平矢量、手绘插画、玻璃微拟态等）、图表配色与要求，以及最终渲染质量和美学风格（如超高清矢量插画与商务信息图风格，边缘锐利无锯齿）。

【参考经典范例格式】：
范例一（简约商务）：
视觉描述：全局视觉语言严格对齐国际顶级咨询公司通用商务范式，强调专业、稳重、克制与可复用。全稿采用极致扁平化与强秩序网格，以信息清晰传达为唯一优先级。禁止渐变、发光、高光、拟物纹理与非必要装饰。光照固定为均匀演播室漫射光，无硬阴影。
配色与材质：背景色锁定为海军蓝（#0B1F3B），文字颜色固定为纯白（#FFFFFF），唯一强调色为天蓝（#38BDF8，面积不超过3%），辅助分割线使用浅灰（#E5E7EB）。材质为平滑矢量色块，不使用阴影与复杂材质。
内容与排版：遵循严格模块化网格系统，页面几何分区清晰，边界使用1px细线（#E5E7EB）划分。字体为现代无衬线体（如思源黑体/Roboto），层级分明。
插图与渲染要求：所有视觉素材统一为白色矢量线稿（#FFFFFF），关键路径用天蓝点亮；输出超高清矢量插画与商务信息图风格，边缘锐利无锯齿。

范例二（现代科技）：
视觉描述：全局视觉语言融合深邃未来感与现代SaaS产品美学。整体氛围神秘、深邃且富有动感，光照采用暗调环境下的自发光与辉光效果。
配色与材质：背景色采用午夜黑（#0B0F19），主色调使用电光蓝（#00A3FF）与赛博紫（#7C3AED）线性渐变，材质运用半透明磨砂玻璃与微发光网格线。
内容与排版：采用不对称动态平衡排版，融入轻量3D线框几何或芯片结构，使用科技感等宽字体或现代无衬线体。
插图与渲染要求：高精度渲染风格，强调光线追踪、辉光与景深控制，粒子特效细腻且充满视觉冲击力。

【输出要求】：
- 直接输出上述规范格式的风格描述文本（包含 视觉描述、配色与材质、内容与排版、插图与渲染要求）。
- 严禁包含任何前缀闲聊（如"好的，为您生成如下风格："）或后缀说明。
"""
    else:
        prompt = f"""\
You are a senior PPT visual design director. Analyze the given presentation topic/outline/content and generate a tailored, professional visual style description for this presentation.

[Input Content]:
{trimmed_content}

[Style Modeling Requirements]:
Your generated style description MUST cover these 4 core dimensions:
1. **Visual Description**: Global visual language, design paradigm (e.g. flat, minimalist, futuristic, editorial), lighting, and overall mood.
2. **Color & Material**: Background color (with exact hex codes e.g. #0B1F3B), text color, primary accent color (with usage cap e.g. <=3%), secondary colors, material finish (flat color block, matte paper, frosted glass), and shadow rules.
3. **Content & Typography**: Grid alignment, page partitioning, divider lines, and font classification (serif, sans-serif, weight hierarchy).
4. **Illustration & Rendering**: Illustration style (vector line art, flat 2D, 3D clay, etc.), chart specifications, and final rendering aesthetic quality.

Output ONLY the structured style description text without any conversational preamble or markdown code blocks.
"""
    logger.debug(f"[get_style_from_content_prompt] Final prompt:\n{prompt}")
    return prompt


def get_template_analysis_prompt(language: str = 'zh') -> str:
    """
    PRD §5.3 9-field schema. Returns markdown-fenced JSON; parsed by
    AIService.generate_json_with_image (3x soft retry).

    On unrecognizable input the model must return {"error": "not_a_slide"};
    the caller flips analysis_status='failed' (decision 2).
    """
    is_zh = language.lower().startswith('zh')

    if is_zh:
        return """你是一名 PPT 模板视觉分析师。仔细观察这张幻灯片图像，提取它作为"模板"的结构化特征。

# 输出要求

严格返回**一个** JSON 对象，包裹在 ```json 代码块中。**禁止**输出代码块以外的任何文字。

如果这张图根本不是幻灯片（例如是一张照片、表情包、自拍），返回：
```json
{"error": "not_a_slide"}
```

# JSON Schema (10 字段)

```json
{
  "template_role": "cover | content | section_divider | summary | data | comparison | timeline | other",
  "layout_structure": "用 kebab-case 概括版式，如 title-top-two-column / hero-image-bottom-text",
  "extracted_text": "模板图上可见的真实文字：主标题 + 关键要点，≤80 字；若全是 Lorem ipsum 等占位文字则留空字符串",
  "content_capacity": "low | medium | high",
  "text_regions": [
    {"name": "title", "position": "top | center | bottom | left | right", "size": "small | medium | large"}
  ],
  "image_regions": [
    {"name": "hero", "position": "top | center | bottom | left | right", "size": "small | medium | large"}
  ],
  "visual_density": "low | medium | high",
  "style_keywords": ["最多 5 个英文形容词，如 academic / clean / minimalist / bold / playful"],
  "color_palette": ["最多 5 个主色 hex，#RRGGBB"],
  "notes": "用一两句话补充任何 schema 字段未覆盖的视觉特征，如固定 logo、装饰元素、特殊版式约束"
}
```

# 示例 1 — 封面页

```json
{
  "template_role": "cover",
  "layout_structure": "centered-title-large-hero-bg",
  "extracted_text": "智慧城市数据平台发布会 · 2025 产品战略",
  "content_capacity": "low",
  "text_regions": [
    {"name": "title", "position": "center", "size": "large"},
    {"name": "subtitle", "position": "center", "size": "medium"}
  ],
  "image_regions": [
    {"name": "background", "position": "center", "size": "large"}
  ],
  "visual_density": "low",
  "style_keywords": ["bold", "modern", "high-contrast"],
  "color_palette": ["#0E1A2B", "#F4B400"],
  "notes": "底部 1/4 处有半透明渐变蒙版，便于叠加白色标题"
}
```

# 示例 2 — 双栏正文

```json
{
  "template_role": "content",
  "layout_structure": "title-top-two-column",
  "extracted_text": "研究方法与数据来源：问卷调查 / 深度访谈",
  "content_capacity": "medium",
  "text_regions": [
    {"name": "title", "position": "top", "size": "medium"},
    {"name": "left_body", "position": "left", "size": "medium"},
    {"name": "right_body", "position": "right", "size": "medium"}
  ],
  "image_regions": [],
  "visual_density": "medium",
  "style_keywords": ["academic", "clean", "blue"],
  "color_palette": ["#FFFFFF", "#1F4E79", "#4472C4"],
  "notes": "右下角有固定 logo 区域，左栏与右栏之间有 4px 浅灰分割线"
}
```

# 示例 3 — 时间线

```json
{
  "template_role": "timeline",
  "layout_structure": "horizontal-timeline-five-nodes",
  "extracted_text": "项目实施路线图：启动 / 调研 / 开发 / 试点 / 推广",
  "content_capacity": "high",
  "text_regions": [
    {"name": "title", "position": "top", "size": "medium"},
    {"name": "node_labels", "position": "center", "size": "small"}
  ],
  "image_regions": [
    {"name": "node_icons", "position": "center", "size": "small"}
  ],
  "visual_density": "high",
  "style_keywords": ["infographic", "timeline", "professional"],
  "color_palette": ["#2E75B6", "#A9D18E", "#FFC000", "#ED7D31"],
  "notes": "贯穿水平的箭头主线，5 个等距节点，节点上方放图标、下方放文字"
}
```

# 关键约束

- `style_keywords` 与 `color_palette` 最多 5 项
- `text_regions` / `image_regions` 数组可空，但必须存在
- 所有 enum 字段严格使用上述候选值，不得自创
- `notes` 字段是你主观补充的"AI 观察"，鼓励填写但不超过 80 字"""

    return """You are a slide-template visual analyst. Inspect this slide image and extract structured features that describe it **as a template**.

# Output

Return exactly **one** JSON object inside a ```json fenced code block. Do NOT emit any text outside the code block.

If the image is clearly not a slide (e.g. a photo, meme, selfie), return:
```json
{"error": "not_a_slide"}
```

# JSON Schema (10 fields)

```json
{
  "template_role": "cover | content | section_divider | summary | data | comparison | timeline | other",
  "layout_structure": "kebab-case layout label, e.g. title-top-two-column / hero-image-bottom-text",
  "extracted_text": "real text visible on the template: main title + key bullets, <= 80 chars; empty string if it is all placeholder text (Lorem ipsum etc.)",
  "content_capacity": "low | medium | high",
  "text_regions": [
    {"name": "title", "position": "top | center | bottom | left | right", "size": "small | medium | large"}
  ],
  "image_regions": [
    {"name": "hero", "position": "top | center | bottom | left | right", "size": "small | medium | large"}
  ],
  "visual_density": "low | medium | high",
  "style_keywords": ["up to 5 English adjectives, e.g. academic / clean / minimalist / bold / playful"],
  "color_palette": ["up to 5 dominant hex colors, #RRGGBB"],
  "notes": "one or two sentences capturing visual specifics not covered by other fields, e.g. fixed logo, decorative motifs, layout constraints"
}
```

# Example 1 — cover

```json
{
  "template_role": "cover",
  "layout_structure": "centered-title-large-hero-bg",
  "extracted_text": "Smart City Data Platform — 2025 Product Strategy",
  "content_capacity": "low",
  "text_regions": [
    {"name": "title", "position": "center", "size": "large"},
    {"name": "subtitle", "position": "center", "size": "medium"}
  ],
  "image_regions": [
    {"name": "background", "position": "center", "size": "large"}
  ],
  "visual_density": "low",
  "style_keywords": ["bold", "modern", "high-contrast"],
  "color_palette": ["#0E1A2B", "#F4B400"],
  "notes": "Translucent gradient overlay on the lower quarter to host white title text"
}
```

# Example 2 — two-column content

```json
{
  "template_role": "content",
  "layout_structure": "title-top-two-column",
  "extracted_text": "Research Methods & Data Sources: surveys / interviews",
  "content_capacity": "medium",
  "text_regions": [
    {"name": "title", "position": "top", "size": "medium"},
    {"name": "left_body", "position": "left", "size": "medium"},
    {"name": "right_body", "position": "right", "size": "medium"}
  ],
  "image_regions": [],
  "visual_density": "medium",
  "style_keywords": ["academic", "clean", "blue"],
  "color_palette": ["#FFFFFF", "#1F4E79", "#4472C4"],
  "notes": "Fixed logo area at bottom-right, 4px light-gray divider between columns"
}
```

# Example 3 — timeline

```json
{
  "template_role": "timeline",
  "layout_structure": "horizontal-timeline-five-nodes",
  "extracted_text": "Implementation Roadmap: kickoff / research / build / pilot / rollout",
  "content_capacity": "high",
  "text_regions": [
    {"name": "title", "position": "top", "size": "medium"},
    {"name": "node_labels", "position": "center", "size": "small"}
  ],
  "image_regions": [
    {"name": "node_icons", "position": "center", "size": "small"}
  ],
  "visual_density": "high",
  "style_keywords": ["infographic", "timeline", "professional"],
  "color_palette": ["#2E75B6", "#A9D18E", "#FFC000", "#ED7D31"],
  "notes": "Horizontal arrow spine, 5 evenly-spaced nodes, icons above, labels below"
}
```

# Constraints

- `style_keywords` and `color_palette`: up to 5 items
- `text_regions` / `image_regions` may be empty arrays but must be present
- All enum fields must use the listed candidates only
- `notes` is your subjective "AI observation"; encouraged but max ~80 words"""


def get_template_auto_match_prompt(templates: list, pages: list, language: str = 'zh') -> str:
    """
    Decision 5 prompt. Returns the full instruction string ready for
    generate_json. The caller is responsible for input trimming
    (page summary <= 100 chars, notes <= 200 chars, style_keywords <= 5).
    """
    is_zh = language.lower().startswith('zh')

    templates_json = json.dumps(templates, ensure_ascii=False, indent=2)
    pages_json = json.dumps(pages, ensure_ascii=False, indent=2)

    if is_zh:
        return f"""你是一名 PPT 模板调度师。给定一组项目内的"模板"和一份按 order_index 排序的页面摘要，请为每页选择最合适的模板。

# 候选模板（asset_id 必须从这里挑选，禁止编造）

```json
{templates_json}
```

# 待匹配页面

```json
{pages_json}
```

# 输出要求

严格返回**一个** JSON 数组，包裹在 ```json 代码块中。每个元素对应一页：

```json
[
  {{
    "page_id": "<必须等于输入页面的 page_id>",
    "template_asset_id": "<候选模板里的 asset_id；status=undecided 时为 null>",
    "status": "matched | undecided",
    "confidence": 0.0,
    "reason": "≤80 字，解释为什么选这张/为什么放弃"
  }}
]
```

# 选择原则

按以下优先级依次考量：

1. **角色对齐**：封面必须分到 `template_role=cover`，目录、分章节、总结同理。角色错配是最严重的错误。
2. **排版结构匹配**：主要依据——页面的图文构成（`layout_hint`、`summary`）应与模板的 `layout_structure` / `text_regions` / `image_regions` 吻合；`content_density` 与 `content_capacity` / `visual_density` 对应（low↔low, high↔high）。
3. **文字对应辅助消歧**：在角色与排版都合适的候选之间，若模板的 `extracted_text` 与该页 `title`/`summary` 明显对应（模板很可能就是这一页的草稿/成稿），优先选它并提高 confidence；由此定案时不受第 5 条节奏限制，整库逐页对应时自然形成一对一。它只辅助消歧，不得为迁就文字对应而选排版不合适的模板。`sort_order` 与 `order_index` 一致可作佐证；占位文字（空 `extracted_text`）不参与。
4. **风格连贯（tie-break）**：模板库风格通常统一，且生成时模板会把风格强加给内容，风格只在库内风格不一时用于收尾——保持全篇连贯，避免相邻页风格跳变。
5. **节奏感**：避免连续 5 页用同一张模板；同一模板间至少留 1 页间隔（除非候选数量不足）。
6. **不确定时**：宁可返回 `status=undecided`（`template_asset_id=null`），让用户手动决定，也不要乱猜。`confidence < 0.5` 时建议改用 undecided。
7. **绝不**返回不在候选列表里的 `asset_id`。

# 输出长度

数组长度必须严格等于待匹配页面数量；`page_id` 顺序应与输入一致。"""

    return f"""You are a slide-template assigner. Given a project's template library and a page-summary list (sorted by order_index), pick the best template for each page.

# Candidate templates (asset_id MUST come from this list; never invent)

```json
{templates_json}
```

# Pages to match

```json
{pages_json}
```

# Output

Return exactly **one** JSON array inside a ```json fenced code block. One element per page:

```json
[
  {{
    "page_id": "<must match an input page_id>",
    "template_asset_id": "<an asset_id from the candidates; null when status=undecided>",
    "status": "matched | undecided",
    "confidence": 0.0,
    "reason": "<= 80 chars: why this template, or why undecided"
  }}
]
```

# Principles

Weigh candidates in this order:

1. **Role alignment**: covers must get `template_role=cover`; TOC, section dividers and summaries likewise. A role mismatch is the worst possible error.
2. **Layout fit**: the main criterion — the page's text/image mix (`layout_hint`, `summary`) should fit the template's `layout_structure` / `text_regions` / `image_regions`; `content_density` should align with `content_capacity` / `visual_density` (low↔low, high↔high).
3. **Text correspondence as disambiguator**: among candidates that already fit role and layout, if a template's `extracted_text` clearly corresponds to the page's `title`/`summary` (the template is likely this page's draft), prefer it and raise confidence; a choice settled this way is exempt from principle 5, so a fully corresponding library naturally maps one-to-one. This is auxiliary only — never pick a layout-unsuitable template just to honor text correspondence. Matching `sort_order` vs `order_index` is supporting evidence; placeholder text (empty `extracted_text`) never counts.
4. **Style cohesion (tie-break)**: a project library is usually style-uniform, and generation imposes the template's style onto the content anyway; use style only when the library mixes styles — keep the deck cohesive and avoid jarring switches between adjacent pages.
5. **Rhythm**: avoid 5 consecutive pages with the same template; keep at least 1 page gap when candidates allow.
6. **When unsure**: prefer `status=undecided` (template_asset_id=null) over guessing. confidence<0.5 should be undecided.
7. **Never** return an asset_id outside the candidate list.

# Length

Array length must equal the number of input pages; `page_id` order must match the input."""



_OUTLINE_TAKEAWAY_RULE = """\
Takeaway rule:
- For content pages, the FIRST point must be the page's takeaway: one complete assertion \
sentence stating the conclusion the audience should remember (e.g. "Compute limits, not \
lack of ideas, caused every AI winter"), never a topic phrase (e.g. "AI winter review").
- State the conclusion ITSELF; do not merely announce that a conclusion exists. Write \
"Self-hosting breaks even within 12-18 months once daily requests pass the threshold", NOT \
"The break-even analysis reveals when to switch" — the latter looks like a sentence but only \
names the topic while hiding the actual answer.
- Follow the takeaway with 1-2 points giving the EVIDENCE behind it — concrete data, examples, \
or mechanisms — not a reworded restatement of the takeaway itself.
- For functional pages (cover, table of contents, section divider, thank-you/Q&A), points \
only describe what the page contains — do not force assertions.
- The cover and table of contents page belong to the deck as a whole, never to a part: do \
not nest them under a `# Part` heading, and do not give them a "part" value.
- Read in order, the takeaways should form a coherent storyline of the whole deck."""


EXTRA_FIELD_INSTRUCTIONS = {
    '配图与素材': (
        '配图与素材：[本页除文字外要展示什么：需要绘制的图表/图示/插画，写明类型与要表达的内容'
        '（如"折线图：2020-2025 营收增长，突出 2023 年拐点"）；'
        '要使用的真实素材图片以 markdown 引用（如 ![说明](/files/xxx/image.png)）。'
        '不要写正文文字（属于页面文字），不要写摆放位置（属于版式与重点）。最多 3 项；无需配图时省略此字段]'
    ),
    '版式与重点': (
        '版式与重点：[不超过两句：第一句写版式结构'
        '（如：上标题下两栏 / 左文右图 / 横向时间线 / 大图铺底文字浮层 / 居中大标题），'
        '第二句写视觉重点（观众第一眼应看到什么、哪个元素放大或强调）。'
        '只描述已有内容如何编排，不引入新内容，不复述页面文字]'
    ),
    '演讲者备注': (
        '演讲者备注：[演讲时的口头讲解要点：推理展开、页间过渡、补充例子。'
        '此字段不会渲染到页面上，也不影响生图]'
    ),
}
