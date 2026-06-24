import type { Task } from '@/types';
import type { StylePreset, StylePresetPreviewImages, StyleTemplate } from '@/api/endpoints';
import type { ProjectScenario } from '@/types';

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
    sample_pages?: Record<string, string>;
  };
}

export interface JsonPresetWorkspaceProps {
  templates: StyleTemplate[];
  scenario: ProjectScenario;
  refreshKey?: number;
}

const PREVIEW_SLOT_ORDER = [
  'cover_url',
  'catalog_url',
  'section_header_url',
  'agenda_timeline_url',
  'detail_text_split_url',
  'bullet_keypoints_url',
  'comparison_url',
  'process_flow_url',
  'framework_matrix_url',
  'detail_chart_url',
  'case_showcase_url',
  'closing_url',
] as const;

const PREVIEW_LABEL_MAP: Record<string, string> = {
  cover_url: '封面',
  catalog_url: '目录',
  section_header_url: '章节过渡',
  agenda_timeline_url: '议程时间线',
  detail_text_split_url: '标准图文',
  bullet_keypoints_url: '要点列表',
  comparison_url: '对比',
  process_flow_url: '流程',
  framework_matrix_url: '框架矩阵',
  detail_chart_url: '图表',
  case_showcase_url: '案例展示',
  closing_url: '结尾',
  cover_page_url: '封面',
  toc_page_url: '目录',
  section_header_page_url: '章节过渡',
  agenda_timeline_page_url: '议程时间线',
  content_page_url: '标准图文',
  bullet_keypoints_page_url: '要点列表',
  comparison_page_url: '对比',
  process_flow_page_url: '流程',
  framework_matrix_page_url: '框架矩阵',
  data_page_url: '图表',
  case_showcase_page_url: '案例展示',
  closing_page_url: '结尾',
};

const PREVIEW_KEY_ALIAS_MAP: Record<string, string> = {
  cover: 'cover_url',
  'cover page': 'cover_url',
  cover_page: 'cover_page_url',
  catalog: 'catalog_url',
  toc: 'catalog_url',
  'toc page': 'catalog_url',
  'catalog page': 'catalog_url',
  toc_page: 'toc_page_url',
  catalog_page: 'toc_page_url',
  section_header: 'section_header_url',
  'section header': 'section_header_url',
  'section header page': 'section_header_url',
  section_header_page: 'section_header_page_url',
  agenda_timeline: 'agenda_timeline_url',
  'agenda timeline': 'agenda_timeline_url',
  'agenda timeline page': 'agenda_timeline_url',
  agenda_timeline_page: 'agenda_timeline_page_url',
  detail_text_split: 'detail_text_split_url',
  content: 'detail_text_split_url',
  'content page': 'detail_text_split_url',
  content_page: 'content_page_url',
  bullet_keypoints: 'bullet_keypoints_url',
  'bullet keypoints': 'bullet_keypoints_url',
  'bullet keypoints page': 'bullet_keypoints_url',
  bullet_keypoints_page: 'bullet_keypoints_page_url',
  comparison: 'comparison_url',
  'comparison page': 'comparison_url',
  comparison_page: 'comparison_page_url',
  process_flow: 'process_flow_url',
  'process flow': 'process_flow_url',
  'process flow page': 'process_flow_url',
  process_flow_page: 'process_flow_page_url',
  framework_matrix: 'framework_matrix_url',
  'framework matrix': 'framework_matrix_url',
  'framework matrix page': 'framework_matrix_url',
  framework_matrix_page: 'framework_matrix_page_url',
  detail_chart: 'detail_chart_url',
  data: 'detail_chart_url',
  'data page': 'detail_chart_url',
  data_page: 'data_page_url',
  case_showcase: 'case_showcase_url',
  'case showcase': 'case_showcase_url',
  'case showcase page': 'case_showcase_url',
  case_showcase_page: 'case_showcase_page_url',
  closing: 'closing_url',
  ending: 'closing_url',
  'closing page': 'closing_url',
  closing_page: 'closing_page_url',
  ending_page: 'closing_page_url',
};

// Normalize preview slot keys and English aliases into canonical preview keys.
export function normalizePreviewKey(previewKey: string): string {
  const rawKey = String(previewKey || '').trim();
  if (!rawKey) return '';
  if (PREVIEW_LABEL_MAP[rawKey]) return rawKey;
  const withoutSuffix = rawKey.replace(/_url$/i, '');
  if (PREVIEW_LABEL_MAP[`${withoutSuffix}_url`]) return `${withoutSuffix}_url`;

  const normalizedAlias = withoutSuffix.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return PREVIEW_KEY_ALIAS_MAP[normalizedAlias] || rawKey;
}

export function humanizePreviewKey(previewKey: string): string {
  const normalizedKey = normalizePreviewKey(previewKey);
  if (PREVIEW_LABEL_MAP[normalizedKey]) return PREVIEW_LABEL_MAP[normalizedKey];
  const base = String(normalizedKey || previewKey || '').replace(/_url$/i, '');
  return base
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getPreviewOrder(previewImages?: Partial<StylePresetPreviewImages>, samplePages?: Record<string, string>): Array<[PreviewKey, string]> {
  const normalizedKeys = new Set<string>();

  Object.keys(previewImages || {}).forEach((key) => {
    const normalizedKey = normalizePreviewKey(key);
    if (normalizedKey) normalizedKeys.add(normalizedKey);
  });

  Object.keys(samplePages || {}).forEach((key) => {
    const normalizedKey = normalizePreviewKey(key);
    if (normalizedKey) {
      normalizedKeys.add(normalizedKey);
      return;
    }
    normalizedKeys.add(`${key}_url`);
  });

  const orderedKeys = [
    ...PREVIEW_SLOT_ORDER.filter((key) => normalizedKeys.has(key)),
    ...Array.from(normalizedKeys).filter((key) => !PREVIEW_SLOT_ORDER.includes(key as typeof PREVIEW_SLOT_ORDER[number])),
  ];

  return orderedKeys.map((key) => [key as PreviewKey, humanizePreviewKey(key)]);
}

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
  return key ? key as PreviewKey : null;
}

export function inferStylePresetScenario(preset: StylePreset): ProjectScenario {
  if (preset.scenario === 'data_report') return 'data_report';
  if (preset.scenario === 'ppt') return 'ppt';
  try {
    const parsed = JSON.parse(preset.style_json || '{}');
    const scenario = parsed?.design_system_spec?.meta?.scenario;
    return scenario === 'data_report' ? 'data_report' : 'ppt';
  } catch {
    return 'ppt';
  }
}
