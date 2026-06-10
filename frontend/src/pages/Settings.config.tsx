import React from 'react';
import { Input } from '@/components/shared';
import type { OutputLanguage } from '@/api/endpoints';
import { PROJECT_IMAGE_MODEL_CATALOG } from '@/config/projectAiDefaults';
import type { useT } from '@/hooks/useT';
import type { Settings as SettingsType } from '@/types';

// 配置项类型定义
export type FieldType = 'text' | 'password' | 'number' | 'select' | 'buttons' | 'switch';

export interface FieldConfig {
  key: keyof typeof initialFormData;
  label: string;
  type: FieldType;
  placeholder?: string;
  description?: string;
  sensitiveField?: boolean;  // 是否为敏感字段（如 API Key）
  lengthKey?: keyof SettingsType;  // 用于显示已有长度的 key（如 api_key_length）
  options?: { value: string; label: string }[];  // select 类型的选项
  min?: number;
  max?: number;
  link?: string;  // 申请链接 URL
}

export interface SectionConfig {
  id: string;
  title: string;
  icon: React.ReactNode;
  fields: FieldConfig[];
}

export interface SettingsNavItem {
  id: string;
  title: string;
  icon: React.ReactNode;
}

export type TestStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ServiceTestState {
  status: TestStatus;
  message?: string;
  detail?: string;
}

export const SETTINGS_SECTION_IDS = [
  'api-config',
  'openai-oauth',
  'model-config',
  'mineru-config',
  'image-config',
  'performance-config',
  'output-language',
  'text-reasoning',
  'image-reasoning',
  'baidu-ocr',
  'service-test',
] as const;

// LazyLLM 支持的厂商列表
export const LAZYLLM_SOURCES = [
  { value: 'qwen', label: 'Qwen (通义千问)' },
  { value: 'doubao', label: 'Doubao (豆包)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'glm', label: 'GLM (智谱)' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'sensenova', label: 'SenseNova (商汤)' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'kimi', label: 'Kimi' },
];

// 全局 provider 下拉（不含 profile:*）
export const GLOBAL_PROVIDER_SOURCES = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'azure-openai', label: 'Azure OpenAI' },
  { value: 'codex', label: 'Codex (OpenAI OAuth)' },
  ...LAZYLLM_SOURCES.filter(s => s.value !== 'openai'), // avoid duplicate 'openai'
];

// 需要 API Key + Base URL 的提供商（非 LazyLLM 厂商）
export const API_KEY_PROVIDERS = new Set(['gemini', 'openai', 'azure-openai']);

// LazyLLM 厂商名集合
const LAZYLLM_VENDOR_SET = new Set(LAZYLLM_SOURCES.map(s => s.value));

// 初始表单数据
export const initialFormData = {
  ai_provider_format: 'gemini' as string,
  api_base_url: '',
  azure_openai_endpoint: '',
  azure_openai_api_version: '2024-10-21',
  api_key: '',
  text_model: '',
  image_model: '',
  image_caption_model: '',
  mineru_api_base: '',
  mineru_token: '',
  image_resolution: '2K',
  max_description_workers: 5,
  max_image_workers: 8,
  output_language: 'zh' as OutputLanguage,
  // 推理模式配置（分别控制文本和图像）
  enable_text_reasoning: false,
  text_thinking_budget: 1024,
  enable_image_reasoning: false,
  image_thinking_budget: 1024,
  baidu_api_key: '',
  // LazyLLM 配置
  text_model_source: '',
  image_model_source: '',
  image_caption_model_source: '',
  lazyllm_api_keys: {} as Record<string, string>,
  // Per-model API credentials (for gemini/openai per-model overrides)
  text_api_key: '',
  text_api_base_url: '',
  text_azure_openai_endpoint: '',
  text_azure_openai_api_version: '2024-10-21',
  image_api_key: '',
  image_api_base_url: '',
  image_azure_openai_endpoint: '',
  image_azure_openai_api_version: '2024-10-21',
  image_caption_api_key: '',
  image_caption_api_base_url: '',
  image_caption_azure_openai_endpoint: '',
  image_caption_azure_openai_api_version: '2024-10-21',
  openai_image_api_protocol: 'auto',
  gpt_image_background: 'auto',
  gpt_image_output_format: 'png',
  gpt_image_output_compression: 100,
  gpt_image_quality: 'auto',
};

export const isLazyllmVendor = (vendor: string) =>
  LAZYLLM_VENDOR_SET.has(vendor) && vendor !== 'openai';

const normalizeProviderValue = (value: string) => (value === 'azure' ? 'azure-openai' : value);

// When backend returns "lazyllm", infer specific vendor from configured keys
const resolveLazyllmVendor = (format: string, keysInfo?: Record<string, number>): string => {
  if (format !== 'lazyllm') return format;
  if (keysInfo) {
    const vendor = LAZYLLM_SOURCES.find(s => isLazyllmVendor(s.value) && keysInfo[s.value]);
    if (vendor) return vendor.value;
  }
  return LAZYLLM_SOURCES.find(s => isLazyllmVendor(s.value))?.value || 'deepseek';
};

const IMAGE_MODEL_OPTIONS = PROJECT_IMAGE_MODEL_CATALOG.map((item) => ({
  value: item.model,
  label: item.label,
}));

// Build image model dropdown options and preserve current custom model value.
export const getImageModelSelectOptions = (currentValue: string) => {
  const normalizedCurrent = String(currentValue || '').trim();
  if (!normalizedCurrent) return IMAGE_MODEL_OPTIONS;
  const exists = IMAGE_MODEL_OPTIONS.some((item) => item.value === normalizedCurrent);
  if (exists) return IMAGE_MODEL_OPTIONS;
  return [{ value: normalizedCurrent, label: `Custom · ${normalizedCurrent}` }, ...IMAGE_MODEL_OPTIONS];
};

export const GlobalVendorKeyInput: React.FC<{
  vendor: string; formData: typeof initialFormData;
  setFormData: React.Dispatch<React.SetStateAction<typeof initialFormData>>;
  settings: SettingsType | null; t: ReturnType<typeof useT>;
}> = ({ vendor, formData, setFormData, settings, t }) => {
  const vendorLabel = LAZYLLM_SOURCES.find(s => s.value === vendor)?.label || vendor.toUpperCase();
  const keyLength = settings?.lazyllm_api_keys_info?.[vendor] || 0;
  const placeholder = keyLength > 0
    ? t('settings.fields.vendorApiKeySet', { length: keyLength })
    : t('settings.fields.vendorApiKeyPlaceholder', { vendor: vendorLabel });
  return (
    <div className="pl-3 border-l-2 border-amber-300 dark:border-amber-600">
      <Input
        label={t('settings.fields.vendorApiKey', { vendor: vendorLabel })}
        type="password"
        placeholder={placeholder}
        value={formData.lazyllm_api_keys[vendor] || ''}
        onChange={(e) => {
          setFormData(prev => ({
            ...prev,
            lazyllm_api_keys: { ...prev.lazyllm_api_keys, [vendor]: e.target.value }
          }));
        }}
      />
      <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.vendorApiKeyDesc')}</p>
    </div>
  );
};

export const formDataFromSettings = (data: SettingsType): typeof initialFormData => ({
  ai_provider_format: normalizeProviderValue(resolveLazyllmVendor(data.ai_provider_format || 'gemini', data.lazyllm_api_keys_info)),
  api_base_url: data.api_base_url || '',
  azure_openai_endpoint: data.azure_openai_endpoint || '',
  azure_openai_api_version: data.azure_openai_api_version || '2024-10-21',
  api_key: '',
  image_resolution: data.image_resolution || '2K',
  max_description_workers: data.max_description_workers || 5,
  max_image_workers: data.max_image_workers || 8,
  text_model: data.text_model || '',
  image_model: data.image_model || '',
  mineru_api_base: data.mineru_api_base || '',
  mineru_token: '',
  image_caption_model: data.image_caption_model || '',
  output_language: data.output_language || 'zh',
  enable_text_reasoning: data.enable_text_reasoning || false,
  text_thinking_budget: data.text_thinking_budget || 1024,
  enable_image_reasoning: data.enable_image_reasoning || false,
  image_thinking_budget: data.image_thinking_budget || 1024,
  baidu_api_key: '',
  text_model_source: normalizeProviderValue(data.text_model_source || ''),
  image_model_source: normalizeProviderValue(data.image_model_source || ''),
  image_caption_model_source: normalizeProviderValue(data.image_caption_model_source || ''),
  lazyllm_api_keys: {},
  text_api_key: '',
  text_api_base_url: data.text_api_base_url || '',
  text_azure_openai_endpoint: data.text_azure_openai_endpoint || '',
  text_azure_openai_api_version: data.text_azure_openai_api_version || '2024-10-21',
  image_api_key: '',
  image_api_base_url: data.image_api_base_url || '',
  image_azure_openai_endpoint: data.image_azure_openai_endpoint || '',
  image_azure_openai_api_version: data.image_azure_openai_api_version || '2024-10-21',
  image_caption_api_key: '',
  image_caption_api_base_url: data.image_caption_api_base_url || '',
  image_caption_azure_openai_endpoint: data.image_caption_azure_openai_endpoint || '',
  image_caption_azure_openai_api_version: data.image_caption_azure_openai_api_version || '2024-10-21',
  openai_image_api_protocol: data.openai_image_api_protocol || 'auto',
  gpt_image_background: data.gpt_image_background || 'auto',
  gpt_image_output_format: data.gpt_image_output_format || 'png',
  gpt_image_output_compression: data.gpt_image_output_compression ?? 100,
  gpt_image_quality: data.gpt_image_quality || 'auto',
});
