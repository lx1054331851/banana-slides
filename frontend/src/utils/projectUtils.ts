import { getImageUrl } from '@/api/client';
import type { Project, Page, DescriptionContent, PresentationMeta, CoverEndingFieldDetect } from '@/types';
import { downloadFile } from './index';
import { getT } from './i18nHelper';
import i18n from '@/i18n';

const utilsI18n = {
  zh: {
    projectUtils: {
      untitled: '未命名项目',
      notStarted: '未开始',
      completed: '已完成',
      pendingImages: '待生成图片',
      pendingDesc: '待生成描述',
      pageNum: '第 {{num}} 页',
      pageHeading: '## 第 {{num}} 页: {{title}}',
      chapter: '章节',
      outlinePoints: '**大纲要点：**',
      noPoints: '*暂无要点*',
      pageDesc: '**页面描述：**',
      noDesc: '*暂无描述*',
      generatedAt: '生成时间',
      prefixDesc: '描述',
      prefixOutline: '大纲',
      prefixProject: '项目',
    }
  },
  en: {
    projectUtils: {
      untitled: 'Untitled Project',
      notStarted: 'Not Started',
      completed: 'Completed',
      pendingImages: 'Pending Images',
      pendingDesc: 'Pending Descriptions',
      pageNum: 'Page {{num}}',
      pageHeading: '## Page {{num}}: {{title}}',
      chapter: 'Chapter',
      outlinePoints: '**Outline Points:**',
      noPoints: '*No points yet*',
      pageDesc: '**Page Description:**',
      noDesc: '*No description yet*',
      generatedAt: 'Generated at',
      prefixDesc: 'Descriptions',
      prefixOutline: 'Outline',
      prefixProject: 'Project',
    }
  }
};
const t = getT(utilsI18n);

/**
 * 获取项目标题
 */
export const getProjectTitle = (project: Project): string => {
  // 从第一个页面的大纲标题获取项目名称
  if (project.pages && project.pages.length > 0) {
    const sortedPages = [...project.pages].sort((a, b) =>
      (a.order_index || 0) - (b.order_index || 0)
    );
    const firstPage = sortedPages[0];

    const title = firstPage?.outline_content?.title;
    if (title) {
      return title;
    }
  }

  return t('projectUtils.untitled');
};

/**
 * 获取第一页图片URL
 */
export const getFirstPageImage = (project: Project): string | null => {
  if (!project.pages || project.pages.length === 0) {
    return null;
  }

  // 找到第一页有图片的页面，优先使用 preview_image_url
  const firstPageWithImage = project.pages.find(p => p.preview_image_url || p.generated_image_url);
  if (firstPageWithImage?.preview_image_url || firstPageWithImage?.generated_image_url) {
    return getImageUrl(firstPageWithImage.preview_image_url || firstPageWithImage.generated_image_url, firstPageWithImage.updated_at);
  }

  return null;
};

/**
 * 格式化日期
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type StatusKey = 'notStarted' | 'completed' | 'pendingImages' | 'pendingDesc';

const getStatusKey = (project: Project): StatusKey => {
  if (!project.pages || project.pages.length === 0) return 'notStarted';
  if (project.pages.some(p => p.generated_image_path)) return 'completed';
  if (project.pages.some(p => p.description_content)) return 'pendingImages';
  return 'pendingDesc';
};

/**
 * 获取项目状态文本
 */
export const getStatusText = (project: Project): string => {
  return t(`projectUtils.${getStatusKey(project)}`);
};

const statusColorMap: Record<StatusKey, string> = {
  completed: 'text-green-600 bg-green-50',
  pendingImages: 'text-yellow-600 bg-yellow-50',
  pendingDesc: 'text-blue-600 bg-blue-50',
  notStarted: 'text-gray-600 bg-gray-50',
};

/**
 * 获取项目状态颜色样式
 */
export const getStatusColor = (project: Project): string => {
  return statusColorMap[getStatusKey(project)];
};

/**
 * 获取项目路由路径
 */
export const getProjectRoute = (project: Project): string => {
  const projectId = project.id || project.project_id;
  if (!projectId) return '/';
  
  if (project.pages && project.pages.length > 0) {
    const hasImages = project.pages.some(p => p.generated_image_path);
    if (hasImages) {
      return `/project/${projectId}/preview`;
    }
    const hasDescriptions = project.pages.some(p => p.description_content);
    if (hasDescriptions) {
      return `/project/${projectId}/detail`;
    }
    return `/project/${projectId}/outline`;
  }
  return `/project/${projectId}/outline`;
};

// ========== Markdown 导出/导入 ==========

export const getDescriptionText = (descContent: DescriptionContent | undefined | null): string => {
  if (!descContent) return '';
  if ('text' in descContent) return (descContent.text as string) || '';
  if ('text_content' in descContent && Array.isArray(descContent.text_content)) return descContent.text_content.join('\n');
  return '';
};

export interface ExportOptions {
  outline?: boolean;
  description?: boolean;
}

const pageToMarkdown = (page: Page, index: number, opts: ExportOptions = {}): string => {
  const includeOutline = opts.outline !== false;
  const includeDesc = opts.description !== false;
  const title = page.outline_content?.title || t('projectUtils.pageNum', { num: index + 1 });
  const points = page.outline_content?.points || [];
  const descText = getDescriptionText(page.description_content);

  let md = t('projectUtils.pageHeading', { num: index + 1, title }) + '\n\n';
  if (page.part) md += `> ${t('projectUtils.chapter')}: ${page.part}\n\n`;

  if (includeOutline) {
    md += `${t('projectUtils.outlinePoints')}\n`;
    if (points.length > 0) {
      points.forEach(p => { md += `- ${p}\n`; });
    } else {
      md += `${t('projectUtils.noPoints')}\n`;
    }
    md += '\n';
  }

  if (includeDesc) {
    md += `${t('projectUtils.pageDesc')}\n`;
    if (descText) {
      md += `${descText}\n`;
    } else {
      md += `${t('projectUtils.noDesc')}\n`;
    }
    md += '\n';
  }

  md += '---\n\n';
  return md;
};

export const exportProjectToMarkdown = (project: Project, opts?: ExportOptions): void => {
  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
  let md = `# ${getProjectTitle(project)}\n\n`;
  md += `> ${t('projectUtils.generatedAt')}: ${new Date().toLocaleString(locale)}\n\n---\n\n`;
  project.pages.forEach((page, i) => { md += pageToMarkdown(page, i, opts); });
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const prefix = opts?.outline === false
    ? t('projectUtils.prefixDesc')
    : opts?.description === false
      ? t('projectUtils.prefixOutline')
      : t('projectUtils.prefixProject');
  downloadFile(blob, `${prefix}_${project.id?.slice(0, 8) || 'export'}.md`);
};

// --- 导入 ---

export interface ParsedPage {
  title: string;
  points: string[];
  text: string;
  part?: string;
}

const sanitize = (s: string) => s.replace(/<[^>]*>/g, '');

const splitMarkdownPages = (markdown: string): string[] => {
  // Support both Chinese "## 第 N 页:" and English "## Page N:" formats
  return markdown.split(/^## (?:第 \d+ 页|Page \d+):/m).slice(1);
};

export const parseMarkdownPages = (markdown: string): ParsedPage[] => {
  return splitMarkdownPages(markdown).map(section => {
    const lines = section.split('\n');
    const title = sanitize(lines[0].trim());

    // Extract metadata (support both Chinese and English)
    const partLine = lines.find(l => l.startsWith('> 章节: ') || l.startsWith('> Chapter: '));
    const part = partLine ? sanitize(partLine.replace(/^> (?:章节|Chapter): /, '').trim()) : undefined;

    // Find section markers (support both Chinese and English)
    const outlineIdx = lines.findIndex(l => l.trim() === '**大纲要点：**' || l.trim() === '**Outline Points:**');
    const descIdx = lines.findIndex(l => l.trim() === '**页面描述：**' || l.trim() === '**Page Description:**');

    let points: string[] = [];
    let text = '';

    const trailingPatterns = new Set(['---', '', '*暂无要点*', '*暂无描述*', '*No points yet*', '*No description yet*']);
    const stripTrailing = (arr: string[]) => {
      while (arr.length && trailingPatterns.has(arr[arr.length - 1].trim())) arr.pop();
    };

    if (outlineIdx >= 0) {
      const end = descIdx >= 0 ? descIdx : lines.length;
      points = lines.slice(outlineIdx + 1, end)
        .filter(l => l.startsWith('- '))
        .map(l => sanitize(l.slice(2).trim()));
    }

    if (descIdx >= 0) {
      const descLines = lines.slice(descIdx + 1);
      stripTrailing(descLines);
      text = sanitize(descLines.join('\n').trim());
    }

    if (outlineIdx < 0 && descIdx < 0) {
      // Legacy format: no markers
      const contentLines = lines.slice(1);
      while (contentLines.length && (contentLines[0].startsWith('> ') || contentLines[0].trim() === '')) contentLines.shift();
      stripTrailing(contentLines);
      points = contentLines.filter(l => l.startsWith('- ')).map(l => sanitize(l.slice(2).trim()));
      text = sanitize(contentLines.filter(l => !l.startsWith('- ')).join('\n').trim());
    }

    return { title, points, text, part };
  });
};

// ========== 封面/结尾补全 ==========

const safeReplaceAll = (text: string, target: string, replacement: string) => {
  if (!target) return text;
  return text.split(target).join(replacement);
};

export const parsePresentationMeta = (raw?: string | null): PresentationMeta => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as PresentationMeta;
  } catch {
    return {};
  }
  return {};
};

const buildFieldLine = (key: string, value: string, pageRole: 'cover' | 'ending'): string => {
  switch (key) {
    case 'logo':
      return `Logo：![公司Logo](${value})，置于左上角，小尺寸`;
    case 'company_name':
      return `公司名称：${value}`;
    case 'project_name':
      return `项目名：${value}`;
    case 'presenter':
      return `汇报人：${value}`;
    case 'presenter_title':
      return `部门/职位：${value}`;
    case 'date':
      return `日期：${value}`;
    case 'location':
      return `地点：${value}`;
    case 'phone':
      return `联系电话：${value}`;
    case 'website_or_email':
      return `网址/邮箱：${value}`;
    case 'thanks_or_slogan':
      return pageRole === 'ending' ? `致谢/口号：${value}` : `口号：${value}`;
    default:
      return value;
  }
};

const insertLinesIntoDescription = (text: string, lines: string[]): string => {
  if (lines.length === 0) return text;
  const normalized = text || '';
  const lineArr = normalized.split('\n');
  const labelIdx = lineArr.findIndex(l => l.trim().replace('：', ':') === '页面文字:');
  const bulletLines = lines.map(line => (line.trim().startsWith('- ') ? line : `- ${line}`));
  if (labelIdx >= 0) {
    let insertIdx = labelIdx + 1;
    while (
      insertIdx < lineArr.length &&
      lineArr[insertIdx].trim() !== '' &&
      !/^(其他页面素材|页面标题|排版|布局|风格|配色|备注|note)/i.test(lineArr[insertIdx].trim())
    ) {
      insertIdx += 1;
    }
    lineArr.splice(insertIdx, 0, ...bulletLines);
    return lineArr.join('\n');
  }
  const suffix = normalized.trim().length > 0 ? '\n\n' : '';
  return `${normalized.trim()}${suffix}页面文字：\n${bulletLines.join('\n')}\n`;
};

export const applyPresentationMetaToDescription = (
  descriptionText: string,
  meta: PresentationMeta,
  options: {
    pageRole: 'cover' | 'ending';
    detectFields?: CoverEndingFieldDetect[];
  }
): string => {
  const pageRole = options.pageRole;
  const detectFields = options.detectFields || [];
  const relevantFields = detectFields.filter(f => f.page_role === pageRole);
  const defaultKeysByRole: Record<'cover' | 'ending', string[]> = {
    cover: [
      'logo',
      'company_name',
      'project_name',
      'presenter',
      'presenter_title',
      'date',
      'location',
      'phone',
      'website_or_email',
    ],
    ending: [
      'logo',
      'company_name',
      'presenter',
      'presenter_title',
      'phone',
      'website_or_email',
      'thanks_or_slogan',
    ],
  };
  const missingKeys = new Set(
    relevantFields.length > 0
      ? relevantFields.filter(f => !f.present || f.is_placeholder).map(f => f.key)
      : defaultKeysByRole[pageRole]
  );
  let updated = descriptionText || '';
  const handledKeys = new Set<string>();

  // 尝试替换占位符
  for (const field of relevantFields) {
    const value = (meta as any)[field.key === 'logo' ? 'logo_url' : field.key] as string | undefined;
    if (!value) continue;
    if (Array.isArray(field.placeholders) && field.placeholders.length > 0) {
      let replaced = false;
      for (const placeholder of field.placeholders) {
        if (placeholder && updated.includes(placeholder)) {
          updated = safeReplaceAll(updated, placeholder, value);
          replaced = true;
        }
      }
      if (replaced) {
        handledKeys.add(field.key);
      }
    }
  }

  // 追加缺失字段到“页面文字”中
  const lines: string[] = [];
  for (const key of Array.from(missingKeys)) {
    if (handledKeys.has(key)) continue;
    const value = (meta as any)[key === 'logo' ? 'logo_url' : key] as string | undefined;
    if (!value) continue;
    if (updated.includes(value)) continue;
    lines.push(buildFieldLine(key, value, pageRole));
  }

  return insertLinesIntoDescription(updated, lines);
};

/**
 * 将页面大纲转换为 Markdown 格式
 */
export const pageOutlineToMarkdown = (page: Page, index: number): string => {
  const title = page.outline_content?.title || `第 ${index + 1} 页`;
  const points = page.outline_content?.points || [];

  let markdown = `## 第 ${index + 1} 页: ${title}\n\n`;

  if (points.length > 0) {
    points.forEach((point) => {
      markdown += `- ${point}\n`;
    });
    markdown += '\n';
  } else {
    markdown += `*暂无要点*\n\n`;
  }

  return markdown;
};

/**
 * 将页面描述转换为 Markdown 格式
 */
export const pageDescriptionToMarkdown = (page: Page, index: number): string => {
  const title = page.outline_content?.title || `第 ${index + 1} 页`;
  const descText = getDescriptionText(page.description_content);

  let markdown = `## 第 ${index + 1} 页: ${title}\n\n`;

  if (descText) {
    markdown += `${descText}\n\n`;
  } else {
    markdown += `*暂无描述*\n\n`;
  }

  markdown += `---\n\n`;

  return markdown;
};

/**
 * 将项目大纲导出为 Markdown 文件
 */
export const exportOutlineToMarkdown = (project: Project): void => {
  const projectTitle = getProjectTitle(project);

  let markdown = `# ${projectTitle}\n\n`;
  markdown += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  markdown += `---\n\n`;

  project.pages.forEach((page, index) => {
    markdown += pageOutlineToMarkdown(page, index);
  });

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const filename = `大纲_${project.id?.slice(0, 8) || 'export'}.md`;
  downloadFile(blob, filename);
};

/**
 * 将项目页面描述导出为 Markdown 文件
 */
export const exportDescriptionsToMarkdown = (project: Project): void => {
  const projectTitle = getProjectTitle(project);
  
  let markdown = `# ${projectTitle}\n\n`;
  markdown += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  markdown += `---\n\n`;
  
  project.pages.forEach((page, index) => {
    markdown += pageDescriptionToMarkdown(page, index);
  });
  
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const filename = `页面描述_${project.id?.slice(0, 8) || 'export'}.md`;
  downloadFile(blob, filename);
};
