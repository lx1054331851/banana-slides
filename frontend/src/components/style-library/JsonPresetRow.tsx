import React from 'react';
import { Eye, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/shared';
import { getImageUrl } from '@/api/client';
import type { StylePreset, StylePresetPreviewImages } from '@/api/endpoints';
import type { PreviewKey } from './types';
import { PREVIEW_ORDER, getPresetDisplayName } from './types';

interface JsonPresetRowProps {
  preset: StylePreset;
  deleting: boolean;
  generatingPreviewKey: PreviewKey | null;
  onViewJson: (presetId: string) => void;
  onPreview: (preset: StylePreset, previewKey?: PreviewKey) => void;
  onDelete: (preset: StylePreset) => void;
  onGeneratePreview: (preset: StylePreset, previewKey: PreviewKey) => void;
}

export const JsonPresetRow: React.FC<JsonPresetRowProps> = ({
  preset,
  deleting,
  generatingPreviewKey,
  onViewJson,
  onPreview,
  onDelete,
  onGeneratePreview,
}) => {
  const preview: Partial<StylePresetPreviewImages> = preset.preview_images || {};

  return (
    <div
      data-testid={`preset-row-${preset.id}`}
      data-style-preset-id={preset.id}
      className="rounded-2xl border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary p-4 space-y-3"
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <button type="button" className="text-left min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={getPresetDisplayName(preset)}>
            {getPresetDisplayName(preset)}
          </div>
          <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">可直接应用的 style_json 与 4 张预览图</div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => onPreview(preset)}>
            预览
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onViewJson(preset.id)} data-testid={`preset-${preset.id}-view-json`}>
            查看 JSON
          </Button>
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} loading={deleting} onClick={() => onDelete(preset)}>
            删除
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {PREVIEW_ORDER.map(([key, label]) => {
          const src = preview[key] ? getImageUrl(preview[key]) : '';
          const isGenerating = generatingPreviewKey === key;
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{label}</div>
                {!src ? null : (
                  <button
                    type="button"
                    className="text-[11px] text-banana-700 hover:text-banana-800"
                    onClick={() => onGeneratePreview(preset, key)}
                  >
                    重生成
                  </button>
                )}
              </div>
              <div className="w-full aspect-video bg-gray-100 dark:bg-background-tertiary rounded-xl overflow-hidden border border-gray-200 dark:border-border-primary">
                {src ? (
                  <button
                    type="button"
                    onClick={() => onPreview(preset, key)}
                    className="w-full h-full block"
                    data-testid={`preset-${preset.id}-preview-${key}`}
                  >
                    <img src={src} alt={`${getPresetDisplayName(preset)}-${label}`} className="w-full h-full object-contain object-center" />
                  </button>
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Wand2 size={14} />}
                      loading={isGenerating}
                      onClick={() => onGeneratePreview(preset, key)}
                      data-testid={`preset-${preset.id}-generate-${key}`}
                    >
                      去生成
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
