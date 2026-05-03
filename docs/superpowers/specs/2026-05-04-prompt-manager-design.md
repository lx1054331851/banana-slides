# 提示词管理独立页面设计

## 背景

当前后台提示词主要集中在 `backend/services/prompts.py`，由 `AIService`、页面控制器、样式预览服务和图片编辑相关服务直接调用。这个文件已经超过项目文件规模红线，`Settings.tsx` 和 `settings_controller.py` 也接近或超过红线，因此提示词管理不能继续堆在现有设置页或提示词文件中。

本次需求选择独立管理页方案：新增专门的提示词管理页面，用于管理后台各模式、各阶段提示词。第一版目标是让运营或开发者可以查看默认提示词、编辑完整覆盖内容、启停覆盖、恢复默认，并让运行时自动优先使用启用中的自定义提示词。

## 目标

- 新增 `/prompt-manager` 独立页面，与设置、素材、模板、历史入口同级。
- 将主生成链路提示词纳入统一清单，按模式和阶段分组。
- 支持完整模板覆盖，不只追加片段。
- 支持一键恢复默认，并保留代码内默认提示词作为兜底。
- 后端运行时读取有效提示词时，启用自定义内容则使用自定义，否则使用默认模板。
- 控制单文件规模，先拆分超大文件，再接入业务功能。

## 非目标

- 第一版不做多版本历史、审批流、灰度发布、按项目/用户差异化提示词。
- 第一版不做真实模型预览调用，避免误触发成本；只展示模板内容和变量说明。
- 第一版不管理 API Key、模型路由、并发等现有设置项。

## 提示词范围

第一版覆盖主生成链路：

- 大纲生成：`outline_generation`
- 大纲流式生成：`outline_generation_markdown`
- 大纲解析：`outline_parsing`
- 大纲流式解析：`outline_parsing_markdown`
- 描述转大纲：`description_to_outline`
- 描述转大纲流式：`description_to_outline_markdown`
- 大纲润色：`outline_refinement`
- 单页描述 JSON：`page_description_json`
- 全量描述流式：`all_descriptions_stream`
- 描述拆分：`description_split`
- 描述润色：`descriptions_refinement`
- 图片生成：`image_generation`
- 图片编辑：`image_edit`
- 封面/结尾字段识别：`cover_ending_fields_detect`
- 长文拆分：`long_report_split`

图片处理、OCR/版式/风格提取、样式推荐、旁白生成作为第二批接入，避免第一版改动过大。

## 后端设计

新增 `PromptTemplate` 模型，表名建议为 `prompt_templates`：

- `id`: 主键
- `key`: 唯一提示词键
- `mode`: 模式，例如 `outline`、`description`、`image`、`renovation`
- `stage`: 阶段，例如 `generate`、`parse`、`refine`、`edit`
- `title`: 展示标题
- `description`: 展示说明
- `default_content`: 默认模板快照，可由注册表同步写入
- `custom_content`: 用户覆盖内容
- `enabled`: 是否启用自定义覆盖
- `created_at` / `updated_at`

新增 `backend/services/prompt_template_service.py`：

- 维护提示词注册表，注册每个提示词的 `key`、`mode`、`stage`、标题、说明、默认模板获取函数。
- `list_templates()`：返回所有注册提示词和数据库覆盖状态。
- `get_effective_content(key)`：返回有效内容，优先使用启用中的 `custom_content`。
- `save_template(key, custom_content, enabled)`：保存覆盖内容和启用状态。
- `reset_template(key)`：清空覆盖并关闭启用，恢复默认。
- `sync_defaults()`：按注册表补齐数据库记录，并更新默认快照。

提示词构建函数保留原签名。每个函数先生成默认模板文本，再通过服务解析有效模板：

```python
prompt = render_default_prompt(...)
prompt = resolve_prompt_template("image_generation", prompt)
```

其中 `resolve_prompt_template` 只接收已经渲染完变量的完整提示词。第一版不引入模板变量引擎，避免让用户编辑后出现未替换变量导致运行失败。

## API 设计

新增 `backend/controllers/prompt_template_controller.py`，注册到应用：

- `GET /api/prompt-templates`
  返回按 `mode`、`stage`、`key` 排序的清单，包含默认内容、自定义内容、有效内容、是否启用、是否已自定义。
- `PUT /api/prompt-templates/<key>`
  请求体：`custom_content`、`enabled`。
  校验 key 必须存在；自定义内容启用时不能为空。
- `POST /api/prompt-templates/<key>/reset`
  清空该 key 的自定义覆盖，返回更新后的模板。

错误处理沿用 `success_response`、`bad_request`、`error_response` 风格。

## 前端设计

新增页面文件：

- `frontend/src/pages/PromptManager.tsx`：页面装配、加载、保存、恢复。
- `frontend/src/pages/PromptManager.i18n.ts`：中英文文案。
- `frontend/src/pages/components/PromptManagerSidebar.tsx`：模式/阶段筛选列表。
- `frontend/src/pages/components/PromptTemplateEditor.tsx`：默认内容、自定义内容、启用状态、保存和恢复。
- `frontend/src/pages/components/PromptTemplateList.tsx`：模板列表和状态展示。

新增 API 类型和方法：

- `PromptTemplate`
- `getPromptTemplates()`
- `updatePromptTemplate(key, payload)`
- `resetPromptTemplate(key)`

新增路由：

- `/prompt-manager`

首页导航增加“提示词管理”入口，位置与设置、素材、模板、历史同级。

交互规则：

- 左侧可按模式筛选，模板列表展示阶段和是否已覆盖。
- 右侧编辑器展示默认提示词和自定义提示词。
- 启用开关关闭时，自定义内容可保留但不生效。
- 恢复默认需要确认。
- 保存成功后刷新当前模板状态并提示成功。

## 数据流

1. 前端进入 `/prompt-manager`，调用 `GET /api/prompt-templates`。
2. 后端从注册表同步默认记录，再合并数据库覆盖状态。
3. 用户编辑并保存某个模板，调用 `PUT /api/prompt-templates/<key>`。
4. 后端保存 `custom_content` 和 `enabled`。
5. 后续生成流程进入提示词函数时，默认模板先完成现有变量渲染，再由 resolver 替换为启用中的自定义内容。
6. 用户恢复默认时，调用 reset 接口，后续生成流程回到代码内默认提示词。

## 文件规模处理

开发顺序必须先处理超大文件：

- 将 `backend/services/prompts.py` 中的注册/解析辅助逻辑拆到新服务，业务提示词函数保持兼容。
- 新增 controller 而不是扩展 `settings_controller.py`。
- 新增独立前端页面和组件，避免继续扩大 `Settings.tsx`。
- 如果修改 `Home.tsx` 增加入口超过小范围，应优先抽出导航组件或只做最小入口修改。

## 测试计划

后端：

- 单测 `prompt_template_service`：
  - 默认模板无数据库覆盖时返回默认内容。
  - 保存并启用覆盖后返回自定义内容。
  - 关闭启用后回退默认内容但保留自定义内容。
  - reset 后清空覆盖并回退默认。
- API 单测：
  - 列表接口返回注册模板。
  - 无效 key 返回 404 或 bad request。
  - 启用空内容返回 bad request。

前端：

- 页面加载后展示模板列表。
- 点击模板后展示默认内容和编辑区。
- 保存调用正确 API 并更新状态。
- 恢复默认需要确认并调用 reset。

验证命令：

- `cd backend && pytest tests/unit/test_prompt_template_service.py tests/unit/test_api_prompt_templates.py`
- `cd frontend && npm test -- PromptManager`

## 风险与缓解

- 风险：自定义完整提示词绕过默认格式约束，可能导致模型输出解析失败。
  缓解：页面展示默认提示词，保存时提示“覆盖会影响生成解析结果”；后续可增加模板校验和预览。

- 风险：每次生成都查数据库影响性能。
  缓解：第一版查询开销可接受；若出现瓶颈，再加进程内短 TTL 缓存，并在保存/reset 后失效。

- 风险：提示词函数变量渲染方式不同，统一模板引擎改动大。
  缓解：第一版只在默认 prompt 完成渲染后做完整文本覆盖，不引入变量引擎。

## 实施顺序

1. 后端新增模型、迁移、服务和 controller，接入应用。
2. 先在少量主链路提示词中接入 resolver，并补单测。
3. 扩展到第一版范围内全部主链路提示词。
4. 前端新增 API、类型、独立页面和路由。
5. 首页新增入口。
6. 跑后端和前端窄范围测试。
