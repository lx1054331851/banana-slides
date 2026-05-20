// TODO: split components
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useT } from '@/hooks/useT';
import { devLog } from '@/utils/logger';
import {
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

// 组件内翻译
import { previewI18n } from './SlidePreview.i18n';
import {
  DEFAULT_EXTRA_FIELDS,
  PREVIEW_SPLIT_DIVIDER_PX,
  PREVIEW_SPLIT_HIT_AREA_PX,
} from './SlidePreview.constants';
import {
  type RenovationJsonViewMode,
  type StyleGuideBindings,
  normalizeOutlinePasteToMarkdown,
  isSupportedDescriptionImageUrl,
  PAGE_STYLE_GUIDE_DEFAULT_BINDING,
  buildStyleGuideBindingKey,
  getDescriptionStyleGuideBindings,
  serializeStyleGuideBindings,
  areStyleGuideBindingsEqual,
  formatImageVersionTimestamp,
  getDescriptionExtraFields,
  serializeExtraFields,
  areStringRecordsEqual,
  buildPreviewStyleJsonForPageType,
  formatJsonForEditor,
  syncRenovationJsonPageType,
  toCanonicalRenovationJsonText,
  toLocalizedRenovationJsonText,
} from './SlidePreview.utils';
import {
  type PageAiUploadedReference,
  type MaterialSelectorMode,
} from './SlidePreview.pageAi';
import { PreviewStatusBar } from './components/PreviewStatusBar';
import { SlidePreviewHeader } from './components/SlidePreviewHeader';
import { SlidePreviewSidebarShell } from './components/SlidePreviewSidebarShell';
import { SlidePreviewSidebarContent } from './components/SlidePreviewSidebarContent';
import { SlidePreviewEditorToolbar } from './components/SlidePreviewEditorToolbar';
import { SlidePreviewEmptyState } from './components/SlidePreviewEmptyState';
import { SlidePreviewVisualPane } from './components/SlidePreviewVisualPane';
import { SlidePreviewSplitDivider } from './components/SlidePreviewSplitDivider';
import { SlidePreviewEditorPane } from './components/SlidePreviewEditorPane';
import { SlidePreviewTopOverlays } from './components/SlidePreviewTopOverlays';
import { SlidePreviewDialogs } from './components/SlidePreviewDialogs';
import { SlidePreviewMainPanel } from './components/SlidePreviewMainPanel';
import { useSlidePreviewLayout } from './hooks/useSlidePreviewLayout';
import { useSlidePreviewGeneration } from './hooks/useSlidePreviewGeneration';
import { useSlidePreviewDrafts } from './hooks/useSlidePreviewDrafts';
import { useSlidePreviewHistoryVersions } from './hooks/useSlidePreviewHistoryVersions';
import { useSlidePreviewTemplateSelection } from './hooks/useSlidePreviewTemplateSelection';
import { useSlidePreviewMultiSelect } from './hooks/useSlidePreviewMultiSelect';
import { useSlidePreviewExport } from './hooks/useSlidePreviewExport';
import { useSlidePreviewProjectSettings } from './hooks/useSlidePreviewProjectSettings';
import { useSlidePreviewTemplateApply } from './hooks/useSlidePreviewTemplateApply';
import { useSlidePreviewPageAiReferences } from './hooks/useSlidePreviewPageAiReferences';
import { useSlidePreviewPageAiContext } from './hooks/useSlidePreviewPageAiContext';
import { useSlidePreviewPageAiSubmit } from './hooks/useSlidePreviewPageAiSubmit';
import { useSlidePreviewMaterials } from './hooks/useSlidePreviewMaterials';
import { useSlidePreviewReorder } from './hooks/useSlidePreviewReorder';
import { useSlidePreviewJsonRefine } from './hooks/useSlidePreviewJsonRefine';
import { useSlidePreviewRegionSelection } from './hooks/useSlidePreviewRegionSelection';
import { useSlidePreviewHistoryActions } from './hooks/useSlidePreviewHistoryActions';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  ChevronDown,
  History,
  Send,
  Sparkles,
  Info,
  Settings2,
} from 'lucide-react';
import {
  Button,
  Loading,
  MarkdownTextarea,
  useToast,
  useConfirm,
  ReferenceFileList,
} from '@/components/shared';
import type { MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { listUserTemplates, type UserTemplate } from '@/api/endpoints';
import { useProjectStore } from '@/store/useProjectStore';
import { useExportTasksStore } from '@/store/useExportTasksStore';
import { getPageImageUrl } from '@/api/client';
import { useImagePaste } from '@/hooks/useImagePaste';
import {
  setCurrentImageVersion,
  getSettings,
  getProviderProfiles,
  refineDescriptions,
  addPage,
  getTaskStatus,
  updateSettings,
} from '@/api/endpoints';
import type {
  DescriptionContent,
  ExportExtractorMethod,
  ExportInpaintMethod,
  Page,
  Project,
  GenerationOverride,
  PageAiMessage,
  PageAiReference,
  PageAiRegionBounds,
  ProviderProfileSummary,
} from '@/types';
import { normalizeErrorMessage } from '@/utils';
import {
  exportProjectToMarkdown,
  parseMarkdownPages,
  getDescriptionText,
} from '@/utils/projectUtils';
import {
  PROJECT_DEFAULT_IMAGE_MODEL,
  PROJECT_DEFAULT_IMAGE_RESOLUTION,
  getImageSourceForModel,
  PROJECT_SUPPORTED_IMAGE_MODELS,
  normalizeProjectDefaultImageModel,
  normalizeProjectDefaultImageResolution,
} from '@/config/projectAiDefaults';
import {
  deriveImageChannelSelection,
  getImageChannelOptions,
  getImageModelDisplayLabel,
  getSelectableImageModelsForChannel,
  getSourceForImageChannel,
  getPreferredImageChannel,
  setRuntimeBuiltinImageChannels,
} from '@/config/projectAiChannels';

type TextSaveOverrides = {
  title?: string;
  pageType?: string;
  points?: string;
  description?: string;
  extraFields?: Record<string, string>;
  styleGuideBindings?: StyleGuideBindings;
};

const VIDEO_VOICE_OPTIONS = [
  { group: '中文', voices: [
    { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女声）', lang: 'zh' },
    { id: 'zh-CN-YunxiNeural', label: '云希（男声）', lang: 'zh' },
    { id: 'zh-CN-YunjianNeural', label: '云健（男声）', lang: 'zh' },
    { id: 'zh-CN-XiaoyiNeural', label: '晓伊（女声）', lang: 'zh' },
  ]},
  { group: 'English', voices: [
    { id: 'en-US-JennyNeural', label: 'Jenny (Female)', lang: 'en' },
    { id: 'en-US-GuyNeural', label: 'Guy (Male)', lang: 'en' },
    { id: 'en-US-AriaNeural', label: 'Aria (Female)', lang: 'en' },
    { id: 'en-US-DavisNeural', label: 'Davis (Male)', lang: 'en' },
  ]},
  { group: '日本語', voices: [
    { id: 'ja-JP-NanamiNeural', label: 'Nanami（女声）', lang: 'ja' },
    { id: 'ja-JP-KeitaNeural', label: 'Keita（男声）', lang: 'ja' },
  ]},
];

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

const buildRuntimeImageModelValue = (channelId: string, model: string) => `${channelId}::${model}`;

const parseRuntimeImageModelValue = (value?: string): { channelId: string; model: string } => {
  const raw = String(value || '').trim();
  const separatorIndex = raw.indexOf('::');
  if (separatorIndex < 0) {
    return { channelId: '', model: raw };
  }
  return {
    channelId: raw.slice(0, separatorIndex),
    model: raw.slice(separatorIndex + 2),
  };
};

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

export const SlidePreview: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT(previewI18n);
  const { projectId } = useParams<{ projectId: string }>();
  const sidebarDefaultWidth = 320;
  const sidebarGridThumbMinPx = 140;
  const sidebarGridThumbMaxPx = 320;
  const sidebarGridThumbDefaultPx = 180;
  const fromHistory = (location.state as any)?.from === 'history';
  const {
    currentProject,
    syncProject,
    generateImages,
    generateDescriptions,
    editPageImage,
    uploadPageImage,
    saveAllPages,
    deletePageById,
    reorderPages,
    updatePageLocal,
    insertPageAt,
    isGlobalLoading,
    isDescriptionStreaming,
    taskProgress,
    pageGeneratingTasks,
    warningMessage,
  } = useProjectStore();
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const previewThumbnailSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const isPageGenerating = useCallback((page?: Page | null) => {
    if (!page?.id) return false;
    const hasImage = Boolean(page.generated_image_path || page.preview_image_path);
    // "Generating" should not block UI when page already has a renderable image.
    // Active task map still takes precedence for in-session running tasks.
    return Boolean(pageGeneratingTasks[page.id]) || (!hasImage && (page.status === 'QUEUED' || page.status === 'GENERATING'));
  }, [pageGeneratingTasks]);

  const { addTask, pollTask: pollExportTask, tasks: exportTasks, restoreActiveTasks } = useExportTasksStore();
  const notifiedFailedExportTaskIds = useRef<Set<string>>(new Set());
  const activeExportTasks = useMemo(
    () => exportTasks.filter(
      task => task.projectId === projectId && (task.status === 'PROCESSING' || task.status === 'RUNNING' || task.status === 'PENDING')
    ),
    [exportTasks, projectId]
  );
  const isExporting = activeExportTasks.length > 0;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isUploadingPageImage, setIsUploadingPageImage] = useState(false);
  const selectedPageIdRef = useRef<string | null>(null);
  const {
    isMobileView,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    sidebarViewMode,
    setSidebarViewMode,
    sidebarGridThumbMaxWidthPx,
    setSidebarGridThumbMaxWidthPx,
    isResizingSidebar,
    setSidebarWidthPxExpanded,
    sidebarWidthPx,
    handleSidebarResizeStart,
    previewSplitContainerRef,
    resolvedPreviewSplitRatio,
    resolvedPreviewSplitMinWidths,
    isResizingPreviewSplit,
    handlePreviewSplitResizeStart,
    isEditorPaneCollapsed,
    setIsEditorPaneCollapsed,
    editorVerticalSplitContainerRef,
    resolvedEditorVerticalSplitRatio,
    isResizingEditorVerticalSplit,
    handleEditorVerticalSplitResizeStart,
    handleLinkedSplitResizeStart,
    previewContainerRef,
    isFullscreen,
    floatingFullscreenButtonPosition,
    isDraggingFloatingFullscreenButton,
    handleFloatingFullscreenButtonMouseDown,
    handleFloatingFullscreenButtonClick,
  } = useSlidePreviewLayout({
    currentProjectId: currentProject?.id,
    selectedIndex,
    sidebarDefaultWidth,
    sidebarGridThumbMinPx,
    sidebarGridThumbMaxPx,
    sidebarGridThumbDefaultPx,
  });
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [isRenovationProcessing, setIsRenovationProcessing] = useState(false);
  const [renovationProgress, setRenovationProgress] = useState<{ total: number; completed: number } | null>(null);
  const [generationMode, setGenerationMode] = useState<'streaming' | 'parallel'>('streaming');
  const [extraFieldNames, setExtraFieldNames] = useState<string[]>(DEFAULT_EXTRA_FIELDS);
  const [imagePromptFields, setImagePromptFields] = useState<string[]>(['视觉元素', '视觉焦点', '排版布局']);
  const [availableFields, setAvailableFields] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('banana-available-extra-fields');
      return stored ? JSON.parse(stored) : DEFAULT_EXTRA_FIELDS;
    } catch {
      return DEFAULT_EXTRA_FIELDS;
    }
  });
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const [showRunModelMenu, setShowRunModelMenu] = useState(false);
  const runModelMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const textAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const textChangesPendingPersistRef = useRef(false);
  const textPersistInFlightRef = useRef(false);
  const [descriptionRequirementsDraft, setDescriptionRequirementsDraft] = useState('');
  const formatDescriptionForEditor = useCallback((descriptionText: string, project?: Project | null) => {
    if ((project || currentProject)?.creation_type !== 'ppt_renovation') return descriptionText;
    return toLocalizedRenovationJsonText(descriptionText, 4);
  }, [currentProject]);
  // 页面挂载时恢复正在进行的导出任务（页面刷新后）
  useEffect(() => {
    restoreActiveTasks();
  }, [restoreActiveTasks]);

  useEffect(() => {
    const pageId = currentProject?.pages?.[selectedIndex]?.id || null;
    selectedPageIdRef.current = pageId;
  }, [currentProject, selectedIndex]);

  const [editPrompt, setEditPrompt] = useState('');
  // 大纲和描述编辑状态
  const [editOutlineTitle, setEditOutlineTitle] = useState('');
  const [editPageType, setEditPageType] = useState('');
  const [editOutlinePoints, setEditOutlinePoints] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStyleGuideBindings, setEditStyleGuideBindings] = useState<StyleGuideBindings>({});
  const [styleGuideManuallyEdited, setStyleGuideManuallyEdited] = useState(false);
  const [renovationJsonViewMode, setRenovationJsonViewMode] = useState<RenovationJsonViewMode>('text');
  const [isPreviewPageTypeMenuOpen, setIsPreviewPageTypeMenuOpen] = useState(false);
  const pendingOutlineFocusIndexRef = useRef<number | null>(null);
  const descriptionTextareaRef = useRef<MarkdownTextareaRef | null>(null);
  const styleGuideTextareaRef = useRef<MarkdownTextareaRef | null>(null);
  const editorJsonContainerRef = useRef<HTMLDivElement | null>(null);
  const previewPageTypeMenuRef = useRef<HTMLDivElement | null>(null);
  const outlineQuickPointsTextareaRef = useRef<MarkdownTextareaRef | null>(null);
  const activeDescriptionSetContent = useRef<(updater: (prev: string) => string) => void>(setEditDescription);
  const activeDescriptionInsertAtCursor = useRef<((markdown: string) => void) | undefined>(undefined);
  const [editExtraFields, setEditExtraFields] = useState<Record<string, string>>({});
  const [activeExternalField, setActiveExternalField] = useState<string | null>(null);
  const { handlePaste: handleDescriptionPaste, handleFiles: handleDescriptionFiles } = useImagePaste({
    projectId,
    setContent: (updater) => activeDescriptionSetContent.current(updater),
    showToast: show,
    insertAtCursor: (markdown) => activeDescriptionInsertAtCursor.current?.(markdown),
  });
  const focusMainDescriptionField = useCallback(() => {
    activeDescriptionSetContent.current = setEditDescription;
    activeDescriptionInsertAtCursor.current = (markdown: string) => {
      descriptionTextareaRef.current?.insertAtCursor(markdown);
    };
  }, []);
  const [isGlobalAiDrawerOpen, setIsGlobalAiDrawerOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExportTasksPanel, setShowExportTasksPanel] = useState(false);
  const [showVideoExportDialog, setShowVideoExportDialog] = useState(false);
  const [videoVoice, setVideoVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [videoEnableKenBurns, setVideoEnableKenBurns] = useState(false);
  const [videoIncludeNoImage, setVideoIncludeNoImage] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const exportTasksPanelRef = useRef<HTMLDivElement | null>(null);
  const externalFieldPopoverRef = useRef<HTMLDivElement | null>(null);
  const generateFlowLockRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const selectedPageForVersionFetch = currentProject?.pages?.[selectedIndex] || null;
  const {
    imageVersions,
    currentImageVersionId,
    selectedHistoryVersionId,
    setSelectedHistoryVersionId,
  } = useSlidePreviewHistoryVersions({
    projectId,
    selectedPage: selectedPageForVersionFetch,
  });
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedContextImages, setSelectedContextImages] = useState<{
    useTemplate: boolean;
    descImageUrls: string[];
    uploadedReferences: PageAiUploadedReference[];
  }>({
    useTemplate: false,
    descImageUrls: [],
    uploadedReferences: [],
  });
  const {
    imageRef,
    isRegionSelectionMode,
    setIsRegionSelectionMode,
    selectionRect,
    handleSelectionMouseDown,
    handleSelectionMouseMove,
    handleSelectionMouseUp,
    clearSelectionPreview,
  } = useSlidePreviewRegionSelection({
    setSelectedContextImages,
    show,
    t,
  });
  const [activePreviewReferenceId, setActivePreviewReferenceId] = useState<string | null>(null);
  const [pageAiMessages, setPageAiMessages] = useState<PageAiMessage[]>([]);
  const [extraRequirements, setExtraRequirements] = useState<string>('');
  const isEditingRequirements = useRef(false); // 跟踪用户是否正在编辑额外要求
  const [templateStyle, setTemplateStyle] = useState<string>('');
  const canQuickEditOutlineInPreview = currentProject?.creation_type !== 'ppt_renovation';
  const {
    persistCurrentPageDraft,
    clearPageDraftsByIds,
    hydrateSelectedPageEditor,
    resetPageDrafts,
  } = useSlidePreviewDrafts({
    currentProject,
    selectedIndex,
    formatDescriptionForEditor,
    setEditOutlineTitle,
    setEditPageType,
    setEditOutlinePoints,
    setEditDescription,
    setEditExtraFields,
    setEditStyleGuideBindings,
    setStyleGuideManuallyEdited,
  });
  const {
    isTemplateModalOpen,
    activeTemplateTab,
    setActiveTemplateTab,
    draftTemplateSelection,
    setDraftTemplateSelection,
    appliedTemplateSelection,
    persistAppliedTemplateSelection,
    closeTemplateModal,
    openTemplateModal,
  } = useSlidePreviewTemplateSelection({
    projectId,
    templateStyleJson: currentProject?.template_style_json,
  });

  useEffect(() => {
    focusMainDescriptionField();
  }, [focusMainDescriptionField, selectedIndex]);
  useEffect(() => {
    if (pendingOutlineFocusIndexRef.current !== selectedIndex) return;
    pendingOutlineFocusIndexRef.current = null;
  }, [selectedIndex, canQuickEditOutlineInPreview]);
  useEffect(() => {
    if (!isPreviewPageTypeMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!previewPageTypeMenuRef.current?.contains(event.target as Node)) {
        setIsPreviewPageTypeMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isPreviewPageTypeMenuOpen]);
  const isEditingTemplateStyle = useRef(false); // 跟踪用户是否正在编辑风格描述
  const lastProjectId = useRef<string | null>(null); // 跟踪上一次的项目ID
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  // 素材生成模态开关（模块本身可复用，这里只是示例入口）
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [outlineQuickEditPageId, setOutlineQuickEditPageId] = useState<string | null>(null);
  const [outlineQuickEditMode, setOutlineQuickEditMode] = useState<'edit' | 'preview'>('edit');
  const [isOutlineQuickGeneratePromptOpen, setIsOutlineQuickGeneratePromptOpen] = useState(false);
  const [outlineQuickGeneratePrompt, setOutlineQuickGeneratePrompt] = useState('');
  const [isOutlineQuickGeneratingDescription, setIsOutlineQuickGeneratingDescription] = useState(false);
  // 素材选择器模态开关
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const [materialSelectorMode, setMaterialSelectorMode] = useState<MaterialSelectorMode>('pageAi');
  // 导出设置
  const [exportExtractorMethod, setExportExtractorMethod] = useState<ExportExtractorMethod>(
    (currentProject?.export_extractor_method as ExportExtractorMethod) || 'hybrid'
  );
  const [exportInpaintMethod, setExportInpaintMethod] = useState<ExportInpaintMethod>(
    (currentProject?.export_inpaint_method as ExportInpaintMethod) || 'hybrid'
  );
  const [exportAllowPartial, setExportAllowPartial] = useState<boolean>(
    currentProject?.export_allow_partial || false
  );
  const [exportCompressEnabled, setExportCompressEnabled] = useState<boolean>(
    currentProject?.export_compress_enabled || false
  );
  const [exportCompressFormat, setExportCompressFormat] = useState<'jpeg' | 'png' | 'webp'>(
    (currentProject?.export_compress_format as 'jpeg' | 'png' | 'webp') || 'jpeg'
  );
  const [exportCompressQuality, setExportCompressQuality] = useState<number>(
    currentProject?.export_compress_quality || 92
  );
  const [exportCompressPngQuantizeEnabled, setExportCompressPngQuantizeEnabled] = useState<boolean>(
    currentProject?.export_compress_png_quantize_enabled || false
  );
  // 画面比例
  const [aspectRatio, setAspectRatio] = useState<string>(
    currentProject?.image_aspect_ratio || '16:9'
  );
  const [projectDefaultImageProvider, setProjectDefaultImageProvider] = useState<string>('gemini');
  const [projectDefaultImageChannel, setProjectDefaultImageChannel] = useState<string>('');
  const [projectDefaultImageModel, setProjectDefaultImageModel] = useState<string>(PROJECT_DEFAULT_IMAGE_MODEL);
  const [projectDefaultImageResolution, setProjectDefaultImageResolution] = useState<string>(PROJECT_DEFAULT_IMAGE_RESOLUTION);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileSummary[]>([]);
  const [editRunImageModel, setEditRunImageModel] = useState<string>(PROJECT_DEFAULT_IMAGE_MODEL);
  const normalizedProjectImageModel = useMemo(
    () => normalizeProjectDefaultImageModel(projectDefaultImageModel),
    [projectDefaultImageModel]
  );
  const normalizedProjectImageSource = useMemo(
    () => getSourceForImageChannel(projectDefaultImageChannel, providerProfiles),
    [projectDefaultImageChannel, providerProfiles]
  );
  const editRunImageModelOptions = useMemo(
    () => getImageChannelOptions(providerProfiles).flatMap((channel) => (
      getSelectableImageModelsForChannel(channel.id, providerProfiles).map((item) => ({
        value: buildRuntimeImageModelValue(channel.id, item.model),
        label: getImageModelDisplayLabel(channel.id, item.model, providerProfiles),
      }))
    )),
    [providerProfiles]
  );
  const parsedEditRunImageSelection = useMemo(
    () => parseRuntimeImageModelValue(editRunImageModel),
    [editRunImageModel]
  );
  const normalizedRunImageModel = useMemo(
    () => normalizeProjectDefaultImageModel(parsedEditRunImageSelection.model || projectDefaultImageModel),
    [parsedEditRunImageSelection.model, projectDefaultImageModel]
  );
  const runtimeSelectedImageChannel = useMemo(
    () => parsedEditRunImageSelection.channelId || projectDefaultImageChannel,
    [parsedEditRunImageSelection.channelId, projectDefaultImageChannel]
  );
  const runtimeSelectedImageProvider = useMemo(
    () => getImageChannelOptions(providerProfiles).find((channel) => channel.id === runtimeSelectedImageChannel)?.provider
      || projectDefaultImageProvider,
    [projectDefaultImageProvider, providerProfiles, runtimeSelectedImageChannel]
  );
  const normalizedRunImageSource = useMemo(
    () => getSourceForImageChannel(runtimeSelectedImageChannel, providerProfiles)
      || getImageSourceForModel(normalizedRunImageModel, normalizedProjectImageSource),
    [normalizedProjectImageSource, normalizedRunImageModel, providerProfiles, runtimeSelectedImageChannel]
  );
  const normalizedRunImageResolution = useMemo(
    () => normalizeProjectDefaultImageResolution(projectDefaultImageResolution, normalizedRunImageModel),
    [projectDefaultImageResolution, normalizedRunImageModel]
  );
  const runtimeImageGenerationOverride = useMemo<GenerationOverride>(() => ({
    image: {
      provider: runtimeSelectedImageProvider,
      channel: runtimeSelectedImageChannel,
      source: normalizedRunImageSource,
      model: normalizedRunImageModel,
      resolution: normalizedRunImageResolution,
    },
  }), [
    normalizedRunImageModel,
    normalizedRunImageResolution,
    normalizedRunImageSource,
    runtimeSelectedImageChannel,
    runtimeSelectedImageProvider,
  ]);
  // 根据画面比例计算 CSS aspect-ratio
  const aspectRatioStyle = useMemo(() => {
    const parts = aspectRatio.split(':');
    if (parts.length === 2) {
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (w > 0 && h > 0) return `${w}/${h}`;
    }
    return '16/9';
  }, [aspectRatio]);
  const [descriptionGenerationError, setDescriptionGenerationError] = useState<string | null>(null);
  const pageAiTextareaRef = useRef<MarkdownTextareaRef | null>(null);
  const {
    showJsonRefineDialog,
    setShowJsonRefineDialog,
    jsonRefineRequirement,
    setJsonRefineRequirement,
    isJsonRefining,
    jsonRefineInputRef,
    handleSubmitJsonRefine,
  } = useSlidePreviewJsonRefine({
    currentProject,
    selectedIndex,
    projectId,
    selectedPageId: currentProject?.pages?.[selectedIndex]?.id,
    selectedPageOutlineContent: currentProject?.pages?.[selectedIndex]?.outline_content,
    editDescription,
    editExtraFields,
    editStyleGuideBindings,
    setEditDescription,
    persistCurrentPageDraft,
    updatePageLocal,
    saveAllPages,
    selectedPageDescriptionContent: currentProject?.pages?.[selectedIndex]?.description_content,
    t,
    show,
    onApplied: () => {
      textChangesPendingPersistRef.current = false;
    },
  });

  useEffect(() => {
    void (async () => {
      try {
        const response = await getSettings();
        const settings = response.data;
        if (!settings) return;
        setGenerationMode(settings.description_generation_mode || 'streaming');
        const activeFields = settings.description_extra_fields || DEFAULT_EXTRA_FIELDS;
        setExtraFieldNames(activeFields);
        if (settings.image_prompt_extra_fields) {
          setImagePromptFields(settings.image_prompt_extra_fields);
        }
        setAvailableFields((prev) => {
          const merged = [...new Set([...prev, ...activeFields])];
          localStorage.setItem('banana-available-extra-fields', JSON.stringify(merged));
          return merged;
        });
        sessionStorage.setItem('banana-settings', JSON.stringify(settings));
      } catch {
        // ignore settings load failures
      }
    })();
  }, []);

  const saveSettingsDebounced = useCallback((updates: Record<string, unknown>) => {
    if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = setTimeout(async () => {
      try {
        const response = await updateSettings(updates as any);
        if (response.data) {
          sessionStorage.setItem('banana-settings', JSON.stringify(response.data));
        }
      } catch (error) {
        console.error('Failed to save preview settings:', error);
      }
    }, 800);
  }, []);

  const handleDescriptionGenerationModeChange = useCallback((mode: 'streaming' | 'parallel') => {
    setGenerationMode(mode);
    saveSettingsDebounced({ description_generation_mode: mode });
  }, [saveSettingsDebounced]);

  const handleDescriptionExtraFieldsChange = useCallback((nextFields: string[]) => {
    setExtraFieldNames(nextFields);
    saveSettingsDebounced({ description_extra_fields: nextFields });
  }, [saveSettingsDebounced]);

  const handleAvailableDescriptionFieldsChange = useCallback((nextPool: string[]) => {
    setAvailableFields(nextPool);
    localStorage.setItem('banana-available-extra-fields', JSON.stringify(nextPool));
  }, []);

  const handleDescriptionImagePromptFieldsChange = useCallback((nextFields: string[]) => {
    setImagePromptFields(nextFields);
    saveSettingsDebounced({ image_prompt_extra_fields: nextFields });
  }, [saveSettingsDebounced]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setFileMenuOpen(false);
      }
      if (runModelMenuRef.current && !runModelMenuRef.current.contains(event.target as Node)) {
        setShowRunModelMenu(false);
      }
      if (externalFieldPopoverRef.current && !externalFieldPopoverRef.current.contains(event.target as Node)) {
        setActiveExternalField(null);
      }
    };
    if (fileMenuOpen || showRunModelMenu || activeExternalField) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [fileMenuOpen, showRunModelMenu, activeExternalField]);

  useEffect(() => {
    if (!projectId) return;
    const taskId = localStorage.getItem('renovationTaskId');
    if (!taskId) return;

    setIsRenovationProcessing(true);
    let cancelled = false;
    let pollFailCount = 0;

    const poll = async () => {
      try {
        const response = await getTaskStatus(projectId, taskId);
        if (cancelled) return;
        const task = response.data;
        if (!task) return;

        if (task.progress) {
          setRenovationProgress({
            total: task.progress.total || 0,
            completed: task.progress.completed || 0,
          });
        }

        if (task.status === 'COMPLETED') {
          localStorage.removeItem('renovationTaskId');
          setIsRenovationProcessing(false);
          setRenovationProgress(null);
          await syncProject(projectId);
          return;
        }

        if (task.status === 'FAILED') {
          localStorage.removeItem('renovationTaskId');
          setIsRenovationProcessing(false);
          setRenovationProgress(null);
          show({ message: task.error_message || 'PDF 解析失败，请返回重试', type: 'error' });
          return;
        }

        pollFailCount = 0;
        setTimeout(poll, 3000);
      } catch {
        if (cancelled) return;
        pollFailCount += 1;
        if (pollFailCount >= 3) {
          setIsRenovationProcessing(false);
          setRenovationProgress(null);
          show({ message: '与服务器通信失败，请检查网络后刷新页面重试', type: 'error' });
          return;
        }
        setTimeout(poll, 3000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [projectId, show, syncProject]);

  useEffect(() => {
    if (!showExportMenu && !showExportTasksPanel) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedMenu = exportMenuRef.current?.contains(target);
      const clickedTasks = exportTasksPanelRef.current?.contains(target);
      if (!clickedMenu && !clickedTasks) {
        setShowExportMenu(false);
        setShowExportTasksPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu, showExportTasksPanel]);

  // 预览图矩形选择状态（编辑弹窗内）
  const pendingInsertedScrollIndexRef = useRef<number | null>(null);

  useEffect(() => {
    exportTasks
      .filter(task => task.projectId === projectId && task.status === 'FAILED' && task.taskId)
      .forEach(task => {
        if (notifiedFailedExportTaskIds.current.has(task.id)) {
          return;
        }
        notifiedFailedExportTaskIds.current.add(task.id);
        show({
          message: normalizeErrorMessage(task.errorMessage || t('preview.messages.exportFailed')),
          type: 'error',
          duration: 5000,
        });
      });
  }, [exportTasks, projectId, show, t]);

  const executeDeletePage = useCallback(async (page: Page) => {
    const pageId = page.id || page.page_id;
    if (!pageId) {
      show({ message: t('preview.deleteFailed'), type: 'error' });
      return;
    }
    const ok = await deletePageById(pageId);
    if (!ok) {
      show({ message: t('preview.deleteFailed'), type: 'error' });
    }
  }, [deletePageById, show, t]);

  const handleDeletePage = useCallback((page: Page) => {
    confirm(
      t('preview.confirmDeletePage'),
      () => {
        void executeDeletePage(page);
      },
      { title: t('preview.confirmDeleteTitle'), confirmText: t('common.delete'), variant: 'danger' }
    );
  }, [confirm, executeDeletePage, t]);

  const handleInsertPageAfter = useCallback(async (targetPage?: Page | null, fallbackIndex = -1) => {
    const insertOrderIndex = targetPage && Number.isFinite(targetPage.order_index)
      ? (targetPage.order_index as number) + 1
      : Math.max(0, fallbackIndex + 1);
    const inserted = await insertPageAt(insertOrderIndex);
    if (!inserted) {
      show({ message: t('preview.addPageFailed'), type: 'error' });
      return;
    }
    const nextIndex = Math.max(0, fallbackIndex + 1);
    pendingInsertedScrollIndexRef.current = nextIndex;
    setSelectedIndex(nextIndex);
  }, [insertPageAt, show, t]);

  useEffect(() => {
    const pendingIndex = pendingInsertedScrollIndexRef.current;
    if (pendingIndex == null || pendingIndex !== selectedIndex) return;
    const candidates = Array.from(document.querySelectorAll(`[data-preview-page-index="${pendingIndex}"]`)) as HTMLElement[];
    const target = candidates.find((item) => item.offsetParent !== null) ?? candidates[0];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    pendingInsertedScrollIndexRef.current = null;
  }, [currentProject?.pages?.length, selectedIndex]);

  const handleSelectPageByIndex = useCallback((index: number) => {
    const pageId = currentProject?.pages?.[index]?.id;
    if (pageId) {
      selectedPageIdRef.current = pageId;
    }
    setSelectedIndex(index);
  }, [currentProject]);

  // Memoize pages with generated images to avoid re-computing in multiple places
  const pagesWithImages = useMemo(() => {
    return currentProject?.pages.filter(p => p.id && (p.generated_image_path || p.preview_image_path)) || [];
  }, [currentProject?.pages]);
  const {
    isMultiSelectMode,
    selectedPageIds,
    togglePageSelection,
    selectAllPages,
    deselectAllPages,
    toggleMultiSelectMode,
    getSelectedPageIdsForExport,
  } = useSlidePreviewMultiSelect({ pagesWithImages });
  const { handleExport } = useSlidePreviewExport({
    projectId,
    t,
    show,
    addTask,
    pollExportTask,
    setShowExportMenu,
    setShowExportTasksPanel,
    getSelectedPageIdsForExport,
    videoExportOptions: {
      voice: videoVoice,
      enableKenBurns: videoEnableKenBurns,
      includeNoImagePages: videoIncludeNoImage,
    },
  });
  const {
    isSavingRequirements,
    isSavingTemplateStyle,
    isSavingDescriptionRequirements,
    isSavingGenerationDefaults,
    isSavingExportSettings,
    isSavingAspectRatio,
    handleSaveExtraRequirements,
    handleSaveTemplateStyle,
    handleSaveDescriptionRequirements,
    handleSaveGenerationDefaults,
    handleSaveExportSettings,
    handleSaveAspectRatio,
  } = useSlidePreviewProjectSettings({
    currentProject,
    projectId,
    extraRequirements,
    templateStyle,
    descriptionRequirementsDraft,
    projectDefaultImageProvider,
    projectDefaultImageChannel,
    projectDefaultImageModel,
    projectDefaultImageResolution,
    providerProfiles,
    exportExtractorMethod,
    exportInpaintMethod,
    exportAllowPartial,
    exportCompressEnabled,
    exportCompressFormat,
    exportCompressQuality,
    exportCompressPngQuantizeEnabled,
    aspectRatio,
    isEditingRequirementsRef: isEditingRequirements,
    isEditingTemplateStyleRef: isEditingTemplateStyle,
    syncProject,
    show,
    t,
  });
  const { isApplyingSelection: isUploadingTemplate, handleApplyTemplateSelection } = useSlidePreviewTemplateApply({
    projectId,
    userTemplates,
    closeTemplateModal,
    persistAppliedTemplateSelection,
    syncProject,
    show,
    t,
  });
  const {
    selectedPageAiReferences,
    handleFileUpload,
    appendPageAiFiles,
    buildPageAiPayload,
    handleToggleTemplateReference,
    handleToggleDescriptionImage,
    handleRemovePageAiReference,
  } = useSlidePreviewPageAiReferences({
    editPrompt,
    setEditPrompt,
    selectedContextImages,
    setSelectedContextImages,
    pageAiTextareaRef,
    activePreviewReferenceId,
    setActivePreviewReferenceId,
    t,
  });
  const { pageAiContextByVersion, bindPendingPageAiContext } = useSlidePreviewPageAiContext({
    currentProject,
    selectedIndex,
    currentImageVersionId,
    defaultModel: PROJECT_DEFAULT_IMAGE_MODEL,
    editPrompt,
    setEditPrompt,
    pageAiMessages,
    setPageAiMessages,
    editRunImageModel,
    setEditRunImageModel,
    selectedContextImages,
    setSelectedContextImages,
  });

  const hasImages = useMemo(
    () => currentProject?.pages?.some(p => p.generated_image_path || p.preview_image_path) ?? false,
    [currentProject?.pages]
  );

  const pageCount = currentProject?.pages?.length ?? 0;

  const goPrevPage = useCallback(() => {
    setSelectedIndex((prev) => {
      const nextIndex = Math.max(0, prev - 1);
      const nextPageId = currentProject?.pages?.[nextIndex]?.id;
      if (nextPageId) {
        selectedPageIdRef.current = nextPageId;
      }
      return nextIndex;
    });
  }, [currentProject]);

  const goNextPage = useCallback(() => {
    setSelectedIndex((prev) => {
      const maxIndex = Math.max(0, pageCount - 1);
      const nextIndex = Math.min(maxIndex, prev + 1);
      const nextPageId = currentProject?.pages?.[nextIndex]?.id;
      if (nextPageId) {
        selectedPageIdRef.current = nextPageId;
      }
      return nextIndex;
    });
  }, [currentProject, pageCount]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isFullscreen) return;
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isTyping) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        goPrevPage();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        goNextPage();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goNextPage, goPrevPage, isFullscreen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  // 加载项目数据 & 用户模板
  useEffect(() => {
    if (projectId && (!currentProject || currentProject.id !== projectId)) {
      // 直接使用 projectId 同步项目数据
      syncProject(projectId);
    }

    // 加载用户模板列表（用于按需获取File）
    const loadTemplates = async () => {
      try {
        const response = await listUserTemplates();
        if (response.data?.templates) {
          setUserTemplates(response.data.templates);
        }
      } catch (error) {
        console.error('Failed to load user templates:', error);
      }
    };
    const loadProviderProfiles = async () => {
      try {
        const response = await getProviderProfiles();
        setProviderProfiles(response.data?.profiles || []);
        setRuntimeBuiltinImageChannels(response.data?.builtin_channels || []);
      } catch (error) {
        console.warn('Failed to load provider profiles:', error);
        setProviderProfiles([]);
        setRuntimeBuiltinImageChannels([]);
      }
    };
    void loadProviderProfiles();
    loadTemplates();
  }, [projectId, currentProject, syncProject]);

  // 监听警告消息
  const lastWarningRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (warningMessage) {
      if (warningMessage !== lastWarningRef.current) {
        lastWarningRef.current = warningMessage;
        show({ message: warningMessage, type: 'warning', duration: 6000 });
      }
    } else {
      // warningMessage 被清空时重置 ref，以便下次能再次显示
      lastWarningRef.current = null;
    }
  }, [warningMessage, show]);

  // 当项目加载后，初始化额外要求和风格描述
  // 只在项目首次加载或项目ID变化时初始化，避免覆盖用户正在输入的内容
  useEffect(() => {
    if (currentProject) {
      // 检查是否是新项目
      const isNewProject = lastProjectId.current !== currentProject.id;

      if (isNewProject) {
        // 新项目，初始化额外要求和风格描述
        setExtraRequirements(currentProject.extra_requirements || '');
        setTemplateStyle(currentProject.template_style || '');
        // 初始化导出设置
        setExportExtractorMethod((currentProject.export_extractor_method as ExportExtractorMethod) || 'hybrid');
        setExportInpaintMethod((currentProject.export_inpaint_method as ExportInpaintMethod) || 'hybrid');
        setExportAllowPartial(currentProject.export_allow_partial || false);
        setExportCompressEnabled(currentProject.export_compress_enabled || false);
        setExportCompressFormat((currentProject.export_compress_format as 'jpeg' | 'png' | 'webp') || 'jpeg');
        setExportCompressQuality(currentProject.export_compress_quality || 92);
        setExportCompressPngQuantizeEnabled(currentProject.export_compress_png_quantize_enabled || false);
        setAspectRatio(currentProject.image_aspect_ratio || '16:9');
        const imageDefaults = currentProject.generation_defaults?.image || {};
        const normalizedModel = normalizeProjectDefaultImageModel(imageDefaults.model);
        const channelSelection = deriveImageChannelSelection(imageDefaults, providerProfiles);
        const preferredChannel = getPreferredImageChannel(providerProfiles, channelSelection.provider);
        setProjectDefaultImageProvider(channelSelection.provider);
        setProjectDefaultImageChannel(channelSelection.channel || preferredChannel?.id || '');
        setProjectDefaultImageModel(normalizedModel);
        setEditRunImageModel(buildRuntimeImageModelValue(channelSelection.channel || preferredChannel?.id || '', normalizedModel));
        setProjectDefaultImageResolution(normalizeProjectDefaultImageResolution(imageDefaults.resolution, normalizedModel));
        setDescriptionRequirementsDraft(currentProject.description_requirements || '');
        lastProjectId.current = currentProject.id || null;
        isEditingRequirements.current = false;
        isEditingTemplateStyle.current = false;
      } else {
        // 同一项目且用户未在编辑，可以更新（比如从服务器保存后同步回来）
        if (!isEditingRequirements.current) {
          setExtraRequirements(currentProject.extra_requirements || '');
        }
        if (!isEditingTemplateStyle.current) {
          setTemplateStyle(currentProject.template_style || '');
        }
        // 非文本输入的设置项，始终从服务器同步
        setAspectRatio(currentProject.image_aspect_ratio || '16:9');
        setExportExtractorMethod((currentProject.export_extractor_method as ExportExtractorMethod) || 'hybrid');
        setExportInpaintMethod((currentProject.export_inpaint_method as ExportInpaintMethod) || 'hybrid');
        setExportAllowPartial(currentProject.export_allow_partial || false);
        setExportCompressEnabled(currentProject.export_compress_enabled || false);
        setExportCompressFormat((currentProject.export_compress_format as 'jpeg' | 'png' | 'webp') || 'jpeg');
        setExportCompressQuality(currentProject.export_compress_quality || 92);
        setExportCompressPngQuantizeEnabled(currentProject.export_compress_png_quantize_enabled || false);
        const imageDefaults = currentProject.generation_defaults?.image || {};
        const normalizedModel = normalizeProjectDefaultImageModel(imageDefaults.model);
        const channelSelection = deriveImageChannelSelection(imageDefaults, providerProfiles);
        const preferredChannel = getPreferredImageChannel(providerProfiles, channelSelection.provider);
        setProjectDefaultImageProvider(channelSelection.provider);
        setProjectDefaultImageChannel(channelSelection.channel || preferredChannel?.id || '');
        setProjectDefaultImageModel(normalizedModel);
        setEditRunImageModel(buildRuntimeImageModelValue(channelSelection.channel || preferredChannel?.id || '', normalizedModel));
        setProjectDefaultImageResolution(normalizeProjectDefaultImageResolution(imageDefaults.resolution, normalizedModel));
        setDescriptionRequirementsDraft(currentProject.description_requirements || '');
      }
      // 如果用户正在编辑，则不更新本地状态
    }
  }, [currentProject?.id, currentProject?.extra_requirements, currentProject?.template_style, currentProject?.description_requirements, currentProject?.image_aspect_ratio, currentProject?.export_extractor_method, currentProject?.export_inpaint_method, currentProject?.export_allow_partial, currentProject?.export_compress_enabled, currentProject?.export_compress_format, currentProject?.export_compress_quality, currentProject?.export_compress_png_quantize_enabled, currentProject?.generation_defaults, providerProfiles]);

  const handleBatchGenerate = useCallback(async (pageIds?: string[]) => {
    try {
      if (!runtimeImageGenerationOverride.image?.channel || !runtimeImageGenerationOverride.image?.source) {
        show({ message: '请先选择一个可用的图片渠道，再开始生成', type: 'error' });
        return;
      }
      await generateImages(pageIds, runtimeImageGenerationOverride);
    } catch (error: any) {
      console.error('批量生成错误:', error);
      console.error('错误响应:', error?.response?.data);

      // 提取后端返回的更具体错误信息
      let errorMessage = t('preview.generationFailed');
      const respData = error?.response?.data;

      if (respData) {
        if (respData.error?.message) {
          errorMessage = respData.error.message;
        } else if (respData.message) {
          errorMessage = respData.message;
        } else if (respData.error) {
          errorMessage =
            typeof respData.error === 'string'
              ? respData.error
              : respData.error.message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      devLog('提取的错误消息:', errorMessage);

      // 使用统一的错误消息规范化函数
      errorMessage = normalizeErrorMessage(errorMessage);

      devLog('规范化后的错误消息:', errorMessage);

      show({
        message: errorMessage,
        type: 'error',
      });
    }
  }, [generateImages, runtimeImageGenerationOverride, show, t]);

  const {
    show1KWarningDialog,
    skip1KWarningChecked,
    setSkip1KWarningChecked,
    handleConfirm1KWarning,
    handleCancel1KWarning,
    showBatchDescriptionGenerateDialog,
    showBatchGenerateDialog,
    setShowBatchGenerateDialog,
    batchGenerateContext,
    setBatchGenerateContext,
    batchDescriptionGenerateContext,
    descriptionRangeStart,
    setDescriptionRangeStart,
    descriptionRangeEnd,
    setDescriptionRangeEnd,
    checkResolutionAndExecute,
    handleGenerateDescriptions,
    handleGenerateDescriptionsByRange,
    closeBatchGenerateDialog,
    closeBatchDescriptionGenerateDialog,
    handleGenerateMissingImagesFromDialog,
    handleRegenerateAllImagesFromDialog,
    handleGenerateMissingDescriptionsFromDialog,
    handleRegenerateAllDescriptionsFromDialog,
  } = useSlidePreviewGeneration({
    currentProject,
    currentImageGenerationOverride: runtimeImageGenerationOverride,
    projectId,
    t,
    show,
    generateDescriptions,
    syncProject,
    clearPageDraftsByIds,
    hydrateSelectedPageEditor,
    getLatestProject: () => useProjectStore.getState().currentProject,
    handleBatchGenerate,
  });

  const handleGenerateAll = async () => {
    // 先检查分辨率，如果是1K则显示警告
    await checkResolutionAndExecute(async () => {
      const isPartialGenerate = isMultiSelectMode && selectedPageIds.size > 0;
      const isRenovationProject = currentProject?.creation_type === 'ppt_renovation';

      // 检查要生成的页面中是否有已有图片的
      const pagesToGenerate = isPartialGenerate
        ? currentProject?.pages.filter(p => p.id && selectedPageIds.has(p.id))
        : currentProject?.pages;
      const isRenovationOriginalFirstPage = (page: Page) => (
        isRenovationProject && page.order_index === 0
      );
      const hasEffectiveGeneratedImage = (page: Page) => {
        if (!isRenovationProject) {
          return Boolean(page.generated_image_path || page.preview_image_path);
        }
        // PPT 翻新项目初始化时会带原始图，这里把原始第 1 页视为基线已存在。
        // 其余页面只有在真正翻新完成后（COMPLETED）才算“已生成”。
        return isRenovationOriginalFirstPage(page) || page.status === 'COMPLETED';
      };

      const generatedPages = pagesToGenerate?.filter((p) => !isPageGenerating(p) && hasEffectiveGeneratedImage(p)) || [];
      const generatingPages = pagesToGenerate?.filter((p) => isPageGenerating(p)) || [];
      const targetPageIds = (pagesToGenerate || [])
        .map(p => p.id)
        .filter((id): id is string => !!id);
      const missingPageIds = (pagesToGenerate || [])
        .filter(p => !isPageGenerating(p) && !hasEffectiveGeneratedImage(p) && p.id)
        .map(p => p.id!) || [];
      const totalCount = targetPageIds.length;
      const generatedCount = generatedPages.length;
      const generatingCount = generatingPages.length;
      const missingCount = missingPageIds.length;

      const executeGenerate = async (pageIdsOverride?: string[]) => {
        await handleBatchGenerate(pageIdsOverride);
      };

      if (totalCount === 0) return;

      if (generatedCount === 0 && generatingCount === 0) {
        confirm(
          t('preview.confirmGenerateAll', { count: totalCount }),
          () => executeGenerate(targetPageIds),
          { title: t('preview.confirmGenerateAllTitle'), variant: 'info' }
        );
        return;
      }

      if (generatingCount > 0 && missingCount === 0) {
        show({ message: t('preview.generatingInProgress', { count: generatingCount }), type: 'info' });
        return;
      }

      if (generatedCount < totalCount) {
        setBatchGenerateContext({
          total: totalCount,
          generated: generatedCount,
          generating: generatingCount,
          missing: missingCount,
          targetPageIds,
          missingPageIds,
        });
        setShowBatchGenerateDialog(true);
        return;
      }

      const message = isPartialGenerate
        ? t('preview.confirmRegenerateSelected', { count: selectedPageIds.size })
        : t('preview.confirmRegenerateAll');
      confirm(
        message,
        () => executeGenerate(targetPageIds),
        { title: t('preview.confirmRegenerateTitle'), variant: 'warning' }
      );
    });
  };

  const handleSwitchVersion = async (versionId: string) => {
    if (!currentProject || !selectedPage?.id || !projectId) return;

    try {
      await setCurrentImageVersion(projectId, selectedPage.id, versionId);
      await syncProject(projectId);
      show({ message: t('slidePreview.versionSwitched'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.versionSwitchFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    }
  };

  // 从描述内容中提取图片URL
  const extractImageUrlsFromDescription = (descriptionContent: DescriptionContent | string | undefined): string[] => {
    const text = typeof descriptionContent === 'string'
      ? descriptionContent
      : getDescriptionText(descriptionContent);
    if (!text) return [];

    const pattern = /!\[.*?\]\((.*?)\)/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const url = match[1]?.trim();
      if (url && isSupportedDescriptionImageUrl(url)) {
        matches.push(url);
      }
    }

    return matches;
  };

  const handleEditPage = useCallback((targetPageKey?: string | null, targetIndex?: number) => {
    if (!currentProject?.pages?.length) return;

    let nextIndex = -1;
    if (targetPageKey) {
      nextIndex = currentProject.pages.findIndex(
        (page) => (page.id || page.page_id) === targetPageKey
      );
    }
    if (nextIndex < 0 && typeof targetIndex === 'number') {
      nextIndex = targetIndex;
    }
    if (nextIndex < 0) {
      nextIndex = selectedIndex;
    }
    if (!currentProject.pages[nextIndex]) return;

    const targetPage = currentProject.pages[nextIndex];
    const targetPageId = targetPage.id || targetPage.page_id || null;
    selectedPageIdRef.current = targetPageId;
    setOutlineQuickEditPageId(targetPageId);
    setSelectedIndex(nextIndex);
    setEditOutlineTitle(targetPage.outline_content?.title || '');
    setEditPageType(targetPage.outline_content?.page_type || '');
    setEditOutlinePoints(targetPage.outline_content?.points?.join('\n') || '');
    setOutlineQuickEditMode('edit');
    setRenovationJsonViewMode('outline');
    setIsRegionSelectionMode(false);
    clearSelectionPreview();
  }, [selectedIndex, currentProject]);

  const handleOutlineQuickPointsPaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const plainText = event.clipboardData.getData('text/plain');
    if (!plainText) return;

    const formatted = normalizeOutlinePasteToMarkdown(plainText);
    if (!formatted || formatted === plainText) return;

    event.preventDefault();
    outlineQuickPointsTextareaRef.current?.insertAtCursor(formatted);
  }, []);

  const outlineQuickEditPageIndex = useMemo(() => {
    if (!currentProject?.pages?.length || !outlineQuickEditPageId) return -1;
    return currentProject.pages.findIndex(
      (page) => (page.id || page.page_id) === outlineQuickEditPageId
    );
  }, [currentProject?.pages, outlineQuickEditPageId]);

  const handleSaveOutlineForQuickEditTarget = useCallback((options?: { silent?: boolean }) => {
    if (!currentProject) return null;
    const fallbackPage = currentProject.pages[selectedIndex];
    const targetPage = outlineQuickEditPageId
      ? currentProject.pages.find(
        (page) => (page.id || page.page_id) === outlineQuickEditPageId
      ) || fallbackPage
      : fallbackPage;
    if (!targetPage?.id) return null;

    const originalTitle = targetPage.outline_content?.title || '';
    const originalPageType = targetPage.outline_content?.page_type || '';
    const originalPoints = targetPage.outline_content?.points?.join('\n') || '';
    if (editOutlineTitle !== originalTitle || editPageType !== originalPageType || editOutlinePoints !== originalPoints) {
      updatePageLocal(targetPage.id, {
        outline_content: {
          title: editOutlineTitle,
          page_type: editPageType || '标准图文页',
          points: editOutlinePoints.split('\n').filter((p) => p.trim()),
        },
      });
    }

    if (!options?.silent) {
      show({ message: t('slidePreview.outlineSaved'), type: 'success' });
    }
    return targetPage.id;
  }, [
    currentProject,
    selectedIndex,
    outlineQuickEditPageId,
    editOutlineTitle,
    editPageType,
    editOutlinePoints,
    updatePageLocal,
    show,
    t,
  ]);

  // 保存大纲和描述修改（支持传入本次输入值，避免自动保存闭包读取旧状态）
  const handleSaveOutlineAndDescription = useCallback((options?: { silent?: boolean; overrides?: TextSaveOverrides }) => {
    if (!currentProject) return false;
    const page = currentProject.pages[selectedIndex];
    if (!page?.id) return false;
    const nextOutlineTitle = options?.overrides?.title ?? editOutlineTitle;
    const nextPageType = options?.overrides?.pageType ?? editPageType;
    const nextOutlinePoints = options?.overrides?.points ?? editOutlinePoints;
    const nextDescriptionDraft = options?.overrides?.description ?? editDescription;
    const nextExtraFields = options?.overrides?.extraFields ?? editExtraFields;
    const nextStyleGuideBindings = options?.overrides?.styleGuideBindings ?? editStyleGuideBindings;
    const nextDescriptionText = currentProject.creation_type === 'ppt_renovation'
      ? toCanonicalRenovationJsonText(nextDescriptionDraft, 4)
      : nextDescriptionDraft;
    const nextEditorDescriptionText = currentProject.creation_type === 'ppt_renovation'
      ? toLocalizedRenovationJsonText(nextDescriptionText, 4)
      : nextDescriptionText;

    const updates: Partial<Page> = {};

    // 检查大纲是否有变化
    const originalTitle = page.outline_content?.title || '';
    const originalPageType = page.outline_content?.page_type || '';
    const originalPoints = page.outline_content?.points?.join('\n') || '';
    if (nextOutlineTitle !== originalTitle || nextPageType !== originalPageType || nextOutlinePoints !== originalPoints) {
      updates.outline_content = {
        title: nextOutlineTitle,
        page_type: nextPageType || '标准图文页',
        points: nextOutlinePoints.split('\n').filter((p) => p.trim()),
      };
    }

    const originalDesc = getDescriptionText(page.description_content);
    const originalExtraFields = getDescriptionExtraFields(page.description_content);
    const originalStyleGuideBindings = getDescriptionStyleGuideBindings(page.description_content);
    const originalStyleGuideManuallyEdited = Boolean(
      page.description_content
      && typeof page.description_content === 'object'
      && (page.description_content as Record<string, unknown>).style_guide_manually_edited
    );
    const serializedExtraFields = serializeExtraFields(nextExtraFields);
    const serializedStyleGuideBindings = serializeStyleGuideBindings(nextStyleGuideBindings);
    if (
      nextDescriptionText !== originalDesc
      || !areStringRecordsEqual(nextExtraFields, originalExtraFields)
      || !areStyleGuideBindingsEqual(nextStyleGuideBindings, originalStyleGuideBindings)
      || styleGuideManuallyEdited !== originalStyleGuideManuallyEdited
    ) {
      const nextDescriptionContent: Record<string, any> = {
        ...(page.description_content && typeof page.description_content === 'object'
          ? page.description_content as Record<string, any>
          : {}),
        text: nextDescriptionText,
        style_guide_manually_edited: styleGuideManuallyEdited,
      };
      if (serializedExtraFields) {
        nextDescriptionContent.extra_fields = serializedExtraFields;
      } else {
        delete nextDescriptionContent.extra_fields;
      }
      if (serializedStyleGuideBindings) {
        nextDescriptionContent.style_guide_bindings = serializedStyleGuideBindings;
      } else {
        delete nextDescriptionContent.style_guide_bindings;
      }
      updates.description_content = nextDescriptionContent as DescriptionContent;
    }

    if (Object.keys(updates).length > 0) {
      updatePageLocal(page.id, updates);
      persistCurrentPageDraft({
        title: nextOutlineTitle,
        pageType: nextPageType,
        points: nextOutlinePoints,
        description: nextEditorDescriptionText,
        extraFields: nextExtraFields,
        styleGuideBindings: nextStyleGuideBindings,
      });
      if (!options?.silent && nextEditorDescriptionText !== editDescription) {
        setEditDescription(nextEditorDescriptionText);
      }
      if (!options?.silent) {
        show({ message: t('slidePreview.outlineSaved'), type: 'success' });
      }
      return true;
    }
    return false;
  }, [currentProject, selectedIndex, editOutlineTitle, editPageType, editOutlinePoints, editDescription, editExtraFields, editStyleGuideBindings, styleGuideManuallyEdited, updatePageLocal, persistCurrentPageDraft, show, t]);

  // 调度页面文本的自动保存，连续输入时只在停顿后触发一次。
  const scheduleTextAutoSave = useCallback((overrides?: TextSaveOverrides) => {
    textChangesPendingPersistRef.current = true;
    if (textAutoSaveTimerRef.current) {
      clearTimeout(textAutoSaveTimerRef.current);
    }
    textAutoSaveTimerRef.current = setTimeout(() => {
      try {
        // 自动保存阶段仅触发本地更新与防抖上送，避免频繁 syncProject 回拉导致编辑光标/输入状态被打断。
        handleSaveOutlineAndDescription({ silent: true, overrides });
      } catch (error) {
        console.error('Failed to auto-save page text:', error);
      }
    }, 900);
  }, [handleSaveOutlineAndDescription]);

  // 立即保存页面文本，并可携带 blur 时从编辑器读取到的最新值。
  const persistTextEditsNow = useCallback((options?: { silent?: boolean; overrides?: TextSaveOverrides }) => {
    if (textAutoSaveTimerRef.current) {
      clearTimeout(textAutoSaveTimerRef.current);
      textAutoSaveTimerRef.current = undefined;
    }

    handleSaveOutlineAndDescription({ silent: options?.silent ?? true, overrides: options?.overrides });

    if (!textChangesPendingPersistRef.current || textPersistInFlightRef.current) {
      return;
    }

    textPersistInFlightRef.current = true;
    void (async () => {
      try {
        await saveAllPages();
        textChangesPendingPersistRef.current = false;
      } catch (error) {
        console.error('Failed to persist page text on blur:', error);
      } finally {
        textPersistInFlightRef.current = false;
      }
    })();
  }, [handleSaveOutlineAndDescription, saveAllPages]);

  useEffect(() => {
    return () => {
      if (textAutoSaveTimerRef.current) {
        clearTimeout(textAutoSaveTimerRef.current);
      }
    };
  }, []);

  const executePageImageGeneration = useCallback(async (options?: {
    prompt?: string;
    contextImages?: {
      useTemplate: boolean;
      descImageUrls: string[];
      uploadedReferences: PageAiUploadedReference[];
    };
    model?: string;
  }) => {
    if (!currentProject) return;

    const page = currentProject.pages[selectedIndex];
    if (!page.id) return;
    try {
      handleSaveOutlineAndDescription();
      await saveAllPages();
      const nextPrompt = options?.prompt ?? editPrompt;
      const nextContextImages = options?.contextImages ?? selectedContextImages;
      const nextSelection = parseRuntimeImageModelValue(options?.model ?? editRunImageModel);
      const normalizedEditModel = normalizeProjectDefaultImageModel(nextSelection.model || projectDefaultImageModel);
      const normalizedEditResolution = normalizeProjectDefaultImageResolution(
        projectDefaultImageResolution,
        normalizedEditModel
      );
      const selectedEditChannel = nextSelection.channelId || projectDefaultImageChannel;
      const selectedEditProvider = getImageChannelOptions(providerProfiles).find((channel) => channel.id === selectedEditChannel)?.provider
        || projectDefaultImageProvider;
      const normalizedEditSource = getSourceForImageChannel(selectedEditChannel, providerProfiles)
        || getImageSourceForModel(normalizedEditModel, normalizedProjectImageSource);
      if (!selectedEditChannel || !normalizedEditSource) {
        show({ message: '请先选择一个可用的图片渠道，再进行单页生成', type: 'error' });
        return;
      }
      const editGenerationOverride: GenerationOverride | undefined = normalizedEditModel
        ? {
          image: {
            provider: selectedEditProvider,
            channel: selectedEditChannel,
            source: normalizedEditSource,
            model: normalizedEditModel,
            resolution: normalizedEditResolution,
          },
        }
        : undefined;
      await editPageImage(
        page.id,
        nextPrompt,
        {
          useTemplate: nextContextImages.useTemplate,
          descImageUrls: nextContextImages.descImageUrls,
          uploadedFiles: nextContextImages.uploadedReferences.length > 0
            ? nextContextImages.uploadedReferences.map((reference) => reference.file)
            : undefined,
        },
        editGenerationOverride
      );
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        t('preview.generationFailed');
      show({ message: errorMessage, type: 'error' });
      throw error;
    }
  }, [currentProject, selectedIndex, editPrompt, selectedContextImages, editPageImage, editRunImageModel, projectDefaultImageChannel, projectDefaultImageModel, projectDefaultImageProvider, projectDefaultImageResolution, providerProfiles, normalizedProjectImageSource, handleSaveOutlineAndDescription, saveAllPages, show, t]);

  const handleGenerateCurrentPage = useCallback(async () => {
    const preferredPageId = selectedPageIdRef.current;
    const pageId = (
      preferredPageId && currentProject?.pages?.some((page) => page.id === preferredPageId)
        ? preferredPageId
        : currentProject?.pages[selectedIndex]?.id
    );
    if (!pageId) return;

    await checkResolutionAndExecute(async () => {
      handleSaveOutlineAndDescription();
      await saveAllPages();
      await handleBatchGenerate([pageId]);
    });
  }, [
    currentProject,
    selectedIndex,
    checkResolutionAndExecute,
    handleSaveOutlineAndDescription,
    saveAllPages,
    handleBatchGenerate,
  ]);

  const handleGenerateDescriptionForCurrentPage = useCallback(async (descriptionRequirementsOverride?: string) => {
    if (!currentProject) return;
    const pageId = handleSaveOutlineForQuickEditTarget({ silent: true });
    if (!pageId) return;
    setIsOutlineQuickGeneratePromptOpen(false);

    try {
      setIsOutlineQuickGeneratingDescription(true);
      await saveAllPages();
      await generateDescriptions(undefined, [pageId], descriptionRequirementsOverride);
      await syncProject(projectId);
      clearPageDraftsByIds([pageId]);
      hydrateSelectedPageEditor(useProjectStore.getState().currentProject);
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        t('slidePreview.unknownError');
      show({ message: errorMessage, type: 'error' });
    } finally {
      setIsOutlineQuickGeneratingDescription(false);
      setOutlineQuickEditPageId(null);
      setOutlineQuickEditMode('edit');
      setOutlineQuickGeneratePrompt('');
    }
  }, [
    currentProject,
    handleSaveOutlineForQuickEditTarget,
    saveAllPages,
    generateDescriptions,
    clearPageDraftsByIds,
    hydrateSelectedPageEditor,
    syncProject,
    projectId,
    t,
    show,
  ]);

  const handleAiRefineDescriptions = useCallback(async (requirement: string, previousRequirements: string[]) => {
    if (!currentProject || !projectId) return;
    try {
      handleSaveOutlineAndDescription();
      await saveAllPages();
      const response = await refineDescriptions(projectId, requirement, previousRequirements);
      resetPageDrafts();
      await syncProject(projectId);
      hydrateSelectedPageEditor(useProjectStore.getState().currentProject);
      const successMessage = response.data?.message || '页面描述修改成功';
      show({
        message: successMessage,
        type: 'success',
      });
      return successMessage;
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        '修改失败，请稍后重试';
      show({ message: errorMessage, type: 'error' });
      throw new Error(errorMessage);
    }
  }, [currentProject, projectId, handleSaveOutlineAndDescription, saveAllPages, show, syncProject, hydrateSelectedPageEditor, resetPageDrafts]);

  const handleExportDescriptions = useCallback(() => {
    if (!currentProject) return;
    exportProjectToMarkdown(currentProject, { outline: false, description: true });
    show({ message: '导出成功', type: 'success' });
  }, [currentProject, show]);

  const handleExportFull = useCallback(() => {
    if (!currentProject) return;
    exportProjectToMarkdown(currentProject);
    show({ message: '导出成功', type: 'success' });
  }, [currentProject, show]);

  const handleImportDescriptions = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (importFileRef.current) importFileRef.current.value = '';
    if (!file || !currentProject || !projectId) return;

    try {
      const text = await file.text();
      const parsed = parseMarkdownPages(text);
      if (parsed.length === 0) {
        show({ message: '文件中未找到有效页面', type: 'error' });
        return;
      }

      const startIndex = currentProject.pages.reduce(
        (max, page) => Math.max(max, (page.order_index ?? 0) + 1),
        0
      );
      await Promise.all(parsed.map(({ title, page_type, points, text: desc, part, extra_fields }, index) =>
        addPage(projectId, {
          outline_content: { title, page_type: page_type || '标准图文页', points },
          description_content: desc ? { text: desc, ...(extra_fields ? { extra_fields } : {}) } : undefined,
          part,
          order_index: startIndex + index,
        })
      ));
      await syncProject(projectId);
      show({ message: '导入成功', type: 'success' });
    } catch {
      show({ message: '导入失败，请检查文件格式', type: 'error' });
    }
  }, [currentProject, projectId, show, syncProject]);

  const runGenerateFlow = useCallback(async (action: () => Promise<void>) => {
    if (!currentProject) return false;
    if (generateFlowLockRef.current) return false;
    generateFlowLockRef.current = true;
    try {
      const currentPage = currentProject.pages[selectedIndex];
      const hasCurrentPageImage = Boolean(currentPage?.generated_image_path || currentPage?.preview_image_path);
      const hasTemplateSource = Boolean(
        currentProject.template_image_path ||
        currentProject.template_style?.trim() ||
        currentProject.template_style_json?.trim()
      );
      if (!hasTemplateSource && !hasCurrentPageImage) {
        show({ message: '请先上传模板图片或添加风格描述。', type: 'error' });
        return false;
      }

      return await checkResolutionAndExecute(action);
    } finally {
      generateFlowLockRef.current = false;
    }
  }, [currentProject, selectedIndex, show, checkResolutionAndExecute]);

  const uploadedReferenceCleanupRef = useRef<PageAiUploadedReference[]>([]);
  useEffect(() => {
    const combined = [
      ...selectedContextImages.uploadedReferences,
      ...Object.values(pageAiContextByVersion).flatMap((context) => context.contextImages.uploadedReferences),
    ];
    const deduped = combined.filter((reference, index, array) => array.findIndex((item) => item.id === reference.id) === index);
    uploadedReferenceCleanupRef.current = deduped;
  }, [selectedContextImages.uploadedReferences, pageAiContextByVersion]);
  useEffect(() => {
    return () => {
      uploadedReferenceCleanupRef.current.forEach((reference) => {
        URL.revokeObjectURL(reference.previewUrl);
      });
    };
  }, []);

  const { handleSelectMaterials, descriptionSlashActions, pageAiSlashActions } = useSlidePreviewMaterials({
    materialSelectorMode,
    setMaterialSelectorMode,
    setIsMaterialSelectorOpen,
    projectId,
    t,
    show,
    handleDescriptionFiles,
    descriptionTextareaRef,
    activeDescriptionInsertAtCursor,
    pageAiTextareaRef,
    appendPageAiFiles,
  });

  const handleRefresh = useCallback(async () => {
    const targetProjectId = projectId || currentProject?.id;
    if (!targetProjectId) {
      show({ message: t('slidePreview.cannotRefresh'), type: 'error' });
      return;
    }

    setIsRefreshing(true);
    try {
      // 强制刷新：丢弃本地草稿缓存，避免覆盖后端最新内容
      resetPageDrafts();
      await syncProject(targetProjectId);
      hydrateSelectedPageEditor(useProjectStore.getState().currentProject);
      show({ message: t('slidePreview.refreshSuccess'), type: 'success' });
    } catch (error: any) {
      show({
        message: error.message || t('slidePreview.refreshFailed'),
        type: 'error'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, currentProject?.id, syncProject, show, hydrateSelectedPageEditor, resetPageDrafts]);

  const canvasFieldNames = [...new Set([
    ...extraFieldNames,
    ...Object.keys(editExtraFields),
  ])];
  const draftDescImageUrls = useMemo(
    () => extractImageUrlsFromDescription(editDescription),
    [editDescription]
  );
  const {
    previewSortablePageIds,
    getPreviewSortablePageIndex,
    canReorderPreviewPages,
    handlePreviewThumbnailDragEnd,
  } = useSlidePreviewReorder({
    currentProject,
    isMobileView,
    isMultiSelectMode,
    selectedIndex,
    setSelectedIndex,
    reorderPages,
  });

  useEffect(() => {
    if (activeExternalField && !canvasFieldNames.includes(activeExternalField)) {
      setActiveExternalField(null);
    }
  }, [activeExternalField, canvasFieldNames]);

  useEffect(() => {
    setSelectedContextImages((prev) => {
      const nextDescImageUrls = prev.descImageUrls.filter((url) => draftDescImageUrls.includes(url));
      const nextUseTemplate = prev.useTemplate && Boolean(currentProject?.template_image_path);
      const sameDescImages =
        nextDescImageUrls.length === prev.descImageUrls.length &&
        nextDescImageUrls.every((url, index) => url === prev.descImageUrls[index]);

      if (sameDescImages && nextUseTemplate === prev.useTemplate) {
        return prev;
      }

      return {
        ...prev,
        descImageUrls: nextDescImageUrls,
        useTemplate: nextUseTemplate,
      };
    });
  }, [draftDescImageUrls, currentProject?.template_image_path]);

  useEffect(() => {
    setActiveExternalField(null);
    setActivePreviewReferenceId(null);
  }, [selectedIndex]);

  const historyVersionsDescending = [...imageVersions].sort((a, b) => b.version_number - a.version_number);
  const selectedHistoryVersion = historyVersionsDescending.find(
    (version) => version.version_id === selectedHistoryVersionId
  ) || historyVersionsDescending[0] || null;
  const {
    copiedHistoryVersionId,
    getHistoryOperationLabel,
    handleOpenHistory,
    handleCopyHistoryPrompt,
  } = useSlidePreviewHistoryActions({
    imageVersions,
    historyVersionsDescending,
    selectedHistoryVersion,
    setSelectedHistoryVersionId,
    setIsHistoryModalOpen,
    t,
    show,
  });
  const { isPageAiSubmitting, handlePageAiSend } = useSlidePreviewPageAiSubmit({
    currentProject,
    selectedIndex,
    t,
    buildPageAiPayload,
    selectedPageAiReferences,
    pageAiMessages,
    setPageAiMessages,
    runGenerateFlow,
    executePageImageGeneration,
    editRunImageModel,
    currentImageVersionId,
    editPrompt,
    selectedContextImages,
    bindPendingPageAiContext,
  });

  if (!currentProject) {
    return <Loading fullscreen message={t('preview.messages.loadingProject')} />;
  }

  if (isGlobalLoading) {
    // 根据任务进度显示不同的消息
    let loadingMessage = t('preview.messages.processing');
    if (taskProgress && typeof taskProgress === 'object') {
      const progressData = taskProgress as any;
      if (progressData.current_step) {
        // 使用后端提供的当前步骤信息
        const stepMap: Record<string, string> = {
          'Generating clean backgrounds': t('preview.messages.generatingBackgrounds'),
          'Creating PDF': t('preview.messages.creatingPdf'),
          'Parsing with MinerU': t('preview.messages.parsingContent'),
          'Creating editable PPTX': t('preview.messages.creatingPptx'),
          'Complete': t('preview.messages.complete')
        };
        loadingMessage = stepMap[progressData.current_step] || progressData.current_step;
      }
      // 不再显示 "处理中 (X/Y)..." 格式，百分比已在进度条显示
    }

    return (
      <Loading
        fullscreen
        message={loadingMessage}
        progress={taskProgress || undefined}
      />
    );
  }

  const selectedPage = currentProject.pages[selectedIndex];

  const imageUrl = getPageImageUrl(selectedPage);

  const hasAllImages = currentProject.pages.every(
    (p) => p.generated_image_path || p.preview_image_path
  );
  const isSidebarCompact = !isMobileView && !isSidebarCollapsed && sidebarWidthPx <= 200;
  const isSidebarGridMode = !isSidebarCompact && sidebarViewMode === 'grid';
  const sidebarGridGapPx = 12;
  const sidebarGridHorizontalPaddingPx = isMobileView ? 24 : 32;
  const sidebarGridAvailableWidthPx = Math.max(0, sidebarWidthPx - sidebarGridHorizontalPaddingPx);
  const sidebarGridColumns = Math.max(
    2,
    Math.ceil((sidebarGridAvailableWidthPx + sidebarGridGapPx) / (sidebarGridThumbMaxWidthPx + sidebarGridGapPx))
  );
  const generateButtonText =
    isMultiSelectMode && selectedPageIds.size > 0
      ? t('preview.generateSelected', { count: selectedPageIds.size })
      : t('preview.batchGenerate', { count: currentProject.pages.length });
  const isGenerateDisabled = isMultiSelectMode && selectedPageIds.size === 0;
  const missingImageCount = currentProject.pages.filter(p => !p.generated_image_path).length;
  const selectedPageHasImage = Boolean(selectedPage?.generated_image_path || selectedPage?.preview_image_path);
  const generatingImageCount = currentProject.pages.filter((page) => isPageGenerating(page)).length;
  const isSelectedPageGenerating = isPageGenerating(selectedPage);
  const descriptionGenerationTotal = taskProgress?.total && taskProgress.total > 0
    ? taskProgress.total
    : currentProject.pages.filter((page) => page.id).length;
  const descriptionGenerationCompleted = taskProgress?.total && taskProgress.total > 0
    ? Math.min(taskProgress.completed, descriptionGenerationTotal)
    : currentProject.pages.filter((page) => page.id && page.status !== 'GENERATING_DESCRIPTION').length;
  const descriptionGenerationProgressPercent = descriptionGenerationTotal > 0
    ? Math.max(0, Math.min(100, Math.round((descriptionGenerationCompleted / descriptionGenerationTotal) * 100)))
    : 0;
  const isDescriptionProgressVisible = isDescriptionStreaming && descriptionGenerationTotal > 0;
  const renovationProgressPercent = renovationProgress && renovationProgress.total > 0
    ? Math.max(0, Math.min(100, Math.round((renovationProgress.completed / renovationProgress.total) * 100)))
    : 0;
  const isPptRenovationProject = currentProject?.creation_type === 'ppt_renovation';
  const isTextGenerationPreviewProject = currentProject?.creation_type !== 'ppt_renovation';
  const useRenovationPreviewForm = isPptRenovationProject || isTextGenerationPreviewProject;
  const syncDescriptionPageTypeForCurrentMode = useCallback((pageType: string, descriptionText: string) => {
    if (!useRenovationPreviewForm) return descriptionText;
    return syncRenovationJsonPageType(descriptionText, pageType, 4);
  }, [useRenovationPreviewForm]);
  const pageTypeOptions = currentProject?.scenario === 'data_report' ? DATA_REPORT_PAGE_TYPE_OPTIONS : PPT_PAGE_TYPE_OPTIONS;
  const activeStyleGuideBindingKey = buildStyleGuideBindingKey(currentImageVersionId);
  const effectivePreviewPageType = editPageType || selectedPage?.outline_content?.page_type || '';
  const projectStyleGuideJson = (() => {
    if (!useRenovationPreviewForm) return '';
    return buildPreviewStyleJsonForPageType(currentProject?.template_style_json || '', effectivePreviewPageType);
  })();
  const currentImageBoundStyleGuide = editStyleGuideBindings[activeStyleGuideBindingKey] || '';
  const pageDefaultStyleGuide = editStyleGuideBindings[PAGE_STYLE_GUIDE_DEFAULT_BINDING] || '';
  const resolvedStyleGuideText = currentImageBoundStyleGuide || pageDefaultStyleGuide || projectStyleGuideJson || '';
  // 根据当前输入构建风格指导覆盖，供 onChange 与 blur 保存共用。
  const buildStyleGuideBindingsFromText = (value: string, base: StyleGuideBindings) => {
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
  };

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

  // 记录风格指导输入并携带最新值触发自动保存。
  const handleStyleGuideTextChange = (value: string) => {
    setStyleGuideManuallyEdited(true);
    setEditStyleGuideBindings((prev) => {
      const next = buildStyleGuideBindingsFromText(value, prev);
      persistCurrentPageDraft({ styleGuideBindings: next, styleGuideManuallyEdited: true });
      scheduleTextAutoSave({ styleGuideBindings: next });
      return next;
    });
  };
  const editorGridClasses = useRenovationPreviewForm
    ? 'grid h-full min-h-0 gap-2 grid-rows-[minmax(0,1fr)] lg:gap-3 lg:grid-rows-[minmax(0,1fr)]'
    : 'grid h-full min-h-0 gap-3 grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-4 lg:grid-rows-[auto_minmax(120px,0.6fr)_minmax(0,1fr)]';
  const shouldUseEditorVerticalSplit = useRenovationPreviewForm && !isMobileView;
  const isEditorPaneHidden = !isMobileView && isEditorPaneCollapsed;
  const focusJsonEditorField = (mode: 'text' | 'styleGuide') => {
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
  };

  const handleEditorContainerMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
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
  };

  const editorCanvasContent = (
    <div
      className={`${useRenovationPreviewForm
        ? `${isMobileView ? 'min-h-[520px]' : 'h-full min-h-0'} overflow-hidden pl-2 pr-0 py-2 sm:pl-3 sm:pr-0 sm:py-3 lg:pl-4 lg:pr-0 lg:py-3`
        : 'min-h-[520px] sm:min-h-[560px] lg:min-h-[580px] p-4 sm:p-5 lg:p-6'} w-full min-w-0 ${
        useRenovationPreviewForm
          ? 'bg-transparent'
          : 'rounded-[24px] border border-[#eadfbf] bg-white dark:border-border-primary dark:bg-[radial-gradient(circle_at_top,#1b2340_0%,#151a26_34%,#101521_100%)]'
      }`}
      style={isMobileView ? undefined : { width: '100%', maxWidth: '100%', aspectRatio: aspectRatioStyle }}
      data-testid="preview-editor-canvas"
    >
      <div className={editorGridClasses}>
        {!useRenovationPreviewForm && (
          <div className="min-h-0 overflow-hidden rounded-2xl border border-[#f4efe4] bg-white px-5 py-3 flex flex-col dark:border-[#2d3447] dark:bg-[#151a26]">
            <div className="mb-2 shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9f8f67] dark:text-[#98a2bd]">{t('preview.pointsPerLine')}</div>
            <textarea
              value={editOutlinePoints}
              onChange={(event) => {
                const value = event.target.value;
                setEditOutlinePoints(value);
                persistCurrentPageDraft({ points: value });
                scheduleTextAutoSave({ points: value });
              }}
              placeholder={t('preview.enterPointsPerLine')}
              data-testid="preview-text-points-input"
              className="min-h-[72px] w-full flex-1 appearance-none resize-none overflow-y-auto bg-transparent px-0 py-0 text-sm leading-6 text-slate-700 outline-none placeholder:text-[#b8ae96] focus:ring-0 dark:text-[#e2e8f0] dark:placeholder:text-[#66708c]"
            />
          </div>
        )}

        <div
          ref={editorJsonContainerRef}
          className={`relative min-h-0 flex flex-col ${
            useRenovationPreviewForm
              ? ''
              : 'overflow-hidden rounded-2xl border border-[#f4efe4] bg-white px-5 py-3 dark:border-[#2d3447] dark:bg-[#151a26]'
          }`}
          onMouseDown={handleEditorContainerMouseDown}
        >
          <div className={`mb-2 shrink-0 ${useRenovationPreviewForm ? 'flex items-center justify-between gap-2' : ''}`}>
            <div className={`${useRenovationPreviewForm ? 'flex min-w-0 items-center gap-3' : ''}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9f8f67] dark:text-[#98a2bd]">
                {useRenovationPreviewForm ? t('preview.pageJson') : t('preview.pageDescription')}
              </div>
              {useRenovationPreviewForm && (
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<History size={14} />}
                    onClick={handleOpenHistory}
                    disabled={historyVersionsDescending.length === 0}
                    aria-label={t('preview.historyButton')}
                    title={t('preview.historyButton')}
                    className="h-6 w-6 rounded-full border border-[#d9c99d] bg-[#f9f2df] p-0 text-[#7c6840] shadow-sm hover:bg-[#f6ebcf] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:bg-background-hover"
                  />
                  {historyVersionsDescending.length > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-banana-500 px-1 py-0 text-[9px] font-bold leading-none text-black shadow-sm">
                      {historyVersionsDescending.length}
                    </span>
                  )}
                </div>
              )}
              {useRenovationPreviewForm && renovationJsonViewMode === 'text' && (
                <div className="group relative">
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center text-[#a88f5e] transition-colors hover:text-[#7c6840] focus:outline-none focus:ring-2 focus:ring-banana-300 dark:text-[#93a0bf] dark:hover:text-[#d7def1]"
                    aria-label="JSON 编辑帮助"
                    title="JSON 编辑帮助"
                  >
                    <Info size={12} />
                  </button>
                  <div className="pointer-events-none absolute left-0 top-full z-40 mt-2 w-max max-w-[280px] rounded-xl border border-[#e8d9b4] bg-[#fffaf0] px-3 py-2 text-[11px] leading-5 text-[#8a7750] opacity-0 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-[#3c4762] dark:bg-[#1a2335] dark:text-[#c4d2f3]">
                    输入 <span className="font-semibold">/</span> 可快速插入图片（本地上传或素材库选择）
                  </div>
                </div>
              )}
            </div>
            {useRenovationPreviewForm && (
              <div className="flex items-center gap-2">
                <div className="relative" ref={runModelMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowRunModelMenu((prev) => !prev)}
                    title={`${t('preview.editRunImageModelLabel')}：${editRunImageModel}`}
                    aria-label={t('preview.editRunImageModelLabel')}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm transition-all ${
                      showRunModelMenu
                        ? 'border-banana-300 bg-[#fff7d9] text-slate-900 dark:border-banana-500/60 dark:bg-banana-500/10 dark:text-banana'
                        : 'border-[#e8d9b4] bg-[#fff9ec] text-[#8a7750] hover:border-[#d1be8b] hover:bg-[#fff6e2] dark:border-[#3c4762] dark:bg-[#1a2335] dark:text-[#9eaccf] dark:hover:border-[#4b5a7b] dark:hover:bg-[#202b3f]'
                    }`}
                  >
                    <Settings2 size={14} />
                  </button>
                  {showRunModelMenu && (
                    <div className="absolute right-0 top-full z-40 mt-2 w-[300px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)] dark:border-border-primary dark:bg-background-elevated dark:shadow-[0_18px_40px_rgba(0,0,0,0.36)]">
                      <div className="max-h-[320px] overflow-y-auto">
                        {editRunImageModelOptions.map((option) => {
                          const selected = option.value === editRunImageModel;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setEditRunImageModel(option.value);
                                setShowRunModelMenu(false);
                              }}
                              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                selected
                                  ? 'bg-[#fff7d9] text-slate-900 dark:bg-banana-500/10 dark:text-banana'
                                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-foreground-secondary dark:hover:bg-background-hover dark:hover:text-foreground-primary'
                              }`}
                              title={option.label}
                            >
                              <span className="min-w-0 truncate">{option.label}</span>
                              {selected && <Check size={16} className="flex-shrink-0 text-banana-600" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="relative" ref={previewPageTypeMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsPreviewPageTypeMenuOpen((prev) => !prev)}
                      data-testid="preview-page-type-select"
                      className="inline-flex h-9 min-w-[136px] items-center justify-between gap-2 rounded-lg border border-[#e8d9b4] bg-[#fff9ec] px-3 py-1.5 text-sm text-slate-800 transition-colors hover:border-banana-300 focus:outline-none focus:ring-2 focus:ring-banana-400/60 dark:border-[#3c4762] dark:bg-[#1a2335] dark:text-[#f5f7ff] dark:hover:border-banana-500/50"
                    >
                      <span className="truncate">{editPageType || t('preview.pageTypePlaceholder')}</span>
                      <ChevronDown
                        size={16}
                        className={`flex-shrink-0 text-slate-400 transition-transform dark:text-[#9eaccf] ${isPreviewPageTypeMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isPreviewPageTypeMenuOpen && (
                      <div className="absolute right-0 top-[calc(100%+8px)] z-30 max-h-72 min-w-full overflow-y-auto rounded-xl border border-[#eadfbf] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.14)] dark:border-[#36415b] dark:bg-[#101521]">
                        {pageTypeOptions.map((option) => {
                          const isActive = (editPageType || '标准图文页') === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                const nextDescription = syncDescriptionPageTypeForCurrentMode(option, editDescription);
                                const nextStyleGuideBindings = syncStyleGuideBindingsForPageType(option, editStyleGuideBindings);
                                setEditPageType(option);
                                if (nextDescription !== editDescription) {
                                  setEditDescription(nextDescription);
                                }
                                if (nextStyleGuideBindings !== editStyleGuideBindings) {
                                  setEditStyleGuideBindings(nextStyleGuideBindings);
                                }
                                persistCurrentPageDraft({ pageType: option });
                                if (nextDescription !== editDescription) {
                                  persistCurrentPageDraft({ description: nextDescription });
                                }
                                if (nextStyleGuideBindings !== editStyleGuideBindings) {
                                  persistCurrentPageDraft({ styleGuideBindings: nextStyleGuideBindings, styleGuideManuallyEdited });
                                }
                                scheduleTextAutoSave({
                                  pageType: option,
                                  ...(nextDescription !== editDescription ? { description: nextDescription } : {}),
                                  ...(nextStyleGuideBindings !== editStyleGuideBindings ? { styleGuideBindings: nextStyleGuideBindings } : {}),
                                });
                                setIsPreviewPageTypeMenuOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                isActive
                                  ? 'bg-banana-50 text-banana-700 dark:bg-banana-500/15 dark:text-banana-300'
                                  : 'text-slate-700 hover:bg-[#f7edd2] dark:text-[#e2e8f0] dark:hover:bg-[#232f47]'
                              }`}
                            >
                              <span className="truncate">{option}</span>
                              {isActive ? <Check size={16} className="flex-shrink-0 text-banana-500" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="inline-flex items-center rounded-lg border border-[#e8d9b4] bg-[#fff9ec] p-1 dark:border-[#3c4762] dark:bg-[#1a2335]">
                    <button
                      type="button"
                      onClick={() => setRenovationJsonViewMode('outline')}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        renovationJsonViewMode === 'outline'
                          ? 'bg-banana-500 text-black shadow-sm'
                          : 'text-[#8a7750] hover:bg-[#f7edd2] dark:text-[#9eaccf] dark:hover:bg-[#232f47]'
                      }`}
                    >
                      {t('preview.jsonOutlineTab')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenovationJsonViewMode('text')}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        renovationJsonViewMode === 'text'
                          ? 'bg-banana-500 text-black shadow-sm'
                          : 'text-[#8a7750] hover:bg-[#f7edd2] dark:text-[#9eaccf] dark:hover:bg-[#232f47]'
                      }`}
                    >
                      {t('preview.jsonTextTab')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenovationJsonViewMode('styleGuide')}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        renovationJsonViewMode === 'styleGuide'
                          ? 'bg-banana-500 text-black shadow-sm'
                          : 'text-[#8a7750] hover:bg-[#f7edd2] dark:text-[#9eaccf] dark:hover:bg-[#232f47]'
                      }`}
                    >
                      {t('preview.jsonStyleGuideTab')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {useRenovationPreviewForm && renovationJsonViewMode === 'outline' ? (
            <MarkdownTextarea
              ref={outlineQuickPointsTextareaRef}
              value={editOutlinePoints}
              onChange={(value: string) => {
                setEditOutlinePoints(value);
                persistCurrentPageDraft({ points: value });
                scheduleTextAutoSave({ points: value });
              }}
              onPaste={handleOutlineQuickPointsPaste}
              onBlur={(value) => persistTextEditsNow({ silent: true, overrides: { points: value } })}
              placeholder={t('preview.enterPointsPerLine')}
              data-testid="preview-outline-text-input"
              rows={14}
              maxHeight="100%"
              resizable={false}
              showUploadButton={false}
              showImagePreview={false}
              slashActions={undefined}
              className="preview-json-editor min-h-[220px] flex-1 border-0 bg-transparent shadow-none focus-within:ring-0 focus-within:border-transparent dark:bg-transparent text-[14px] leading-6 [&_[role=textbox]]:pr-0"
            />
          ) : useRenovationPreviewForm && renovationJsonViewMode === 'styleGuide' ? (
            <MarkdownTextarea
              ref={styleGuideTextareaRef}
              value={resolvedStyleGuideText}
              onChange={(value: string) => handleStyleGuideTextChange(value)}
              onBlur={(value) => {
                const next = buildStyleGuideBindingsFromText(value, editStyleGuideBindings);
                setStyleGuideManuallyEdited(true);
                persistCurrentPageDraft({ styleGuideBindings: next, styleGuideManuallyEdited: true });
                persistTextEditsNow({ silent: true, overrides: { styleGuideBindings: next } });
              }}
              placeholder={t('preview.jsonStyleGuidePlaceholder')}
              data-testid="preview-style-guide-input"
              rows={14}
              maxHeight="100%"
              resizable={false}
              showUploadButton={false}
              showImagePreview={false}
              slashActions={undefined}
              className="preview-json-editor min-h-[220px] flex-1 border-0 bg-transparent shadow-none focus-within:ring-0 focus-within:border-transparent dark:bg-transparent font-mono text-[13px] leading-6 [&_[role=textbox]]:pr-0 [&_[role=textbox]]:font-mono"
            />
          ) : (
            <MarkdownTextarea
              ref={descriptionTextareaRef}
              value={editDescription}
              onChange={(value: string) => {
                setEditDescription(value);
                persistCurrentPageDraft({ description: value });
                scheduleTextAutoSave({ description: value });
              }}
              onPaste={handleDescriptionPaste}
              onFiles={handleDescriptionFiles}
              onFocus={focusMainDescriptionField}
              onBlur={(value) => persistTextEditsNow({ silent: true, overrides: { description: value } })}
              placeholder={useRenovationPreviewForm ? t('preview.enterPageJson') : t('preview.enterDescription')}
              data-testid="preview-text-description-input"
              rows={useRenovationPreviewForm ? 14 : 8}
              maxHeight="100%"
              resizable={useRenovationPreviewForm ? false : true}
              showUploadButton={false}
              showImagePreview={!useRenovationPreviewForm}
              slashActions={descriptionSlashActions}
              className={useRenovationPreviewForm
                ? 'preview-json-editor min-h-[220px] flex-1 border-0 bg-transparent shadow-none focus-within:ring-0 focus-within:border-transparent dark:bg-transparent font-mono text-[13px] leading-6 [&_[role=textbox]]:pr-0 [&_[role=textbox]]:font-mono'
                : 'min-h-[200px] flex-1 border-0 bg-transparent shadow-none focus-within:ring-0 focus-within:border-transparent dark:bg-transparent [&_[role=textbox]]:pr-0'}
            />
          )}
          {useRenovationPreviewForm && renovationJsonViewMode === 'text' && (
            <div className="pointer-events-none absolute bottom-[-5px] left-0 right-0 z-20 flex items-center justify-end gap-2 px-2 sm:bottom-[-9px]">
              {showJsonRefineDialog && (
                <div className="pointer-events-auto min-w-0 flex-1 p-0 transition-all duration-300">
                  <div className="flex items-center gap-2">
                    <input
                      ref={jsonRefineInputRef}
                      value={jsonRefineRequirement}
                      onChange={(event) => setJsonRefineRequirement(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.nativeEvent as KeyboardEvent).isComposing) return;
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleSubmitJsonRefine();
                        }
                      }}
                      disabled={isJsonRefining}
                      placeholder={t('preview.refineJsonPlaceholder')}
                      className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400 focus:border-banana-400 focus:ring-2 focus:ring-banana-200/50 dark:border-border-primary dark:bg-background-primary dark:text-foreground-primary dark:placeholder:text-foreground-tertiary dark:focus:border-banana-500/70 dark:focus:ring-banana-500/20"
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={isJsonRefining}
                      disabled={!jsonRefineRequirement.trim()}
                      onClick={() => void handleSubmitJsonRefine()}
                      title={t('preview.refineJson')}
                      aria-label={t('preview.refineJson')}
                      icon={!isJsonRefining ? <Send size={14} /> : undefined}
                      className="h-10 w-10 rounded-lg border border-[#e6ca67] bg-white px-0 text-[#1f2937] shadow-sm hover:bg-[#fffdf2] dark:border-banana-500/50 dark:bg-background-secondary dark:text-foreground-primary dark:hover:bg-background-hover"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isJsonRefining}
                      onClick={() => setShowJsonRefineDialog(false)}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-slate-500 hover:bg-slate-50 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:bg-background-hover"
                    >
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              )}
              <div className="pointer-events-auto inline-flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<Sparkles size={14} />}
                  title={t('preview.refineJsonTooltip')}
                  aria-label={t('preview.refineJsonTooltip')}
                  onClick={() => setShowJsonRefineDialog((prev) => !prev)}
                  className="h-9 w-9 rounded-xl border border-slate-200 bg-white px-0 text-slate-600 shadow-sm hover:border-[#e6ca67] hover:bg-[#fffdf2] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/40 dark:hover:bg-background-hover"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<Send size={14} />}
                  title={t('preview.generateImage')}
                  aria-label={t('preview.generateImage')}
                  onClick={() => void handleGenerateCurrentPage()}
                  disabled={isJsonRefining || isSelectedPageGenerating}
                  className="h-9 w-9 rounded-xl border border-[#e6ca67] bg-white px-0 text-[#1f2937] shadow-sm hover:bg-[#fffdf2] disabled:opacity-50 dark:border-banana-500/50 dark:bg-background-secondary dark:text-foreground-primary dark:hover:bg-background-hover"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const externalFieldTags = (
    <div className="relative" ref={externalFieldPopoverRef}>
      {activeExternalField && (
        <div className="absolute bottom-full left-0 z-30 mb-3 w-[min(420px,100%)] rounded-2xl border border-[#e3d8b7] bg-[#fffaf0] p-4 shadow-[0_22px_48px_rgba(15,23,42,0.12)] ring-1 ring-[#f0e8d4] dark:border-[#2d3447] dark:bg-[#151a26] dark:shadow-[0_22px_48px_rgba(8,10,18,0.38)] dark:ring-[#252b3d]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-base font-semibold text-slate-900 dark:text-[#f5f7ff]">{activeExternalField}</div>
            <button
              type="button"
              onClick={() => setActiveExternalField(null)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#e8dec4] bg-white text-[#8f7f5b] transition-colors hover:border-[#d7c799] hover:text-slate-900 dark:border-[#343c52] dark:bg-[#0f1420] dark:text-[#8f98b3] dark:hover:border-[#46506b] dark:hover:text-[#f5f7ff]"
              aria-label="close external field popover"
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            value={editExtraFields[activeExternalField] || ''}
            onChange={(event) => {
              const value = event.target.value;
              setEditExtraFields((prev) => {
                const next = { ...prev, [activeExternalField]: value };
                persistCurrentPageDraft({ extraFields: next });
                scheduleTextAutoSave({ extraFields: next });
                return next;
              });
            }}
            rows={4}
            className="w-full appearance-none resize-none rounded-xl border border-[#e8dec4] bg-[#fffdf8] px-4 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-[#b8ae96] focus:border-banana-400/80 focus:ring-2 focus:ring-banana-400/15 dark:border-[#343c52] dark:bg-[#0f1420] dark:text-[#e2e8f0] dark:placeholder:text-[#66708c]"
            placeholder={`输入 ${activeExternalField}`}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canvasFieldNames.length === 0 ? (
          <span className="rounded-full border border-dashed border-slate-200 px-3 py-1.5 text-xs text-slate-400 dark:border-border-primary dark:text-foreground-tertiary">
            暂无字段
          </span>
        ) : canvasFieldNames.map((fieldName) => (
          <button
            key={fieldName}
            type="button"
            onClick={() => setActiveExternalField((prev) => prev === fieldName ? null : fieldName)}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeExternalField === fieldName
                ? 'border-banana-300 bg-banana-50 text-banana-700 dark:border-banana-500/60 dark:bg-banana-500/10 dark:text-banana'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:bg-background-hover'
            }`}
          >
            {fieldName}
          </button>
        ))}
      </div>
    </div>
  );

  const handlePreviewReferenceFocus = (reference: PageAiReference) => {
    setActivePreviewReferenceId(reference.id);
    if (reference.sourceType !== 'region' || !reference.regionBounds || !imageRef.current) {
      return;
    }
    setIsRegionSelectionMode(false);
    clearSelectionPreview();
    imageRef.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  };

  const handleUploadPageImage = useCallback(async (file: File) => {
    const targetPage = currentProject?.pages[selectedIndex];
    if (!targetPage?.id) return;

    setIsUploadingPageImage(true);
    try {
      await uploadPageImage(targetPage.id, file);
      show({ message: t('preview.uploadPageImageSuccess'), type: 'success' });
    } catch (error: any) {
      show({
        message: error?.response?.data?.error?.message || error?.message || t('preview.uploadPageImageFailed'),
        type: 'error',
      });
    } finally {
      setIsUploadingPageImage(false);
    }
  }, [currentProject?.pages, selectedIndex, show, t, uploadPageImage]);

  const currentPageDescriptionText = getDescriptionText(selectedPage?.description_content);
  const currentPageExtraFields = getDescriptionExtraFields(selectedPage?.description_content);
  const currentPageStyleGuideBindings = getDescriptionStyleGuideBindings(selectedPage?.description_content);
  const regionOverlayReferences = selectedContextImages.uploadedReferences.filter(
    (reference): reference is PageAiUploadedReference & { regionBounds: PageAiRegionBounds } =>
      reference.sourceType === 'region' && Boolean(reference.regionBounds)
  );
  const isCurrentPageDirty = Boolean(
    selectedPage && (
      editOutlineTitle !== (selectedPage.outline_content?.title || '') ||
      editOutlinePoints !== (selectedPage.outline_content?.points?.join('\n') || '') ||
      editDescription !== currentPageDescriptionText ||
      !areStringRecordsEqual(editExtraFields, currentPageExtraFields) ||
      !areStyleGuideBindingsEqual(editStyleGuideBindings, currentPageStyleGuideBindings)
    )
  );
  const textStatusLabel = isCurrentPageDirty ? '文本未保存' : '文本已保存';
  const imageStatusLabel = isSelectedPageGenerating
    ? t('preview.generating')
    : selectedPageHasImage
      ? '图片已生成'
      : t('preview.notGenerated');
  const generationStatusDetail = selectedPage?.status === 'QUEUED'
    ? '排队等待'
    : '正在渲染';
  const outlineQuickEditModalTitle = `${t('preview.outlineQuickEditTitle')} · ${t('preview.page', { num: (outlineQuickEditPageIndex >= 0 ? outlineQuickEditPageIndex : selectedIndex) + 1 })}`;

  const closeOutlineQuickEditModal = () => {
    setOutlineQuickEditPageId(null);
    setOutlineQuickEditMode('edit');
    setIsOutlineQuickGeneratePromptOpen(false);
    setOutlineQuickGeneratePrompt('');
  };

  const closeOutlineQuickGeneratePromptModal = () => {
    if (isOutlineQuickGeneratingDescription) return;
    setIsOutlineQuickGeneratePromptOpen(false);
  };

  return (
    <div className="h-dvh bg-gray-50 dark:bg-background-primary flex flex-col overflow-hidden">
      <SlidePreviewHeader
        t={t}
        navigate={navigate}
        fromHistory={fromHistory}
        projectId={projectId}
        isRefreshing={isRefreshing}
        handleRefresh={handleRefresh}
        setIsGlobalAiDrawerOpen={setIsGlobalAiDrawerOpen}
        setIsProjectSettingsOpen={setIsProjectSettingsOpen}
        openTemplateModal={openTemplateModal}
        setIsMaterialModalOpen={setIsMaterialModalOpen}
        exportTasks={exportTasks}
        exportTasksPanelRef={exportTasksPanelRef}
        showExportTasksPanel={showExportTasksPanel}
        setShowExportTasksPanel={setShowExportTasksPanel}
        setShowExportMenu={setShowExportMenu}
        currentProjectPages={currentProject?.pages || []}
        exportMenuRef={exportMenuRef}
        isExporting={isExporting}
        isMultiSelectMode={isMultiSelectMode}
        selectedPageCount={selectedPageIds.size}
        hasAllImages={hasAllImages}
        missingImageCount={missingImageCount}
        showExportMenu={showExportMenu}
        handleExport={handleExport}
        openVideoExportDialog={() => setShowVideoExportDialog(true)}
      />

      {/* 视频导出设置弹窗 */}
      {showVideoExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowVideoExportDialog(false)}>
          <div className="bg-white dark:bg-background-secondary rounded-xl shadow-xl p-6 w-[420px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5">{t('preview.videoExportTitle')}</h3>
            <div className="space-y-4">
              {/* 语音选择 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('preview.videoVoiceLabel')}</label>
                <select
                  value={videoVoice}
                  onChange={e => setVideoVoice(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-border-primary rounded-lg bg-white dark:bg-background-primary focus:outline-none focus:ring-2 focus:ring-banana-400"
                >
                  {VIDEO_VOICE_OPTIONS.map(group => (
                    <optgroup key={group.group} label={group.group}>
                      {group.voices.map(v => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {/* Ken Burns 动效 */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={videoEnableKenBurns}
                  onChange={e => setVideoEnableKenBurns(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-banana-500 focus:ring-banana-500"
                />
                <span className="text-sm">{t('preview.videoEnableKenBurns')}</span>
                <span className="relative group">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 text-[10px] text-gray-500 dark:text-gray-300 cursor-help">?</span>
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 text-xs text-white bg-gray-800 dark:bg-gray-700 rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    {t('preview.videoKenBurnsTip')}
                  </span>
                </span>
              </label>
              {/* 包含未配图页面 */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={videoIncludeNoImage}
                  onChange={e => setVideoIncludeNoImage(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-banana-500 focus:ring-banana-500"
                />
                <span className="text-sm">{t('preview.videoIncludeNoImage')}</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowVideoExportDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover rounded-lg transition-colors"
              >
                {t('preview.videoCancel')}
              </button>
              <button
                onClick={() => { setShowVideoExportDialog(false); handleExport('video'); }}
                className="px-4 py-2 text-sm bg-banana-500 text-white rounded-lg hover:bg-banana-600 transition-colors"
              >
                {t('preview.videoStartExport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-w-0 min-h-0">
        {/* 左侧：缩略图列表 */}
        <SlidePreviewSidebarShell
          t={t}
          currentPageCount={currentProject.pages.length}
          generatingImageCount={generatingImageCount}
          isMobileView={isMobileView}
          isResizingSidebar={isResizingSidebar}
          isSidebarCollapsed={isSidebarCollapsed}
          isSidebarCompact={isSidebarCompact}
          sidebarWidthPx={sidebarWidthPx}
          sidebarDefaultWidth={sidebarDefaultWidth}
          setSidebarWidthPxExpanded={setSidebarWidthPxExpanded}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          handleSidebarResizeStart={handleSidebarResizeStart}
          sidebarViewMode={sidebarViewMode}
          setSidebarViewMode={setSidebarViewMode}
          sidebarGridThumbMinPx={sidebarGridThumbMinPx}
          sidebarGridThumbMaxPx={sidebarGridThumbMaxPx}
          sidebarGridThumbMaxWidthPx={sidebarGridThumbMaxWidthPx}
          setSidebarGridThumbMaxWidthPx={setSidebarGridThumbMaxWidthPx}
        >

          <SlidePreviewSidebarContent
            t={t}
            pages={currentProject.pages}
            selectedIndex={selectedIndex}
            isMobileView={isMobileView}
            isSidebarCollapsed={isSidebarCollapsed}
            isSidebarCompact={isSidebarCompact}
            isSidebarGridMode={isSidebarGridMode}
            isMultiSelectMode={isMultiSelectMode}
            selectedPageIds={selectedPageIds}
            pagesWithImages={pagesWithImages}
            canReorderPreviewPages={canReorderPreviewPages}
            previewThumbnailSensors={previewThumbnailSensors}
            previewSortablePageIds={previewSortablePageIds}
            sidebarGridColumns={sidebarGridColumns}
            aspectRatio={aspectRatio}
            aspectRatioStyle={aspectRatioStyle}
            toggleMultiSelectMode={toggleMultiSelectMode}
            selectAllPages={selectAllPages}
            deselectAllPages={deselectAllPages}
            togglePageSelection={togglePageSelection}
            getPreviewSortablePageIndex={getPreviewSortablePageIndex}
            isPageGenerating={isPageGenerating}
            onSelectPageByIndex={handleSelectPageByIndex}
            onDeletePage={handleDeletePage}
            onInsertPageAfter={handleInsertPageAfter}
            onEditPage={handleEditPage}
            onPreviewThumbnailDragEnd={handlePreviewThumbnailDragEnd}
          />
        </SlidePreviewSidebarShell>

        <SlidePreviewMainPanel>
          <div
            data-testid="preview-secondary-toolbar"
            className="border-b border-gray-200 dark:border-border-primary bg-white/85 dark:bg-background-secondary/90 px-4 py-2 md:px-6 md:py-2.5"
          >
            <ReferenceFileList
              projectId={projectId}
              onFileClick={setPreviewFileId}
              className="mb-2"
              showToast={show}
            />
            <div className="mx-auto w-full max-w-6xl">
              <SlidePreviewEditorToolbar
                isDescriptionStreaming={isDescriptionStreaming}
                isDescriptionProgressVisible={isDescriptionProgressVisible}
                descriptionGenerationProgressPercent={descriptionGenerationProgressPercent}
                descriptionGenerationError={descriptionGenerationError}
                isRenovationProcessing={isRenovationProcessing}
                isGenerateDisabled={isGenerateDisabled}
                renovationProgress={renovationProgress}
                renovationProgressPercent={renovationProgressPercent}
                generateButtonText={generateButtonText}
                fileMenuOpen={fileMenuOpen}
                hasDescriptionContent={currentProject.pages.some((page) => page.description_content)}
                fileMenuRef={fileMenuRef}
                importFileRef={importFileRef}
                setFileMenuOpen={setFileMenuOpen}
                onGenerateDescriptions={() => void handleGenerateDescriptions()}
                onClearDescriptionGenerationError={() => setDescriptionGenerationError(null)}
                onGenerateAll={handleGenerateAll}
                onExportDescriptions={handleExportDescriptions}
                onExportFull={handleExportFull}
                onImportDescriptions={handleImportDescriptions}
              />
            </div>
          </div>

          {currentProject.pages.length === 0 ? (
            <SlidePreviewEmptyState
              t={t}
              projectId={projectId}
              onInsertFirstPage={() => void handleInsertPageAfter(undefined, -1)}
              onBackToOutline={(targetProjectId) => navigate(`/project/${targetProjectId}/outline`)}
            />
          ) : (
            <>
              <div className={`flex-1 min-h-0 overflow-hidden ${useRenovationPreviewForm ? 'px-2 pt-0 pb-0 md:px-3 md:pt-0 md:pb-0' : 'px-2 py-3 md:px-3 md:py-4'}`}>
                <div className="flex h-full w-full flex-col gap-4">
                  <div className="relative min-h-0 flex-1">
                    {!isMobileView && isEditorPaneHidden && (
                      <button
                        type="button"
                        onClick={() => setIsEditorPaneCollapsed((prev) => !prev)}
                        aria-label={isEditorPaneHidden ? t('preview.expandRightPanel') : t('preview.collapseRightPanel')}
                        title={isEditorPaneHidden ? t('preview.expandRightPanel') : t('preview.collapseRightPanel')}
                        className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d9c99d] bg-[#f9f2df] text-[#7c6840] shadow-sm transition-colors hover:bg-[#f6ebcf] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:bg-background-hover"
                      >
                        {isEditorPaneHidden ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                      </button>
                    )}
                    <div
                      ref={previewSplitContainerRef}
                      data-testid="preview-main-split"
                      className={`min-h-0 h-full ${isMobileView ? 'flex flex-col gap-4 overflow-y-auto' : 'grid overflow-hidden'}`}
                      style={!isMobileView
                        ? {
                          gridTemplateColumns: isEditorPaneHidden
                            ? 'minmax(0,1fr) 0px 0px'
                            : `minmax(${resolvedPreviewSplitMinWidths.visualMinWidth}px, ${Math.max(resolvedPreviewSplitRatio * 100, 1)}fr) ${PREVIEW_SPLIT_DIVIDER_PX}px minmax(${resolvedPreviewSplitMinWidths.editorMinWidth}px, ${Math.max((1 - resolvedPreviewSplitRatio) * 100, 1)}fr)`,
                        }
                        : undefined}
                    >
                    <SlidePreviewVisualPane
                      t={t}
                      selectedIndex={selectedIndex}
                      imageUrl={imageUrl}
                      selectedPageHasImage={selectedPageHasImage}
                      isFullscreen={isFullscreen}
                      isDraggingFloatingFullscreenButton={isDraggingFloatingFullscreenButton}
                      floatingFullscreenButtonPosition={floatingFullscreenButtonPosition}
                      aspectRatioStyle={aspectRatioStyle}
                      previewContainerRef={previewContainerRef}
                      imageRef={imageRef}
                      regionOverlayReferences={regionOverlayReferences}
                      activePreviewReferenceId={activePreviewReferenceId}
                      selectionRect={selectionRect}
                      imageVersions={imageVersions}
                      isUploadingPageImage={isUploadingPageImage}
                      onSelectionMouseDown={handleSelectionMouseDown}
                      onSelectionMouseMove={handleSelectionMouseMove}
                      onSelectionMouseUp={handleSelectionMouseUp}
                      onFloatingFullscreenButtonMouseDown={handleFloatingFullscreenButtonMouseDown}
                      onFloatingFullscreenButtonClick={handleFloatingFullscreenButtonClick}
                      onSwitchVersion={(versionId) => void handleSwitchVersion(versionId)}
                      onUploadPageImage={handleUploadPageImage}
                    />

                    {!isMobileView && !isEditorPaneHidden && (
                      <SlidePreviewSplitDivider
                        t={t}
                        isResizingPreviewSplit={isResizingPreviewSplit}
                        previewSplitHitAreaPx={PREVIEW_SPLIT_HIT_AREA_PX}
                        onResizeStart={handlePreviewSplitResizeStart}
                        onToggleEditorPane={() => setIsEditorPaneCollapsed((prev) => !prev)}
                      />
                    )}

                    <SlidePreviewEditorPane
                      t={t}
                      isEditorPaneHidden={isEditorPaneHidden}
                      isMobileView={isMobileView}
                      useRenovationPreviewForm={useRenovationPreviewForm}
                      shouldUseEditorVerticalSplit={shouldUseEditorVerticalSplit}
                      editorVerticalSplitContainerRef={editorVerticalSplitContainerRef}
                      resolvedEditorVerticalSplitRatio={resolvedEditorVerticalSplitRatio}
                      isResizingEditorVerticalSplit={isResizingEditorVerticalSplit}
                      editorCanvasContent={editorCanvasContent}
                      externalFieldTags={externalFieldTags}
                      pageAiMessages={pageAiMessages}
                      selectedPageAiReferences={selectedPageAiReferences}
                      activePreviewReferenceId={activePreviewReferenceId}
                      editPrompt={editPrompt}
                      pageAiTextareaRef={pageAiTextareaRef}
                      pageAiSlashActions={pageAiSlashActions}
                      editRunImageModel={editRunImageModel}
                      editRunImageModelOptions={editRunImageModelOptions}
                      isPageAiSubmitting={isPageAiSubmitting}
                      isRegionSelectionMode={isRegionSelectionMode}
                      historyVersionsCount={historyVersionsDescending.length}
                      onEditorVerticalSplitResizeStart={handleEditorVerticalSplitResizeStart}
                      onLinkedSplitResizeStart={handleLinkedSplitResizeStart}
                      onOpenHistory={handleOpenHistory}
                      onEditPromptChange={setEditPrompt}
                      onEditRunImageModelChange={setEditRunImageModel}
                      onPageAiSend={() => void handlePageAiSend()}
                      onToggleRegionSelect={() => {
                        setIsRegionSelectionMode((prev) => !prev);
                        clearSelectionPreview();
                      }}
                      onToggleTemplate={handleToggleTemplateReference}
                      onToggleDescriptionImage={handleToggleDescriptionImage}
                      onReferenceClick={handlePreviewReferenceFocus}
                      onRemoveReference={handleRemovePageAiReference}
                      onOpenMaterialSelector={projectId ? () => {
                        setMaterialSelectorMode('pageAi');
                        setIsMaterialSelectorOpen(true);
                      } : undefined}
                      onUploadFiles={handleFileUpload}
                    />
                  </div>
                </div>
              </div>
              </div>

              <PreviewStatusBar
                selectedIndex={selectedIndex}
                totalPages={currentProject.pages.length}
                isCurrentPageDirty={isCurrentPageDirty}
                textStatusLabel={textStatusLabel}
                isSelectedPageGenerating={isSelectedPageGenerating}
                generationStatusDetail={generationStatusDetail}
                selectedPageHasImage={selectedPageHasImage}
                imageStatusLabel={imageStatusLabel}
                t={t}
                onPrevPage={goPrevPage}
                onNextPage={goNextPage}
              />
            </>
          )}
        </SlidePreviewMainPanel>
      </div>
      <SlidePreviewTopOverlays
        t={t}
        toastContainer={<ToastContainer />}
        confirmDialog={ConfirmDialog}
        isGlobalAiDrawerOpen={isGlobalAiDrawerOpen}
        onCloseGlobalAiDrawer={() => setIsGlobalAiDrawerOpen(false)}
        onSubmitGlobalAi={handleAiRefineDescriptions}
        previewFileId={previewFileId}
        onClosePreviewFile={() => setPreviewFileId(null)}
        isOutlineQuickEditOpen={false}
        isOutlineQuickGeneratePromptOpen={isOutlineQuickGeneratePromptOpen}
        isOutlineQuickGeneratingDescription={isOutlineQuickGeneratingDescription}
        outlineQuickEditTitle={outlineQuickEditModalTitle}
        editOutlineTitle={editOutlineTitle}
        editOutlinePoints={editOutlinePoints}
        outlineQuickEditMode={outlineQuickEditMode}
        outlineQuickGeneratePrompt={outlineQuickGeneratePrompt}
        outlineQuickPointsTextareaRef={outlineQuickPointsTextareaRef}
        onCloseOutlineQuickEdit={closeOutlineQuickEditModal}
        onEditOutlineTitleChange={(value) => {
          setEditOutlineTitle(value);
          persistCurrentPageDraft({ title: value });
        }}
        onEditOutlineModeChange={setOutlineQuickEditMode}
        onEditOutlinePointsChange={(value) => {
          setEditOutlinePoints(value);
          persistCurrentPageDraft({ points: value });
        }}
        onOutlineQuickPointsPaste={handleOutlineQuickPointsPaste}
        onOpenGeneratePrompt={() => {
          setOutlineQuickGeneratePrompt('');
          setIsOutlineQuickGeneratePromptOpen(true);
        }}
        onSaveOutline={() => {
          handleSaveOutlineForQuickEditTarget();
          closeOutlineQuickEditModal();
        }}
        onCloseGeneratePrompt={closeOutlineQuickGeneratePromptModal}
        onOutlineQuickGeneratePromptChange={setOutlineQuickGeneratePrompt}
        onConfirmGeneratePrompt={() => void handleGenerateDescriptionForCurrentPage(outlineQuickGeneratePrompt)}
      />

      <SlidePreviewDialogs
        t={t}
        projectId={projectId}
        projectScenario={currentProject?.scenario || 'ppt'}
        isTemplateModalOpen={isTemplateModalOpen}
        closeTemplateModal={closeTemplateModal}
        activeTemplateTab={activeTemplateTab}
        setActiveTemplateTab={setActiveTemplateTab}
        draftTemplateSelection={draftTemplateSelection}
        setDraftTemplateSelection={setDraftTemplateSelection}
        appliedTemplateSelection={appliedTemplateSelection}
        currentProjectTemplateStyleJson={currentProject?.template_style_json || ''}
        handleApplyTemplateSelection={handleApplyTemplateSelection}
        isUploadingTemplate={isUploadingTemplate}
        isMaterialModalOpen={isMaterialModalOpen}
        setIsMaterialModalOpen={setIsMaterialModalOpen}
        isMaterialSelectorOpen={isMaterialSelectorOpen}
        setIsMaterialSelectorOpen={setIsMaterialSelectorOpen}
        handleSelectMaterials={handleSelectMaterials}
        isProjectSettingsOpen={isProjectSettingsOpen}
        setIsProjectSettingsOpen={setIsProjectSettingsOpen}
        extraRequirements={extraRequirements}
        templateStyle={templateStyle}
        onExtraRequirementsChange={(value) => {
          isEditingRequirements.current = true;
          setExtraRequirements(value);
        }}
        onTemplateStyleChange={(value) => {
          isEditingTemplateStyle.current = true;
          setTemplateStyle(value);
        }}
        handleSaveExtraRequirements={handleSaveExtraRequirements}
        handleSaveTemplateStyle={handleSaveTemplateStyle}
        isSavingRequirements={isSavingRequirements}
        isSavingTemplateStyle={isSavingTemplateStyle}
        generationMode={generationMode}
        extraFieldNames={extraFieldNames}
        availableFields={availableFields}
        imagePromptFields={imagePromptFields}
        descriptionRequirementsDraft={descriptionRequirementsDraft}
        presetDescriptionFields={DEFAULT_EXTRA_FIELDS}
        handleDescriptionGenerationModeChange={handleDescriptionGenerationModeChange}
        handleDescriptionExtraFieldsChange={handleDescriptionExtraFieldsChange}
        handleAvailableDescriptionFieldsChange={handleAvailableDescriptionFieldsChange}
        handleDescriptionImagePromptFieldsChange={handleDescriptionImagePromptFieldsChange}
        setDescriptionRequirementsDraft={setDescriptionRequirementsDraft}
        handleSaveDescriptionRequirements={handleSaveDescriptionRequirements}
        isSavingDescriptionRequirements={isSavingDescriptionRequirements}
        exportExtractorMethod={exportExtractorMethod}
        exportInpaintMethod={exportInpaintMethod}
        exportAllowPartial={exportAllowPartial}
        exportCompressEnabled={exportCompressEnabled}
        exportCompressFormat={exportCompressFormat}
        exportCompressQuality={exportCompressQuality}
        exportCompressPngQuantizeEnabled={exportCompressPngQuantizeEnabled}
        setExportExtractorMethod={setExportExtractorMethod}
        setExportInpaintMethod={setExportInpaintMethod}
        setExportAllowPartial={setExportAllowPartial}
        setExportCompressEnabled={setExportCompressEnabled}
        setExportCompressFormat={setExportCompressFormat}
        setExportCompressQuality={setExportCompressQuality}
        setExportCompressPngQuantizeEnabled={setExportCompressPngQuantizeEnabled}
        handleSaveExportSettings={handleSaveExportSettings}
        isSavingExportSettings={isSavingExportSettings}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        handleSaveAspectRatio={handleSaveAspectRatio}
        isSavingAspectRatio={isSavingAspectRatio}
        hasImages={hasImages}
        projectDefaultImageProvider={projectDefaultImageProvider}
        projectDefaultImageChannel={projectDefaultImageChannel}
        projectDefaultImageModel={projectDefaultImageModel}
        projectDefaultImageResolution={projectDefaultImageResolution}
        providerProfiles={providerProfiles}
        setProjectDefaultImageProvider={setProjectDefaultImageProvider}
        setProjectDefaultImageChannel={setProjectDefaultImageChannel}
        setProjectDefaultImageModel={setProjectDefaultImageModel}
        setProjectDefaultImageResolution={setProjectDefaultImageResolution}
        handleSaveGenerationDefaults={handleSaveGenerationDefaults}
        isSavingGenerationDefaults={isSavingGenerationDefaults}
        isHistoryModalOpen={isHistoryModalOpen}
        setIsHistoryModalOpen={setIsHistoryModalOpen}
        selectedIndex={selectedIndex}
        historyVersionsDescending={historyVersionsDescending}
        selectedHistoryVersion={selectedHistoryVersion}
        copiedHistoryVersionId={copiedHistoryVersionId}
        setSelectedHistoryVersionId={setSelectedHistoryVersionId}
        handleSwitchVersion={handleSwitchVersion}
        handleCopyHistoryPrompt={handleCopyHistoryPrompt}
        getHistoryOperationLabel={getHistoryOperationLabel}
        formatImageVersionTimestamp={formatImageVersionTimestamp}
        show1KWarningDialog={show1KWarningDialog}
        skip1KWarningChecked={skip1KWarningChecked}
        handleCancel1KWarning={handleCancel1KWarning}
        setSkip1KWarningChecked={setSkip1KWarningChecked}
        handleConfirm1KWarning={handleConfirm1KWarning}
        showBatchGenerateDialog={showBatchGenerateDialog}
        batchGenerateContext={batchGenerateContext}
        closeBatchGenerateDialog={closeBatchGenerateDialog}
        handleGenerateMissingImagesFromDialog={handleGenerateMissingImagesFromDialog}
        handleRegenerateAllImagesFromDialog={handleRegenerateAllImagesFromDialog}
        showBatchDescriptionGenerateDialog={showBatchDescriptionGenerateDialog}
        batchDescriptionGenerateContext={batchDescriptionGenerateContext}
        descriptionRangeStart={descriptionRangeStart}
        descriptionRangeEnd={descriptionRangeEnd}
        setDescriptionRangeStart={setDescriptionRangeStart}
        setDescriptionRangeEnd={setDescriptionRangeEnd}
        handleGenerateMissingDescriptionsFromDialog={handleGenerateMissingDescriptionsFromDialog}
        handleRegenerateAllDescriptionsFromDialog={handleRegenerateAllDescriptionsFromDialog}
        handleGenerateDescriptionsByRange={handleGenerateDescriptionsByRange}
        closeBatchDescriptionGenerateDialog={closeBatchDescriptionGenerateDialog}
      />

    </div>
  );
};
