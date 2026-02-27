# Banana Slides API

本文件基于仓库代码生成（`backend/app.py` 与 `backend/controllers/*.py`），用于快速了解后端接口。

## 基本信息
- Base URL: `http://localhost:5000`
- API 前缀: `/api`（少量文件相关接口在 `/files`）
- Content-Type: `application/json`
- 访问码（可选）
  - 若环境变量 `ACCESS_CODE` 设置了值，则所有 `/api/**` 需要请求头 `X-Access-Code: <code>`
  - 例外：`/api/access-code/check` 和 `/api/access-code/verify` 不要求该头

## 健康检查
- `GET /health` 服务器健康检查

## 访问码
- `GET /api/access-code/check` 检查是否启用访问码
- `POST /api/access-code/verify` 验证访问码

## 输出语言
- `GET /api/output-language` 获取输出语言偏好（`zh`/`ja`/`en`/`auto`）

## 项目（Projects）
- `GET /api/projects` 获取项目列表（历史）
- `POST /api/projects` 创建项目
- `GET /api/projects/{project_id}` 获取项目详情
- `PUT /api/projects/{project_id}` 更新项目
- `DELETE /api/projects/{project_id}` 删除项目

### 生成与解析
- `POST /api/projects/{project_id}/generate/outline` 生成大纲
- `POST /api/projects/{project_id}/generate/from-description` 从描述生成大纲和页面描述
- `POST /api/projects/{project_id}/generate/descriptions` 生成页面描述
- `POST /api/projects/{project_id}/generate/images` 生成页面图片
- `POST /api/projects/{project_id}/parse/description` 解析描述为页面描述（不创建页面）
- `POST /api/projects/{project_id}/detect/cover-ending-fields` 检测封面/结尾缺失字段

### 任务与精炼
- `GET /api/projects/{project_id}/tasks/{task_id}` 获取任务状态
- `POST /api/projects/{project_id}/refine/outline` 精炼大纲
- `POST /api/projects/{project_id}/refine/descriptions` 精炼页面描述

### 风格与改造
- `POST /api/projects/{project_id}/style/recommendations` 推荐风格（生成预览）
- `POST /api/projects/{project_id}/style/recommendations/{rec_id}/previews` 重新生成预览图
- `POST /api/projects/renovation` 创建 PPT 改造项目

## 页面（Pages）
- `POST /api/projects/{project_id}/pages` 新增页面
- `DELETE /api/projects/{project_id}/pages/{page_id}` 删除页面
- `PUT /api/projects/{project_id}/pages/{page_id}` 更新页面字段
- `PUT /api/projects/{project_id}/pages/{page_id}/outline` 编辑页面大纲
- `PUT /api/projects/{project_id}/pages/{page_id}/description` 编辑页面描述
- `POST /api/projects/{project_id}/pages/{page_id}/generate/description` 生成单页描述
- `POST /api/projects/{project_id}/pages/{page_id}/generate/image` 生成单页图片
- `POST /api/projects/{project_id}/pages/{page_id}/edit/image` 编辑单页图片
- `GET /api/projects/{project_id}/pages/{page_id}/image-versions` 获取图片版本列表
- `POST /api/projects/{project_id}/pages/{page_id}/image-versions/{version_id}/set-current` 设置当前图片版本
- `POST /api/projects/{project_id}/pages/{page_id}/regenerate-renovation` 重新生成改造页

## 模板（Templates）
- `POST /api/projects/{project_id}/template` 上传项目模板
- `DELETE /api/projects/{project_id}/template` 删除项目模板
- `GET /api/templates` 获取系统模板
- `POST /api/user-templates` 上传用户模板
- `GET /api/user-templates` 获取用户模板列表
- `DELETE /api/user-templates/{template_id}` 删除用户模板

## 导出（Export）
- `GET /api/projects/{project_id}/export/pptx` 导出 PPTX
- `POST /api/projects/{project_id}/export/pptx` 导出 PPTX（表单/JSON 方式）
- `GET /api/projects/{project_id}/export/pdf` 导出 PDF
- `POST /api/projects/{project_id}/export/pdf` 导出 PDF（表单/JSON 方式）
- `GET /api/projects/{project_id}/export/images` 导出图片
- `POST /api/projects/{project_id}/export/images` 导出图片（表单/JSON 方式）
- `POST /api/projects/{project_id}/export/editable-pptx` 导出可编辑 PPTX（异步）

## 素材（Materials）
- `POST /api/projects/{project_id}/materials/generate` 生成素材图片
- `GET /api/projects/{project_id}/materials` 获取项目素材列表
- `POST /api/projects/{project_id}/materials/upload` 上传素材（项目内）
- `GET /api/materials` 全局素材查询
- `POST /api/materials/upload` 上传素材（全局）
- `DELETE /api/materials/{material_id}` 删除素材
- `POST /api/materials/associate` 将素材关联到项目
- `POST /api/materials/download` 打包下载素材（ZIP）

## 参考文件（Reference Files）
- `POST /api/reference-files/upload` 上传参考文件
- `GET /api/reference-files/{file_id}` 获取参考文件信息
- `DELETE /api/reference-files/{file_id}` 删除参考文件
- `GET /api/reference-files/project/{project_id}` 获取项目关联参考文件列表
- `POST /api/reference-files/{file_id}/parse` 解析参考文件
- `POST /api/reference-files/{file_id}/associate` 关联参考文件到项目
- `POST /api/reference-files/{file_id}/dissociate` 从项目中移除参考文件

## 设置（Settings）
- `GET /api/settings` 获取应用设置
- `PUT /api/settings` 更新应用设置
- `POST /api/settings/reset` 重置设置
- `POST /api/settings/verify` 验证模型/密钥配置
- `POST /api/settings/tests/{test_name}` 启动异步服务测试
- `GET /api/settings/tests/{task_id}/status` 查询测试任务状态

## 风格库（Style Library）
- `GET /api/style-templates` 获取风格模板
- `POST /api/style-templates` 新增风格模板
- `DELETE /api/style-templates/{template_id}` 删除风格模板
- `GET /api/style-presets` 获取风格预设
- `POST /api/style-presets` 新增风格预设
- `DELETE /api/style-presets/{preset_id}` 删除风格预设

## 工具类接口（非项目）
- `POST /api/extract-style` 从图片提取风格描述
- `POST /api/parse/description` 解析描述文本为页面描述（无项目）
- `POST /api/parse/report` 拆分长报告为 PPT JSON（无项目）
- `POST /api/parse/report/stream` SSE 流式拆分报告

## 文件服务（非 /api）
- `GET /files/{project_id}/{file_type}/{filename}` 获取项目文件
- `GET /files/{project_id}/style-previews/{rec_id}/{filename}` 获取风格预览图
- `GET /files/user-templates/{template_id}/{filename}` 获取用户模板文件
- `GET /files/materials/{filename}` 获取素材文件
- `GET /files/mineru/{extract_id}/{filepath}` 获取 MinerU 解析结果文件

## 说明
- 许多生成/导出接口会返回 `task_id`，通过 `GET /api/projects/{project_id}/tasks/{task_id}` 轮询任务进度与结果。
- 接口的请求/响应体以实际代码实现为准，可根据 `backend/controllers/*.py` 中对应处理函数查看字段细节。
