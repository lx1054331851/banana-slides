import React from 'react';
import { Button, Card } from '@/components/shared';
import type { StylePreset } from '@/api/endpoints';
import type { ProjectScenario } from '@/types';
import type { PreviewKey } from './types';
import { JsonPresetRow } from './JsonPresetRow';

interface JsonPresetListProps {
  presets: StylePreset[];
  scenario: ProjectScenario;
  deletingPresetId: string | null;
  generatingPreviewState: { presetId: string; previewKey: PreviewKey } | null;
  onViewJson: (presetId: string) => void;
  onPreview: (preset: StylePreset, previewKey?: PreviewKey) => void;
  onDelete: (preset: StylePreset) => void;
  onGeneratePreview: (preset: StylePreset, previewKey: PreviewKey) => void;
  onOpenCreateDrawer: () => void;
}

export const JsonPresetList: React.FC<JsonPresetListProps> = ({
  presets,
  scenario,
  deletingPresetId,
  generatingPreviewState,
  onViewJson,
  onPreview,
  onDelete,
  onGeneratePreview,
  onOpenCreateDrawer,
}) => {
  return (
    <Card className="p-4 md:p-5 space-y-4" data-testid="style-library-presets-panel">
      <div className="flex items-start justify-between gap-4 flex-col md:flex-row md:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">JSON文本模版</h2>
          <p className="text-xs text-gray-600 dark:text-foreground-tertiary">
            当前展示{scenario === 'data_report' ? '数据报告' : 'PPT'}场景的 style_json 与按页型动态生成的多张预览图
          </p>
        </div>
        <Button size="sm" onClick={onOpenCreateDrawer}>新建模板</Button>
      </div>

      {presets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-border-primary p-5 text-sm text-gray-500 dark:text-foreground-tertiary">
          暂无 JSON 文本模版，点击右上角「新建模板」开始生成。
        </div>
      ) : (
        <div className="space-y-3">
          {presets.map((preset) => (
            <JsonPresetRow
              key={preset.id}
              preset={preset}
              deleting={deletingPresetId === preset.id}
              generatingPreviewKey={generatingPreviewState?.presetId === preset.id ? generatingPreviewState.previewKey : null}
              onViewJson={onViewJson}
              onPreview={onPreview}
              onDelete={onDelete}
              onGeneratePreview={onGeneratePreview}
            />
          ))}
        </div>
      )}
    </Card>
  );
};
