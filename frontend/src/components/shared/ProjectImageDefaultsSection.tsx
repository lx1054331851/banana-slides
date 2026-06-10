import React from 'react';
import { HelpCircle } from 'lucide-react';

import { Input } from './Input';
import { Select } from './Select';
import {
  getImageChannelOptionById,
  getImageModelSchema,
  type ImageModelSchema,
} from '@/config/projectAiChannels';

type ProviderProfileSummary = import('@/types').ProviderProfileSummary;
type ImageChannelOption = import('@/types').ImageChannelOption;

const GPT_IMAGE_SIZE_OPTIONS = [
  { value: '1024x1024', label: '1:1', group: 'square' },
  { value: '1536x1024', label: '3:2', group: 'landscape' },
  { value: '1536x1152', label: '4:3', group: 'landscape' },
  { value: '1440x1152', label: '5:4', group: 'landscape' },
  { value: '1536x864', label: '16:9', group: 'landscape' },
  { value: '1680x720', label: '21:9', group: 'landscape' },
  { value: '1024x1536', label: '2:3', group: 'portrait' },
  { value: '1152x1536', label: '3:4', group: 'portrait' },
  { value: '1152x1440', label: '4:5', group: 'portrait' },
  { value: '864x1536', label: '9:16', group: 'portrait' },
  { value: '2048x2048', label: '1:1', group: 'square' },
  { value: '2016x1344', label: '3:2', group: 'landscape' },
  { value: '2048x1536', label: '4:3', group: 'landscape' },
  { value: '1920x1536', label: '5:4', group: 'landscape' },
  { value: '2048x1152', label: '16:9', group: 'landscape' },
  { value: '2352x1008', label: '21:9', group: 'landscape' },
  { value: '1344x2016', label: '2:3', group: 'portrait' },
  { value: '1536x2048', label: '3:4', group: 'portrait' },
  { value: '1536x1920', label: '4:5', group: 'portrait' },
  { value: '1152x2048', label: '9:16', group: 'portrait' },
  { value: '2880x2880', label: '1:1', group: 'square' },
  { value: '3840x2160', label: '16:9', group: 'landscape' },
  { value: '2160x3840', label: '9:16', group: 'portrait' },
] as const;

type ProjectImageDefaultsSectionProps = {
  providerProfiles: ProviderProfileSummary[];
  selectedImageChannel: string;
  availableImageChannels: ImageChannelOption[];
  selectedImageModel: string;
  selectableImageModels: ReadonlyArray<{ model: string; label?: string }>;
  selectedImageResolution: string;
  visibleResolutionOptions: string[];
  gptImageSize: string;
  gptImageBackground: string;
  gptImageOutputFormat: string;
  gptImageOutputCompression: number;
  gptImageQuality: string;
  onChannelChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onGptImageSizeChange: (value: string) => void;
  onGptImageBackgroundChange: (value: string) => void;
  onGptImageOutputFormatChange: (value: string) => void;
  onGptImageOutputCompressionChange: (value: number) => void;
  onGptImageQualityChange: (value: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveLabel: string;
};

// Render an inline label with a hover tooltip for compact field help.
function TooltipLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="group relative inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span
        className="inline-flex cursor-help text-gray-400 transition-colors hover:text-banana-600 dark:text-foreground-tertiary dark:hover:text-banana"
        aria-label={`${label}说明：${tooltip}`}
      >
        <HelpCircle size={14} />
      </span>
      <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden w-64 -translate-y-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs font-normal leading-5 text-white shadow-lg group-hover:block dark:bg-black">
        {tooltip}
      </span>
    </span>
  );
}

// Render grouped GPT Image 2 real size options for project-level defaults.
function ProjectGptImageSizeOptions({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const groupedOptions = [
    { key: 'square', title: '方图', options: GPT_IMAGE_SIZE_OPTIONS.filter((item) => item.group === 'square') },
    { key: 'landscape', title: '横版', options: GPT_IMAGE_SIZE_OPTIONS.filter((item) => item.group === 'landscape') },
    { key: 'portrait', title: '竖版', options: GPT_IMAGE_SIZE_OPTIONS.filter((item) => item.group === 'portrait') },
  ];

  return (
    <div className="space-y-3">
      {groupedOptions.map((group) => (
        <div key={group.key} className="space-y-1.5">
          <div className="text-xs font-semibold tracking-wide text-gray-500 dark:text-foreground-tertiary">
            {group.title}
          </div>
          <div className="grid gap-1 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
            {group.options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange(option.value)}
                  className={`rounded-md border px-2 py-1.5 text-left transition-all ${
                    active
                      ? 'border-banana-500 bg-banana-50 text-banana-900 shadow-sm dark:border-banana-400 dark:bg-banana-500/10 dark:text-banana-100'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-banana-300 hover:bg-banana-50/50 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/60 dark:hover:bg-background-hover'
                  }`}
                >
                  <div className="text-[12px] font-medium leading-snug">{option.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Return the project-level schema for the current channel/model pair.
function getProjectImageSchema(
  selectedImageChannel: string,
  selectedImageModel: string,
  providerProfiles: ProviderProfileSummary[],
): ImageModelSchema {
  return getImageModelSchema(selectedImageChannel, selectedImageModel, providerProfiles);
}

// Render project-level AI image defaults with model-specific controls.
export const ProjectImageDefaultsSection: React.FC<ProjectImageDefaultsSectionProps> = ({
  providerProfiles,
  selectedImageChannel,
  availableImageChannels,
  selectedImageModel,
  selectableImageModels,
  selectedImageResolution,
  visibleResolutionOptions,
  gptImageSize,
  gptImageBackground,
  gptImageOutputFormat,
  gptImageOutputCompression,
  gptImageQuality,
  onChannelChange,
  onModelChange,
  onResolutionChange,
  onGptImageSizeChange,
  onGptImageBackgroundChange,
  onGptImageOutputFormatChange,
  onGptImageOutputCompressionChange,
  onGptImageQualityChange,
  onSave,
  isSaving = false,
  saveLabel,
}) => {
  const schema = getProjectImageSchema(selectedImageChannel, selectedImageModel, providerProfiles);
  const showGptImageControls = schema === 'gpt-image-2';
  const configNote = getImageChannelOptionById(selectedImageChannel, providerProfiles)?.config_note;

  return (
    <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
      <div>
        <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">AI 生成默认（项目级）</h4>
        <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
          配置当前项目默认的图片生成来源、模型和对应参数（可在预览页临时覆盖）。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(320px,1.35fr)]">
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            Channel
          </label>
          <Select
            value={selectedImageChannel}
            onChange={onChannelChange}
            options={availableImageChannels.map((channel) => ({
              value: channel.id,
              label: channel.label || channel.id,
            }))}
          />
        </div>
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            图片模型
          </label>
          <Select
            value={selectedImageModel}
            className="min-w-0"
            menuClassName="max-w-[min(80vw,40rem)]"
            onChange={onModelChange}
            options={selectableImageModels.map((item) => ({
              value: item.model,
              label: item.label || item.model,
            }))}
          />
        </div>
      </div>
      {showGptImageControls ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
              图片尺寸
            </label>
            <ProjectGptImageSizeOptions value={gptImageSize} onChange={onGptImageSizeChange} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
                <TooltipLabel label="背景模式" tooltip="控制生成图像背景的透明/实色策略，仅对 GPT Image 2 生效。" />
              </label>
              <Select
                value={gptImageBackground}
                onChange={onGptImageBackgroundChange}
                options={[
                  { value: 'auto', label: '自动' },
                  { value: 'transparent', label: '透明' },
                  { value: 'opaque', label: '实色' },
                ]}
              />
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
                <TooltipLabel label="输出格式" tooltip="控制图片返回格式。JPEG / WebP 可配合压缩强度使用。" />
              </label>
              <Select
                value={gptImageOutputFormat}
                onChange={onGptImageOutputFormatChange}
                options={[
                  { value: 'png', label: 'PNG' },
                  { value: 'jpeg', label: 'JPEG' },
                  { value: 'webp', label: 'WebP' },
                ]}
              />
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
                <TooltipLabel label="质量档位" tooltip="优先使用显式质量档位，不再只由分辨率自动映射。" />
              </label>
              <Select
                value={gptImageQuality}
                onChange={onGptImageQualityChange}
                options={[
                  { value: 'auto', label: '自动' },
                  { value: 'low', label: '低' },
                  { value: 'medium', label: '中' },
                  { value: 'high', label: '高' },
                ]}
              />
            </div>
            <Input
              label={<TooltipLabel label="输出压缩率" tooltip="仅在 JPEG / WebP 下生效，0 为最强压缩，100 为最高质量。" />}
              type="number"
              min={0}
              max={100}
              value={gptImageOutputCompression}
              onChange={(event) => onGptImageOutputCompressionChange(Number(event.target.value))}
            />
          </div>
        </>
      ) : (
        <div className="w-full md:max-w-sm">
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            图像清晰度
          </label>
          <Select
            value={selectedImageResolution}
            onChange={onResolutionChange}
            options={visibleResolutionOptions.map((resolution) => ({
              value: resolution,
              label: resolution,
            }))}
          />
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-foreground-tertiary">
        当前支持的生图渠道为 `viviai`、`gs88`、`147ai`。不同模型会展示各自真实可用的参数。
      </p>
      {configNote && (
        <p className="text-xs text-gray-500 dark:text-foreground-tertiary">
          当前渠道状态：
          {configNote}
        </p>
      )}
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex w-full items-center justify-center rounded-lg border border-banana-500 px-4 py-2 text-sm font-medium text-banana-700 transition-colors hover:bg-banana-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-banana dark:text-banana dark:hover:bg-banana-900/20 sm:w-auto"
        >
          {isSaving ? '保存中...' : saveLabel}
        </button>
      )}
    </div>
  );
};
