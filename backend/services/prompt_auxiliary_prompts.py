"""Auxiliary AI prompt builders split from services.prompts."""
import json
import logging
from textwrap import dedent
from typing import Dict, List, Optional

from services.prompt_template_service import (
    prompt_template_overrides_enabled,
    resolve_prompt_template,
)

logger = logging.getLogger(__name__)

LANGUAGE_CONFIG = {
    'zh': {
        'instruction': '请使用全中文输出。',
    },
    'ja': {
        'instruction': 'すべて日本語で出力してください。',
    },
    'en': {
        'instruction': 'Please output all in English.',
    },
    'auto': {
        'instruction': '',
    },
}


def get_language_instruction(language: str = None) -> str:
    """Return language instruction text for auxiliary prompt builders."""
    lang = language or 'zh'
    config = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG['zh'])
    return config.get('instruction', '')


def _format_reference_files_xml(reference_files_content: Optional[List[Dict[str, str]]]) -> str:
    """Format reference file content as uploaded_files XML."""
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
    xml_parts.append('')
    return '\n'.join(xml_parts)

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

    if prompt_template_overrides_enabled():
        prompt = resolve_prompt_template('image_edit', prompt)
    logger.debug(f"[get_image_edit_prompt] Final prompt:\n{prompt}")
    return prompt


# ═══════════════════════════════════════════════════════════════════════════════
# 5. 图片处理 Prompts — 背景提取、画质修复
# ═══════════════════════════════════════════════════════════════════════════════


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
    if prompt_template_overrides_enabled():
        final_prompt = resolve_prompt_template('long_report_split', final_prompt)
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
                                     language: str = None,
                                     max_total_file_chars: int = 24000,
                                     max_file_chars: int = 6000,
                                     max_idea_chars: int = 4000,
                                     max_outline_chars: int = 8000,
                                     max_description_chars: int = 8000,
                                     max_template_chars: int = 24000) -> str:
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
        max_total = max(0, int(max_total_file_chars or 0))
        max_per_file = max(0, int(max_file_chars or 0))
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
    idea_prompt = _truncate(project_dict.get('idea_prompt') or "", max_idea_chars)
    outline_text = _truncate(project_dict.get('outline_text') or "", max_outline_chars)
    description_text = _truncate(project_dict.get('description_text') or "", max_description_chars)
    template_json_text = _truncate(template_json_text or "", max_template_chars)

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


def get_style_recommendations_prompt_minimal(project_dict: Dict,
                                             template_json_text: str,
                                             style_requirements: str = "",
                                             language: str = None,
                                             max_context_chars: int = 2500,
                                             max_template_chars: int = 6000) -> str:
    """生成更短的风格推荐 prompt，用于大上下文失败后的降级重试。"""
    def _truncate(text: str, limit: int) -> str:
        if not text:
            return ""
        s = str(text)
        safe_limit = max(0, int(limit or 0))
        if len(s) <= safe_limit:
            return s
        return s[:safe_limit] + f"\n...(内容过长，已截断，原长度={len(s)})"

    context = "\n".join([
        str(project_dict.get('idea_prompt') or ''),
        str(project_dict.get('outline_text') or ''),
        str(project_dict.get('description_text') or ''),
    ]).strip()
    context = _truncate(context, max_context_chars)
    template_json_text = _truncate(template_json_text or "", max_template_chars)
    style_req = (style_requirements or "").strip()

    prompt = f"""\
你是 PPT 视觉设计总监。请基于项目内容、风格模板 JSON 骨架和附加要求，输出 3 组不同的风格指导方案。

<project_context>
{context}
</project_context>

<style_template_json_skeleton>
{template_json_text}
</style_template_json_skeleton>

<style_requirements>
{style_req}
</style_requirements>

只输出 JSON 对象，格式：
{{
  "recommendations": [
    {{
      "name": "风格名称",
      "rationale": "适配原因",
      "style_json": {{}},
      "sample_pages": {{
        "cover": "封面页描述",
        "toc": "目录页描述",
        "detail": "详情页描述",
        "ending": "结尾页描述"
      }}
    }}
  ]
}}

强约束：
- recommendations 必须刚好 3 个。
- style_json 必须遵循模板骨架字段。
- 三组风格应有明显差异，避免同质化暗色科技风。
- sample_pages 必须包含 cover/toc/detail/ending。
- 只输出 JSON，不要 markdown。
{get_language_instruction(language)}
"""
    logger.debug(f"[get_style_recommendations_prompt_minimal] Final prompt:\n{prompt}")
    return prompt

def get_narration_generation_prompt(description_text: str,
                                    outline: Optional[Dict] = None,
                                    page_index: int = 1,
                                    total_pages: int = 1,
                                    language: str = None) -> str:
    """生成页面旁白文案 prompt。"""
    outline = outline or {}
    title = outline.get('title') or ''
    points = outline.get('points') if isinstance(outline.get('points'), list) else []
    points_text = "\n".join([f"- {point}" for point in points])

    prompt = dedent(f"""\
    你是一位专业演示文稿旁白撰稿人。请根据页面描述和大纲，为当前 PPT 页面生成自然、口语化、适合配音朗读的旁白。

    页面位置：第 {page_index} 页 / 共 {total_pages} 页

    <slide_title>
    {title}
    </slide_title>

    <slide_points>
    {points_text}
    </slide_points>

    <slide_description>
    {description_text or ''}
    </slide_description>

    要求：
    - 旁白应围绕本页核心信息展开，不要添加与页面无关的内容。
    - 使用连贯自然的句子，不要输出项目符号。
    - 不要包含舞台指令、镜头说明、Markdown 或 XML 标签。
    - 控制在 80 到 180 字之间，适合一页 PPT 的讲解节奏。
    {get_language_instruction(language)}
    """)
    logger.debug(f"[get_narration_generation_prompt] Final prompt:\n{prompt}")
    return prompt
