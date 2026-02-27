// 页面状态
export type PageStatus = 'DRAFT' | 'DESCRIPTION_GENERATED' | 'GENERATING' | 'COMPLETED' | 'FAILED';

// 项目状态
export type ProjectStatus = 'DRAFT' | 'OUTLINE_GENERATED' | 'DESCRIPTIONS_GENERATED' | 'COMPLETED';

// 大纲内容
export interface OutlineContent {
  title: string;
  points: string[];
}

// 描述内容 - 支持两种格式：后端可能返回纯文本或结构化内容
export type DescriptionContent = 
  | {
      // 格式1: 后端返回的纯文本格式
      text: string;
    }
  | {
      // 格式2: 类型定义中的结构化格式
      title: string;
      text_content: string[];
      layout_suggestion?: string;
    };

// 封面/结尾补全信息（前端使用的结构）
export interface PresentationMeta {
  logo_url?: string;
  company_name?: string;
  project_name?: string;
  presenter?: string;
  presenter_title?: string;
  date?: string;
  location?: string;
  phone?: string;
  website_or_email?: string;
  thanks_or_slogan?: string;
  _cover_ending_checked?: boolean;
  _cover_ending_skipped?: boolean;
  _cover_ending_completed?: boolean;
}

export interface CoverEndingFieldDetect {
  key: string;
  page_role: 'cover' | 'ending';
  present: boolean;
  value?: string;
  is_placeholder?: boolean;
  placeholders?: string[];
  confidence?: number | null;
}

// 图片版本
export interface ImageVersion {
  version_id: string;
  page_id: string;
  image_path: string;
  image_url?: string;
  version_number: number;
  is_current: boolean;
  created_at?: string;
}

// 页面
export interface Page {
  page_id: string;  // 后端返回 page_id
  id?: string;      // 前端使用的别名
  order_index: number;
  part?: string; // 章节名
  outline_content: OutlineContent | null;
  description_content?: DescriptionContent;
  generated_image_url?: string; // 后端返回 generated_image_url
  preview_image_url?: string; // 后端返回 preview_image_url
  cached_image_url?: string; // 后端返回 cached_image_url
  generated_image_path?: string; // 前端使用的别名
  preview_image_path?: string; // 前端使用的预览图别名
  status: PageStatus;
  created_at?: string;
  updated_at?: string;
  image_versions?: ImageVersion[]; // 历史版本列表
}

// 导出设置 - 组件提取方法
export type ExportExtractorMethod = 'mineru' | 'hybrid';

// 导出设置 - 背景图获取方法
export type ExportInpaintMethod = 'generative' | 'baidu' | 'hybrid';

// 项目
export interface Project {
  project_id: string;  // 后端返回 project_id
  id?: string;         // 前端使用的别名
  idea_prompt: string;
  outline_text?: string;  // 用户输入的大纲文本（用于outline类型）
  description_text?: string;  // 用户输入的描述文本（用于description类型）
  extra_requirements?: string; // 额外要求，应用到每个页面的AI提示词
  presentation_meta?: string; // 封面/结尾补全信息（JSON字符串）
  creation_type?: string;
  template_image_url?: string; // 后端返回 template_image_url
  template_image_path?: string; // 前端使用的别名
  template_style?: string; // 风格描述文本（无模板图模式）
  template_style_json?: string; // 风格指导 JSON（字符串，优先级高于 template_style）
  // 导出设置
  export_extractor_method?: ExportExtractorMethod; // 组件提取方法
  export_inpaint_method?: ExportInpaintMethod; // 背景图获取方法
  export_allow_partial?: boolean; // 是否允许返回半成品（导出出错时继续而非停止）
  export_compress_enabled?: boolean;
  export_compress_format?: 'jpeg' | 'png' | 'webp';
  export_compress_quality?: number;
  export_compress_subsampling?: number;
  export_compress_progressive?: boolean;
  export_compress_png_quantize_enabled?: boolean;
  image_aspect_ratio?: string; // 画面比例（如 16:9, 4:3）
  status: ProjectStatus;
  pages: Page[];
  created_at: string;
  updated_at: string;
}

// 任务状态
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

// 任务信息
export interface Task {
  task_id: string;
  id?: string; // 别名
  task_type?: string;
  status: TaskStatus;
  progress?: {
    total: number;
    completed: number;
    failed?: number;
    [key: string]: any; // 允许额外的字段，如material_id, image_url等
  };
  error_message?: string;
  result?: any;
  error?: string; // 别名
  created_at?: string;
  completed_at?: string;
}

// 创建项目请求
export interface CreateProjectRequest {
  idea_prompt?: string;
  outline_text?: string;
  description_text?: string;
  template_image?: File;
  template_style?: string;
  image_aspect_ratio?: string;
}

// API响应
export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  task_id?: string;
  message?: string;
  error?: string;
}

// 设置
export interface Settings {
  id: number;
  ai_provider_format: 'openai' | 'gemini' | 'lazyllm';
  api_base_url?: string;
  api_key_length: number;
  image_resolution: string;
  image_aspect_ratio: string;
  max_description_workers: number;
  max_image_workers: number;
  text_model?: string;
  image_model?: string;
  mineru_api_base?: string;
  mineru_token_length: number;
  image_caption_model?: string;
  output_language: 'zh' | 'en' | 'ja' | 'auto';
  // 推理模式配置（分别控制文本和图像）
  enable_text_reasoning: boolean;
  text_thinking_budget: number;
  enable_image_reasoning: boolean;
  image_thinking_budget: number;
  baidu_api_key_length: number;
  // LazyLLM 配置
  text_model_source?: string;
  image_model_source?: string;
  image_caption_model_source?: string;
  lazyllm_api_keys_info?: Record<string, number>;  // {vendor: key_length}
  // Per-model API credentials (for gemini/openai per-model overrides)
  text_api_key_length: number;
  text_api_base_url?: string;
  image_api_key_length: number;
  image_api_base_url?: string;
  image_caption_api_key_length: number;
  image_caption_api_base_url?: string;
  created_at?: string;
  updated_at?: string;
}
