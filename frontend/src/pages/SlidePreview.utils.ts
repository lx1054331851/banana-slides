import type { Material } from '@/api/endpoints';
import type { DescriptionContent, Page } from '@/types';

export const MARKDOWN_BLOCK_PREFIXES = ['#', '-', '*', '>', '`', '|'];

export const looksLikeMarkdownLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (MARKDOWN_BLOCK_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return true;
  return /^\d+\.\s+/.test(trimmed);
};

export const normalizeOutlinePasteToMarkdown = (raw: string) => {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized || !normalized.includes('\n')) return raw;

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return raw;
  if (lines.some((line) => looksLikeMarkdownLine(line))) return normalized;

  const stepPattern = /^(?:第[一二三四五六七八九十百零两\d]+(?:步|阶段|节|部分)[：:、.\s-]*|\d+[、.．)\s-]+)\s*(.+)$/;
  const stepItems = lines
    .map((line) => {
      const match = line.match(stepPattern);
      if (!match) return null;
      return match[1]?.trim() || line;
    })
    .filter((item): item is string => !!item);

  if (stepItems.length === lines.length) {
    return stepItems.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
  }

  return lines.map((line) => `- ${line}`).join('\n');
};

export const isSupportedDescriptionImageUrl = (url: string): boolean => {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/files/');
};

export const escapeMarkdownText = (text: string): string => text.replace(/[[\]()]/g, '\\$&');
export const DESCRIPTION_UPLOAD_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg';
export type RenovationJsonViewMode = 'text' | 'styleGuide';
export const PAGE_STYLE_GUIDE_DEFAULT_BINDING = '__page_default__';
export const PAGE_AI_DEFAULT_BINDING = '__page_default__';

export type StyleGuideBindings = Record<string, string>;

export const buildStyleGuideBindingKey = (imageVersionId?: string | null): string => (
  imageVersionId ? `image_version:${imageVersionId}` : PAGE_STYLE_GUIDE_DEFAULT_BINDING
);

export const buildPageAiContextBindingKey = (imageVersionId?: string | null): string => (
  imageVersionId ? `image_version:${imageVersionId}` : PAGE_AI_DEFAULT_BINDING
);

export const buildPageAiContextStoreKey = (pageId: string, imageVersionId?: string | null): string => (
  `${pageId}:${buildPageAiContextBindingKey(imageVersionId)}`
);

export const normalizeStyleGuideBindings = (raw: unknown): StyleGuideBindings => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return Object.entries(raw as Record<string, unknown>).reduce<StyleGuideBindings>((acc, [key, value]) => {
    if (!key || typeof value !== 'string') return acc;
    if (!value.trim()) return acc;
    acc[key] = value;
    return acc;
  }, {});
};

export const getDescriptionStyleGuideBindings = (
  descriptionContent?: DescriptionContent | null
): StyleGuideBindings => {
  if (!descriptionContent || typeof descriptionContent !== 'object') {
    return {};
  }
  return normalizeStyleGuideBindings((descriptionContent as any).style_guide_bindings);
};

export const serializeStyleGuideBindings = (bindings: StyleGuideBindings): StyleGuideBindings | undefined => {
  const normalized = normalizeStyleGuideBindings(bindings);
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const areStyleGuideBindingsEqual = (left: StyleGuideBindings, right: StyleGuideBindings): boolean => {
  const leftEntries = Object.entries(normalizeStyleGuideBindings(left)).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(normalizeStyleGuideBindings(right)).sort(([a], [b]) => a.localeCompare(b));
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value], index) => {
    const [rightKey, rightValue] = rightEntries[index];
    return key === rightKey && value.trim() === rightValue.trim();
  });
};

export const getMaterialMarkdownLabel = (material: Material): string => {
  return (
    material.prompt?.trim() ||
    material.name?.trim() ||
    material.original_filename?.trim() ||
    material.source_filename?.trim() ||
    material.filename?.trim() ||
    'image'
  );
};

export const stripMarkdownImages = (text: string): string => (
  text
    .replace(/!\[.*?\]\((.*?)\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
);

export const removeMarkdownImageByUrl = (text: string, url: string): string => {
  if (!url) return text;
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`!?\\[[^\\]]*\\]\\(${escapedUrl}\\)\\n?`, 'g');
  return text.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trim();
};

export const getPageDraftKey = (page?: Page | null, index = 0): string | null => {
  if (!page) return null;
  return page.id || page.page_id || `index-${index}`;
};

export const formatImageVersionTimestamp = (createdAt?: string): string => {
  if (!createdAt) return '-';
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return createdAt;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed);
};

export const getDescriptionExtraFields = (
  descriptionContent?: DescriptionContent | null
): Record<string, string> => {
  if (!descriptionContent || !descriptionContent.extra_fields) {
    return {};
  }
  return Object.entries(descriptionContent.extra_fields).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = typeof value === 'string' ? value : '';
    return acc;
  }, {});
};

export const serializeExtraFields = (fields: Record<string, string>): Record<string, string> | undefined => {
  const entries = Object.entries(fields)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key && value);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

export const areStringRecordsEqual = (left: Record<string, string>, right: Record<string, string>): boolean => {
  const leftKeys = Object.keys(left).filter((key) => left[key]?.trim());
  const rightKeys = Object.keys(right).filter((key) => right[key]?.trim());
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => (left[key] || '').trim() === (right[key] || '').trim());
};

export const formatJsonForEditor = (text: string, indent = 4): string => {
  const raw = (text || '').trim();
  if (!raw) return text || '';
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, indent);
  } catch {
    return text || '';
  }
};

export const SLIDE_KEY_EN_TO_ZH: Record<string, string> = {
  type: '页面类型',
  title: '页面标题',
  layout_suggestion: '排版建议',
  content: '内容',
  visual_suggestion: '视觉建议',
  note: '备注',
  headline_summary: '核心结论',
  detailed_items: '详细条目',
  sub_title: '小标题',
  body: '正文',
  highlight_phrases: '高亮短语',
  key_takeaway: '关键结论',
  chart_type: '图表类型',
  chart_data: '图表数据',
  labels: '标签',
  datasets: '数据集',
  label: '系列名',
  data: '数据',
  headline: '主标题',
  sub_headline: '副标题',
  sections: '章节列表',
  final_conclusion: '最终结论',
  vision: '愿景',
  slogan: '口号',
  qa_text: '问答文本',
  presenter_info: '汇报信息',
  contact_info: '联系信息',
};
export const SLIDE_KEY_ZH_TO_EN = Object.fromEntries(
  Object.entries(SLIDE_KEY_EN_TO_ZH).map(([en, zh]) => [zh, en]),
) as Record<string, string>;

export const SLIDE_TYPE_EN_TO_ZH: Record<string, string> = {
  cover: '封面页',
  catalog: '目录页',
  section_header: '章节页',
  detail_chart: '图表页',
  detail_text_split: '图文页',
  closing: '结尾页',
};
export const SLIDE_TYPE_ZH_TO_EN: Record<string, string> = {
  封面: 'cover',
  封面页: 'cover',
  目录: 'catalog',
  目录页: 'catalog',
  章节页: 'section_header',
  章节过渡页: 'section_header',
  图表页: 'detail_chart',
  图文页: 'detail_text_split',
  详情页: 'detail_text_split',
  文本页: 'detail_text_split',
  结尾: 'closing',
  结尾页: 'closing',
};

export const LAYOUT_EN_TO_ZH: Record<string, string> = {
  split_comparison: '左右对比',
  multi_column_logic: '多栏逻辑',
  dashboard_style: '看板布局',
  pyramid_hierarchy: '金字塔层级',
};
export const LAYOUT_ZH_TO_EN: Record<string, string> = {
  左右对比: 'split_comparison',
  多栏逻辑: 'multi_column_logic',
  看板布局: 'dashboard_style',
  金字塔层级: 'pyramid_hierarchy',
};

export const isReferenceFieldKey = (rawKey: string, normalizedKey?: string): boolean => {
  const compactRaw = (rawKey || '').trim().toLowerCase().replace(/-/g, '_');
  if (rawKey === '来源页' || rawKey === '来源' || compactRaw.endsWith('_ref')) {
    return true;
  }
  const compactNormalized = (normalizedKey || '').trim().toLowerCase().replace(/-/g, '_');
  return compactNormalized.endsWith('_ref');
};

export const canonicalizeSlideJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeSlideJsonValue(item));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([rawKey, rawValue]) => {
      const key = SLIDE_KEY_ZH_TO_EN[rawKey] || rawKey;
      if (isReferenceFieldKey(rawKey, key)) return;
      let normalizedValue = canonicalizeSlideJsonValue(rawValue);
      if (key === 'type' && typeof normalizedValue === 'string') {
        normalizedValue = SLIDE_TYPE_ZH_TO_EN[normalizedValue.trim()] || normalizedValue.trim();
      }
      if (key === 'layout_suggestion' && typeof normalizedValue === 'string') {
        normalizedValue = LAYOUT_ZH_TO_EN[normalizedValue.trim()] || normalizedValue.trim();
      }
      next[key] = normalizedValue;
    });
    return next;
  }
  return value;
};

export const localizeSlideJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => localizeSlideJsonValue(item));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([rawKey, rawValue]) => {
      const canonicalKey = SLIDE_KEY_ZH_TO_EN[rawKey] || rawKey;
      if (isReferenceFieldKey(rawKey, canonicalKey)) return;
      let localizedValue = localizeSlideJsonValue(rawValue);
      if (canonicalKey === 'type' && typeof localizedValue === 'string') {
        localizedValue = SLIDE_TYPE_EN_TO_ZH[localizedValue.trim()] || localizedValue.trim();
      }
      if (canonicalKey === 'layout_suggestion' && typeof localizedValue === 'string') {
        localizedValue = LAYOUT_EN_TO_ZH[localizedValue.trim()] || localizedValue.trim();
      }
      const outputKey = SLIDE_KEY_EN_TO_ZH[canonicalKey] || rawKey;
      next[outputKey] = localizedValue;
    });
    return next;
  }
  return value;
};

export const toCanonicalRenovationJsonText = (text: string, indent = 4): string => {
  const raw = (text || '').trim();
  if (!raw) return text || '';
  try {
    const parsed = JSON.parse(raw);
    const normalized = canonicalizeSlideJsonValue(parsed);
    return JSON.stringify(normalized, null, indent);
  } catch {
    return text || '';
  }
};

export const toLocalizedRenovationJsonText = (text: string, indent = 4): string => {
  const raw = (text || '').trim();
  if (!raw) return text || '';
  try {
    const parsed = JSON.parse(raw);
    const normalized = canonicalizeSlideJsonValue(parsed);
    const localized = localizeSlideJsonValue(normalized);
    return JSON.stringify(localized, null, indent);
  } catch {
    return text || '';
  }
};

const tryParseStyleJson = (styleJson?: string | null): Record<string, unknown> | null => {
  if (!styleJson || typeof styleJson !== 'string' || !styleJson.trim()) return null;
  try {
    const parsed = JSON.parse(styleJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const slugifyStylePageKey = (text: string): string => {
  const value = String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return value || 'page';
};

export const buildPreviewStyleJsonForPageType = (
  styleJson?: string | null,
  pageTypeKey?: string | null,
): string => {
  const parsed = tryParseStyleJson(styleJson);
  if (!parsed) return styleJson || '';

  const designSystem = parsed.design_system_spec;
  if (!designSystem || typeof designSystem !== 'object' || Array.isArray(designSystem)) {
    return styleJson || '';
  }

  const slideTemplates = (designSystem as Record<string, unknown>).slide_templates;
  if (!slideTemplates || typeof slideTemplates !== 'object' || Array.isArray(slideTemplates)) {
    return styleJson || '';
  }

  const requestedKey = slugifyStylePageKey(pageTypeKey || '');
  if (!requestedKey) return styleJson || '';

  let matchedTemplateKey: string | null = null;
  let matchedTemplateValue: unknown = null;

  Object.entries(slideTemplates as Record<string, unknown>).some(([templateKey, templateValue]) => {
    if (!templateValue || typeof templateValue !== 'object' || Array.isArray(templateValue)) return false;
    const pageType = String((templateValue as Record<string, unknown>).page_type || '').trim();
    if (slugifyStylePageKey(pageType) === requestedKey || slugifyStylePageKey(templateKey) === requestedKey) {
      matchedTemplateKey = templateKey;
      matchedTemplateValue = templateValue;
      return true;
    }
    return false;
  });

  if (!matchedTemplateKey || !matchedTemplateValue) {
    return styleJson || '';
  }

  const reducedDesignSystem: Record<string, unknown> = {};
  Object.entries(designSystem as Record<string, unknown>).forEach(([key, value]) => {
    if (key === 'slide_templates') {
      reducedDesignSystem[key] = { [matchedTemplateKey!]: matchedTemplateValue };
    } else {
      reducedDesignSystem[key] = value;
    }
  });

  return JSON.stringify({ design_system_spec: reducedDesignSystem }, null, 4);
};
