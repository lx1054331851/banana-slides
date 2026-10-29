# 提交规则

1. 每次完成一次代码修改后，立即执行 `git add -A` 与 `git commit`。
2. 提交信息使用简洁中文，描述本次修改目的。
3. 如果本次没有文件变更，不创建空提交。
4. 如果提交失败，先修复失败原因，再继续后续工作。

## 文件规模与拆分规范（避免超大文件）

1. 默认目标：单个 `.ts`/`.tsx` 文件控制在 **600 行以内**；超过 **800 行** 必须优先拆分。
2. 硬性红线：任何单文件超过 **1200 行** 时，禁止继续堆功能；本次任务必须先做拆分再继续业务改动。
3. 页面文件（如 `src/pages/*`）只保留“路由装配 + 状态编排”，UI 结构必须下沉到 `components/`，复杂逻辑必须下沉到 `hooks/`。
4. 当一个文件同时包含以下两类内容时必须拆分：
   - 大段 JSX 视图结构
   - 多组副作用/异步流程/状态派生逻辑
5. 拆分优先级：
   - 先提取可复用视图块到 `components/`
   - 再提取流程型逻辑到 `hooks/`
   - 最后提取纯函数与类型到 `*.utils.ts` / `*.types.ts`
6. 单次新增功能若让目标文件增长超过 **+120 行**，应同步提交至少 1 个拆分提交（可先拆后改，或边拆边改）。
7. Code Review 自检项（提交前必须检查）：
   - 是否出现“巨型组件”（JSX 连续超过 200 行）
   - 是否出现“巨型 Hook/函数”（单函数超过 80 行）
   - 是否存在可抽离但仍内联的重复 UI/逻辑
8. 遗留超大文件治理：对历史大文件采用“连续小步拆分”，每次至少完成一个可独立提交的拆分动作，直到降到目标区间。
9. 命名约定：
   - 页面拆分组件：`PageName + 语义后缀`（如 `SlidePreviewEditorPane`）
   - 页面拆分 Hook：`use + PageName + 语义`（如 `useSlidePreviewReorder`）
10. 例外机制：确实无法拆分时，需在提交说明中写明原因与后续拆分计划；无说明视为不合规。


# Project notes

- 安装 Playwright 浏览器依赖的 CI job 须固定到锁定版本支持的 OS；升级 runner 前核对兼容性，避免 `ubuntu-latest` 漂移导致浏览器安装失败。

- Docker E2E 在环境测试重建容器后，须让宿主 runner 可写 `uploads`、`backend/instance` 及 SQLite 文件，并验证实际写事务；PPTX 下载须在点击前监听 Page 的 `download`，保存文件验收，不能用接口 200 代替。
- nightly 的官方 PyPI 配置须在测试和发布两个 job 中通过 `scripts/prepare_nightly_lock.py` 同步锁文件 URL；`uv sync --frozen` 不会用索引环境变量覆盖锁定的下载地址，不能通过重新解析或升级依赖规避镜像 403。

- README 翻译以 `docs/i18n/readme-state.json` 的成功同步快照为基线；保留 `i18n` 章节 ID，译文与状态一起提交。不可用干净 CI 工作区的 `git diff HEAD` 判断增量，也不可用中英文标题文字匹配章节。维护说明见 `docs/readme-i18n.md`。

- 同一项目的素材工具箱会从多个入口同时挂载；任务列表和轮询必须按项目共享，验收跨入口提交、关闭其中一个入口及重新挂载，避免覆盖任务或重复轮询。

- `main` 只承载通用开源功能。`bananaslides.online` 专属的 Landing、内测预约、站内反馈、公开 Demo、访客隔离、管理员入口及其配置/迁移只能进入 `production/bananaslides-online`；默认关闭的开关不等于分支隔离。官网任务创建分支和 PR 前必须核对基线与目标分支，未经用户明确要求不得“同步主线”。

- `bananaslides.online` 的正式源码基线为 `origin/production/bananaslides-online`（2026-09-27 建立，包含当时线上首页与后端补丁）；官网改动从该分支出发，发布前重新核对线上镜像及差异，不把旧 `feat/sponsor` 或独立 `feat/public-site-landing` 当作完整线上代码。
- `bananaslides.online` 经 Cloudflare 访问时，服务器内 Python `urllib` 可能被返回 403，即使源站和浏览器正常。发布验收分别核对源站构建哈希与公网 `curl`/真实浏览器结果；不要仅因 `urllib` 的边缘拦截判定部署失败。
- 官网发布含数据库迁移时，先用真实 SQLite 库的在线备份预演，再核对该备份的 `alembic_version`、新表和原有数据行数；镜像中的 `alembic.ini` 不得指向占位数据库。
- 官网前端使用 `npm run build:online`（启用 `VITE_PUBLIC_LANDING=true`）；验收实际发布产物和公网根路径的 landing 标题及 Demo 跳转，不能只检查 HTTP 200。

- 下架赞助商须移除所有品牌入口、提供商预设、注册链接和获取密钥引导，并按新访客及已有配置验收；不能只删除广告卡片。保留底层兼容不得变成继续展示或引流。
