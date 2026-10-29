import React from 'react';
import { Card, Input } from '@/components/shared';
import { DataStorageSettings } from '@/components/settings/DataStorageSettings';
import { isDesktop } from '@/utils';

interface UpstreamOptions {
  ai_provider_format: string;
  image_model_source: string;
  image_model: string;
  text_max_output_tokens: number;
  image_quality: string;
  enable_image_quality_control: boolean;
  openai_image_api_protocol: string;
}

interface SettingsUpstreamOptionsProps {
  values: UpstreamOptions;
  onChange: (patch: Partial<UpstreamOptions>) => void;
}

/** Expose upstream generation controls while retaining the custom settings layout. */
export const SettingsUpstreamOptions: React.FC<SettingsUpstreamOptionsProps> = ({ values, onChange }) => {
  const source = values.image_model_source || values.ai_provider_format;
  const showProtocol = ['openai', 'azure', 'volcengine', 'ppio', 'aiping'].includes(source);
  const showQuality = (showProtocol || source === 'codex') && values.image_model.toLowerCase().startsWith('gpt-image');
  return (
  <Card className="p-4 md:p-5 space-y-4">
    <h2 className="text-lg font-semibold">生成控制</h2>
    <Input label="文本输出上限" type="number" min={1024} max={128000}
      value={values.text_max_output_tokens}
      onChange={(event) => onChange({ text_max_output_tokens: Number(event.target.value) })} />
    {showQuality && <label className="block text-sm font-medium">
      图片质量档位
      <select className="mt-2 block w-full rounded-lg border p-2 dark:bg-background-secondary"
        data-testid="openai-image-quality-select" value={values.image_quality} onChange={(event) => onChange({ image_quality: event.target.value })}>
        {['auto', 'low', 'medium', 'high', 'xhigh', 'max'].map((quality) => (
          <option key={quality} value={quality}>{quality}</option>
        ))}
      </select>
    </label>}
    {showQuality && <p className="text-sm text-gray-500">xhigh / max 适用于 GPT Image 2.5 及更新模型，旧模型回落到 high。</p>}
    {showProtocol && <label className="block text-sm font-medium">
      OpenAI 图片 API 协议
      <select className="mt-2 block w-full rounded-lg border p-2 dark:bg-background-secondary"
        data-testid="openai-image-api-protocol-select" value={values.openai_image_api_protocol}
        onChange={(event) => onChange({ openai_image_api_protocol: event.target.value })}>
        <option value="auto">自动识别</option>
        <option value="images">Images API</option>
        <option value="chat">Chat Completions</option>
      </select>
    </label>}
    <label className="flex items-center gap-2 text-sm">
      <span>启用质量控制模式</span>
      <button type="button" role="switch" aria-label="启用质量控制模式"
        aria-checked={values.enable_image_quality_control}
        className="rounded border px-3 py-1"
        onClick={() => onChange({ enable_image_quality_control: !values.enable_image_quality_control })}>
        {values.enable_image_quality_control ? '开启' : '关闭'}
      </button>
    </label>
    {source === 'sensenova' && <p data-testid="sensenova-image-model-hint" className="text-sm text-gray-500">商汤 U1 生图请使用 OpenAI 兼容格式，Base URL 填 https://token.sensenova.cn/v1，模型填 sensenova-u1.5-lite</p>}
    {values.ai_provider_format === 'sensenova' && <p data-testid="sensenova-global-image-hint" className="text-sm text-gray-500">商汤 U1 生图请使用 OpenAI 兼容格式，Base URL 填 https://token.sensenova.cn/v1，模型填 sensenova-u1.5-lite</p>}
    {isDesktop && <DataStorageSettings />}
  </Card>
  );
};
