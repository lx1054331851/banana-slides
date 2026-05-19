<div align="center">



<p>
  <b>一个基于 nano banana pro 🍌 的原生 AI PPT 生成应用</b><br>
  <b>在几分钟内从想法到演示文稿，无需繁琐排版、口头提出修改，迈向真正的 "Vibe PPT"</b>
</p>
<p>
  <a href="https://bananaslides.online/"><b>🚀 在线 Demo</b></a>
  &nbsp;|&nbsp;
  <a href="https://docs.bananaslides.online/"><b>📖 文档</b></a>
  &nbsp;|&nbsp;
 <a href="https://github.com/Anionex/banana-slides#-%E4%BD%BF%E7%94%A8%E6%96%B9%E6%B3%95"><b>部署方法</b></a>
</p>
<p>
  如果该项目对你有用，欢迎 <b>Star 🌟</b> & <b>Fork 🍴</b>
</p>

```bash
uv run alembic upgrade head && uv run python app.py
```

```bash
npm run dev
```


</div>

## ✨ 项目缘起
你是否也曾陷入这样的困境：明天就要汇报，但PPT还是一片空白；脑中有无数精彩的想法，却被繁琐的排版和设计消磨掉所有热情？

我(们)渴望能快速创作出既专业又具设计感的演示文稿，传统的AI PPT生成app，虽然大体满足“快”这一需求，却还存在以下问题：

- 1️⃣只能选择预设模版，无法灵活调整风格
- 2️⃣自由度低，多轮改动难以进行 
- 3️⃣成品观感相似，同质化严重
- 4️⃣素材质量较低，缺乏针对性
- 5️⃣图文排版割裂，设计感差

以上这些缺陷，让传统的AI ppt生成器难以同时满足我们“快”和“美”的两大PPT制作需求。即使自称Vibe PPT，但是在我的眼中还远不够“Vibe”。

但是，nano banana🍌模型的出现让一切有了转机。我尝试使用🍌pro进行ppt页面生成，发现生成的结果无论是质量、美感还是一致性，都做的非常好，且几乎能精确渲染prompt要求的所有文字+遵循参考图的风格。那为什么不基于🍌pro，做一个原生的"Vibe PPT"应用呢？

## 👨‍💻 适用场景


1. **小白**：零门槛快速生成美观PPT，无需设计经验，减少模板选择烦恼
2. **PPT专业人士**：参考AI生成的布局和图文元素组合，快速获取设计灵感
3. **教育工作者**：将教学内容快速转换为配图教案PPT，提升课堂效果
4. **学生**：快速完成作业Pre，把精力专注于内容而非排版美化
5. **职场人士**：商业提案、产品介绍快速可视化，多场景快速适配

<p>
  <b>🎯目标： 降低 PPT 制作门槛，让每个人都能快速创作出美观专业的演示文稿</b>
</p>


更多可见<a href="https://github.com/Anionex/banana-slides/issues/2" > 使用案例 </a>


## 🎯 功能介绍

### 1. 灵活多样的创作路径
支持**想法**、**大纲**、**页面描述**三种起步方式，满足不同创作习惯。
- **一句话生成**：输入一个主题，AI 自动生成结构清晰的大纲和逐页内容描述。
- **自然语言编辑**：支持以 Vibe 形式口头修改大纲或描述（如"把第三页改成案例分析"），AI 实时响应调整。
- **大纲/描述模式**：既可一键批量生成，也可手动调整细节。



### 2. 强大的素材解析能力
- **多格式支持**：上传 PDF/Docx/MD/Txt 等文件，后台自动解析内容。
- **智能提取**：自动识别文本中的关键点、图片链接和图表信息，为生成提供丰富素材。
- **风格参考**：支持上传参考图片或模板，定制 PPT 风格。


### 3. "Vibe" 式自然语言修改
不再受限于复杂的菜单按钮，直接通过**自然语言**下达修改指令。
- **局部重绘**：对不满意的区域进行口头式修改（如"把这个图换成饼图"）。
- **整页优化**：基于 nano banana pro🍌 生成高清、风格统一的页面。



### 4. 开箱即用的格式导出
- **多格式支持**：一键导出标准 **PPTX** 或 **PDF** 文件。
- **完美适配**：默认 16:9 比例，排版无需二次调整，直接演示。


### 5. 可自由编辑的pptx导出（Beta迭代中）
- **导出图像为高还原度、背景干净的、可自由编辑图像和文字的PPT页面**
- 相关更新见 https://github.com/Anionex/banana-slides/issues/121

### 6. TTS 讲解视频导出
- **一键将幻灯片转换为带 AI 语音旁白和字幕的讲解视频（MP4）**
- AI 自动将页面描述转为口语化旁白，通过 edge-tts 合成语音
- 支持中/英/日三种语言，多种音色可选（晓晓、云希、Jenny、Guy 等）
- 逐句滚动字幕，自动按语音节奏切换，支持中文字体渲染
- 可选 Ken Burns 画面动效（缩放/平移），丰富视觉表现

<br>

**🌟和notebooklm slide deck功能对比**
| 功能 | notebooklm | 本项目 | 
| --- | --- | --- |
| 页数上限 | 15页 | **无限制** | 
| 二次编辑 | 提示词修改 | **框选编辑+口头编辑** |
| 素材添加 | 生成后无法添加 | **生成后自由添加** |
| 导出格式 | 支持导出为 PDF、（不可编辑图片）pptx | **导出为PDF、(图片or可编辑)pptx、讲解视频** |
| 水印 | 免费版有水印 | **无水印，自由增删元素** |

> 注：随着新功能添加,对比可能过时


## 📦 使用方法

### （新）使用应用模板一键部署
这是最简单的方式，无需安装docker或下载项目，创建后可直接进入应用


1. 通过雨云一键部署和启动本应用 (带宽大，适合高清图片生成和下载。新用户有15天免费试用)

[![通过雨云一键部署](https://rainyun-apps.cn-nb1.rains3.com/materials/deploy-on-rainyun-cn.svg)](https://app.rainyun.com/apps/rca/store/7549/anionex_)

2. 敬请期待


### 使用 Docker Compose🐳
通过docker compose快速启动前后端服务。

<details>
  <summary>📒 Windows/Mac用户说明</summary>

如果你使用 **Windows 或 macOS**，请先[安装 **Docker Desktop**](https://docs.docker.com/desktop/setup/install/windows-install/)，并确保 Docker 正在运行（Windows 可检查系统托盘图标；macOS 可检查菜单栏图标），然后按文档中的相同步骤操作。

> **提示**：如果遇到问题，Windows 用户请在 Docker Desktop 设置中启用 **WSL 2 后端**（推荐）；同时确保端口 **3000** 和 **5000** 未被占用。

</details>

0. **克隆代码仓库**
```bash
git clone https://github.com/Anionex/banana-slides
cd banana-slides
```

1. **配置环境变量**

创建 `.env` 文件（参考 `.env.example`）：
```bash
cp .env.example .env
```

**（可选， 也可以启动后在用户界面配置，[教程可点击此处](https://ziy68cvfvu3.feishu.cn/wiki/GiNawdmpiinSRqkGspocqEWAnkh?from=from_copylink )）** 编辑 `.env` 文件，配置必要的环境变量：

<details>
<summary>点击展开详情</summary>
  
> **项目中大模型接口以AIHubMix平台格式为标准，推荐使用 [AIHubMix(点击此处可直接访问)](https://aihubmix.com/?aff=17EC) 获取API密钥，减小迁移成本**<br>
> **友情提示：谷歌nano banana pro模型接口费用较高，请注意调用成本**
```env
# AI Provider格式配置 (gemini / openai / vertex)
AI_PROVIDER_FORMAT=gemini

# Gemini 格式配置（当 AI_PROVIDER_FORMAT=gemini 时使用）
GOOGLE_API_KEY=your-api-key-here
GOOGLE_API_BASE=https://generativelanguage.googleapis.com
# 代理示例: https://aihubmix.com/gemini

# OpenAI 格式配置（当 AI_PROVIDER_FORMAT=openai 时使用）
OPENAI_API_KEY=your-api-key-here
OPENAI_API_BASE=https://api.openai.com/v1
# 代理示例: https://aihubmix.com/v1

# Azure OpenAI（可选）：配置后会自动使用 AzureOpenAI 客户端
# 注意：Azure 的“model”参数一般填写 Deployment 名称
# 注意：AZURE_OPENAI_ENDPOINT 只填到域名即可，不要带 `/openai/v1` 之类的路径
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_VERSION=2024-10-21

# 仅“生图”走 Gemini，其余文本/识图走 OpenAI(Azure) 示例：
# AI_PROVIDER_FORMAT=openai
# IMAGE_MODEL_SOURCE=gemini
# TEXT_MODEL_SOURCE=openai
# IMAGE_CAPTION_MODEL_SOURCE=openai

# Vertex AI 配置（AI_PROVIDER_FORMAT=vertex）
# 需要 GCP 项目和服务账户密钥
# VERTEX_PROJECT_ID=your-gcp-project-id
# VERTEX_LOCATION=global
# GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json

# Lazyllm 格式配置（当 AI_PROVIDER_FORMAT=lazyllm 时使用）
# 选择文本生成和图片生成使用的厂商
TEXT_MODEL_SOURCE=deepseek        # 文本生成模型厂商
IMAGE_MODEL_SOURCE=doubao         # 图片编辑模型厂商
IMAGE_CAPTION_MODEL_SOURCE=qwen   # 图片描述模型厂商

# 各厂商 API Key（只需配置你要使用的厂商）
DOUBAO_API_KEY=your-doubao-api-key            # 火山引擎/豆包
DEEPSEEK_API_KEY=your-deepseek-api-key        # DeepSeek
QWEN_API_KEY=your-qwen-api-key                # 阿里云/通义千问
GLM_API_KEY=your-glm-api-key                  # 智谱 GLM
SILICONFLOW_API_KEY=your-siliconflow-api-key  # 硅基流动
SENSENOVA_API_KEY=your-sensenova-api-key      # 商汤日日新
MINIMAX_API_KEY=your-minimax-api-key          # MiniMax
...
```
  
</details>


#### 双中转 Gemini 图片配置（手动切换）

仅图片模型走 OpenAI 兼容格式时，可通过 `.env` 切换不同中转商参数风格：

```env
# 让图片模型走 OpenAI provider（文本/识图可继续走 Gemini 或其他）
IMAGE_MODEL_SOURCE=openai
IMAGE_MODEL=gemini-3.1-flash-image-preview
IMAGE_API_BASE=https://your-proxy.example.com/v1
IMAGE_API_KEY=your-image-key

# 图片路由策略：auto=优先 image(s) 端点，必要时回退 chat/completions
IMAGE_OPENAI_ENDPOINT_MODE=auto
# 端点路径风格：auto/singular/plural
IMAGE_OPENAI_PATH_STYLE=auto
# 返回格式：b64_json 或 url
IMAGE_OPENAI_RESPONSE_FORMAT=b64_json
# auto 下 image(s) 端点不可用时是否回退 chat/completions
IMAGE_OPENAI_CHAT_FALLBACK=true
# 严格参数校验（推荐）
IMAGE_OPENAI_STRICT_PARAMS=true
```

`viviai` 示例（Gemini 原生更稳定，建议图片走 gemini provider）：

```env
IMAGE_MODEL_SOURCE=gemini
IMAGE_API_BASE=https://api.viviai.cc
IMAGE_MODEL=gemini-3.1-flash-image-preview
```

手动切换步骤：
1. 修改 `.env` 中 `IMAGE_MODEL_SOURCE` 与 `IMAGE_API_BASE`，或调整 `PROVIDER_PROFILES_JSON` 中的图片渠道。
2. 重启后端服务，使新环境变量生效。
3. 在设置页“服务测试 -> 图像生成模型”执行一次测试，确认当前中转配置可用。

可选：设置 `LOG_IMAGE_PROMPTS=true` 可在后端日志打印发送给 Gemini 的图片提示词。

#### Native-first 路由（Profile + Adapter）

主代码默认只认 `openai` / `gemini` 原生语义。只有第三方不兼容时，才通过 `profile + adapter` 适配。

新增环境变量：

```env
# JSON 数组：声明可用 profile（支持 source=profile:<id>）
PROVIDER_PROFILES_JSON=[
  {
    "id":"gs88",
    "channel":"gs88",
    "label":"GS88",
    "kind":"relay",
    "provider":"openai",
    "api_base":"https://ai.gs88.shop/v1",
    "api_key_env":"GS88_API_KEY",
    "adapter":"openai_image_compat",
    "capabilities":["image"],
    "models":["gpt-image-2"],
    "model_defaults":{"image":"gpt-image-2"}
  },
  {
    "id":"147ai",
    "channel":"147ai",
    "label":"147AI",
    "kind":"relay",
    "provider":"openai",
    "api_base":"https://nn.147ai.com/v1",
    "api_key_env":"AI147_API_KEY",
    "adapter":"openai_image_compat",
    "capabilities":["image"],
    "models":[
      "gpt-image-2-low",
      "gpt-image-2-medium",
      "gpt-image-2-high",
      "gemini-2.5-flash-image",
      "gemini-2.5-flash-image-preview",
      "gemini-3-pro-image-preview",
      "gemini-3-pro-image-preview-stable",
      "gemini-3.1-flash-image-preview",
      "grok-4-image"
    ],
    "model_defaults":{"image":"gpt-image-2-low"}
  }
]

# 严格模式：profile / adapter 无效时直接报错（默认 true）
PROVIDER_ROUTING_STRICT=true

# profile 未显式设置 adapter 时使用的默认适配器（默认 native）
PROVIDER_ADAPTER_DEFAULT=native
```

当前保留的图片渠道建议为：

- `viviai`：Gemini 原生代理，走 `IMAGE_MODEL_SOURCE=gemini`
- `gs88`：OpenAI 兼容图片渠道，建议通过 `PROVIDER_PROFILES_JSON`
- `147ai`：OpenAI 兼容图片渠道，建议通过 `PROVIDER_PROFILES_JSON`

请求级临时覆盖（不落库）：

```json
{
  "generation_override": {
    "image": {
      "source": "profile:openai_vveai_image",
      "model": "gemini-3.1-flash-image-preview"
    }
  }
}
```

项目级默认（保存在 `presentation_meta._ai_generation_defaults_v1`，无需 DB 迁移）：

```json
{
  "generation_defaults": {
    "image": {
      "source": "profile:gs88",
      "model": "gemini-3.1-flash-image-preview"
    }
  }
}
```

**使用新版可编辑导出配置方法，获得更好的可编辑导出效果**: 需在[百度智能云平台](https://console.bce.baidu.com/iam/#/iam/apikey/list)（点击此处进入）中获取 API KEY，填写在 `.env` 文件中的 `BAIDU_API_KEY` 字段（有充足的免费使用额度）。详见 https://github.com/Anionex/banana-slides/issues/121 中的说明


<details>
  <summary>📒 Vertex AI 配置指南（适用于 GCP 用户）</summary>

Google Cloud Vertex AI 允许通过 GCP 服务账户调用 Gemini 模型，新用户可使用赠金额度。配置步骤：

1. 前往 [GCP Console](https://console.cloud.google.com/)，创建一个服务账户并下载 JSON 格式的密钥文件
2. 将密钥文件保存为项目根目录下的 `gcp-service-account.json`
3. 在 `.env` 中设置：
   ```env
   AI_PROVIDER_FORMAT=vertex
   VERTEX_PROJECT_ID=your-gcp-project-id
   VERTEX_LOCATION=global
   ```
4. 如果使用 Docker 部署，还需要在 `docker-compose.yml` 中取消相关注释，将密钥文件挂载到容器内并设置 `GOOGLE_APPLICATION_CREDENTIALS` 环境变量。

> `gemini-3-*` 系列模型要求 `VERTEX_LOCATION=global`

</details>

2. **启动服务**

**⚡ 使用预构建镜像（推荐）**

项目在 Docker Hub 提供了构建好的前端和后端镜像（同步主分支最新版本），可以跳过本地构建步骤，实现快速部署：

```bash
# 使用预构建镜像启动（无需从头构建）
docker compose -f docker-compose.prod.yml up -d
```

镜像名称：
- `anoinex/banana-slides-frontend:latest`
- `anoinex/banana-slides-backend:latest`

**从头构建镜像**

```bash
docker compose up -d
```


> [!TIP]
> 如遇网络问题，可在 `.env` 文件中取消镜像源配置的注释, 再重新运行启动命令：
> ```env
> # 在 .env 文件中取消以下注释即可使用国内镜像源
> DOCKER_REGISTRY=docker.1ms.run/
> GHCR_REGISTRY=ghcr.nju.edu.cn/
> APT_MIRROR=mirrors.aliyun.com
> PYPI_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
> NPM_REGISTRY=https://registry.npmmirror.com/
> ```


3. **访问应用**

- 前端：http://localhost:3000
- 后端 API：http://localhost:5000

4. **查看日志**

```bash
# 查看后端日志（最后 200 行）
docker logs --tail 200 banana-slides-backend

# 实时查看后端日志（最后 100 行）
docker logs -f --tail 100 banana-slides-backend

# 查看前端日志（最后 100 行）
docker logs --tail 100 banana-slides-frontend
```

5. **停止服务**

```bash
docker compose down
```

6. **更新项目**

**使用预构建镜像（docker-compose.prod.yml）**

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

**使用本地构建（docker-compose.yml）**

注：若手动修改了代码，该方法不适用，需要先将代码还原到拉取时的版本。

```bash
git pull 
docker compose down
docker compose build --no-cache
docker compose up -d
```

**注：感谢优秀开发者朋友 [@ShellMonster](https://github.com/ShellMonster/) 提供了[新人部署教程](https://github.com/ShellMonster/banana-slides/blob/docs-deploy-tutorial/docs/NEWBIE_DEPLOYMENT.md)，专为没有任何服务器部署经验的新手设计，可[点击链接](https://github.com/ShellMonster/banana-slides/blob/docs-deploy-tutorial/docs/NEWBIE_DEPLOYMENT.md)查看。**

### 从源码部署

#### 环境要求
- Python 3.10 - 3.13（推荐 3.13，暂不支持 3.14）
- [uv](https://github.com/astral-sh/uv) - Python 包管理器
- Node.js 16+ 和 npm
- 有效的 Google Gemini API 密钥
- （可选）[LibreOffice](https://www.libreoffice.org/) - 使用「PPT 翻新」功能上传 PPTX 文件时需要，用于将 PPTX 转换为 PDF。**推荐先在本地将 PPTX 转为 PDF 后再上传**，原因：LibreOffice 在服务端渲染时可能因缺少字体（如微软雅黑、Calibri 等）导致排版错位，且无法完整还原部分特效。上传 PDF 文件则不需要 LibreOffice。Docker 用户如仍需在容器内支持 PPTX 上传，可执行：
  ```bash
  docker exec -it banana-slides-backend bash -c "apt-get update && apt-get install -y libreoffice-impress && rm -rf /var/lib/apt/lists/*"
  ```
  > 注意：此方式安装的 LibreOffice 在容器重建后会丢失，需重新安装。

#### 后端安装

0. **克隆代码仓库**
```bash
git clone https://github.com/Anionex/banana-slides
cd banana-slides
```

1. **安装 uv（如果尚未安装）**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. **安装依赖**

在项目根目录下运行：
```bash
uv sync
```

这将根据 `pyproject.toml` 自动安装所有依赖。

3. **配置环境变量**

复制环境变量模板：
```bash
cp .env.example .env
# 然后按照前述方法，打开编辑 `.env` 文件，配置你的 API 密钥
```

#### 前端安装

1. **进入前端目录**
```bash
cd frontend
```

2. **安装依赖**
```bash
npm install
```

3. **配置API地址**

前端会自动连接到 `http://localhost:5000` 的后端服务。如需修改，请编辑 `src/api/client.ts`。


#### 启动后端服务
> （可选）如果本地已有重要数据，升级前建议先备份数据库：  
> `cp backend/instance/database.db backend/instance/database.db.bak`
> 备注： 默认配置下，模板、素材、成品都在uploads/文件夹中

```bash
cd backend
uv run alembic upgrade head && uv run python app.py
```

后端服务将在 `http://localhost:5000` 启动。

访问 `http://localhost:5000/health` 验证服务是否正常运行。

#### 启动前端开发服务器

```bash
cd frontend
npm run dev
```

前端开发服务器将在 `http://localhost:3000` 启动。

打开浏览器访问即可使用应用。

#### 项目导入/导出（跨电脑迁移）

如果你在多台电脑上开发，可以使用仓库内置脚本快速迁移单个项目（包含数据库记录 + `uploads/<project_id>/` 文件）。

1. **查看项目 ID（取最近 20 个）**
```bash
python - <<'PY'
import sqlite3, sys
sys.path.insert(0, 'backend')
from config import get_default_sqlite_db_path
db = get_default_sqlite_db_path()
conn = sqlite3.connect(db)
rows = conn.execute("SELECT id, updated_at FROM projects ORDER BY updated_at DESC LIMIT 20").fetchall()
for r in rows:
    print(r[0], r[1])
PY
```

2. **在电脑 A 导出项目**
```bash
python scripts/project_transfer.py export --project-id <PROJECT_ID> --output ./project-transfer.zip
```

3. **在电脑 B 导入项目**
```bash
python scripts/project_transfer.py import --archive ./project-transfer.zip
```

4. **可选：冲突处理与重命名导入**
```bash
# 如果目标项目已存在，直接覆盖
python scripts/project_transfer.py import --archive ./project-transfer.zip --on-conflict replace

# 导入为新的项目 ID（避免与本地已有项目冲突）
python scripts/project_transfer.py import --archive ./project-transfer.zip --target-project-id <NEW_PROJECT_ID>
```

> 脚本路径：`scripts/project_transfer.py`  
> 默认会自动读取当前分支对应的 SQLite（`backend/instance/database-<branch>.db`）和 `uploads` 目录；也可通过 `--db-path` 与 `--uploads-dir` 显式指定。


## 🛠️ 技术架构

### 前端技术栈
React 18 + TypeScript + Vite 5 + Zustand

### 后端技术栈
- **语言**：Python 3.10 - 3.13
- **框架**：Flask 3.0
- **包管理**：uv
- **数据库**：SQLite + Flask-SQLAlchemy
- **AI能力**：Google Gemini API
- **PPT处理**：python-pptx
- **图片处理**：Pillow
- **并发处理**：ThreadPoolExecutor
- **跨域支持**：Flask-CORS

## 📁 项目结构

```
banana-slides/
├── frontend/                    # React前端应用
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   │   ├── Home.tsx        # 首页（创建项目）
│   │   │   ├── OutlineEditor.tsx    # 大纲编辑页
│   │   │   ├── DetailEditor.tsx     # 详细描述编辑页
│   │   │   ├── SlidePreview.tsx     # 幻灯片预览页
│   │   │   └── History.tsx          # 历史版本管理页
│   │   ├── components/         # UI组件
│   │   │   ├── outline/        # 大纲相关组件
│   │   │   │   └── OutlineCard.tsx
│   │   │   ├── preview/        # 预览相关组件
│   │   │   │   ├── SlideCard.tsx
│   │   │   │   └── DescriptionCard.tsx
│   │   │   ├── shared/         # 共享组件
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Textarea.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Loading.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   ├── Markdown.tsx
│   │   │   │   ├── MaterialSelector.tsx
│   │   │   │   ├── MaterialGeneratorModal.tsx
│   │   │   │   ├── TemplateSelector.tsx
│   │   │   │   ├── ReferenceFileSelector.tsx
│   │   │   │   └── ...
│   │   │   ├── layout/         # 布局组件
│   │   │   └── history/        # 历史版本组件
│   │   ├── store/              # Zustand状态管理
│   │   │   └── useProjectStore.ts
│   │   ├── api/                # API接口
│   │   │   ├── client.ts       # Axios客户端配置
│   │   │   └── endpoints.ts    # API端点定义
│   │   ├── types/              # TypeScript类型定义
│   │   ├── utils/              # 工具函数
│   │   ├── constants/          # 常量定义
│   │   └── styles/             # 样式文件
│   ├── public/                 # 静态资源
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js      # Tailwind CSS配置
│   ├── Dockerfile
│   └── nginx.conf              # Nginx配置
│
├── backend/                    # Flask后端应用
│   ├── app.py                  # Flask应用入口
│   ├── config.py               # 配置文件
│   ├── models/                 # 数据库模型
│   │   ├── project.py          # Project模型
│   │   ├── page.py             # Page模型（幻灯片页）
│   │   ├── task.py             # Task模型（异步任务）
│   │   ├── material.py         # Material模型（参考素材）
│   │   ├── user_template.py    # UserTemplate模型（用户模板）
│   │   ├── reference_file.py   # ReferenceFile模型（参考文件）
│   │   ├── page_image_version.py # PageImageVersion模型（页面版本）
│   ├── services/               # 服务层
│   │   ├── ai_service.py       # AI生成服务（Gemini集成）
│   │   ├── file_service.py     # 文件管理服务
│   │   ├── file_parser_service.py # 文件解析服务
│   │   ├── export_service.py   # PPTX/PDF导出服务
│   │   ├── task_manager.py     # 异步任务管理
│   │   ├── prompts.py          # AI提示词模板
│   ├── controllers/            # API控制器
│   │   ├── project_controller.py      # 项目管理
│   │   ├── page_controller.py         # 页面管理
│   │   ├── material_controller.py     # 素材管理
│   │   ├── template_controller.py     # 模板管理
│   │   ├── reference_file_controller.py # 参考文件管理
│   │   ├── export_controller.py       # 导出功能
│   │   └── file_controller.py         # 文件上传
│   ├── utils/                  # 工具函数
│   │   ├── response.py         # 统一响应格式
│   │   ├── validators.py       # 数据验证
│   │   └── path_utils.py       # 路径处理
│   ├── instance/               # SQLite数据库（自动生成）
│   ├── exports/                # 导出文件目录
│   ├── Dockerfile
│   └── README.md
│
├── tests/                      # 测试文件目录
├── v0_demo/                    # 早期演示版本
├── output/                     # 输出文件目录
│
├── pyproject.toml              # Python项目配置（uv管理）
├── uv.lock                     # uv依赖锁定文件
├── docker-compose.yml          # Docker Compose配置
├── .env.example                 # 环境变量示例
├── LICENSE                     # 许可证
└── README.md                   # 本文件
```

## 交流群
为了方便大家沟通互助，建此微信交流群.

欢迎提出新功能建议或反馈，本人也会~~佛系~~回答大家问题

<img width="312" alt="image" src="https://github.com/user-attachments/assets/20233131-4137-41cd-ba2e-76eda832d486" />

欢迎关注作者的社交媒体，我会分享有关本项目和有关AI的信息：

<p>
  <a href="https://x.com/anion_ex"><img src="https://img.shields.io/badge/X-@anion__ex-000000?style=flat-square&logo=x&logoColor=white" alt="X (Twitter)"></a>
  <a href="https://www.xiaohongshu.com/user/profile/62e8f580000000001902fc9d"><img src="https://img.shields.io/badge/小红书-Anion-FF2442?style=flat-square&logo=xiaohongshu&logoColor=white" alt="小红书"></a>
  <a href="https://space.bilibili.com/477162339"><img src="https://img.shields.io/badge/Bilibili-Anion-00A1D6?style=flat-square&logo=bilibili&logoColor=white" alt="Bilibili"></a>
</p>





## **🔧 常见问题**
可见[官网文档](https://docs.bananaslides.online/zh/faq)


## 🤝 贡献指南

欢迎通过
[Issue](https://github.com/Anionex/banana-slides/issues)
和
[Pull Request](https://github.com/Anionex/banana-slides/pulls)
为本项目贡献力量！

> **重要：** 贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 许可证

本项目采用 **GNU Affero General Public License v3.0（AGPL-3.0）** 开源，
可自由用于个人学习、研究、试验、教育或非营利科研活动等非商业用途；
<details> 
<summary> 详情 </summary>
需要商业许可证（Commercial License）（例如：希望闭源使用、私有化部署交付、将本项目集成进闭源产品，或在不公开对应源代码的前提下提供服务），请联系作者：davidyang042@gmail.com
</details>



<h2>🚀 Sponsor / 赞助 </h2>
<br>
<div align="center">
<a href="https://aihubmix.com/?aff=17EC">
  <img src="./assets/logo_aihubmix.png" alt="AIHubMix" style="height:48px;">
</a>
<p>感谢AIHubMix对本项目的赞助</p>
</div>


<div align="center">

 <br>

<a href="https://api.chatfire.site/login?inviteCode=A15CD6A0"><img width="200" alt="image" src="https://github.com/user-attachments/assets/d6bd255f-ba2c-4ea3-bd90-fef292fc3397" />
</a>


感谢<a href="https://api.chatfire.site/login?inviteCode=A15CD6A0">AI火宝</a>对本项目的赞助
 
</div>



## 致谢

- 项目贡献者们：

[![Contributors](https://contrib.rocks/image?repo=Anionex/banana-slides)](https://github.com/Anionex/banana-slides/graphs/contributors)

- [Linux.do](https://linux.do/): 新的理想型社区
  
## 赞赏

开源不易🙏如果本项目对你有价值，欢迎请开发者喝杯咖啡☕️

<img width="240" alt="image" src="https://github.com/user-attachments/assets/fd7a286d-711b-445e-aecf-43e3fe356473" />

感谢以下朋友对项目的无偿赞助支持：
> @雅俗共赏、@曹峥、@以年观日、@John、@胡yun星Ethan, @azazo1、@刘聪NLP、@🍟、@苍何、@万瑾、@biubiu、@law、@方源、@寒松Falcon
> 如对赞助列表有疑问，可<a href="mailto:davidyang042@gmail.com">联系作者</a>
 
## 📈 项目统计

<a href="https://www.star-history.com/#Anionex/banana-slides&type=Timeline&legend=top-left">

 <picture>

   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Anionex/banana-slides&type=Timeline&theme=dark&legend=top-left" />

   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Anionex/banana-slides&type=Timeline&legend=top-left" />

   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Anionex/banana-slides&type=Timeline&legend=top-left" />

 </picture>

</a>

<br>
