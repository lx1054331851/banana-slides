import { useCallback } from 'react';
import type { Dispatch, MouseEvent as ReactMouseEvent, RefObject, SetStateAction } from 'react';
import type { MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import type { Page, Project } from '@/types';
import {
  type RenovationJsonViewMode,
  type StyleGuideBindings,
  PAGE_STYLE_GUIDE_DEFAULT_BINDING,
  buildPreviewStyleJsonForPageType,
  buildStyleGuideBindingKey,
  syncRenovationJsonPageType,
} from '../SlidePreview.utils';
import type { PageDraft } from './useSlidePreviewDrafts';

const PPT_PAGE_TYPE_OPTIONS = [
  '封面页',
  '目录页',
  '章节过渡页',
  '议程时间线页',
  '标准图文页',
  '要点列表页',
  '对比页',
  '流程页',
  '框架矩阵页',
  '图表页',
  '案例展示页',
  '结尾页',
];

const DATA_REPORT_PAGE_TYPE_OPTIONS = [
  '报告封面',
  '执行摘要',
  '目录',
  '研究方法',
  '章节页',
  '品牌概览页',
  '品牌历程页',
  '品牌画像页',
  '品牌定位页',
  '核心指标总览页',
  '市场概览页',
  '品牌对标页',
  '品类结构页',
  '价格带分布页',
  '渠道平台表现页',
  '商品SKU诊断页',
  '数据明细页',
  '洞察图文页',
  '洞察图表页',
  '矩阵图谱页',
  '时间轴生命周期页',
  '人群画像页',
  '策略建议页',
  '封底页',
];

type UseSlidePreviewEditorStateParams = {
  currentProject?: Project | null;
  selectedPage?: Page;
  currentImageVersionId?: string | null;
  editPageType: string;
  editStyleGuideBindings: StyleGuideBindings;
  styleGuideManuallyEdited: boolean;
  setStyleGuideManuallyEdited: Dispatch<SetStateAction<boolean>>;
  setEditStyleGuideBindings: Dispatch<SetStateAction<StyleGuideBindings>>;
  persistCurrentPageDraft: (updates: Partial<PageDraft>) => void;
  scheduleTextAutoSave: (overrides?: Pick<PageDraft, 'styleGuideBindings'>) => void;
  isMobileView: boolean;
  isEditorPaneCollapsed: boolean;
  renovationJsonViewMode: RenovationJsonViewMode;
  styleGuideTextareaRef: RefObject<MarkdownTextareaRef | null>;
  descriptionTextareaRef: RefObject<MarkdownTextareaRef | null>;
  editorJsonContainerRef: RefObject<HTMLDivElement | null>;
};

export const useSlidePreviewEditorState = ({
  currentProject,
  selectedPage,
  currentImageVersionId,
  editPageType,
  editStyleGuideBindings,
  styleGuideManuallyEdited,
  setStyleGuideManuallyEdited,
  setEditStyleGuideBindings,
  persistCurrentPageDraft,
  scheduleTextAutoSave,
  isMobileView,
  isEditorPaneCollapsed,
  renovationJsonViewMode,
  styleGuideTextareaRef,
  descriptionTextareaRef,
  editorJsonContainerRef,
}: UseSlidePreviewEditorStateParams) => {
  const isPptRenovationProject = currentProject?.creation_type === 'ppt_renovation';
  const isTextGenerationPreviewProject = currentProject?.creation_type !== 'ppt_renovation';
  const useRenovationPreviewForm = isPptRenovationProject || isTextGenerationPreviewProject;
  const pageTypeOptions = currentProject?.scenario === 'data_report'
    ? DATA_REPORT_PAGE_TYPE_OPTIONS
    : PPT_PAGE_TYPE_OPTIONS;
  const activeStyleGuideBindingKey = buildStyleGuideBindingKey(currentImageVersionId);
  const effectivePreviewPageType = editPageType || selectedPage?.outline_content?.page_type || '';
  const projectStyleGuideJson = useRenovationPreviewForm
    ? buildPreviewStyleJsonForPageType(currentProject?.template_style_json || '', effectivePreviewPageType)
    : '';
  const currentImageBoundStyleGuide = editStyleGuideBindings[activeStyleGuideBindingKey] || '';
  const pageDefaultStyleGuide = editStyleGuideBindings[PAGE_STYLE_GUIDE_DEFAULT_BINDING] || '';
  const resolvedStyleGuideText = currentImageBoundStyleGuide || pageDefaultStyleGuide || projectStyleGuideJson || '';

  const syncDescriptionPageTypeForCurrentMode = useCallback((pageType: string, descriptionText: string) => {
    if (!useRenovationPreviewForm) return descriptionText;
    return syncRenovationJsonPageType(descriptionText, pageType, 4);
  }, [useRenovationPreviewForm]);

  const buildStyleGuideBindingsFromText = useCallback((value: string, base: StyleGuideBindings) => {
    const next = { ...base };
    if (value.trim()) {
      next[PAGE_STYLE_GUIDE_DEFAULT_BINDING] = value;
      if (activeStyleGuideBindingKey !== PAGE_STYLE_GUIDE_DEFAULT_BINDING) {
        next[activeStyleGuideBindingKey] = value;
      }
    } else {
      delete next[activeStyleGuideBindingKey];
      delete next[PAGE_STYLE_GUIDE_DEFAULT_BINDING];
    }
    return next;
  }, [activeStyleGuideBindingKey]);

  const syncStyleGuideBindingsForPageType = useCallback((
    nextPageType: string,
    baseBindings: StyleGuideBindings,
  ): StyleGuideBindings => {
    if (!useRenovationPreviewForm) return baseBindings;
    if (styleGuideManuallyEdited) return baseBindings;

    const nextTemplateStyleGuide = buildPreviewStyleJsonForPageType(
      currentProject?.template_style_json || '',
      nextPageType,
    );

    if (!nextTemplateStyleGuide.trim()) return baseBindings;

    const nextBindings = { ...baseBindings };
    nextBindings[PAGE_STYLE_GUIDE_DEFAULT_BINDING] = nextTemplateStyleGuide;
    if (activeStyleGuideBindingKey !== PAGE_STYLE_GUIDE_DEFAULT_BINDING) {
      nextBindings[activeStyleGuideBindingKey] = nextTemplateStyleGuide;
    }

    return nextBindings;
  }, [
    activeStyleGuideBindingKey,
    currentProject?.template_style_json,
    styleGuideManuallyEdited,
    useRenovationPreviewForm,
  ]);

  const handleStyleGuideTextChange = useCallback((value: string) => {
    setStyleGuideManuallyEdited(true);
    setEditStyleGuideBindings((prev) => {
      const next = buildStyleGuideBindingsFromText(value, prev);
      persistCurrentPageDraft({ styleGuideBindings: next, styleGuideManuallyEdited: true });
      scheduleTextAutoSave({ styleGuideBindings: next });
      return next;
    });
  }, [
    buildStyleGuideBindingsFromText,
    persistCurrentPageDraft,
    scheduleTextAutoSave,
    setEditStyleGuideBindings,
    setStyleGuideManuallyEdited,
  ]);

  const editorGridClasses = useRenovationPreviewForm
    ? 'grid h-full min-h-0 gap-2 grid-rows-[minmax(0,1fr)] lg:gap-3 lg:grid-rows-[minmax(0,1fr)]'
    : 'grid h-full min-h-0 gap-3 grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-4 lg:grid-rows-[auto_minmax(120px,0.6fr)_minmax(0,1fr)]';
  const shouldUseEditorVerticalSplit = useRenovationPreviewForm && !isMobileView;
  const isEditorPaneHidden = !isMobileView && isEditorPaneCollapsed;

  const focusJsonEditorField = useCallback((mode: 'text' | 'styleGuide') => {
    if (mode === 'styleGuide') {
      styleGuideTextareaRef.current?.focus();
    } else {
      descriptionTextareaRef.current?.focus();
    }

    const testId = mode === 'styleGuide' ? 'preview-style-guide-input' : 'preview-text-description-input';
    const container = editorJsonContainerRef.current;
    if (!container) return;

    const root = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
    const textbox = root?.getAttribute('role') === 'textbox'
      ? root
      : (root?.querySelector('[role="textbox"]') as HTMLElement | null);
    textbox?.focus();
  }, [descriptionTextareaRef, editorJsonContainerRef, styleGuideTextareaRef]);

  const handleEditorContainerMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const shouldSkipFocus = Boolean(
      target.closest('button, a, input, textarea, select, [role="button"], [role="textbox"], [contenteditable="true"]')
    );
    if (shouldSkipFocus) return;

    if (useRenovationPreviewForm && renovationJsonViewMode === 'styleGuide') {
      focusJsonEditorField('styleGuide');
      return;
    }
    focusJsonEditorField('text');
  }, [focusJsonEditorField, renovationJsonViewMode, useRenovationPreviewForm]);

  return {
    useRenovationPreviewForm,
    pageTypeOptions,
    resolvedStyleGuideText,
    buildStyleGuideBindingsFromText,
    syncDescriptionPageTypeForCurrentMode,
    syncStyleGuideBindingsForPageType,
    handleStyleGuideTextChange,
    editorGridClasses,
    shouldUseEditorVerticalSplit,
    isEditorPaneHidden,
    handleEditorContainerMouseDown,
  };
};
