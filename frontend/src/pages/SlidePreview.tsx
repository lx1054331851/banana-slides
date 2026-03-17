// TODO: split components
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useT } from '@/hooks/useT';
import { devLog } from '@/utils/logger';

// 组件内翻译
const previewI18n = {
  zh: {
    home: { title: '蕉幻' },
    nav: { home: '主页', materialGenerate: '素材生成' },
    slidePreview: {
      pageGenerating: "该页面正在生成中，请稍候...", generationStarted: "已开始生成图片，请稍候...",
      versionSwitched: "已切换到该版本", outlineSaved: "大纲和描述已保存",
      materialsAdded: "已添加 {{count}} 个素材", exportStarted: "导出任务已开始，可在导出任务面板查看进度",
      cannotRefresh: "无法刷新：缺少项目ID", refreshSuccess: "刷新成功",
      extraRequirementsSaved: "额外要求已保存", styleDescSaved: "风格描述已保存",
      exportSettingsSaved: "导出设置已保存", aspectRatioSaved: "画面比例已保存", loadTemplateFailed: "加载模版失败", templateChanged: "模版已更新",
      saveFailed: "保存失败: {{error}}", refreshFailed: "刷新失败，请稍后重试",
      loadMaterialFailed: "加载素材失败: {{error}}", templateChangeFailed: "选择模版失败: {{error}}",
      versionSwitchFailed: "切换失败: {{error}}", unknownError: "未知错误",
      regionCropSuccess: "已将选中区域添加到页面级 AI 引用，可继续输入修改要求后发送",
      regionCropFailed: "无法从当前图片裁剪区域（浏览器安全限制）。可以尝试手动上传参考图片。"
    },
    preview: {
      title: "预览", pageCount: "共 {{count}} 页", export: "导出",
      exportPptx: "导出为 PPTX", exportPdf: "导出为 PDF",
      exportEditablePptx: "导出可编辑 PPTX（Beta）", exportImages: "导出为图片",
      exportSelectedPages: "将导出选中的 {{count}} 页",
      regenerate: "重新生成", regenerating: "生成中...",
      editMode: "编辑模式", viewMode: "查看模式", page: "第 {{num}} 页",
      projectSettings: "项目设置", changeTemplate: "选择模版", refresh: "刷新",
      globalAiOpen: "打开 AI 助手",
      globalAiTitle: "AI 文档助手",
      globalAiSubtitle: "作为全局工具，统一修改整套页面描述与表达风格",
      globalAiWelcomeTitle: "让 AI 直接改整套文档",
      globalAiWelcomeDescription: "你可以用自然语言告诉我如何改写整个项目，例如统一语气、删除冗余页面重点、加强业务结论，或让内容更适合汇报场景。",
      globalAiSuggestionTone: "把整体改得更像高管汇报，语气更专业，结论更前置",
      globalAiSuggestionTrim: "删除重复表述，压缩每页文字长度，并突出关键指标",
      globalAiSuggestionFlow: "重写页面描述，让逻辑更连贯，页与页之间过渡更自然",
      globalAiPlaceholder: "例如：让全部页面更像董事会汇报，删除第 2 页冗余要点，强调成本收益和落地路径...",
      globalAiLoading: "正在更新整个项目的页面描述...",
      globalAiResponseFallback: "已根据你的要求更新整套文档描述，你可以继续追加修改。",
      globalAiErrorFallback: "修改失败，请稍后重试。",
      globalAiSubmitTooltip: "发送指令",
      globalAiInputHint: "Enter 发送，Shift+Enter 换行",
      batchGenerate: "批量生成图片 ({{count}})", generateSelected: "生成选中页面 ({{count}})",
      multiSelect: "多选", cancelMultiSelect: "取消多选", pagesUnit: "页",
      noPages: "还没有页面", noPagesHint: "可直接在本页添加页面，或返回编辑页继续完善内容", backToEdit: "返回编辑",
      generating: "正在生成中...", notGenerated: "尚未生成图片", generateThisPage: "生成此页",
      prevPage: "上一页", nextPage: "下一页", historyVersions: "历史版本",
      fullscreen: "全屏查看", exitFullscreen: "退出全屏",
      versions: "版本", version: "版本", current: "当前", editPage: "编辑页面",
      regionSelect: "区域选图", endRegionSelect: "结束区域选图",
      pageOutline: "页面大纲（可编辑）", pageDescription: "页面描述（可编辑）",
      refineDescription: "AI 优化", refineDescriptionTooltip: "AI 优化当前页描述",
      refinePlaceholder: "例如：让描述更具体，突出核心结论，改成更适合商务汇报的语气... · Enter 提交，Shift+Enter 换行",
      refineApplied: "AI 优化已应用到当前描述草稿", refineFailed: "页面描述优化失败，请稍后重试",
      enterTitle: "输入页面标题", pointsPerLine: "要点（每行一个）",
      enterPointsPerLine: "每行输入一个要点", enterDescription: "输入页面的详细描述内容",
      selectContextImages: "选择上下文图片（可选）", useTemplateImage: "使用模板图片",
      imagesInDescription: "描述中的图片", uploadImages: "上传图片",
      selectFromMaterials: "从素材库选择", upload: "上传",
      editRunImageModelLabel: "本次生成模型",
      editRunImageModelHint: "仅对本次生成生效，不会保存到项目设置",
      editPromptLabel: "输入修改指令(将自动添加页面描述)",
      editPromptPlaceholder: "例如：将框选区域内的素材移除、把背景改成蓝色、增大标题字号、更改文本框样式为虚线...",
      pageAiTitle: "页面级 AI 优化",
      pageAiSubtitle: "仅作用于当前页图片编辑/重生成，自动带入当前页描述上下文。",
      pageAiEmptyTitle: "先补充修改意图，再让 AI 处理当前页",
      pageAiEmptyDescription: "你可以引用框选区域、上传图片、素材库图片、模板图或描述内图片，再配合文字一起发送。",
      pageAiReferencesTitle: "当前引用",
      pageAiReferencesEmpty: "还没有引用内容。可先区域选图、上传图片，或从下方可用来源里加入引用。",
      pageAiDescriptionSourcesTitle: "描述内可用图片",
      pageAiTemplateReference: "模板图",
      pageAiMaterialReference: "素材库",
      pageAiUploadReference: "上传图片",
      pageAiLoading: "正在处理当前页图片...",
      pageAiSendTooltip: "发送到页面级 AI",
      pageAiInputHint: "Enter 发送，Shift+Enter 换行",
      pageAiResponseFallback: "已开始处理当前页图片，请稍候查看最新结果。",
      pageAiReferenceOnlyFallback: "请参考这些引用修改当前页图片。",
      saveOutlineOnly: "仅保存大纲/描述", generateImage: "生成图片",
      collapseSidebar: "收起左侧导航",
      expandSidebar: "展开左侧导航",
      addPage: "添加页面",
      addFirstPage: "添加第一页",
      insertAfterPage: "在此页后新增页面",
      addPageFailed: "新增页面失败",
      sidebarView: { list: "列表", grid: "网格" },
      gridZoomLabel: "网格缩放",
      gridZoomSmall: "小",
      gridZoomLarge: "大",
      templateModalDesc: "选择一个新的模版将应用到后续 PPT 页面生成，不影响已经生成的页面。",
      styleSaved: "风格描述已保存",
      uploadingTemplate: "正在上传模板...",
      resolution1KWarning: "1K分辨率警告",
      resolution1KWarningText: "当前使用 1K 分辨率 生成图片，可能导致渲染的文字乱码或模糊。",
      resolution1KWarningHint: "建议在「系统设置」中切换到 2K 或 4K 分辨率以获得更清晰的效果。",
      dontShowAgain: "不再提示", generateAnyway: "仍然生成",
      confirmRegenerateSelected: "将重新生成选中的 {{count}} 页（历史记录将会保存），确定继续吗？",
      confirmRegenerateAll: "将重新生成所有页面（历史记录将会保存），确定继续吗？",
      confirmRegenerateTitle: "确认重新生成",
      confirmGenerateAllTitle: "确认生成",
      confirmGenerateAll: "尚未生成任何图片，将生成全部 {{count}} 页。确定继续吗？",
      confirmPartialGenerateTitle: "选择生成范围",
      confirmPartialGenerateMessage: "已生成 {{generated}}/{{total}} 页图片。请选择仅生成未生成的 {{missing}} 页，或重新生成全部 {{total}} 页（历史记录将会保存）。",
      confirmPartialGenerateWithGeneratingMessage: "已生成 {{generated}}/{{total}} 页图片，另有 {{generating}} 页正在生成中。请选择仅生成未生成的 {{missing}} 页，或重新生成全部 {{total}} 页（历史记录将会保存）。",
      generatingInProgress: "已有 {{count}} 页正在生成中，请稍候...",
      deleteFailed: "删除页面失败",
      confirmDeletePage: "确定要删除这一页吗？",
      confirmDeleteTitle: "确认删除",
      generateMissingOnly: "仅生成未生成的 {{count}} 页",
      regenerateAllPages: "重新生成全部 {{count}} 页",
      generationFailed: "生成失败",
      disabledExportTip: "还有 {{count}} 页未生成图片，请先生成所有页面图片",
      disabledEditTip: "请先生成该页图片",
      messages: {
        exportSuccess: "导出成功", exportFailed: "导出失败",
        regenerateSuccess: "重新生成完成", regenerateFailed: "重新生成失败",
        loadingProject: "加载项目中...", processing: "处理中...",
        generatingBackgrounds: "正在生成干净背景...", creatingPdf: "正在创建PDF...",
        parsingContent: "正在解析内容...", creatingPptx: "正在创建可编辑PPTX...", complete: "完成！"
      }
    },
    outline: {
      titleLabel: "标题",
      keyPoints: "要点"
    }
  },
  en: {
    home: { title: 'Banana Slides' },
    nav: { home: 'Home', materialGenerate: 'Generate Material' },
    slidePreview: {
      pageGenerating: "This page is generating, please wait...", generationStarted: "Image generation started, please wait...",
      versionSwitched: "Switched to this version", outlineSaved: "Outline and description saved",
      materialsAdded: "Added {{count}} material(s)", exportStarted: "Export task started, check progress in export tasks panel",
      cannotRefresh: "Cannot refresh: Missing project ID", refreshSuccess: "Refresh successful",
      extraRequirementsSaved: "Extra requirements saved", styleDescSaved: "Style description saved",
      exportSettingsSaved: "Export settings saved", aspectRatioSaved: "Aspect ratio saved", loadTemplateFailed: "Failed to load template", templateChanged: "Template updated",
      saveFailed: "Save failed: {{error}}", refreshFailed: "Refresh failed, please try again later",
      loadMaterialFailed: "Failed to load material: {{error}}", templateChangeFailed: "Failed to select template: {{error}}",
      versionSwitchFailed: "Switch failed: {{error}}", unknownError: "Unknown error",
      regionCropSuccess: "Selected region added to page-level AI references. You can continue typing and send it.",
      regionCropFailed: "Cannot crop from current image (browser security restriction). Try uploading a reference image manually."
    },
    preview: {
      title: "Preview", pageCount: "{{count}} pages", export: "Export",
      exportPptx: "Export as PPTX", exportPdf: "Export as PDF",
      exportEditablePptx: "Export Editable PPTX (Beta)", exportImages: "Export as Images",
      exportSelectedPages: "Will export {{count}} selected page(s)",
      regenerate: "Regenerate", regenerating: "Generating...",
      editMode: "Edit Mode", viewMode: "View Mode", page: "Page {{num}}",
      projectSettings: "Project Settings", changeTemplate: "Select Template", refresh: "Refresh",
      globalAiOpen: "Open AI Assistant",
      globalAiTitle: "AI Document Assistant",
      globalAiSubtitle: "A global tool to refine the full deck's descriptions and narrative style",
      globalAiWelcomeTitle: "Let AI rewrite the whole deck",
      globalAiWelcomeDescription: "Use natural language to revise the project globally, such as aligning tone, removing redundant points, strengthening business conclusions, or making the content more presentation-ready.",
      globalAiSuggestionTone: "Rewrite the deck in a more executive presentation tone with conclusions first",
      globalAiSuggestionTrim: "Remove repetitive wording, shorten each page, and highlight the key metrics",
      globalAiSuggestionFlow: "Rewrite the page descriptions so the story flows more naturally from page to page",
      globalAiPlaceholder: "e.g. Make the whole deck sound more executive, remove redundant points from page 2, and emphasize ROI and delivery path...",
      globalAiLoading: "Updating descriptions across the whole project...",
      globalAiResponseFallback: "The deck descriptions have been updated based on your request. You can keep refining.",
      globalAiErrorFallback: "Update failed. Please try again.",
      globalAiSubmitTooltip: "Send instruction",
      globalAiInputHint: "Enter to send, Shift+Enter for newline",
      batchGenerate: "Batch Generate Images ({{count}})", generateSelected: "Generate Selected ({{count}})",
      multiSelect: "Multi-select", cancelMultiSelect: "Cancel Multi-select", pagesUnit: " pages",
      noPages: "No pages yet", noPagesHint: "You can add pages directly here, or go back to editor", backToEdit: "Back to Editor",
      generating: "Generating...", notGenerated: "Image not generated yet", generateThisPage: "Generate This Page",
      prevPage: "Previous", nextPage: "Next", historyVersions: "History Versions",
      fullscreen: "Fullscreen", exitFullscreen: "Exit Fullscreen",
      versions: "Versions", version: "Version", current: "Current", editPage: "Edit Page",
      regionSelect: "Region Select", endRegionSelect: "End Region Select",
      pageOutline: "Page Outline (Editable)", pageDescription: "Page Description (Editable)",
      refineDescription: "AI Refine", refineDescriptionTooltip: "Refine current page description with AI",
      refinePlaceholder: "e.g., Make the description more specific, highlight the key conclusion, and use a business presentation tone... · Enter to submit, Shift+Enter for newline",
      refineApplied: "AI refinement applied to the current draft", refineFailed: "Failed to refine page description",
      enterTitle: "Enter page title", pointsPerLine: "Key Points (one per line)",
      enterPointsPerLine: "Enter one key point per line", enterDescription: "Enter detailed page description",
      selectContextImages: "Select Context Images (Optional)", useTemplateImage: "Use Template Image",
      imagesInDescription: "Images in Description", uploadImages: "Upload Images",
      selectFromMaterials: "Select from Materials", upload: "Upload",
      editRunImageModelLabel: "Model For This Run",
      editRunImageModelHint: "Only applies to this generation and will not be saved to project settings.",
      editPromptLabel: "Enter edit instructions (page description will be auto-added)",
      editPromptPlaceholder: "e.g., Remove elements in selected area, change background to blue, increase title font size, change text box style to dashed...",
      pageAiTitle: "Page AI Optimize",
      pageAiSubtitle: "Only affects the current page image and automatically uses the current page description as context.",
      pageAiEmptyTitle: "Add intent, then let AI work on this page",
      pageAiEmptyDescription: "Reference a selected region, uploaded image, material library image, template image, or description image, then send them with text.",
      pageAiReferencesTitle: "Current References",
      pageAiReferencesEmpty: "No references yet. Select a region, upload an image, or add one from the available sources below.",
      pageAiDescriptionSourcesTitle: "Images From Description",
      pageAiTemplateReference: "Template Image",
      pageAiMaterialReference: "Materials",
      pageAiUploadReference: "Upload Image",
      pageAiLoading: "Processing the current page image...",
      pageAiSendTooltip: "Send to page AI",
      pageAiInputHint: "Enter to send, Shift+Enter for newline",
      pageAiResponseFallback: "Started processing the current page image. Please check back shortly.",
      pageAiReferenceOnlyFallback: "Please update the current page image using these references.",
      saveOutlineOnly: "Save Outline/Description Only", generateImage: "Generate Image",
      collapseSidebar: "Collapse sidebar",
      expandSidebar: "Expand sidebar",
      addPage: "Add Page",
      addFirstPage: "Add First Page",
      insertAfterPage: "Insert page after this one",
      addPageFailed: "Failed to add page",
      sidebarView: { list: "List", grid: "Grid" },
      gridZoomLabel: "Grid Zoom",
      gridZoomSmall: "Small",
      gridZoomLarge: "Large",
      templateModalDesc: "Selecting a new template will apply to future PPT page generation without affecting pages that already exist.",
      styleSaved: "Style description saved",
      uploadingTemplate: "Uploading template...",
      resolution1KWarning: "1K Resolution Warning",
      resolution1KWarningText: "Currently using 1K resolution for image generation, which may cause garbled or blurry text.",
      resolution1KWarningHint: "It's recommended to switch to 2K or 4K resolution in \"Settings\" for clearer results.",
      dontShowAgain: "Don't show again", generateAnyway: "Generate Anyway",
      confirmRegenerateSelected: "Will regenerate {{count}} selected page(s) (history will be saved). Continue?",
      confirmRegenerateAll: "Will regenerate all pages (history will be saved). Continue?",
      confirmRegenerateTitle: "Confirm Regenerate",
      confirmGenerateAllTitle: "Confirm Generate",
      confirmGenerateAll: "No images have been generated yet. Generate all {{count}} page(s)?",
      confirmPartialGenerateTitle: "Choose Scope",
      confirmPartialGenerateMessage: "{{generated}}/{{total}} page(s) already have images. Generate only the {{missing}} missing page(s), or regenerate all {{total}} page(s) (history will be saved).",
      confirmPartialGenerateWithGeneratingMessage: "{{generated}}/{{total}} page(s) already have images, and {{generating}} page(s) are still generating. Generate only the {{missing}} missing page(s), or regenerate all {{total}} page(s) (history will be saved).",
      generatingInProgress: "{{count}} page(s) are generating. Please wait...",
      deleteFailed: "Failed to delete page",
      confirmDeletePage: "Are you sure you want to delete this page?",
      confirmDeleteTitle: "Confirm Delete",
      generateMissingOnly: "Generate Missing ({{count}})",
      regenerateAllPages: "Regenerate All ({{count}})",
      generationFailed: "Generation failed",
      disabledExportTip: "{{count}} page(s) have no images yet. Please generate all page images first",
      disabledEditTip: "Please generate this page's image first",
      messages: {
        exportSuccess: "Export successful", exportFailed: "Export failed",
        regenerateSuccess: "Regeneration complete", regenerateFailed: "Failed to regenerate",
        loadingProject: "Loading project...", processing: "Processing...",
        generatingBackgrounds: "Generating clean backgrounds...", creatingPdf: "Creating PDF...",
        parsingContent: "Parsing content...", creatingPptx: "Creating editable PPTX...", complete: "Complete!"
      }
    },
    outline: {
      titleLabel: "Title",
      keyPoints: "Key Points"
    }
  }
};
import {
  Home,
  ArrowLeft,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ChevronDown,
  X,
  Trash2,
  Upload,
  Image as ImageIcon,
  ImagePlus,
  Settings,
  CheckSquare,
  Square,
  Check,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  List,
  LayoutGrid,
  FileText,
  Settings2,
  HelpCircle,
  ArrowUpDown,
  BookOpen,
} from 'lucide-react';
import {
  Button,
  Loading,
  Modal,
  Textarea,
  useToast,
  useConfirm,
  MaterialSelector,
  ProjectSettingsModal,
  ExportTasksPanel,
  FilePreviewModal,
  ReferenceFileList,
  CoverEndingInfoModal,
  GlobalAiAssistantDrawer,
  PageAiWorkbench,
} from '@/components/shared';
import { MaterialGeneratorModal } from '@/components/shared/MaterialGeneratorModal';
import {
  TemplateSelector,
  getTemplateFile,
  type TemplateSource,
  type TemplateSelectorTab,
  type TemplateSelection,
  type AppliedTemplateSelection,
} from '@/components/shared/TemplateSelector';
import { listUserTemplates, type UserTemplate } from '@/api/endpoints';
import { materialUrlToFile } from '@/components/shared/MaterialSelector';
import type { Material } from '@/api/endpoints';
import { SlideCard } from '@/components/preview/SlideCard';
import { useProjectStore } from '@/store/useProjectStore';
import { useExportTasksStore, type ExportTaskType } from '@/store/useExportTasksStore';
import { getImageUrl } from '@/api/client';
import {
  getPageImageVersions,
  setCurrentImageVersion,
  updateProject,
  uploadTemplate,
  exportPPTXTask as apiExportPPTXTask,
  exportPDFTask as apiExportPDFTask,
  exportImagesTask as apiExportImagesTask,
  exportEditablePPTX as apiExportEditablePPTX,
  getSettings,
  refineDescriptions,
  detectCoverEndingFields,
  addPage,
  updatePageDescription,
  getTaskStatus,
  updateSettings,
} from '@/api/endpoints';
import type {
  ImageVersion,
  DescriptionContent,
  ExportExtractorMethod,
  ExportInpaintMethod,
  Page,
  GenerationOverride,
  CoverEndingFieldDetect,
  PresentationMeta,
  PageAiMessage,
  PageAiReference,
  PageAiRegionBounds,
} from '@/types';
import { normalizeErrorMessage } from '@/utils';
import {
  exportProjectToMarkdown,
  parseMarkdownPages,
  getDescriptionText,
  applyPresentationMetaToDescription,
  parsePresentationMeta,
} from '@/utils/projectUtils';
import {
  PROJECT_DEFAULT_IMAGE_MODEL,
  PROJECT_DEFAULT_IMAGE_SOURCE,
  PROJECT_DEFAULT_IMAGE_RESOLUTION,
  PROJECT_SUPPORTED_IMAGE_MODELS,
  normalizeProjectDefaultImageModel,
  normalizeProjectDefaultImageResolution,
} from '@/config/projectAiDefaults';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DEFAULT_EXTRA_FIELDS = ['视觉元素', '视觉焦点', '排版布局', '演讲者备注'];
const PRESET_EXTRA_FIELDS = new Set(DEFAULT_EXTRA_FIELDS);
const PREVIEW_SPLIT_STORAGE_KEY = 'previewSplitRatio';
const PREVIEW_SPLIT_DEFAULT_RATIO = 0.45;
const PREVIEW_SPLIT_DIVIDER_PX = 12;
const PREVIEW_VISUAL_MIN_WIDTH = 360;
const PREVIEW_EDITOR_MIN_WIDTH = 420;
const FLOATING_FULLSCREEN_BUTTON_SIZE = 44;

type PageDraft = {
  title: string;
  points: string;
  description: string;
  extraFields: Record<string, string>;
};

type PageAiUploadedReference = {
  id: string;
  sourceType: 'region' | 'upload' | 'material';
  file: File;
  previewUrl: string;
  label: string;
  regionBounds?: PageAiRegionBounds;
};

type PageAiContextState = {
  draftInput: string;
  messages: PageAiMessage[];
  model: string;
  contextImages: {
    useTemplate: boolean;
    descImageUrls: string[];
    uploadedReferences: PageAiUploadedReference[];
  };
};

const createPageAiMessage = (
  role: PageAiMessage['role'],
  content: string,
  attachments: PageAiReference[] = [],
  tone: PageAiMessage['tone'] = 'default',
): PageAiMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
  tone,
  attachments,
});

const createUploadedReference = (
  file: File,
  sourceType: PageAiUploadedReference['sourceType'],
  label: string = file.name,
  meta?: Pick<PageAiUploadedReference, 'regionBounds'>,
): PageAiUploadedReference => ({
  id: `${sourceType}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  sourceType,
  file,
  previewUrl: URL.createObjectURL(file),
  label,
  ...meta,
});

const getPageDraftKey = (page?: Page | null, index = 0): string | null => {
  if (!page) return null;
  return page.id || page.page_id || `index-${index}`;
};

const getDescriptionExtraFields = (
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

const serializeExtraFields = (fields: Record<string, string>): Record<string, string> | undefined => {
  const entries = Object.entries(fields)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key && value);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

const areStringRecordsEqual = (left: Record<string, string>, right: Record<string, string>): boolean => {
  const leftKeys = Object.keys(left).filter((key) => left[key]?.trim());
  const rightKeys = Object.keys(right).filter((key) => right[key]?.trim());
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => (left[key] || '').trim() === (right[key] || '').trim());
};

const SortableFieldPill: React.FC<{
  name: string;
  active: boolean;
  removable?: boolean;
  inImagePrompt?: boolean;
  imagePromptTooltip?: string;
  onToggle: () => void;
  onRemove: () => void;
  onToggleImagePrompt?: () => void;
}> = ({ name, active, onToggle, onRemove, removable = true, inImagePrompt, imagePromptTooltip, onToggleImagePrompt }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: name });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      className={`group inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border cursor-grab active:cursor-grabbing ${
        active
          ? 'bg-banana-50 dark:bg-banana-900/20 border-banana-300 dark:border-banana-700 text-banana-700 dark:text-banana-400'
          : 'bg-gray-50 dark:bg-background-hover border-gray-200 dark:border-border-primary text-gray-400 dark:text-foreground-tertiary line-through'
      }`}
      onClick={onToggle}
    >
      {name}
      {active && onToggleImagePrompt && (
        <span
          role="button"
          className={`relative group/img ml-0.5 transition-colors ${inImagePrompt ? 'text-banana-500' : 'text-gray-300 dark:text-gray-600'}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleImagePrompt();
          }}
        >
          <ImageIcon size={10} />
          {imagePromptTooltip && (
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-40 px-2 py-1 text-[10px] leading-snug text-gray-600 dark:text-foreground-secondary bg-white dark:bg-background-primary border border-gray-200 dark:border-border-primary rounded-md shadow-md opacity-0 pointer-events-none group-hover/img:opacity-100 transition-opacity z-50">
              {imagePromptTooltip}
            </span>
          )}
        </span>
      )}
      {!active && removable && (
        <span
          role="button"
          className="opacity-0 group-hover:opacity-100 ml-0.5 text-gray-400 hover:text-red-500 transition-all"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <X size={10} />
        </span>
      )}
    </button>
  );
};

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
    saveAllPages,
    deletePageById,
    updatePageLocal,
    insertPageAt,
    isGlobalLoading,
    taskProgress,
    pageGeneratingTasks,
    warningMessage,
  } = useProjectStore();
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

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
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === 'undefined') return 1200;
    return window.innerWidth;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarViewMode, setSidebarViewMode] = useState<'list' | 'grid'>(() => {
    try {
      const stored = localStorage.getItem('previewSidebarViewMode');
      return stored === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });
  const [sidebarGridThumbMaxWidthPx, setSidebarGridThumbMaxWidthPx] = useState(() => {
    try {
      const stored = Number(localStorage.getItem('previewSidebarGridThumbMaxWidthPx'));
      if (Number.isFinite(stored) && stored >= sidebarGridThumbMinPx && stored <= sidebarGridThumbMaxPx) {
        return stored;
      }
    } catch {
      // ignore storage errors
    }
    return sidebarGridThumbDefaultPx;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarWidthPxExpanded, setSidebarWidthPxExpanded] = useState(sidebarDefaultWidth);
  const sidebarResizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarResizeRafRef = useRef<number | null>(null);
  const sidebarResizePendingRef = useRef<number | null>(null);
  const [previewSplitRatio, setPreviewSplitRatio] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(PREVIEW_SPLIT_STORAGE_KEY));
      if (Number.isFinite(stored) && stored > 0.2 && stored < 0.8) {
        return stored;
      }
    } catch {
      // ignore storage errors
    }
    return PREVIEW_SPLIT_DEFAULT_RATIO;
  });
  const [previewSplitContainerWidth, setPreviewSplitContainerWidth] = useState(0);
  const [isResizingPreviewSplit, setIsResizingPreviewSplit] = useState(false);
  const previewSplitContainerRef = useRef<HTMLDivElement | null>(null);
  const previewSplitResizeRef = useRef<{ startX: number; startWidth: number; availableWidth: number } | null>(null);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [isRenovationProcessing, setIsRenovationProcessing] = useState(false);
  const [renovationProgress, setRenovationProgress] = useState<{ total: number; completed: number } | null>(null);
  const [detectFields, setDetectFields] = useState<CoverEndingFieldDetect[]>([]);
  const [isCoverEndingModalOpen, setIsCoverEndingModalOpen] = useState(false);
  const [coverEndingModalMode, setCoverEndingModalMode] = useState<'missing' | 'all'>('missing');
  const [isCheckingCoverEnding, setIsCheckingCoverEnding] = useState(false);
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [descriptionRequirementsDraft, setDescriptionRequirementsDraft] = useState('');
  const [isSavingDescriptionRequirements, setIsSavingDescriptionRequirements] = useState(false);
  const [pageDrafts, setPageDrafts] = useState<Record<string, PageDraft>>({});
  // 页面挂载时恢复正在进行的导出任务（页面刷新后）
  useEffect(() => {
    restoreActiveTasks();
  }, [restoreActiveTasks]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      setIsMobileView(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobileView && isSidebarCollapsed) {
      setSidebarWidthPxExpanded(sidebarDefaultWidth);
      setIsSidebarCollapsed(false);
    }
  }, [isMobileView, isSidebarCollapsed, sidebarDefaultWidth]);

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    if (!page) {
      if (lastSelectedPageKeyRef.current !== null) {
        lastSelectedPageKeyRef.current = null;
        setEditOutlineTitle('');
        setEditOutlinePoints('');
        setEditDescription('');
        setEditExtraFields({});
      }
      return;
    }

    const pageKey = getPageDraftKey(page, selectedIndex);
    if (!pageKey) return;
    if (pageKey === lastSelectedPageKeyRef.current) return;
    lastSelectedPageKeyRef.current = pageKey;

    const pageDraft = pageDrafts[pageKey];
    if (pageDraft) {
      setEditOutlineTitle(pageDraft.title);
      setEditOutlinePoints(pageDraft.points);
      setEditDescription(pageDraft.description);
      setEditExtraFields(pageDraft.extraFields);
      return;
    }

    setEditOutlineTitle(page.outline_content?.title || '');
    setEditOutlinePoints(page.outline_content?.points?.join('\n') || '');
    setEditDescription(getDescriptionText(page.description_content));
    setEditExtraFields(getDescriptionExtraFields(page.description_content));
  }, [currentProject, selectedIndex, pageDrafts]);

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) {
      setEditPrompt('');
      setPageAiMessages([]);
      setEditRunImageModel(PROJECT_DEFAULT_IMAGE_MODEL);
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedReferences: [],
      });
      return;
    }

    const cached = editContextByPage[pageId];
    if (!cached) {
      setEditPrompt('');
      setPageAiMessages([]);
      setEditRunImageModel(PROJECT_DEFAULT_IMAGE_MODEL);
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedReferences: [],
      });
      return;
    }

    setEditPrompt(cached.draftInput);
    setPageAiMessages(cached.messages);
    setEditRunImageModel(cached.model);
    setSelectedContextImages({
      useTemplate: cached.contextImages.useTemplate,
      descImageUrls: [...cached.contextImages.descImageUrls],
      uploadedReferences: [...cached.contextImages.uploadedReferences],
    });
  }, [currentProject?.id, selectedIndex]);

  const sidebarCollapsedWidth = 72;
  const sidebarMinWidth = sidebarCollapsedWidth;
  const sidebarMaxWidth = Math.round(viewportWidth * (2 / 3));
  const sidebarWidthPx = isSidebarCollapsed ? sidebarCollapsedWidth : sidebarWidthPxExpanded;

  useEffect(() => {
    try {
      localStorage.setItem('previewSidebarViewMode', sidebarViewMode);
    } catch {
      // ignore storage errors
    }
  }, [sidebarViewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('previewSidebarGridThumbMaxWidthPx', String(sidebarGridThumbMaxWidthPx));
    } catch {
      // ignore storage errors
    }
  }, [sidebarGridThumbMaxWidthPx]);

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_SPLIT_STORAGE_KEY, String(previewSplitRatio));
    } catch {
      // ignore storage errors
    }
  }, [previewSplitRatio]);

  useEffect(() => {
    if (!viewportWidth) return;
    setSidebarWidthPxExpanded((prev) =>
      Math.min(Math.max(prev, sidebarMinWidth), sidebarMaxWidth)
    );
  }, [viewportWidth, sidebarMinWidth, sidebarMaxWidth]);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMove = (e: MouseEvent) => {
      if (!sidebarResizeStartRef.current) return;
      const delta = e.clientX - sidebarResizeStartRef.current.startX;
      const nextWidth = sidebarResizeStartRef.current.startWidth + delta;
      sidebarResizePendingRef.current = nextWidth;
      if (sidebarResizeRafRef.current !== null) return;
      sidebarResizeRafRef.current = window.requestAnimationFrame(() => {
        sidebarResizeRafRef.current = null;
        const pendingWidth = sidebarResizePendingRef.current;
        sidebarResizePendingRef.current = null;
        if (pendingWidth === null) return;
        const clampedWidth = Math.min(
          Math.max(pendingWidth, sidebarMinWidth),
          sidebarMaxWidth
        );
        if (clampedWidth <= sidebarCollapsedWidth) {
          if (!isSidebarCollapsed) {
            setIsSidebarCollapsed(true);
          }
        } else if (isSidebarCollapsed) {
          setIsSidebarCollapsed(false);
        }
        setSidebarWidthPxExpanded((prev) => (prev === clampedWidth ? prev : clampedWidth));
      });
    };
    const handleUp = () => {
      setIsResizingSidebar(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
      if (sidebarResizeRafRef.current !== null) {
        cancelAnimationFrame(sidebarResizeRafRef.current);
        sidebarResizeRafRef.current = null;
      }
      sidebarResizePendingRef.current = null;
    };
  }, [
    isResizingSidebar,
    sidebarMinWidth,
    sidebarMaxWidth,
    isSidebarCollapsed,
  ]);

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    sidebarResizeStartRef.current = {
      startX: e.clientX,
      startWidth: isSidebarCollapsed ? sidebarCollapsedWidth : sidebarWidthPxExpanded,
    };
    setIsResizingSidebar(true);
  };

  useEffect(() => {
    const node = previewSplitContainerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => {
      setPreviewSplitContainerWidth(node.getBoundingClientRect().width);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sidebarWidthPx, isMobileView, currentProject?.id]);

  const resolvedPreviewSplitRatio = useMemo(() => {
    if (isMobileView) return PREVIEW_SPLIT_DEFAULT_RATIO;
    if (!previewSplitContainerWidth) return previewSplitRatio;

    const availableWidth = Math.max(1, previewSplitContainerWidth - PREVIEW_SPLIT_DIVIDER_PX);
    const minRatio = PREVIEW_VISUAL_MIN_WIDTH / availableWidth;
    const maxRatio = (availableWidth - PREVIEW_EDITOR_MIN_WIDTH) / availableWidth;
    const clampedMin = Math.min(Math.max(minRatio, 0.2), 0.8);
    const clampedMax = Math.max(clampedMin, Math.min(maxRatio, 0.8));
    return Math.min(Math.max(previewSplitRatio, clampedMin), clampedMax);
  }, [isMobileView, previewSplitContainerWidth, previewSplitRatio]);

  useEffect(() => {
    if (!isResizingPreviewSplit) return;

    const handleMove = (event: MouseEvent) => {
      const resizeState = previewSplitResizeRef.current;
      if (!resizeState) return;
      const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);
      const clampedWidth = Math.min(
        Math.max(nextWidth, PREVIEW_VISUAL_MIN_WIDTH),
        Math.max(PREVIEW_VISUAL_MIN_WIDTH, resizeState.availableWidth - PREVIEW_EDITOR_MIN_WIDTH)
      );
      setPreviewSplitRatio(clampedWidth / resizeState.availableWidth);
    };

    const handleUp = () => {
      setIsResizingPreviewSplit(false);
      previewSplitResizeRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
    };
  }, [isResizingPreviewSplit]);

  const handlePreviewSplitResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isMobileView || !previewSplitContainerRef.current) return;
    event.preventDefault();
    const containerWidth = previewSplitContainerRef.current.getBoundingClientRect().width;
    const availableWidth = Math.max(1, containerWidth - PREVIEW_SPLIT_DIVIDER_PX);
    previewSplitResizeRef.current = {
      startX: event.clientX,
      startWidth: availableWidth * resolvedPreviewSplitRatio,
      availableWidth,
    };
    setIsResizingPreviewSplit(true);
  }, [isMobileView, resolvedPreviewSplitRatio]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<TemplateSelectorTab>('image');
  const [draftTemplateSelection, setDraftTemplateSelection] = useState<TemplateSelection | null>(null);
  const [appliedTemplateSelection, setAppliedTemplateSelection] = useState<AppliedTemplateSelection | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  // 大纲和描述编辑状态
  const [editOutlineTitle, setEditOutlineTitle] = useState('');
  const [editOutlinePoints, setEditOutlinePoints] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editExtraFields, setEditExtraFields] = useState<Record<string, string>>({});
  const [activeExternalField, setActiveExternalField] = useState<string | null>(null);
  const [isGlobalAiDrawerOpen, setIsGlobalAiDrawerOpen] = useState(false);
  const lastSelectedPageKeyRef = useRef<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExportTasksPanel, setShowExportTasksPanel] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const exportTasksPanelRef = useRef<HTMLDivElement | null>(null);
  const externalFieldPopoverRef = useRef<HTMLDivElement | null>(null);
  const generateFlowLockRef = useRef(false);
  // 多选导出相关状态
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [floatingFullscreenButtonPosition, setFloatingFullscreenButtonPosition] = useState({ x: 0.92, y: 0.1 });
  const [imageVersions, setImageVersions] = useState<ImageVersion[]>([]);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  const [selectedContextImages, setSelectedContextImages] = useState<{
    useTemplate: boolean;
    descImageUrls: string[];
    uploadedReferences: PageAiUploadedReference[];
  }>({
    useTemplate: false,
    descImageUrls: [],
    uploadedReferences: [],
  });
  const [activePreviewReferenceId, setActivePreviewReferenceId] = useState<string | null>(null);
  const [pageAiMessages, setPageAiMessages] = useState<PageAiMessage[]>([]);
  const [isPageAiSubmitting, setIsPageAiSubmitting] = useState(false);
  const [extraRequirements, setExtraRequirements] = useState<string>('');
  const [isSavingRequirements, setIsSavingRequirements] = useState(false);
  const isEditingRequirements = useRef(false); // 跟踪用户是否正在编辑额外要求
  const [templateStyle, setTemplateStyle] = useState<string>('');
  const [isSavingTemplateStyle, setIsSavingTemplateStyle] = useState(false);
  const isEditingTemplateStyle = useRef(false); // 跟踪用户是否正在编辑风格描述
  const lastProjectId = useRef<string | null>(null); // 跟踪上一次的项目ID
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  // 素材生成模态开关（模块本身可复用，这里只是示例入口）
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  // 素材选择器模态开关
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
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
  const [isSavingExportSettings, setIsSavingExportSettings] = useState(false);
  // 画面比例
  const [aspectRatio, setAspectRatio] = useState<string>(
    currentProject?.image_aspect_ratio || '16:9'
  );
  const [isSavingAspectRatio, setIsSavingAspectRatio] = useState(false);
  const [isSavingGenerationDefaults, setIsSavingGenerationDefaults] = useState(false);
  const [projectDefaultImageSource, setProjectDefaultImageSource] = useState<string>(PROJECT_DEFAULT_IMAGE_SOURCE);
  const [projectDefaultImageModel, setProjectDefaultImageModel] = useState<string>(PROJECT_DEFAULT_IMAGE_MODEL);
  const [projectDefaultImageResolution, setProjectDefaultImageResolution] = useState<string>(PROJECT_DEFAULT_IMAGE_RESOLUTION);
  const [editRunImageModel, setEditRunImageModel] = useState<string>(PROJECT_DEFAULT_IMAGE_MODEL);
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
  // 1K分辨率警告对话框状态
  const [show1KWarningDialog, setShow1KWarningDialog] = useState(false);
  const [skip1KWarningChecked, setSkip1KWarningChecked] = useState(false);
  const [pending1KAction, setPending1KAction] = useState<(() => Promise<void>) | null>(null);
  const [showBatchGenerateDialog, setShowBatchGenerateDialog] = useState(false);
  const [batchGenerateContext, setBatchGenerateContext] = useState<{
    total: number;
    generated: number;
    generating: number;
    missing: number;
    targetPageIds: string[];
    missingPageIds: string[];
  } | null>(null);
  // 每页编辑参数缓存（前端会话内缓存，便于重复执行）
  const [editContextByPage, setEditContextByPage] = useState<Record<string, PageAiContextState>>({});
  const floatingFullscreenDragRef = useRef<{ moved: boolean } | null>(null);
  const [isDraggingFloatingFullscreenButton, setIsDraggingFloatingFullscreenButton] = useState(false);
  const suppressFloatingFullscreenClickRef = useRef(false);

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

  const fieldSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleFieldDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = availableFields.indexOf(active.id as string);
    const newIndex = availableFields.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const nextPool = arrayMove(availableFields, oldIndex, newIndex);
    setAvailableFields(nextPool);
    localStorage.setItem('banana-available-extra-fields', JSON.stringify(nextPool));
    const activeSet = new Set(extraFieldNames);
    const nextActive = nextPool.filter((field) => activeSet.has(field));
    setExtraFieldNames(nextActive);
    saveSettingsDebounced({ description_extra_fields: nextActive });
  }, [availableFields, extraFieldNames, saveSettingsDebounced]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setFileMenuOpen(false);
      }
      if (externalFieldPopoverRef.current && !externalFieldPopoverRef.current.contains(event.target as Node)) {
        setActiveExternalField(null);
      }
    };
    if (settingsOpen || fileMenuOpen || activeExternalField) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [settingsOpen, fileMenuOpen, activeExternalField]);

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
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [isRegionSelectionMode, setIsRegionSelectionMode] = useState(false);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

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
    setSelectedIndex(Math.max(0, fallbackIndex + 1));
  }, [insertPageAt, show, t]);

  const persistCurrentPageDraft = useCallback((updates: Partial<PageDraft>) => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageKey = getPageDraftKey(page, selectedIndex);
    if (!pageKey) return;

    setPageDrafts((prev) => {
      const baseDraft = prev[pageKey] || {
        title: page?.outline_content?.title || '',
        points: page?.outline_content?.points?.join('\n') || '',
        description: getDescriptionText(page?.description_content),
        extraFields: getDescriptionExtraFields(page?.description_content),
      };
      return {
        ...prev,
        [pageKey]: {
          ...baseDraft,
          ...updates,
        },
      };
    });
  }, [currentProject, selectedIndex]);

  // Memoize pages with generated images to avoid re-computing in multiple places
  const pagesWithImages = useMemo(() => {
    return currentProject?.pages.filter(p => p.id && (p.generated_image_path || p.preview_image_path)) || [];
  }, [currentProject?.pages]);

  const hasImages = useMemo(
    () => currentProject?.pages?.some(p => p.generated_image_path || p.preview_image_path) ?? false,
    [currentProject?.pages]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => {
      const fullscreenElement =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement ||
        null;
      setIsFullscreen(fullscreenElement === previewContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    document.addEventListener('msfullscreenchange', handleFullscreenChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange as EventListener);
    };
  }, []);

  const requestFullscreen = useCallback(async () => {
    const target = previewContainerRef.current;
    if (!target) return;
    const request =
      target.requestFullscreen ||
      (target as any).webkitRequestFullscreen ||
      (target as any).msRequestFullscreen;
    if (!request) return;
    try {
      await request.call(target);
    } catch (error) {
      console.warn('Failed to enter fullscreen:', error);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const exit =
      document.exitFullscreen ||
      (document as any).webkitExitFullscreen ||
      (document as any).msExitFullscreen;
    if (!exit) return;
    try {
      await exit.call(document);
    } catch (error) {
      console.warn('Failed to exit fullscreen:', error);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    const fullscreenElement =
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).msFullscreenElement ||
      null;
    if (fullscreenElement) {
      void exitFullscreen();
    } else {
      void requestFullscreen();
    }
  }, [exitFullscreen, requestFullscreen]);

  useEffect(() => {
    if (!isDraggingFloatingFullscreenButton) return;

    const handleMove = (event: MouseEvent) => {
      const container = previewContainerRef.current;
      const dragState = floatingFullscreenDragRef.current;
      if (!container || !dragState) return;

      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const nextX = (event.clientX - rect.left) / rect.width;
      const nextY = (event.clientY - rect.top) / rect.height;
      const xPadding = FLOATING_FULLSCREEN_BUTTON_SIZE / (2 * rect.width);
      const yPadding = FLOATING_FULLSCREEN_BUTTON_SIZE / (2 * rect.height);

      const clampedX = Math.min(Math.max(nextX, xPadding), 1 - xPadding);
      const clampedY = Math.min(Math.max(nextY, yPadding), 1 - yPadding);

      if (!dragState.moved) {
        dragState.moved =
          Math.abs(event.movementX) > 1 ||
          Math.abs(event.movementY) > 1;
      }

      setFloatingFullscreenButtonPosition({ x: clampedX, y: clampedY });
    };

    const handleUp = () => {
      if (floatingFullscreenDragRef.current?.moved) {
        suppressFloatingFullscreenClickRef.current = true;
      }
      floatingFullscreenDragRef.current = null;
      setIsDraggingFloatingFullscreenButton(false);
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
    };
  }, [isDraggingFloatingFullscreenButton]);

  const handleFloatingFullscreenButtonMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    floatingFullscreenDragRef.current = { moved: false };
    setIsDraggingFloatingFullscreenButton(true);
  }, []);

  const handleFloatingFullscreenButtonClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (suppressFloatingFullscreenClickRef.current) {
      suppressFloatingFullscreenClickRef.current = false;
      return;
    }
    toggleFullscreen();
  }, [toggleFullscreen]);

  const pageCount = currentProject?.pages?.length ?? 0;

  const goPrevPage = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goNextPage = useCallback(() => {
    setSelectedIndex((prev) => {
      const maxIndex = Math.max(0, pageCount - 1);
      return Math.min(maxIndex, prev + 1);
    });
  }, [pageCount]);

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
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevPage();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNextPage();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goNextPage, goPrevPage, isFullscreen]);

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
        setProjectDefaultImageSource(PROJECT_DEFAULT_IMAGE_SOURCE);
        setProjectDefaultImageModel(normalizedModel);
        setEditRunImageModel(normalizedModel);
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
        setProjectDefaultImageSource(PROJECT_DEFAULT_IMAGE_SOURCE);
        setProjectDefaultImageModel(normalizedModel);
        setEditRunImageModel(normalizedModel);
        setProjectDefaultImageResolution(normalizeProjectDefaultImageResolution(imageDefaults.resolution, normalizedModel));
        setDescriptionRequirementsDraft(currentProject.description_requirements || '');
      }
      // 如果用户正在编辑，则不更新本地状态
    }
  }, [currentProject?.id, currentProject?.extra_requirements, currentProject?.template_style, currentProject?.description_requirements, currentProject?.image_aspect_ratio, currentProject?.export_extractor_method, currentProject?.export_inpaint_method, currentProject?.export_allow_partial, currentProject?.export_compress_enabled, currentProject?.export_compress_format, currentProject?.export_compress_quality, currentProject?.export_compress_png_quantize_enabled, currentProject?.generation_defaults]);

  const templateSelectionStorageKey = useMemo(
    () => (projectId ? `preview-template-selection:${projectId}` : null),
    [projectId]
  );

  useEffect(() => {
    if (!templateSelectionStorageKey) {
      setAppliedTemplateSelection(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(templateSelectionStorageKey);
      if (!raw) {
        setAppliedTemplateSelection(null);
        return;
      }
      const parsed = JSON.parse(raw) as AppliedTemplateSelection;
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.kind === 'string' &&
        typeof parsed.id === 'string'
      ) {
        setAppliedTemplateSelection(parsed);
        return;
      }
    } catch (error) {
      console.warn('Failed to restore applied template selection:', error);
    }
    setAppliedTemplateSelection(null);
  }, [templateSelectionStorageKey]);

  const persistAppliedTemplateSelection = useCallback((selection: AppliedTemplateSelection | null) => {
    setAppliedTemplateSelection(selection);
    if (!templateSelectionStorageKey) return;
    if (!selection) {
      sessionStorage.removeItem(templateSelectionStorageKey);
      return;
    }
    sessionStorage.setItem(templateSelectionStorageKey, JSON.stringify(selection));
  }, [templateSelectionStorageKey]);

  const closeTemplateModal = useCallback(() => {
    setDraftTemplateSelection(null);
    setIsTemplateModalOpen(false);
  }, []);

  const openTemplateModal = useCallback(() => {
    setDraftTemplateSelection(null);
    const nextTab: TemplateSelectorTab = currentProject?.template_style_json
      ? 'json'
      : appliedTemplateSelection?.kind === 'material'
        ? 'material'
        : 'image';
    setActiveTemplateTab(nextTab);
    setIsTemplateModalOpen(true);
  }, [appliedTemplateSelection?.kind, currentProject?.template_style_json]);

  // 加载当前页面的历史版本
  useEffect(() => {
    const loadVersions = async () => {
      if (!currentProject || !projectId || selectedIndex < 0 || selectedIndex >= currentProject.pages.length) {
        setImageVersions([]);
        return;
      }

      const page = currentProject.pages[selectedIndex];
      if (!page?.id) {
        setImageVersions([]);
        return;
      }

      try {
        const response = await getPageImageVersions(projectId, page.id);
        if (response.data?.versions) {
          setImageVersions(response.data.versions);
        }
      } catch (error) {
        console.error('Failed to load image versions:', error);
        setImageVersions([]);
      }
    };

    loadVersions();
  }, [currentProject, selectedIndex, projectId]);

  // 检查是否需要显示1K分辨率警告
  const checkResolutionAndExecute = useCallback(async (action: () => Promise<void>) => {
    // 检查 localStorage 中是否已跳过警告
    const skipWarning = localStorage.getItem('skip1KResolutionWarning') === 'true';
    if (skipWarning) {
      await action();
      return;
    }

    let resolution: string | undefined;
    try {
      const response = await getSettings();
      resolution = response.data?.image_resolution;
    } catch (error) {
      console.error('获取设置失败:', error);
    }

    // 如果是1K分辨率，显示警告对话框
    if (resolution === '1K') {
      setPending1KAction(() => action);
      setSkip1KWarningChecked(false);
      setShow1KWarningDialog(true);
    } else {
      // 未配置/获取失败/非1K时都直接执行
      await action();
    }
  }, []);

  // 确认1K分辨率警告后执行
  const handleConfirm1KWarning = useCallback(async () => {
    // 如果勾选了"不再提示"，保存到 localStorage
    if (skip1KWarningChecked) {
      localStorage.setItem('skip1KResolutionWarning', 'true');
    }

    setShow1KWarningDialog(false);

    // 执行待处理的操作
    if (pending1KAction) {
      await pending1KAction();
      setPending1KAction(null);
    }
  }, [skip1KWarningChecked, pending1KAction]);

  // 取消1K分辨率警告
  const handleCancel1KWarning = useCallback(() => {
    setShow1KWarningDialog(false);
    setPending1KAction(null);
  }, []);

  const handleBatchGenerate = useCallback(async (pageIds?: string[]) => {
    try {
      await generateImages(pageIds);
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
  }, [generateImages, show, t]);

  const handleGenerateAll = async () => {
    // 先检查分辨率，如果是1K则显示警告
    await checkResolutionAndExecute(async () => {
      const isPartialGenerate = isMultiSelectMode && selectedPageIds.size > 0;

      // 检查要生成的页面中是否有已有图片的
      const pagesToGenerate = isPartialGenerate
        ? currentProject?.pages.filter(p => p.id && selectedPageIds.has(p.id))
        : currentProject?.pages;
      const generatedPages = pagesToGenerate?.filter((p) => !isPageGenerating(p) && (p.generated_image_path || p.preview_image_path)) || [];
      const generatingPages = pagesToGenerate?.filter((p) => isPageGenerating(p)) || [];
      const targetPageIds = (pagesToGenerate || [])
        .map(p => p.id)
        .filter((id): id is string => !!id);
      const missingPageIds = (pagesToGenerate || [])
        .filter(p => !isPageGenerating(p) && !p.generated_image_path && !p.preview_image_path && p.id)
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
      // 只保留有效的HTTP/HTTPS URL
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        matches.push(url);
      }
    }

    return matches;
  };

  const handleEditPage = useCallback(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (pageId && editContextByPage[pageId]) {
      const cached = editContextByPage[pageId];
      setEditPrompt(cached.draftInput);
      setPageAiMessages(cached.messages);
      setEditRunImageModel(cached.model);
      setSelectedContextImages({
        useTemplate: cached.contextImages.useTemplate,
        descImageUrls: [...cached.contextImages.descImageUrls],
        uploadedReferences: [...cached.contextImages.uploadedReferences],
      });
    }
    setIsRegionSelectionMode(false);
    setSelectionStart(null);
    setSelectionRect(null);
    setIsSelectingRegion(false);
  }, [currentProject, selectedIndex, editContextByPage]);

  // 保存大纲和描述修改
  const handleSaveOutlineAndDescription = useCallback(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    if (!page?.id) return;

    const updates: Partial<Page> = {};

    // 检查大纲是否有变化
    const originalTitle = page.outline_content?.title || '';
    const originalPoints = page.outline_content?.points?.join('\n') || '';
    if (editOutlineTitle !== originalTitle || editOutlinePoints !== originalPoints) {
      updates.outline_content = {
        title: editOutlineTitle,
        points: editOutlinePoints.split('\n').filter((p) => p.trim()),
      };
    }

    const originalDesc = getDescriptionText(page.description_content);
    const originalExtraFields = getDescriptionExtraFields(page.description_content);
    const serializedExtraFields = serializeExtraFields(editExtraFields);
    if (editDescription !== originalDesc || !areStringRecordsEqual(editExtraFields, originalExtraFields)) {
      updates.description_content = {
        text: editDescription,
        ...(serializedExtraFields ? { extra_fields: serializedExtraFields } : {}),
      } as DescriptionContent;
    }

    if (Object.keys(updates).length > 0) {
      updatePageLocal(page.id, updates);
      persistCurrentPageDraft({
        title: editOutlineTitle,
        points: editOutlinePoints,
        description: editDescription,
        extraFields: editExtraFields,
      });
      show({ message: t('slidePreview.outlineSaved'), type: 'success' });
    }
  }, [currentProject, selectedIndex, editOutlineTitle, editOutlinePoints, editDescription, editExtraFields, updatePageLocal, persistCurrentPageDraft, show, t]);

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
      const nextModel = options?.model ?? editRunImageModel;
      const normalizedEditModel = normalizeProjectDefaultImageModel(nextModel || projectDefaultImageModel);
      const editGenerationOverride: GenerationOverride | undefined = normalizedEditModel
        ? { image: { model: normalizedEditModel } }
        : undefined;
      const hasExistingImage = Boolean(page.generated_image_path || page.preview_image_path);
      const hasContextInputs = Boolean(
        nextPrompt.trim() ||
        nextContextImages.useTemplate ||
        nextContextImages.descImageUrls.length > 0 ||
        nextContextImages.uploadedReferences.length > 0
      );

      if (hasExistingImage || hasContextInputs) {
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
      } else {
        await generateImages([page.id], editGenerationOverride);
      }

      setEditContextByPage((prev) => ({
        ...prev,
        [page.id!]: {
          draftInput: nextPrompt,
          messages: prev[page.id!]?.messages || pageAiMessages,
          model: normalizedEditModel,
          contextImages: {
            useTemplate: nextContextImages.useTemplate,
            descImageUrls: [...nextContextImages.descImageUrls],
            uploadedReferences: [...nextContextImages.uploadedReferences],
          },
        },
      }));
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        t('preview.generationFailed');
      show({ message: errorMessage, type: 'error' });
      throw error;
    }
  }, [currentProject, selectedIndex, editPrompt, selectedContextImages, editPageImage, editRunImageModel, projectDefaultImageModel, handleSaveOutlineAndDescription, saveAllPages, generateImages, pageAiMessages, show, t]);

  const handleSaveCurrentPage = useCallback(async () => {
    handleSaveOutlineAndDescription();
    await saveAllPages();
  }, [handleSaveOutlineAndDescription, saveAllPages]);

  const handleGenerateDescriptions = useCallback(async () => {
    if (!currentProject) return;
    const hasDescriptions = currentProject.pages.some((page) => page.description_content);
    const executeGenerate = async () => {
      await generateDescriptions();
      await syncProject(projectId);
    };

    if (hasDescriptions) {
      confirm(
        '部分页面已有描述，重新生成将覆盖，确定继续吗？',
        () => {
          void executeGenerate();
        },
        { title: '确认重新生成', variant: 'warning' }
      );
      return;
    }

    await executeGenerate();
  }, [confirm, currentProject, generateDescriptions, projectId, syncProject]);

  const handleAiRefineDescriptions = useCallback(async (requirement: string, previousRequirements: string[]) => {
    if (!currentProject || !projectId) return;
    try {
      const response = await refineDescriptions(projectId, requirement, previousRequirements);
      await syncProject(projectId);
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
  }, [currentProject, projectId, show, syncProject]);

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
      await Promise.all(parsed.map(({ title, points, text: desc, part, extra_fields }, index) =>
        addPage(projectId, {
          outline_content: { title, points },
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

  const getSortedPages = useCallback(() => {
    if (!currentProject) return [];
    return [...currentProject.pages].sort((left, right) => (left.order_index ?? 0) - (right.order_index ?? 0));
  }, [currentProject]);

  const handleCoverEndingSave = useCallback(async (meta: PresentationMeta) => {
    if (!currentProject || !projectId) return;
    const sortedPages = getSortedPages();
    if (sortedPages.length === 0) return;
    const coverPage = sortedPages[0];
    const endingPage = sortedPages[sortedPages.length - 1];
    const coverId = coverPage.id || coverPage.page_id;
    const endingId = endingPage.id || endingPage.page_id;

    try {
      const baseMeta = parsePresentationMeta(currentProject.presentation_meta);
      const mergedMeta: PresentationMeta = {
        ...baseMeta,
        ...meta,
        _cover_ending_checked: true,
        _cover_ending_skipped: false,
        _cover_ending_completed: true,
      };
      await updateProject(projectId, { presentation_meta: JSON.stringify(mergedMeta || {}) } as any);

      const coverText = getDescriptionText(coverPage.description_content);
      const endingText = getDescriptionText(endingPage.description_content);
      const updatedCover = applyPresentationMetaToDescription(coverText, mergedMeta, {
        pageRole: 'cover',
        detectFields,
      });
      const updatedEnding = applyPresentationMetaToDescription(endingText, mergedMeta, {
        pageRole: 'ending',
        detectFields,
      });

      const saveRequests: Promise<any>[] = [];
      if (coverId) {
        saveRequests.push(updatePageDescription(projectId, coverId, { text: updatedCover }));
      }
      if (endingId && endingId !== coverId) {
        saveRequests.push(updatePageDescription(projectId, endingId, { text: updatedEnding }));
      }
      if (saveRequests.length > 0) {
        await Promise.all(saveRequests);
      }

      await syncProject(projectId);
      setIsCoverEndingModalOpen(false);
      setCoverEndingModalMode('missing');
    } catch (error: any) {
      show({ message: error.message || '保存失败，请重试', type: 'error' });
    }
  }, [currentProject, projectId, getSortedPages, detectFields, syncProject, show]);

  const handleCoverEndingSkip = useCallback(async () => {
    if (!currentProject || !projectId) {
      setIsCoverEndingModalOpen(false);
      return;
    }

    try {
      const baseMeta = parsePresentationMeta(currentProject.presentation_meta);
      const mergedMeta: PresentationMeta = {
        ...baseMeta,
        _cover_ending_checked: true,
        _cover_ending_skipped: true,
        _cover_ending_completed: false,
      };
      await updateProject(projectId, { presentation_meta: JSON.stringify(mergedMeta) } as any);
      await syncProject(projectId);
    } catch (error) {
      console.warn('保存跳过状态失败:', error);
    } finally {
      setIsCoverEndingModalOpen(false);
      setCoverEndingModalMode('missing');
    }
  }, [currentProject, projectId, syncProject]);

  const handleCoverEndingView = useCallback(async () => {
    if (!currentProject || !projectId) {
      setDetectFields([]);
      setCoverEndingModalMode('all');
      setIsCoverEndingModalOpen(true);
      return;
    }

    const sortedPages = getSortedPages();
    if (sortedPages.length === 0) {
      setDetectFields([]);
      setCoverEndingModalMode('all');
      setIsCoverEndingModalOpen(true);
      return;
    }

    const coverPage = sortedPages[0];
    const endingPage = sortedPages[sortedPages.length - 1];
    const coverText = getDescriptionText(coverPage.description_content);
    const endingText = getDescriptionText(endingPage.description_content);

    try {
      setIsCheckingCoverEnding(true);
      const response = await detectCoverEndingFields(projectId, {
        cover: { page_id: coverPage.id || coverPage.page_id, description: coverText },
        ending: { page_id: endingPage.id || endingPage.page_id, description: endingText },
      });
      setDetectFields(response.data?.fields || []);
    } catch (error) {
      console.warn('查看封面/结尾信息时检测失败，继续打开编辑框', error);
      setDetectFields([]);
    } finally {
      setIsCheckingCoverEnding(false);
      setCoverEndingModalMode('all');
      setIsCoverEndingModalOpen(true);
    }
  }, [currentProject, projectId, getSortedPages]);

  const handleCoverEndingClose = useCallback(() => {
    setIsCoverEndingModalOpen(false);
    setCoverEndingModalMode('missing');
  }, []);

  const runGenerateFlow = useCallback(async (action: () => Promise<void>) => {
    if (!currentProject || !projectId) return;
    if (generateFlowLockRef.current) return;
    generateFlowLockRef.current = true;
    try {
      const hasTemplateSource = Boolean(
        currentProject.template_image_path ||
        currentProject.template_style?.trim() ||
        currentProject.template_style_json?.trim()
      );
      if (!hasTemplateSource) {
        show({ message: '请先上传模板图片或添加风格描述。', type: 'error' });
        return;
      }

      const sortedPages = getSortedPages();
      if (sortedPages.length === 0) return;
      const coverPage = sortedPages[0];
      const endingPage = sortedPages[sortedPages.length - 1];
      const coverText = getDescriptionText(coverPage.description_content);
      const endingText = getDescriptionText(endingPage.description_content);

      try {
        const meta = parsePresentationMeta(currentProject.presentation_meta);
        if (meta._cover_ending_checked) {
          await checkResolutionAndExecute(action);
          return;
        }
        setIsCheckingCoverEnding(true);
        show({ message: '正在检查封面/结尾信息...', type: 'info' });
        const response = await detectCoverEndingFields(projectId, {
          cover: { page_id: coverPage.id || coverPage.page_id, description: coverText },
          ending: { page_id: endingPage.id || endingPage.page_id, description: endingText },
        });
        const fields = response.data?.fields || [];
        const missing = fields.filter((field) => !field.present || field.is_placeholder);
        if (missing.length > 0) {
          setDetectFields(fields);
          setCoverEndingModalMode('missing');
          setIsCoverEndingModalOpen(true);
          return;
        }
      } catch (error) {
        console.warn('封面/结尾检测失败，跳过检测流程', error);
      } finally {
        setIsCheckingCoverEnding(false);
      }

      await checkResolutionAndExecute(action);
    } finally {
      generateFlowLockRef.current = false;
    }
  }, [currentProject, projectId, getSortedPages, show, checkResolutionAndExecute]);

  const handleQuickGenerateImage = useCallback(async () => {
    await runGenerateFlow(async () => {
      if (!currentProject) return;
      const page = currentProject.pages[selectedIndex];
      if (!page?.id) return;
      handleSaveOutlineAndDescription();
      await saveAllPages();
      await generateImages([page.id]);
    });
  }, [runGenerateFlow, currentProject, selectedIndex, handleSaveOutlineAndDescription, saveAllPages, generateImages]);

  const handleFileUpload = useCallback((files: File[]) => {
    setSelectedContextImages((prev) => ({
      ...prev,
      uploadedReferences: [
        ...prev.uploadedReferences,
        ...files.map((file) => createUploadedReference(file, 'upload')),
      ],
    }));
  }, []);

  const removeUploadedReference = useCallback((referenceId: string) => {
    setSelectedContextImages((prev) => ({
      ...prev,
      uploadedReferences: prev.uploadedReferences.filter((reference) => reference.id !== referenceId),
    }));
  }, []);

  const uploadedReferenceCleanupRef = useRef<PageAiUploadedReference[]>([]);
  useEffect(() => {
    const combined = [
      ...selectedContextImages.uploadedReferences,
      ...Object.values(editContextByPage).flatMap((context) => context.contextImages.uploadedReferences),
    ];
    const deduped = combined.filter((reference, index, array) => array.findIndex((item) => item.id === reference.id) === index);
    uploadedReferenceCleanupRef.current = deduped;
  }, [selectedContextImages.uploadedReferences, editContextByPage]);
  useEffect(() => {
    return () => {
      uploadedReferenceCleanupRef.current.forEach((reference) => {
        URL.revokeObjectURL(reference.previewUrl);
      });
    };
  }, []);

  const handleSelectMaterials = async (materials: Material[]) => {
    try {
      const files = await Promise.all(
        materials.map((material) => materialUrlToFile(material))
      );
      setSelectedContextImages((prev) => ({
        ...prev,
        uploadedReferences: [
          ...prev.uploadedReferences,
          ...files.map((file, index) => createUploadedReference(file, 'material', materials[index]?.name || file.name)),
        ],
      }));
      show({ message: t('slidePreview.materialsAdded', { count: materials.length }), type: 'success' });
    } catch (error: any) {
      console.error('加载素材失败:', error);
      show({
        message: t('slidePreview.loadMaterialFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    }
  };

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) return;

    setEditContextByPage((prev) => ({
      ...prev,
      [pageId]: {
        draftInput: editPrompt,
        messages: pageAiMessages,
        model: editRunImageModel,
        contextImages: {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: [...selectedContextImages.descImageUrls],
          uploadedReferences: [...selectedContextImages.uploadedReferences],
        },
      },
    }));
  }, [currentProject, selectedIndex, editPrompt, selectedContextImages, pageAiMessages, editRunImageModel]);

  // ========== 预览图矩形选择相关逻辑（编辑弹窗内） ==========
  const handleSelectionMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    setIsSelectingRegion(true);
    setSelectionStart({ x, y });
    setSelectionRect(null);
  };

  const handleSelectionMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionStart || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(x, rect.width));
    const clampedY = Math.max(0, Math.min(y, rect.height));

    const left = Math.min(selectionStart.x, clampedX);
    const top = Math.min(selectionStart.y, clampedY);
    const width = Math.abs(clampedX - selectionStart.x);
    const height = Math.abs(clampedY - selectionStart.y);

    setSelectionRect({ left, top, width, height });
  };

  const handleSelectionMouseUp = async () => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionRect || !imageRef.current) {
      setIsSelectingRegion(false);
      setSelectionStart(null);
      return;
    }

    // 结束拖拽，但保留选中的矩形，直到用户手动退出区域选图模式
    setIsSelectingRegion(false);
    setSelectionStart(null);

    try {
      const img = imageRef.current;
      const { left, top, width, height } = selectionRect;
      if (width < 10 || height < 10) {
        // 选区太小，忽略
        return;
      }

      // 将选区从展示尺寸映射到原始图片尺寸
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayWidth = img.clientWidth;
      const displayHeight = img.clientHeight;

      if (!naturalWidth || !naturalHeight || !displayWidth || !displayHeight) return;

      const scaleX = naturalWidth / displayWidth;
      const scaleY = naturalHeight / displayHeight;

      const sx = left * scaleX;
      const sy = top * scaleY;
      const sWidth = width * scaleX;
      const sHeight = height * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sWidth));
      canvas.height = Math.max(1, Math.round(sHeight));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        ctx.drawImage(
          img,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], `crop-${Date.now()}.png`, { type: 'image/png' });
          setSelectedContextImages((prev) => ({
            ...prev,
            uploadedReferences: [
              ...prev.uploadedReferences,
              createUploadedReference(
                file,
                'region',
                `框选区域 ${prev.uploadedReferences.filter((item) => item.sourceType === 'region').length + 1}`,
                {
                  regionBounds: {
                    leftRatio: left / displayWidth,
                    topRatio: top / displayHeight,
                    widthRatio: width / displayWidth,
                    heightRatio: height / displayHeight,
                  },
                }
              ),
            ],
          }));
          show({
            message: t('slidePreview.regionCropSuccess'),
            type: 'success',
          });
        }, 'image/png');
      } catch (e: any) {
        console.error('裁剪选中区域失败（可能是跨域图片导致 canvas 被污染）:', e);
        show({
          message: t('slidePreview.regionCropFailed'),
          type: 'error',
        });
      }
    } finally {
      // 不清理 selectionRect，让选区在界面上持续显示
    }
  };

  // 多选相关函数
  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const selectAllPages = () => {
    const allPageIds = pagesWithImages.map(p => p.id!);
    setSelectedPageIds(new Set(allPageIds));
  };

  const deselectAllPages = () => {
    setSelectedPageIds(new Set());
  };

  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(prev => {
      if (prev) {
        // 退出多选模式时清空选择
        setSelectedPageIds(new Set());
      }
      return !prev;
    });
  };

  // 获取有图片的选中页面ID列表
  const getSelectedPageIdsForExport = (): string[] | undefined => {
    if (!isMultiSelectMode || selectedPageIds.size === 0) {
      return undefined; // 导出全部
    }
    return Array.from(selectedPageIds);
  };

  const handleExport = async (type: 'pptx' | 'pdf' | 'editable-pptx' | 'images') => {
    setShowExportMenu(false);
    if (!projectId) return;

    const pageIds = getSelectedPageIdsForExport();
    const exportTaskId = `export-${Date.now()}`;

    try {
      // Create a local task immediately for instant UI feedback
      addTask({
        id: exportTaskId,
        taskId: '',
        projectId,
        type: type as ExportTaskType,
        status: 'PROCESSING',
        pageIds: pageIds,
        progress: { total: 100, completed: 0, percent: 0 },
      });

      setShowExportTasksPanel(true);
      show({ message: t('slidePreview.exportStarted'), type: 'success' });

      let response: { data?: { task_id?: string } } | undefined;
      if (type === 'pptx') {
        response = await apiExportPPTXTask(projectId, undefined, pageIds);
      } else if (type === 'pdf') {
        response = await apiExportPDFTask(projectId, undefined, pageIds);
      } else if (type === 'images') {
        response = await apiExportImagesTask(projectId, pageIds);
      } else if (type === 'editable-pptx') {
        response = await apiExportEditablePPTX(projectId, undefined, pageIds);
      }

      const taskId = response?.data?.task_id;

      if (!taskId) {
        throw new Error('导出任务创建失败');
      }

      // Update task with real taskId
      addTask({
        id: exportTaskId,
        taskId,
        projectId,
        type: type as ExportTaskType,
        status: 'PROCESSING',
        pageIds: pageIds,
        progress: { total: 100, completed: 0, percent: 0 },
      });

      // Start polling in background (non-blocking)
      pollExportTask(exportTaskId, projectId, taskId);
    } catch (error: any) {
      // Update task as failed
      addTask({
        id: exportTaskId,
        taskId: '',
        projectId,
        type: type as ExportTaskType,
        status: 'FAILED',
        errorMessage: normalizeErrorMessage(error.message || t('preview.messages.exportFailed')),
        pageIds: pageIds,
      });
      show({ message: normalizeErrorMessage(error.message || t('preview.messages.exportFailed')), type: 'error' });
    }
  };

  const handleRefresh = useCallback(async () => {
    const targetProjectId = projectId || currentProject?.id;
    if (!targetProjectId) {
      show({ message: t('slidePreview.cannotRefresh'), type: 'error' });
      return;
    }

    setIsRefreshing(true);
    try {
      await syncProject(targetProjectId);
      show({ message: t('slidePreview.refreshSuccess'), type: 'success' });
    } catch (error: any) {
      show({
        message: error.message || t('slidePreview.refreshFailed'),
        type: 'error'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, currentProject?.id, syncProject, show]);

  const handleSaveExtraRequirements = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingRequirements(true);
    try {
      await updateProject(projectId, { extra_requirements: extraRequirements || '' });
      // 保存成功后，标记为不在编辑状态，允许同步更新
      isEditingRequirements.current = false;
      // 更新本地项目状态
      await syncProject(projectId);
      show({ message: t('slidePreview.extraRequirementsSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingRequirements(false);
    }
  }, [currentProject, projectId, extraRequirements, syncProject, show]);

  const handleSaveTemplateStyle = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingTemplateStyle(true);
    try {
      await updateProject(projectId, { template_style: templateStyle || '' });
      // 保存成功后，标记为不在编辑状态，允许同步更新
      isEditingTemplateStyle.current = false;
      // 更新本地项目状态
      await syncProject(projectId);
      show({ message: t('slidePreview.styleDescSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingTemplateStyle(false);
    }
  }, [currentProject, projectId, templateStyle, syncProject, show]);

  const handleSaveDescriptionRequirements = useCallback(async () => {
    if (!currentProject || !projectId) return;
    setIsSavingDescriptionRequirements(true);
    try {
      await updateProject(projectId, { description_requirements: descriptionRequirementsDraft || '' });
      await syncProject(projectId);
      show({ message: '描述生成要求已保存', type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    } finally {
      setIsSavingDescriptionRequirements(false);
    }
  }, [currentProject, projectId, descriptionRequirementsDraft, syncProject, show, t]);

  const handleSaveGenerationDefaults = useCallback(async () => {
    if (!currentProject || !projectId) return;
    setIsSavingGenerationDefaults(true);
    try {
      const normalizedModel = normalizeProjectDefaultImageModel(projectDefaultImageModel);
      const normalizedResolution = normalizeProjectDefaultImageResolution(
        projectDefaultImageResolution,
        normalizedModel
      );
      const imageDefaults: Record<string, string> = {
        source: PROJECT_DEFAULT_IMAGE_SOURCE,
        model: normalizedModel,
        resolution: normalizedResolution,
      };
      const generationDefaults: GenerationOverride = { image: imageDefaults };
      await updateProject(projectId, { generation_defaults: generationDefaults });
      await syncProject(projectId);
      show({ message: '项目 AI 默认已保存', type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    } finally {
      setIsSavingGenerationDefaults(false);
    }
  }, [currentProject, projectId, projectDefaultImageModel, projectDefaultImageResolution, syncProject, show, t]);

  const handleSaveExportSettings = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingExportSettings(true);
    try {
      await updateProject(projectId, {
        export_extractor_method: exportExtractorMethod,
        export_inpaint_method: exportInpaintMethod,
        export_allow_partial: exportAllowPartial,
        export_compress_enabled: exportCompressEnabled,
        export_compress_format: exportCompressFormat,
        export_compress_quality: exportCompressQuality,
        export_compress_png_quantize_enabled: exportCompressPngQuantizeEnabled,
      });
      // 更新本地项目状态
      await syncProject(projectId);
      show({ message: t('slidePreview.exportSettingsSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingExportSettings(false);
    }
  }, [currentProject, projectId, exportExtractorMethod, exportInpaintMethod, exportAllowPartial, exportCompressEnabled, exportCompressFormat, exportCompressQuality, exportCompressPngQuantizeEnabled, syncProject, show]);

  const handleSaveAspectRatio = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingAspectRatio(true);
    try {
      await updateProject(projectId, { image_aspect_ratio: aspectRatio });
      await syncProject(projectId);
      show({ message: t('slidePreview.aspectRatioSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingAspectRatio(false);
    }
  }, [currentProject, projectId, aspectRatio, syncProject, show]);

  const handleTemplateSelect = useCallback(async (templateFile: File | null, templateId?: string, source?: TemplateSource) => {
    if (!projectId) return;

    let file = templateFile;
    if (templateId && !file) {
      file = await getTemplateFile(templateId, userTemplates, source === 'preset' ? 'preset' : 'user');
      if (!file) {
        show({ message: t('slidePreview.loadTemplateFailed'), type: 'error' });
        return false;
      }
    }

    if (!file) {
      return false;
    }

    setIsUploadingTemplate(true);
    try {
      await uploadTemplate(projectId, file);
      await updateProject(projectId, { template_style_json: '' } as any);
      await syncProject(projectId);
      show({ message: t('slidePreview.templateChanged'), type: 'success' });
      return true;
    } catch (error: any) {
      show({
        message: t('slidePreview.templateChangeFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
      return false;
    } finally {
      setIsUploadingTemplate(false);
    }
  }, [projectId, show, syncProject, t, userTemplates]);

  const handleStylePresetSelect = useCallback(async (presetId: string, styleJson: string) => {
    if (!projectId) return;
    try {
      await updateProject(projectId, { template_style_json: styleJson || '' } as any);
      await syncProject(projectId);
      show({ message: t('slidePreview.templateChanged'), type: 'success' });
      return { ok: true, selection: { kind: 'style', id: presetId } as AppliedTemplateSelection };
    } catch (error: any) {
      show({
        message: t('slidePreview.templateChangeFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
      return { ok: false, selection: null };
    }
  }, [projectId, show, syncProject, t]);

  const handleApplyTemplateSelection = useCallback(async (selection: TemplateSelection) => {
    if (!projectId) return;

    if (selection.kind === 'style') {
      const result = await handleStylePresetSelect(selection.presetId, selection.styleJson);
      if (result?.ok) {
        persistAppliedTemplateSelection(result.selection);
        closeTemplateModal();
      }
      return;
    }

    if (selection.kind === 'material') {
      const file = await materialUrlToFile(selection.material);
      const applied = await handleTemplateSelect(file, undefined, 'upload');
      if (applied) {
        persistAppliedTemplateSelection({ kind: 'material', id: selection.id });
        closeTemplateModal();
      }
      return;
    }

    const applied = await handleTemplateSelect(null, selection.templateId, selection.kind === 'preset' ? 'preset' : 'user');
    if (applied) {
      persistAppliedTemplateSelection({ kind: selection.kind, id: selection.id });
      closeTemplateModal();
    }
  }, [closeTemplateModal, handleStylePresetSelect, handleTemplateSelect, persistAppliedTemplateSelection]);

  const canvasFieldNames = [...new Set([
    ...extraFieldNames,
    ...Object.keys(editExtraFields),
  ])];
  const draftDescImageUrls = useMemo(
    () => extractImageUrlsFromDescription(editDescription),
    [editDescription]
  );

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
  const imageUrl = (selectedPage?.generated_image_path || selectedPage?.preview_image_path)
    ? getImageUrl(selectedPage.generated_image_path || selectedPage.preview_image_path, selectedPage.updated_at)
    : '';

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

  const editorCanvasContent = (
    <div
      className="min-h-[520px] w-full min-w-0 rounded-[24px] border border-[#eadfbf] bg-[#f7f5ef] p-4 sm:min-h-[560px] sm:p-5 lg:min-h-[580px] lg:p-6 dark:border-border-primary dark:bg-background-secondary"
      style={isMobileView ? undefined : { width: '100%', maxWidth: '100%', aspectRatio: aspectRatioStyle }}
      data-testid="preview-editor-canvas"
    >
      <div className="grid h-full min-h-0 gap-3 grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-4 lg:grid-rows-[auto_minmax(120px,0.6fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-amber-200/70 bg-white/90 px-5 py-3 dark:border-amber-900/40 dark:bg-background-primary">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700/80">标题</div>
          <input
            type="text"
            value={editOutlineTitle}
            onChange={(event) => {
              const value = event.target.value;
              setEditOutlineTitle(value);
              persistCurrentPageDraft({ title: value });
            }}
            placeholder={t('preview.enterTitle')}
            data-testid="preview-text-title-input"
            className="min-h-[48px] w-full bg-transparent text-xl font-semibold text-slate-900 outline-none placeholder:text-slate-300 dark:text-foreground-primary sm:text-2xl"
          />
        </div>

        <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 dark:border-border-primary dark:bg-background-primary flex flex-col">
          <div className="mb-2 shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t('preview.pointsPerLine')}</div>
          <textarea
            value={editOutlinePoints}
            onChange={(event) => {
              const value = event.target.value;
              setEditOutlinePoints(value);
              persistCurrentPageDraft({ points: value });
            }}
            placeholder={t('preview.enterPointsPerLine')}
            data-testid="preview-text-points-input"
            className="min-h-[72px] w-full flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-300 dark:border-border-primary dark:bg-background-primary/40 dark:text-foreground-secondary"
          />
        </div>

        <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 dark:border-border-primary dark:bg-background-primary flex flex-col">
          <div className="mb-3 shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t('preview.pageDescription')}
          </div>
          <textarea
            value={editDescription}
            onChange={(event) => {
              const value = event.target.value;
              setEditDescription(value);
              persistCurrentPageDraft({ description: value });
            }}
            placeholder={t('preview.enterDescription')}
            data-testid="preview-text-description-input"
            className="min-h-[140px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-300 dark:border-border-primary dark:bg-background-primary/40 dark:text-foreground-secondary"
          />
        </div>
      </div>
    </div>
  );

  const externalFieldTags = (
    <div className="relative" ref={externalFieldPopoverRef}>
      {activeExternalField && (
        <div className="absolute bottom-full left-0 z-30 mb-3 w-[min(420px,100%)] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_22px_48px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/80 dark:border-border-primary dark:bg-background-secondary dark:ring-border-primary">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-base font-semibold text-slate-900 dark:text-foreground-primary">{activeExternalField}</div>
            <button
              type="button"
              onClick={() => setActiveExternalField(null)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-border-primary dark:bg-background-primary dark:text-foreground-tertiary"
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
                return next;
              });
            }}
            rows={4}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-300 dark:border-border-primary dark:bg-background-primary dark:text-foreground-secondary"
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

  const templatePreviewUrl = currentProject.template_image_path
    ? getImageUrl(currentProject.template_image_path, currentProject.updated_at)
    : undefined;
  const selectedPageAiReferences: PageAiReference[] = (() => {
    const references: PageAiReference[] = [];
    if (selectedContextImages.useTemplate && templatePreviewUrl) {
      references.push({
        id: 'template-reference',
        sourceType: 'template',
        label: t('preview.pageAiTemplateReference'),
        previewUrl: templatePreviewUrl,
      });
    }
    selectedContextImages.descImageUrls.forEach((url, index) => {
      references.push({
        id: `description-reference:${url}`,
        sourceType: 'description',
        label: `${t('preview.imagesInDescription')} ${index + 1}`,
        previewUrl: url,
      });
    });
    selectedContextImages.uploadedReferences.forEach((reference) => {
      references.push({
        id: reference.id,
        sourceType: reference.sourceType,
        label: reference.label,
        previewUrl: reference.previewUrl,
        regionBounds: reference.regionBounds,
      });
    });
    return references;
  })();

  const descriptionImageOptions = draftDescImageUrls.map((url, index) => ({
    id: `description-option:${url}`,
    label: `${t('preview.imagesInDescription')} ${index + 1}`,
    url,
    selected: selectedContextImages.descImageUrls.includes(url),
  }));

  const handleToggleTemplateReference = () => {
    setSelectedContextImages((prev) => ({
      ...prev,
      useTemplate: !prev.useTemplate,
    }));
  };

  const handleToggleDescriptionImage = (url: string) => {
    setSelectedContextImages((prev) => {
      const isSelected = prev.descImageUrls.includes(url);
      return {
        ...prev,
        descImageUrls: isSelected
          ? prev.descImageUrls.filter((item) => item !== url)
          : [...prev.descImageUrls, url],
      };
    });
  };

  const handleRemovePageAiReference = (referenceId: string) => {
    if (activePreviewReferenceId === referenceId) {
      setActivePreviewReferenceId(null);
    }
    if (referenceId === 'template-reference') {
      setSelectedContextImages((prev) => ({ ...prev, useTemplate: false }));
      return;
    }
    if (referenceId.startsWith('description-reference:')) {
      const url = referenceId.replace('description-reference:', '');
      setSelectedContextImages((prev) => ({
        ...prev,
        descImageUrls: prev.descImageUrls.filter((item) => item !== url),
      }));
      return;
    }
    removeUploadedReference(referenceId);
  };

  const handlePreviewReferenceFocus = useCallback((reference: PageAiReference) => {
    setActivePreviewReferenceId(reference.id);
    if (reference.sourceType !== 'region' || !reference.regionBounds || !imageRef.current) {
      return;
    }
    const img = imageRef.current;
    const rect = img.getBoundingClientRect();
    setSelectionRect({
      left: reference.regionBounds.leftRatio * rect.width,
      top: reference.regionBounds.topRatio * rect.height,
      width: reference.regionBounds.widthRatio * rect.width,
      height: reference.regionBounds.heightRatio * rect.height,
    });
    setIsRegionSelectionMode(false);
    setIsSelectingRegion(false);
    setSelectionStart(null);
    img.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, []);

  const handlePageAiSend = async () => {
    if (!currentProject) return;
    const draftText = editPrompt.trim();
    if (!draftText && selectedPageAiReferences.length === 0) return;

    const userMessage = createPageAiMessage(
      'user',
      draftText || t('preview.pageAiReferenceOnlyFallback'),
      selectedPageAiReferences.map((reference) => ({ ...reference })),
    );
    setPageAiMessages((prev) => [...prev, userMessage]);
    setIsPageAiSubmitting(true);

    try {
      await checkResolutionAndExecute(async () => {
        await executePageImageGeneration({
          prompt: draftText,
          contextImages: selectedContextImages,
          model: editRunImageModel,
        });
      });
      setPageAiMessages((prev) => [
        ...prev,
        createPageAiMessage('assistant', t('preview.pageAiResponseFallback')),
      ]);
      setEditPrompt('');
      setEditRunImageModel(projectDefaultImageModel);
      setActivePreviewReferenceId(null);
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedReferences: [],
      });
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        t('preview.generationFailed');
      setPageAiMessages((prev) => [
        ...prev,
        createPageAiMessage('assistant', errorMessage, [], 'error'),
      ]);
    } finally {
      setIsPageAiSubmitting(false);
    }
  };

  const currentPageDescriptionText = getDescriptionText(selectedPage?.description_content);
  const currentPageExtraFields = getDescriptionExtraFields(selectedPage?.description_content);
  const isCurrentPageDirty = Boolean(
    selectedPage && (
      editOutlineTitle !== (selectedPage.outline_content?.title || '') ||
      editOutlinePoints !== (selectedPage.outline_content?.points?.join('\n') || '') ||
      editDescription !== currentPageDescriptionText ||
      !areStringRecordsEqual(editExtraFields, currentPageExtraFields)
    )
  );
  const textStatusLabel = isCurrentPageDirty ? '文本未保存' : '文本已保存';
  const imageStatusLabel = isPageGenerating(selectedPage)
    ? t('preview.generating')
    : selectedPageHasImage
      ? '图片已生成'
      : t('preview.notGenerated');

  return (
    <div className="h-screen bg-gray-50 dark:bg-background-primary flex flex-col overflow-hidden">
      {/* 顶栏 */}
      <header className="h-14 md:h-16 bg-white dark:bg-background-secondary shadow-sm dark:shadow-background-primary/30 border-b border-gray-200 dark:border-border-primary flex items-center justify-between px-3 md:px-6 flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Home size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => navigate('/')}
            className="hidden sm:inline-flex flex-shrink-0"
          >
            <span className="hidden md:inline">{t('nav.home')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => {
              if (fromHistory) {
                navigate('/history');
              } else {
                navigate(`/project/${projectId}/outline`);
              }
            }}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">{t('common.back')}</span>
          </Button>
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
            <span className="text-xl md:text-2xl">🍌</span>
            <span className="text-base md:text-xl font-bold truncate">{t('home.title')}</span>
          </div>
          <span className="text-gray-400 hidden md:inline">|</span>
          <span className="text-sm md:text-lg font-semibold truncate hidden sm:inline">{t('preview.title')}</span>
        </div>
        <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsGlobalAiDrawerOpen(true)}
            title={t('preview.globalAiOpen')}
            aria-label={t('preview.globalAiOpen')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#ecd67c] bg-[#fff5cf] text-[#8a6200] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#ffefb5] focus:outline-none focus:ring-2 focus:ring-banana-500 focus:ring-offset-2 dark:border-banana-700/50 dark:bg-banana-500/10 dark:text-banana"
          >
            <Sparkles size={18} />
          </button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Settings size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => setIsProjectSettingsOpen(true)}
            className="hidden lg:inline-flex"
          >
            <span className="hidden xl:inline">{t('preview.projectSettings')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Upload size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={openTemplateModal}
            className="hidden lg:inline-flex"
          >
            <span className="hidden xl:inline">{t('preview.changeTemplate')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => setIsMaterialModalOpen(true)}
            className="hidden lg:inline-flex"
          >
            <span className="hidden xl:inline">{t('nav.materialGenerate')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => navigate(`/project/${projectId}/outline`)}
            className="hidden sm:inline-flex"
          >
            <span className="hidden md:inline">{t('common.previous')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={16} className={`md:w-[18px] md:h-[18px] ${isRefreshing ? 'animate-spin' : ''}`} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="hidden md:inline-flex"
          >
            <span className="hidden lg:inline">{t('preview.refresh')}</span>
          </Button>
          {/* 导出任务按钮 */}
          {exportTasks.filter(t => t.projectId === projectId).length > 0 && (
            <div className="relative" ref={exportTasksPanelRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowExportTasksPanel(!showExportTasksPanel);
                  setShowExportMenu(false);
                }}
                className="relative"
              >
                {exportTasks.filter(t => t.projectId === projectId && (t.status === 'PROCESSING' || t.status === 'RUNNING' || t.status === 'PENDING')).length > 0 ? (
                  <Loader2 size={16} className="animate-spin text-banana-500" />
                ) : (
                  <FileText size={16} />
                )}
                <span className="ml-1 text-xs">
                  {exportTasks.filter(t => t.projectId === projectId).length}
                </span>
              </Button>
              {showExportTasksPanel && (
                <div className="absolute right-0 mt-2 z-20">
                  <ExportTasksPanel
                    projectId={projectId}
                    pages={currentProject?.pages || []}
                    className="w-96 max-h-[28rem] shadow-lg"
                  />
                </div>
              )}
            </div>
          )}

          <div className="relative" ref={exportMenuRef}>
            <Button
              variant="primary"
              size="sm"
              icon={isExporting ? <Loader2 size={16} className="md:w-[18px] md:h-[18px] animate-spin text-banana-500" /> : <Download size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => {
                setShowExportMenu(!showExportMenu);
                setShowExportTasksPanel(false);
              }}
              disabled={isMultiSelectMode ? selectedPageIds.size === 0 : !hasAllImages}
              title={!isMultiSelectMode && !hasAllImages ? t('preview.disabledExportTip', { count: missingImageCount }) : undefined}
              className="text-xs md:text-sm"
            >
              <span className="hidden sm:inline">
                {isMultiSelectMode && selectedPageIds.size > 0
                  ? `${t('preview.export')} (${selectedPageIds.size})`
                  : t('preview.export')}
              </span>
              <span className="sm:hidden">
                {isMultiSelectMode && selectedPageIds.size > 0
                  ? `(${selectedPageIds.size})`
                  : t('preview.export')}
              </span>
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-background-secondary rounded-lg shadow-lg border border-gray-200 dark:border-border-primary py-2 z-10">
                {isMultiSelectMode && selectedPageIds.size > 0 && (
                  <div className="px-4 py-2 text-xs text-gray-500 dark:text-foreground-tertiary border-b border-gray-100 dark:border-border-primary">
                    {t('preview.exportSelectedPages', { count: selectedPageIds.size })}
                  </div>
                )}
                <button
                  onClick={() => handleExport('pptx')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm"
                >
                  {t('preview.exportPptx')}
                </button>
                <button
                  onClick={() => handleExport('editable-pptx')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm"
                >
                  {t('preview.exportEditablePptx')}
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm"
                >
                  {t('preview.exportPdf')}
                </button>
                <button
                  onClick={() => handleExport('images')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm"
                >
                  {t('preview.exportImages')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-w-0 min-h-0">
        {/* 左侧：缩略图列表 */}
        <aside
          className={`relative w-full md:w-auto bg-white dark:bg-background-secondary border-b md:border-b-0 md:border-r border-gray-200 dark:border-border-primary flex flex-col flex-shrink-0 ${isResizingSidebar ? 'transition-none' : 'transition-[width] duration-300 ease-out'
            } ${isSidebarCollapsed ? 'md:items-center' : ''}`}
          style={isMobileView ? undefined : { width: sidebarWidthPx }}
        >
          {!isMobileView && (
            <div
              className="absolute -right-2 top-0 h-full w-3 cursor-col-resize bg-transparent hover:bg-banana-100/60 z-20"
              onMouseDown={handleSidebarResizeStart}
            />
          )}
          <div
            className={`border-b border-gray-200 dark:border-border-primary flex-shrink-0 space-y-2 md:space-y-3 ${isSidebarCollapsed ? 'px-2 py-3' : 'p-3 md:p-4'
              }`}
          >
            <div className={`flex items-center gap-2 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
              {!isSidebarCollapsed && !isSidebarCompact && (
                <span className="text-xs font-semibold text-gray-600 dark:text-foreground-tertiary">
                  {t('preview.pageCount', { count: currentProject.pages.length })}
                </span>
              )}
              {!isMobileView && (
                <button
                  type="button"
                  onClick={() => {
                    if (isSidebarCollapsed) {
                      setSidebarWidthPxExpanded(sidebarDefaultWidth);
                      setIsSidebarCollapsed(false);
                    } else {
                      setIsSidebarCollapsed(true);
                    }
                  }}
                  title={isSidebarCollapsed ? t('preview.expandSidebar') : t('preview.collapseSidebar')}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:text-foreground-secondary dark:hover:bg-background-hover transition-colors"
                >
                  {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
              )}
            </div>
            {(isSidebarCollapsed || isSidebarCompact) && !isMobileView ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Sparkles size={16} />}
                onClick={handleGenerateAll}
                className="w-10 h-10 p-0"
                disabled={isGenerateDisabled}
                title={generateButtonText}
              />
            ) : (
              <Button
                variant="primary"
                icon={<Sparkles size={16} className="md:w-[18px] md:h-[18px]" />}
                onClick={handleGenerateAll}
                className="w-full text-sm md:text-base"
                disabled={isGenerateDisabled}
              >
                {generateButtonText}
              </Button>
            )}
            {!isSidebarCollapsed && !isSidebarCompact && !isMobileView && (
              <div className="space-y-2">
                <div className="inline-flex w-full rounded-lg border border-gray-200 dark:border-border-primary overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSidebarViewMode('list')}
                    className={`flex-1 h-8 inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ${sidebarViewMode === 'list'
                        ? 'bg-banana-50 text-banana-700 dark:bg-banana-900/30 dark:text-banana-400'
                        : 'bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-tertiary hover:bg-gray-50 dark:hover:bg-background-hover'
                      }`}
                    title={t('preview.sidebarView.list')}
                    aria-label={t('preview.sidebarView.list')}
                  >
                    <List size={14} />
                    <span>{t('preview.sidebarView.list')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarViewMode('grid')}
                    className={`flex-1 h-8 inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-colors border-l border-gray-200 dark:border-border-primary ${sidebarViewMode === 'grid'
                        ? 'bg-banana-50 text-banana-700 dark:bg-banana-900/30 dark:text-banana-400'
                        : 'bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-tertiary hover:bg-gray-50 dark:hover:bg-background-hover'
                      }`}
                    title={t('preview.sidebarView.grid')}
                    aria-label={t('preview.sidebarView.grid')}
                  >
                    <LayoutGrid size={14} />
                    <span>{t('preview.sidebarView.grid')}</span>
                  </button>
                </div>
                {sidebarViewMode === 'grid' && (
                  <div className="rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary px-2 py-1.5">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-foreground-tertiary">
                      <span>{t('preview.gridZoomLabel')}</span>
                      <span>{sidebarGridThumbMaxWidthPx}px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 dark:text-foreground-tertiary">{t('preview.gridZoomSmall')}</span>
                      <input
                        type="range"
                        min={sidebarGridThumbMinPx}
                        max={sidebarGridThumbMaxPx}
                        step={10}
                        value={sidebarGridThumbMaxWidthPx}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next)) return;
                          const clamped = Math.min(Math.max(next, sidebarGridThumbMinPx), sidebarGridThumbMaxPx);
                          setSidebarGridThumbMaxWidthPx(clamped);
                        }}
                        className="h-1.5 w-full cursor-pointer accent-banana-500"
                        aria-label={t('preview.gridZoomLabel')}
                        title={t('preview.gridZoomLabel')}
                      />
                      <span className="text-[10px] text-gray-400 dark:text-foreground-tertiary">{t('preview.gridZoomLarge')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {isSidebarCollapsed && !isMobileView ? (
            <div className="flex-1 overflow-y-auto py-3 flex flex-col items-center gap-2 min-h-0">
              {currentProject.pages.map((page, index) => (
                <div key={page.id || `collapsed-${index}`} className="relative">
                  <button
                    onClick={() => {
                      if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                        togglePageSelection(page.id);
                      } else {
                        setSelectedIndex(index);
                      }
                    }}
                    title={t('preview.page', { num: index + 1 })}
                    className={`w-12 h-9 rounded border-2 transition-all ${selectedIndex === index
                        ? 'border-banana-500 shadow-md'
                        : 'border-gray-200 dark:border-border-primary'
                      } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                  >
                    {(page.preview_image_path || page.generated_image_path) ? (
                      <img
                        src={getImageUrl(page.preview_image_path || page.generated_image_path, page.updated_at)}
                        alt={`Slide ${index + 1}`}
                        className="w-full h-full object-cover rounded"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 dark:bg-background-secondary rounded flex items-center justify-center text-[10px] text-gray-400">
                        {index + 1}
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto md:overflow-y-auto overflow-x-auto md:overflow-x-visible p-3 md:p-4 min-h-0">
              <div className="flex items-center gap-2 text-xs mb-3">
                {isSidebarCompact ? (
                  <button
                    onClick={toggleMultiSelectMode}
                    title={isMultiSelectMode ? t('preview.cancelMultiSelect') : t('preview.multiSelect')}
                    className={`w-8 h-8 rounded transition-colors inline-flex items-center justify-center ${isMultiSelectMode
                        ? 'bg-banana-100 text-banana-700 hover:bg-banana-200'
                        : 'text-gray-500 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover'
                      }`}
                  >
                    {isMultiSelectMode ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                ) : (
                  <button
                    onClick={toggleMultiSelectMode}
                    className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${isMultiSelectMode
                        ? 'bg-banana-100 text-banana-700 hover:bg-banana-200'
                        : 'text-gray-500 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover'
                      }`}
                  >
                    {isMultiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
                    <span>{isMultiSelectMode ? t('preview.cancelMultiSelect') : t('preview.multiSelect')}</span>
                  </button>
                )}
                {isMultiSelectMode && !isSidebarCompact && (
                  <>
                    <button
                      onClick={selectedPageIds.size === pagesWithImages.length ? deselectAllPages : selectAllPages}
                      className="text-gray-500 dark:text-foreground-tertiary hover:text-banana-600 transition-colors"
                    >
                      {selectedPageIds.size === pagesWithImages.length ? t('common.deselectAll') : t('common.selectAll')}
                    </button>
                    {selectedPageIds.size > 0 && (
                      <span className="text-banana-600 font-medium">
                        ({selectedPageIds.size}{t('preview.pagesUnit')})
                      </span>
                    )}
                  </>
                )}
                {isMultiSelectMode && isSidebarCompact && selectedPageIds.size > 0 && (
                  <span className="text-banana-600 font-medium">
                    {selectedPageIds.size}
                  </span>
                )}
              </div>
              {isSidebarGridMode ? (
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${sidebarGridColumns}, minmax(0, 1fr))` }}
                >
                  {currentProject.pages.map((page, index) => {
                    const hasImage = Boolean(page.preview_image_path || page.generated_image_path);
                    return (
                      <div key={page.id || `grid-${index}`} className="relative group">
                        <button
                          onClick={() => {
                            if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                              togglePageSelection(page.id);
                            } else {
                              setSelectedIndex(index);
                            }
                          }}
                          className={`w-full overflow-hidden rounded-lg bg-white dark:bg-background-secondary shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all ${selectedIndex === index
                              ? 'ring-2 ring-banana-300 shadow-[0_10px_30px_rgba(250,204,21,0.18)]'
                              : 'ring-1 ring-gray-200 hover:ring-gray-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
                            } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                        >
                          <div className="text-xs font-medium px-2 py-1 text-left text-gray-600 dark:text-foreground-tertiary bg-white/90 dark:bg-background-secondary/90">
                            {t('preview.page', { num: index + 1 })}
                          </div>
                          <div className="aspect-video bg-gray-100 dark:bg-background-primary ring-1 ring-gray-200/90">
                            {(page.preview_image_path || page.generated_image_path) ? (
                              <img
                                src={getImageUrl(page.preview_image_path || page.generated_image_path, page.updated_at)}
                                alt={`Slide ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                                {index + 1}
                              </div>
                            )}
                          </div>
                        </button>
                        {isMultiSelectMode && page.id && hasImage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageSelection(page.id!);
                            }}
                            className={`absolute top-2 right-2 z-10 w-5 h-5 rounded flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                                ? 'bg-banana-500 text-white shadow-md'
                                : 'bg-white/90 border border-gray-300 dark:border-border-primary'
                              }`}
                          >
                            {selectedPageIds.has(page.id) && <Check size={12} />}
                          </button>
                        )}
                        {!isMultiSelectMode && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePage(page);
                            }}
                            className={`absolute top-2 right-2 z-20 p-1.5 bg-white/95 dark:bg-background-secondary rounded-lg border border-gray-200 dark:border-border-primary text-red-600 transition-opacity hover:bg-red-50 ${hasImage ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'
                              }`}
                            title={t('preview.confirmDeleteTitle')}
                            aria-label={t('preview.confirmDeleteTitle')}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleInsertPageAfter(page, index);
                          }}
                          title={t('preview.insertAfterPage')}
                          aria-label={t('preview.insertAfterPage')}
                          className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 h-7 w-7 hidden md:inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-secondary shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:bg-banana-50 dark:hover:bg-background-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-400"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex md:flex-col gap-2 md:gap-4 min-w-max md:min-w-0">
                  {currentProject.pages.map((page, index) => (
                    <div key={page.id || `list-${index}`} className="md:w-full flex-shrink-0 relative group">
                      {/* 移动端：简化缩略图 */}
                      <div className="md:hidden relative">
                        <button
                          onClick={() => {
                            if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                              togglePageSelection(page.id);
                            } else {
                              setSelectedIndex(index);
                            }
                          }}
                          className={`h-14 w-20 rounded bg-white dark:bg-background-secondary shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all ${selectedIndex === index
                              ? 'ring-2 ring-banana-300 shadow-[0_10px_30px_rgba(250,204,21,0.18)]'
                              : 'ring-1 ring-gray-200'
                            } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                        >
                          {(page.preview_image_path || page.generated_image_path) ? (
                            <img
                              src={getImageUrl(page.preview_image_path || page.generated_image_path, page.updated_at)}
                              alt={`Slide ${index + 1}`}
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            <div className="w-full h-full rounded bg-gray-100 dark:bg-background-secondary flex items-center justify-center text-xs text-gray-400">
                              {index + 1}
                            </div>
                          )}
                        </button>
                        {isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageSelection(page.id!);
                            }}
                            className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                                ? 'bg-banana-500 text-white'
                                : 'bg-white dark:bg-background-secondary border-2 border-gray-300 dark:border-border-primary'
                              }`}
                          >
                            {selectedPageIds.has(page.id) && <Check size={12} />}
                          </button>
                        )}
                      </div>
                      {/* 桌面端：完整卡片 */}
                      <div className="hidden md:block relative">
                        {isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageSelection(page.id!);
                            }}
                            className={`absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                                ? 'bg-banana-500 text-white shadow-md'
                                : 'bg-white/90 border-2 border-gray-300 dark:border-border-primary hover:border-banana-400'
                              }`}
                          >
                            {selectedPageIds.has(page.id) && <Check size={14} />}
                          </button>
                        )}
                        <SlideCard
                          page={page}
                          index={index}
                          isSelected={selectedIndex === index}
                          onClick={() => {
                            if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                              togglePageSelection(page.id);
                            } else {
                              setSelectedIndex(index);
                            }
                          }}
                          onEdit={() => {
                            setSelectedIndex(index);
                            handleEditPage();
                          }}
                          onDelete={() => handleDeletePage(page)}
                          showDelete={!isMultiSelectMode}
                          isGenerating={page.id ? isPageGenerating(page) : false}
                          aspectRatio={aspectRatio}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleInsertPageAfter(page, index);
                          }}
                          title={t('preview.insertAfterPage')}
                          aria-label={t('preview.insertAfterPage')}
                          className="absolute left-1/2 -bottom-3 -translate-x-1/2 z-20 h-7 w-7 hidden md:inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-secondary shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:bg-banana-50 dark:hover:bg-background-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-400"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        <main className="flex-1 flex flex-col bg-[#f6f3ea] dark:bg-background-primary min-w-0 overflow-hidden">
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
              <div
                data-testid="preview-editor-toolbar"
                className="flex min-h-[40px] flex-wrap items-center gap-2 py-1"
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Sparkles size={16} />}
                  className="h-9 rounded-xl"
                  onClick={() => void handleGenerateDescriptions()}
                >
                  批量生成描述
                </Button>
                <div className="relative" ref={settingsRef}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 rounded-xl"
                    onClick={() => setSettingsOpen((prev) => !prev)}
                    icon={<Settings2 size={16} />}
                  >
                    描述设置
                  </Button>
                  {settingsOpen && (
                    <div className="absolute left-0 top-full mt-2 z-30 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-border-primary dark:bg-background-secondary">
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-foreground-tertiary">
                            生成模式
                            <span className="relative group">
                              <HelpCircle size={12} className="cursor-help text-gray-400" />
                              <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-56 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-gray-600 opacity-0 shadow-md transition-opacity group-hover:opacity-100 dark:border-border-primary dark:bg-background-primary dark:text-foreground-secondary">
                                流式：AI 从第一页开始逐页输出，速度慢但效果更好。并行：AI 根据大纲并行生成每页描述，速度快但可能不够细致。
                              </span>
                            </span>
                          </label>
                          <div className="flex gap-1">
                            {(['streaming', 'parallel'] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                  generationMode === mode
                                    ? 'bg-banana-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-background-hover dark:text-foreground-tertiary dark:hover:bg-background-primary'
                                }`}
                                onClick={() => {
                                  setGenerationMode(mode);
                                  saveSettingsDebounced({ description_generation_mode: mode });
                                }}
                              >
                                {mode === 'streaming' ? '流式' : '并行'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-foreground-tertiary">
                            额外字段
                            <span className="relative group">
                              <HelpCircle size={12} className="cursor-help text-gray-400" />
                              <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-56 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-gray-600 opacity-0 shadow-md transition-opacity group-hover:opacity-100 dark:border-border-primary dark:bg-background-primary dark:text-foreground-secondary">
                                启用后，AI 生成描述时会带上这些字段。点击胶囊启用/禁用，拖拽调整顺序。
                              </span>
                            </span>
                          </label>
                          <DndContext sensors={fieldSensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
                            <SortableContext items={availableFields} strategy={rectSortingStrategy}>
                              <div className="mb-2 flex flex-wrap gap-1.5">
                                {availableFields.map((name) => {
                                  const active = extraFieldNames.includes(name);
                                  return (
                                    <SortableFieldPill
                                      key={name}
                                      name={name}
                                      active={active}
                                      removable={!PRESET_EXTRA_FIELDS.has(name)}
                                      onToggle={() => {
                                        const next = active
                                          ? extraFieldNames.filter((field) => field !== name)
                                          : [...extraFieldNames, name];
                                        const normalizedNext = next.length > 0 ? next : DEFAULT_EXTRA_FIELDS;
                                        setExtraFieldNames(normalizedNext);
                                        saveSettingsDebounced({ description_extra_fields: normalizedNext });
                                      }}
                                      inImagePrompt={imagePromptFields.includes(name)}
                                      imagePromptTooltip={imagePromptFields.includes(name) ? '该字段会影响生成的图片效果，点击可关闭' : '该字段不会影响生成的图片，点击可开启'}
                                      onToggleImagePrompt={() => {
                                        const next = imagePromptFields.includes(name)
                                          ? imagePromptFields.filter((field) => field !== name)
                                          : [...imagePromptFields, name];
                                        setImagePromptFields(next);
                                        saveSettingsDebounced({ image_prompt_extra_fields: next });
                                      }}
                                      onRemove={() => {
                                        const nextPool = availableFields.filter((field) => field !== name);
                                        setAvailableFields(nextPool);
                                        localStorage.setItem('banana-available-extra-fields', JSON.stringify(nextPool));
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </SortableContext>
                          </DndContext>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-banana-500/30 dark:border-border-primary dark:bg-background-primary dark:text-foreground-secondary"
                              placeholder="添加字段"
                              value={newFieldName}
                              onChange={(event) => setNewFieldName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && newFieldName.trim()) {
                                  event.preventDefault();
                                  const trimmed = newFieldName.trim();
                                  if (!availableFields.includes(trimmed) && availableFields.length < 10) {
                                    const nextPool = [...availableFields, trimmed];
                                    setAvailableFields(nextPool);
                                    localStorage.setItem('banana-available-extra-fields', JSON.stringify(nextPool));
                                    const nextActive = [...extraFieldNames, trimmed];
                                    setExtraFieldNames(nextActive);
                                    saveSettingsDebounced({ description_extra_fields: nextActive });
                                    setNewFieldName('');
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-banana-500 disabled:opacity-40 dark:hover:bg-background-hover"
                              disabled={!newFieldName.trim() || availableFields.includes(newFieldName.trim()) || availableFields.length >= 10}
                              onClick={() => {
                                const trimmed = newFieldName.trim();
                                if (trimmed && !availableFields.includes(trimmed) && availableFields.length < 10) {
                                  const nextPool = [...availableFields, trimmed];
                                  setAvailableFields(nextPool);
                                  localStorage.setItem('banana-available-extra-fields', JSON.stringify(nextPool));
                                  const nextActive = [...extraFieldNames, trimmed];
                                  setExtraFieldNames(nextActive);
                                  saveSettingsDebounced({ description_extra_fields: nextActive });
                                  setNewFieldName('');
                                }
                              }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-foreground-tertiary">
                            描述生成要求
                          </label>
                          <Textarea
                            value={descriptionRequirementsDraft}
                            onChange={(event) => setDescriptionRequirementsDraft(event.target.value)}
                            rows={3}
                            placeholder="例如：每页描述控制在100字以内、多使用数据和案例、强调关键指标..."
                          />
                          <div className="mt-2 flex justify-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleSaveDescriptionRequirements()}
                              loading={isSavingDescriptionRequirements}
                            >
                              保存要求
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative" ref={fileMenuRef}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowUpDown size={16} />}
                    className="h-9 rounded-xl"
                    onClick={() => setFileMenuOpen((prev) => !prev)}
                  >
                    导入/导出
                    <ChevronDown size={14} className={`ml-1 transition-transform ${fileMenuOpen ? 'rotate-180' : ''}`} />
                  </Button>
                  {fileMenuOpen && (
                    <div className="absolute left-0 top-full mt-2 z-30 min-w-[170px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-border-primary dark:bg-background-secondary">
                      <button
                        type="button"
                        onClick={() => {
                          handleExportDescriptions();
                          setFileMenuOpen(false);
                        }}
                        disabled={!currentProject.pages.some((page) => page.description_content)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:text-foreground-tertiary dark:hover:bg-background-hover"
                      >
                        <Download size={14} />
                        导出描述
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleExportFull();
                          setFileMenuOpen(false);
                        }}
                        disabled={!currentProject.pages.some((page) => page.description_content)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:text-foreground-tertiary dark:hover:bg-background-hover"
                      >
                        <Download size={14} />
                        导出大纲+描述
                      </button>
                      <div className="border-t border-gray-100 dark:border-border-primary" />
                      <button
                        type="button"
                        onClick={() => {
                          importFileRef.current?.click();
                          setFileMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-foreground-tertiary dark:hover:bg-background-hover"
                      >
                        <Upload size={14} />
                        导入描述
                      </button>
                    </div>
                  )}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  icon={<BookOpen size={16} />}
                  className="h-9 rounded-xl"
                  onClick={() => void handleCoverEndingView()}
                >
                  封面/结尾信息
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="preview-primary-save"
                  icon={<FileText size={16} />}
                  className="h-9 rounded-xl"
                  onClick={() => void handleSaveCurrentPage()}
                  disabled={isPageAiSubmitting}
                >
                  仅保存文本
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ImagePlus size={16} />}
                  className="h-9 rounded-xl"
                  data-testid="preview-primary-generate"
                  onClick={() => void handleQuickGenerateImage()}
                  disabled={isPageAiSubmitting || isCheckingCoverEnding}
                  loading={isCheckingCoverEnding}
                >
                  {selectedPageHasImage ? '重新生成图片' : '生成图片'}
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".md,.txt"
                  className="hidden"
                  onChange={handleImportDescriptions}
                />
              </div>
            </div>
          </div>

          {currentProject.pages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center overflow-y-auto">
              <div className="text-center">
                <div className="text-4xl md:text-6xl mb-4">📊</div>
                <h3 className="text-lg md:text-xl font-semibold text-gray-700 dark:text-foreground-secondary mb-2">
                  {t('preview.noPages')}
                </h3>
                <p className="text-sm md:text-base text-gray-500 dark:text-foreground-tertiary mb-6">
                  {t('preview.noPagesHint')}
                </p>
                <Button
                  variant="primary"
                  icon={<Plus size={16} />}
                  onClick={() => void handleInsertPageAfter(undefined, -1)}
                  className="text-sm md:text-base"
                >
                  {t('preview.addFirstPage')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/project/${projectId}/outline`)}
                  className="text-sm md:text-base mt-2"
                >
                  {t('preview.backToEdit')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-hidden px-2 py-3 md:px-3 md:py-4">
                <div className="flex h-full w-full flex-col gap-4">
                  {isRenovationProcessing && (
                    <div className="rounded-2xl border border-banana-200 bg-white/90 px-4 py-4 shadow-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">正在解析页面内容...</span>
                        {renovationProgress && renovationProgress.total > 0 && (
                          <span className="text-sm font-medium text-banana-600 dark:text-banana">
                            {renovationProgress.completed}/{renovationProgress.total} 页
                          </span>
                        )}
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-background-hover">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-banana-400 to-banana-500 transition-all duration-500"
                          style={{
                            width: renovationProgress && renovationProgress.total > 0
                              ? `${Math.round((renovationProgress.completed / renovationProgress.total) * 100)}%`
                              : '10%',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div
                    ref={previewSplitContainerRef}
                    data-testid="preview-main-split"
                    className={`min-h-0 flex-1 ${isMobileView ? 'flex flex-col gap-4 overflow-y-auto' : 'grid overflow-hidden'}`}
                    style={!isMobileView
                      ? {
                        gridTemplateColumns: `minmax(${PREVIEW_VISUAL_MIN_WIDTH}px, ${Math.max(resolvedPreviewSplitRatio * 100, 1)}fr) ${PREVIEW_SPLIT_DIVIDER_PX}px minmax(${PREVIEW_EDITOR_MIN_WIDTH}px, ${Math.max((1 - resolvedPreviewSplitRatio) * 100, 1)}fr)`,
                      }
                      : undefined}
                  >
                    <section
                      data-testid="preview-visual-pane"
                      className="min-w-0 overflow-hidden"
                    >
                      <div className="flex h-full flex-col">
                        <div className="flex-1 overflow-auto px-2 pb-2 pt-1 md:px-3 md:pb-3 md:pt-2">
                          <div className={`flex h-full min-h-[320px] ${selectedPageHasImage ? 'items-center justify-stretch' : 'items-center justify-center'}`}>
                            <div className={selectedPageHasImage ? 'h-full w-full' : 'w-full'}>
                              <div className={`flex ${selectedPageHasImage ? 'h-full flex-col items-center justify-center gap-4' : ''}`}>
                                <div
                                  ref={previewContainerRef}
                                  className={`relative overflow-hidden touch-manipulation ${isFullscreen
                                    ? 'h-screen w-screen max-h-none max-w-none rounded-none bg-black shadow-none'
                                    : 'rounded-2xl border border-[#eadfbf] bg-white dark:border-border-primary dark:bg-background-primary'
                                  }`}
                                  style={isFullscreen ? undefined : { aspectRatio: aspectRatioStyle, width: '100%' }}
                                  onMouseDown={selectedPageHasImage ? handleSelectionMouseDown : undefined}
                                  onMouseMove={selectedPageHasImage ? handleSelectionMouseMove : undefined}
                                  onMouseUp={selectedPageHasImage ? handleSelectionMouseUp : undefined}
                                  onMouseLeave={selectedPageHasImage ? handleSelectionMouseUp : undefined}
                                >
                                  {selectedPageHasImage ? (
                                    <>
                                      <img
                                        ref={imageRef}
                                        src={imageUrl}
                                        alt={`Slide ${selectedIndex + 1}`}
                                        className={`h-full w-full select-none ${isFullscreen ? 'object-contain' : 'object-contain'}`}
                                        draggable={false}
                                        crossOrigin="anonymous"
                                      />
                                      <button
                                        type="button"
                                        aria-label={isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')}
                                        title={isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')}
                                        onMouseDown={handleFloatingFullscreenButtonMouseDown}
                                        onClick={handleFloatingFullscreenButtonClick}
                                        className={`absolute z-20 inline-flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-[0_10px_28px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:border-banana-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 ${isDraggingFloatingFullscreenButton ? 'cursor-grabbing' : 'cursor-grab'}`}
                                        style={{
                                          left: `${floatingFullscreenButtonPosition.x * 100}%`,
                                          top: `${floatingFullscreenButtonPosition.y * 100}%`,
                                        }}
                                      >
                                        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                      </button>
                                      {selectionRect && (
                                        <div
                                          className="pointer-events-none absolute border-2 border-banana-500 bg-banana-400/10"
                                          style={{
                                            left: selectionRect.left,
                                            top: selectionRect.top,
                                            width: selectionRect.width,
                                            height: selectionRect.height,
                                          }}
                                        />
                                      )}
                                    </>
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-[#f7f5ef] text-sm text-slate-400 dark:bg-background-secondary dark:text-foreground-tertiary">
                                      尚未生成图片
                                    </div>
                                  )}
                                </div>
                                {selectedPageHasImage && imageVersions.length > 1 && !isFullscreen && (
                                  <div className="flex w-full flex-col items-center gap-2 px-2 pb-1">
                                    <div className="text-xs font-medium tracking-[0.18em] text-[#9f8b5b] dark:text-foreground-tertiary">
                                      {t('preview.historyVersions')} ({imageVersions.length})
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                      {[...imageVersions]
                                        .sort((a, b) => a.version_number - b.version_number)
                                        .map((version, index) => (
                                          <button
                                            key={version.version_id}
                                            type="button"
                                            onClick={() => handleSwitchVersion(version.version_id)}
                                            aria-pressed={version.is_current}
                                            aria-label={`${t('preview.version')} ${index + 1}${version.is_current ? `，${t('preview.current')}` : ''}`}
                                            title={`${t('preview.version')} ${index + 1}${version.is_current ? ` (${t('preview.current')})` : ''}`}
                                            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 ${
                                              version.is_current
                                                ? 'border-banana-500 bg-banana-500 text-white shadow-[0_10px_24px_rgba(245,181,0,0.28)]'
                                                : 'border-[#d8caa6] bg-white text-[#6f5f3d] hover:border-banana-400 hover:text-banana-600 dark:border-border-primary dark:bg-background-primary dark:text-foreground-primary'
                                            }`}
                                          >
                                            {index + 1}
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {!isMobileView && (
                      <div
                        data-testid="preview-split-divider"
                        role="separator"
                        aria-orientation="vertical"
                        className={`group relative cursor-col-resize ${isResizingPreviewSplit ? 'bg-banana-300/70' : 'bg-transparent'}`}
                        onMouseDown={handlePreviewSplitResizeStart}
                      >
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:bg-banana-300 dark:bg-border-primary dark:group-hover:bg-banana-500/70" />
                      </div>
                    )}

                    <section
                      data-testid="preview-editor-pane"
                      className="min-h-0 min-w-0 overflow-visible"
                    >
                      <div className="flex h-full flex-col px-3 pt-3 md:px-4 md:pt-4">
                        <div className="shrink-0">
                          {editorCanvasContent}
                        </div>
                        <div className="mt-3 shrink-0">
                          {externalFieldTags}
                        </div>
                        <div className="mt-2 min-h-0 flex-1 overflow-visible">
                          <div className="h-full">
                            <PageAiWorkbench
                              title={t('preview.pageAiTitle')}
                              subtitle={t('preview.pageAiSubtitle')}
                              emptyTitle={t('preview.pageAiEmptyTitle')}
                              emptyDescription={t('preview.pageAiEmptyDescription')}
                              inputPlaceholder={t('preview.editPromptPlaceholder')}
                              inputHint={t('preview.pageAiInputHint')}
                              sendTooltip={t('preview.pageAiSendTooltip')}
                              referencesTitle={t('preview.pageAiReferencesTitle')}
                              referencesEmpty={t('preview.pageAiReferencesEmpty')}
                              descriptionSourcesTitle={t('preview.pageAiDescriptionSourcesTitle')}
                              templateLabel={t('preview.pageAiTemplateReference')}
                              materialLabel={t('preview.pageAiMaterialReference')}
                              uploadLabel={t('preview.pageAiUploadReference')}
                              loadingLabel={t('preview.pageAiLoading')}
                              regionSelectLabel={t('preview.regionSelect')}
                              regionSelectActiveLabel={t('preview.endRegionSelect')}
                              modelLabel={t('preview.editRunImageModelLabel')}
                              modelHint={t('preview.editRunImageModelHint')}
                              messages={pageAiMessages}
                              references={selectedPageAiReferences}
                              descriptionImageOptions={descriptionImageOptions}
                              hasTemplateReference={selectedContextImages.useTemplate}
                              templatePreviewUrl={templatePreviewUrl}
                              activeReferenceId={activePreviewReferenceId}
                              inputValue={editPrompt}
                              modelValue={editRunImageModel}
                              modelOptions={PROJECT_SUPPORTED_IMAGE_MODELS}
                              isSubmitting={isPageAiSubmitting}
                              isRegionSelectionActive={isRegionSelectionMode}
                              onInputChange={setEditPrompt}
                              onModelChange={setEditRunImageModel}
                              onSend={() => void handlePageAiSend()}
                              onToggleRegionSelect={() => {
                                setIsRegionSelectionMode((prev) => !prev);
                                setSelectionStart(null);
                                setSelectionRect(null);
                                setIsSelectingRegion(false);
                              }}
                              onToggleTemplate={handleToggleTemplateReference}
                              onToggleDescriptionImage={handleToggleDescriptionImage}
                              onReferenceClick={handlePreviewReferenceFocus}
                              onRemoveReference={handleRemovePageAiReference}
                              onOpenMaterialSelector={projectId ? () => setIsMaterialSelectorOpen(true) : undefined}
                              onUploadFiles={handleFileUpload}
                            />
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>

              <div
                data-testid="preview-status-bar"
                className="border-t border-gray-200 bg-white/92 px-4 py-3 dark:border-border-primary dark:bg-background-secondary/95"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-foreground-secondary">
                    <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-background-hover">
                      第 {selectedIndex + 1} / {currentProject.pages.length} 页
                    </span>
                    <span className={`rounded-full px-3 py-1 ${isCurrentPageDirty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {textStatusLabel}
                    </span>
                    <span className={`rounded-full px-3 py-1 ${selectedPageHasImage ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600 dark:bg-background-hover dark:text-foreground-tertiary'}`}>
                      {imageStatusLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ChevronLeft size={16} />}
                      onClick={goPrevPage}
                      disabled={selectedIndex === 0}
                    >
                      {t('preview.prevPage')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ChevronRight size={16} />}
                      onClick={goNextPage}
                      disabled={selectedIndex === currentProject.pages.length - 1}
                    >
                      {t('preview.nextPage')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      <ToastContainer />
      {ConfirmDialog}
      <GlobalAiAssistantDrawer
        isOpen={isGlobalAiDrawerOpen}
        onClose={() => setIsGlobalAiDrawerOpen(false)}
        title={t('preview.globalAiTitle')}
        subtitle={t('preview.globalAiSubtitle')}
        welcomeTitle={t('preview.globalAiWelcomeTitle')}
        welcomeDescription={t('preview.globalAiWelcomeDescription')}
        suggestions={[
          t('preview.globalAiSuggestionTone'),
          t('preview.globalAiSuggestionTrim'),
          t('preview.globalAiSuggestionFlow'),
        ]}
        placeholder={t('preview.globalAiPlaceholder')}
        loadingLabel={t('preview.globalAiLoading')}
        responseFallback={t('preview.globalAiResponseFallback')}
        errorFallback={t('preview.globalAiErrorFallback')}
        submitTooltip={t('preview.globalAiSubmitTooltip')}
        inputHint={t('preview.globalAiInputHint')}
        onSubmit={handleAiRefineDescriptions}
      />
      <CoverEndingInfoModal
        isOpen={isCoverEndingModalOpen}
        detectFields={detectFields}
        initialMeta={parsePresentationMeta(currentProject.presentation_meta)}
        onSave={handleCoverEndingSave}
        onSkip={handleCoverEndingSkip}
        onClose={handleCoverEndingClose}
        mode={coverEndingModalMode}
        showSkip={coverEndingModalMode === 'missing'}
      />
      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />

      {/* 模板选择 Modal */}
      <Modal
        isOpen={isTemplateModalOpen}
        onClose={closeTemplateModal}
        title={t('preview.changeTemplate')}
        size="wide"
      >
        <TemplateSelector
          projectId={projectId || null}
          activeTab={activeTemplateTab}
          onActiveTabChange={setActiveTemplateTab}
          draftSelection={draftTemplateSelection}
          onDraftSelectionChange={setDraftTemplateSelection}
          appliedSelection={appliedTemplateSelection}
          appliedStyleJson={currentProject?.template_style_json || ''}
          onApplySelection={handleApplyTemplateSelection}
          isApplyingSelection={isUploadingTemplate}
        />
      </Modal>
      {/* 素材生成模态组件（可复用模块，这里只是示例挂载） */}
      {projectId && (
        <>
          <MaterialGeneratorModal
            projectId={projectId}
            isOpen={isMaterialModalOpen}
            onClose={() => setIsMaterialModalOpen(false)}
          />
          {/* 素材选择器 */}
          <MaterialSelector
            projectId={projectId}
            isOpen={isMaterialSelectorOpen}
            onClose={() => setIsMaterialSelectorOpen(false)}
            onSelect={handleSelectMaterials}
            multiple={true}
          />
          {/* 项目设置模态框 */}
          <ProjectSettingsModal
            isOpen={isProjectSettingsOpen}
            onClose={() => setIsProjectSettingsOpen(false)}
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
            onSaveExtraRequirements={handleSaveExtraRequirements}
            onSaveTemplateStyle={handleSaveTemplateStyle}
            isSavingRequirements={isSavingRequirements}
            isSavingTemplateStyle={isSavingTemplateStyle}
            // 导出设置
            exportExtractorMethod={exportExtractorMethod}
            exportInpaintMethod={exportInpaintMethod}
            exportAllowPartial={exportAllowPartial}
            exportCompressEnabled={exportCompressEnabled}
            exportCompressFormat={exportCompressFormat}
            exportCompressQuality={exportCompressQuality}
            exportCompressPngQuantizeEnabled={exportCompressPngQuantizeEnabled}
            onExportExtractorMethodChange={setExportExtractorMethod}
            onExportInpaintMethodChange={setExportInpaintMethod}
            onExportAllowPartialChange={setExportAllowPartial}
            onExportCompressEnabledChange={setExportCompressEnabled}
            onExportCompressFormatChange={setExportCompressFormat}
            onExportCompressQualityChange={setExportCompressQuality}
            onExportCompressPngQuantizeEnabledChange={setExportCompressPngQuantizeEnabled}
            onSaveExportSettings={handleSaveExportSettings}
            isSavingExportSettings={isSavingExportSettings}
            // 画面比例
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            onSaveAspectRatio={handleSaveAspectRatio}
            isSavingAspectRatio={isSavingAspectRatio}
            hasImages={hasImages}
            generationDefaultImageSource={projectDefaultImageSource}
            generationDefaultImageModel={projectDefaultImageModel}
            generationDefaultImageResolution={projectDefaultImageResolution}
            onGenerationDefaultImageSourceChange={setProjectDefaultImageSource}
            onGenerationDefaultImageModelChange={setProjectDefaultImageModel}
            onGenerationDefaultImageResolutionChange={setProjectDefaultImageResolution}
            onSaveGenerationDefaults={handleSaveGenerationDefaults}
            isSavingGenerationDefaults={isSavingGenerationDefaults}
          />
        </>
      )}

      {/* 1K分辨率警告对话框 */}
      <Modal
        isOpen={show1KWarningDialog}
        onClose={handleCancel1KWarning}
        title={t('preview.resolution1KWarning')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <p className="text-sm text-amber-800">
                {t('preview.resolution1KWarningText')}
              </p>
              <p className="text-sm text-amber-700 mt-2">
                {t('preview.resolution1KWarningHint')}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skip1KWarningChecked}
              onChange={(e) => setSkip1KWarningChecked(e.target.checked)}
              className="w-4 h-4 text-banana-600 rounded focus:ring-banana-500"
            />
            <span className="text-sm text-gray-600 dark:text-foreground-tertiary">{t('preview.dontShowAgain')}</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleCancel1KWarning}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirm1KWarning}>
              {t('preview.generateAnyway')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 批量生成范围选择对话框 */}
      <Modal
        isOpen={showBatchGenerateDialog}
        onClose={() => {
          setShowBatchGenerateDialog(false);
          setBatchGenerateContext(null);
        }}
        title={t('preview.confirmPartialGenerateTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-foreground-secondary">
            {batchGenerateContext
              ? t(
                batchGenerateContext.generating > 0
                  ? 'preview.confirmPartialGenerateWithGeneratingMessage'
                  : 'preview.confirmPartialGenerateMessage',
                {
                  generated: batchGenerateContext.generated,
                  total: batchGenerateContext.total,
                  missing: batchGenerateContext.missing,
                  generating: batchGenerateContext.generating,
                }
              )
              : ''}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                if (!batchGenerateContext) return;
                setShowBatchGenerateDialog(false);
                setBatchGenerateContext(null);
                await handleBatchGenerate(batchGenerateContext.missingPageIds);
              }}
            >
              {batchGenerateContext
                ? t('preview.generateMissingOnly', { count: batchGenerateContext.missing })
                : t('preview.generateMissingOnly', { count: 0 })}
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!batchGenerateContext) return;
                setShowBatchGenerateDialog(false);
                setBatchGenerateContext(null);
                await handleBatchGenerate(batchGenerateContext.targetPageIds);
              }}
            >
              {batchGenerateContext
                ? t('preview.regenerateAllPages', { count: batchGenerateContext.total })
                : t('preview.regenerateAllPages', { count: 0 })}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowBatchGenerateDialog(false);
                setBatchGenerateContext(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
