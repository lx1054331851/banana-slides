import type { Task } from '@/types';
import type { StylePreset, StylePresetPreviewImages, StyleTemplate } from '@/api/endpoints';

export type PreviewKey = keyof StylePresetPreviewImages;

export type StylePresetTaskStage =
  | 'json_generating'
  | 'preview_generating'
  | 'single_preview_generating'
  | 'completed'
  | 'failed';

export interface StylePresetTaskRecord extends Task {
  task_type?: 'STYLE_PRESET_GENERATE' | 'STYLE_PRESET_IMAGE_REGENERATE' | string;
  stage?: StylePresetTaskStage;
  progress?: Task['progress'] & {
    stage?: StylePresetTaskStage;
    current_step?: string;
    preset_id?: string;
    preset_name?: string;
    preview_key?: PreviewKey;
    preview_images?: Partial<StylePresetPreviewImages>;
    preview_errors?: Record<string, string>;
    style_requirements?: string;
    template_json?: string;
    preset_name_input?: string;
    style_json?: string;
    sample_pages?: Record<'cover' | 'toc' | 'detail' | 'ending', string>;
  };
}

export interface JsonPresetWorkspaceProps {
  templates: StyleTemplate[];
  refreshKey?: number;
}

export const PREVIEW_ORDER: Array<[PreviewKey, string]> = [
  ['cover_url', '首页'],
  ['toc_url', '目录'],
  ['detail_url', '详情'],
  ['ending_url', '结尾'],
];

export const RUNNING_TASK_STATUSES = new Set(['PENDING', 'PROCESSING', 'RUNNING']);

export function isTaskRunning(task: StylePresetTaskRecord): boolean {
  return RUNNING_TASK_STATUSES.has(String(task.status || ''));
}

export function getTaskStage(task: StylePresetTaskRecord): StylePresetTaskStage {
  return (task.stage || task.progress?.stage || (task.status === 'FAILED' ? 'failed' : undefined) || 'json_generating') as StylePresetTaskStage;
}

export function getPresetDisplayName(preset: StylePreset): string {
  return preset.name || preset.id;
}

export function getTaskDisplayName(task: StylePresetTaskRecord): string {
  return String(task.progress?.preset_name || task.progress?.preset_name_input || task.progress?.preset_id || task.task_id || '未命名模板');
}

export function getTaskPresetId(task: StylePresetTaskRecord): string {
  return String(task.progress?.preset_id || '');
}

export function getTaskPreviewKey(task: StylePresetTaskRecord): PreviewKey | null {
  const key = task.progress?.preview_key;
  return key === 'cover_url' || key === 'toc_url' || key === 'detail_url' || key === 'ending_url' ? key : null;
}
