import React from 'react';
import { HelpCircle } from 'lucide-react';

import { Input } from './Input';
import { Select } from './Select';
import {
  getGptImageSizeOptionsForAspectRatio,
  getImageChannelOptionById,
  getImageModelSchema,
  getNormalizedImageModel,
  type ImageModelSchema,
} from '@/config/projectAiChannels';

type ProviderProfileSummary = import('@/types').ProviderProfileSummary;
type ImageChannelOption = import('@/types').ImageChannelOption;

type ProjectImageDefaultsSectionProps = {
  providerProfiles: ProviderProfileSummary[];
  selectedImageChannel: string;
  availableImageChannels: ImageChannelOption[];
  selectedImageModel: string;
  selectableImageModels: ReadonlyArray<{ model: string; label?: string }>;
  selectedImageResolution: string;
  visibleResolutionOptions: string[];
  aspectRatio: string;
  isAspectRatioCompatible: boolean;
  compatibilityMessage?: string;
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
  aspectRatio,
  value,
  onChange,
}: {
  aspectRatio: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const aspectRatioOptions = getGptImageSizeOptionsForAspectRatio(aspectRatio);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 dark:text-foreground-tertiary">
        当前页面比例为 {aspectRatio}，这里只展示该比例下可实际传给后端的尺寸。
      </p>
      <div className="grid gap-1 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {aspectRatioOptions.map((option) => {
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
              <div className="text-[12px] font-medium leading-snug">{option.value}</div>
            </button>
          );
        })}
      </div>
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
  aspectRatio,
  isAspectRatioCompatible,
  compatibilityMessage,
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
  const normalizedModel = getNormalizedImageModel(selectedImageChannel, selectedImageModel, providerProfiles);
  const lockedGptImageQuality = normalizedModel.lockedParams.gptImageQuality;
  const resolvedGptImageQuality = lockedGptImageQuality || gptImageQuality;
  const showGptImageControls = schema === 'gpt-image-2';
  const configNote = getImageChannelOptionById(selectedImageChannel, providerProfiles)?.config_note;
  const showCompatibilityWarning = Boolean(compatibilityMessage) && !isAspectRatioCompatible;

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
          {normalizedModel.variantLabel && (
            <p className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">
              {normalizedModel.variantLabel}
            </p>
          )}
        </div>
      </div>
      {showCompatibilityWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200">
          {compatibilityMessage}
        </div>
      )}
      {showGptImageControls ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
              图片尺寸
            </label>
            {isAspectRatioCompatible ? (
              <ProjectGptImageSizeOptions
                aspectRatio={aspectRatio}
                value={gptImageSize}
                onChange={onGptImageSizeChange}
              />
            ) : null}
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
                value={resolvedGptImageQuality}
                onChange={onGptImageQualityChange}
                disabled={Boolean(lockedGptImageQuality)}
                options={[
                  { value: 'auto', label: '自动' },
                  { value: 'low', label: lockedGptImageQuality === 'low' ? '低（渠道锁定）' : '低' },
                  { value: 'medium', label: lockedGptImageQuality === 'medium' ? '中（渠道锁定）' : '中' },
                  { value: 'high', label: lockedGptImageQuality === 'high' ? '高（渠道锁定）' : '高' },
                ]}
              />
              {lockedGptImageQuality && (
                <p className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">
                  质量档位由渠道模型 {normalizedModel.providerModelId} 固定为{resolvedGptImageQuality === 'low' ? '低' : (resolvedGptImageQuality === 'medium' ? '中' : '高')}。
                </p>
              )}
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
          disabled={isSaving || !isAspectRatioCompatible}
          className="inline-flex w-full items-center justify-center rounded-lg border border-banana-500 px-4 py-2 text-sm font-medium text-banana-700 transition-colors hover:bg-banana-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-banana dark:text-banana dark:hover:bg-banana-900/20 sm:w-auto"
        >
          {isSaving ? '保存中...' : saveLabel}
        </button>
      )}
    </div>
  );
};
