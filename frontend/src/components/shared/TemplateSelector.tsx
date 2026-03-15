import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, FileCode2, Image as ImageIcon, Layers3, RefreshCw } from 'lucide-react';
import { getImageUrl } from '@/api/client';
import {
  listUserTemplates,
  listPresetTemplates,
  listStylePresets,
  type UserTemplate,
  type PresetTemplate,
  type Material,
  type StylePreset,
  type StylePresetPreviewImages,
} from '@/api/endpoints';
import { useT } from '@/hooks/useT';
import { Button } from './Button';
import { useToast } from './Toast';
import { MaterialLibraryPanel } from './MaterialSelector';

const INITIAL_BATCH = 24;
const BATCH_SIZE = 24;

export type TemplateSource = 'user' | 'preset' | 'upload';
export type TemplateSelectorTab = 'image' | 'json' | 'material';

export type TemplateSelection =
  | {
      kind: 'user';
      id: string;
      name: string;
      previewUrl: string;
      templateId: string;
    }
  | {
      kind: 'preset';
      id: string;
      name: string;
      previewUrl: string;
      templateId: string;
    }
  | {
      kind: 'style';
      id: string;
      name: string;
      previewUrl: string;
      presetId: string;
      styleJson: string;
      previewImages: StylePresetPreviewImages;
    }
  | {
      kind: 'material';
      id: string;
      name: string;
      previewUrl: string;
      material: Material;
    };

export type AppliedTemplateSelection = Pick<TemplateSelection, 'kind' | 'id'>;

const templateI18n = {
  zh: {
    template: {
      tabs: {
        image: '图片模版',
        json: 'JSON文本模版',
        material: '从素材库选择',
      },
      imageSearch: '搜索图片模版名称',
      jsonSearch: '搜索 JSON 文本模版名称',
      myTemplates: '我的图片模版',
      presetTemplates: '图片模版库',
      jsonTemplates: 'JSON文本模版',
      emptyImage: '暂无图片模版',
      emptyJson: '暂无 JSON 文本模版',
      emptyImageHint: '请前往模板管理维护图片模版',
      emptyJsonHint: '请前往模板管理维护 JSON 文本模版',
      goToStyleLibrary: '去模板管理',
      goToMaterialLibrary: '去素材管理',
      statusCurrent: '当前使用',
      statusPending: '已选中待应用',
      statusIdle: '可选择',
      applySelection: '应用当前选择',
      applyCurrent: '当前已在使用',
      selectionTitle: '当前选择',
      currentTitle: '当前使用中',
      selectionPlaceholder: '左侧选择一个模版后，在这里确认并应用到后续页面生成。',
      selectionTip: '点击卡片只会进入草稿态；只有点击“应用当前选择”才会更新项目。',
      noPreview: '当前模版暂无预览图',
      sourceMyTemplate: '来源：我的图片模版',
      sourcePresetTemplate: '来源：图片模版库',
      sourceJsonTemplate: '来源：JSON文本模版',
      sourceMaterial: '来源：素材库',
      refresh: '刷新',
      loadFailed: '加载模版失败',
      materialHint: '这里只支持选择已有素材；上传和生成请前往素材管理完成。',
      previewSlots: {
        cover: '封面',
        toc: '目录',
        detail: '详情',
        ending: '结尾',
      },
    },
  },
  en: {
    template: {
      tabs: {
        image: 'Image Templates',
        json: 'JSON Templates',
        material: 'From Materials',
      },
      imageSearch: 'Search image templates',
      jsonSearch: 'Search JSON templates',
      myTemplates: 'My Image Templates',
      presetTemplates: 'Image Template Library',
      jsonTemplates: 'JSON Text Templates',
      emptyImage: 'No image templates',
      emptyJson: 'No JSON templates',
      emptyImageHint: 'Manage image templates in the template library',
      emptyJsonHint: 'Manage JSON templates in the template library',
      goToStyleLibrary: 'Open Template Library',
      goToMaterialLibrary: 'Open Material Management',
      statusCurrent: 'Current',
      statusPending: 'Pending Apply',
      statusIdle: 'Selectable',
      applySelection: 'Apply Current Selection',
      applyCurrent: 'Already Applied',
      selectionTitle: 'Current Selection',
      currentTitle: 'Currently Applied',
      selectionPlaceholder: 'Choose a template from the left, then confirm it here before applying it to future page generation.',
      selectionTip: 'Clicking a card only creates a draft. The project changes only after “Apply Current Selection”.',
      noPreview: 'No preview available for this template',
      sourceMyTemplate: 'Source: My Image Templates',
      sourcePresetTemplate: 'Source: Image Template Library',
      sourceJsonTemplate: 'Source: JSON Text Templates',
      sourceMaterial: 'Source: Material Library',
      refresh: 'Refresh',
      loadFailed: 'Failed to load templates',
      materialHint: 'This tab only selects existing materials. Upload or generate materials in Material Management.',
      previewSlots: {
        cover: 'Cover',
        toc: 'TOC',
        detail: 'Detail',
        ending: 'Ending',
      },
    },
  }
};

interface TemplateSelectorProps {
  projectId?: string | null;
  activeTab: TemplateSelectorTab;
  onActiveTabChange: (tab: TemplateSelectorTab) => void;
  draftSelection: TemplateSelection | null;
  onDraftSelectionChange: (selection: TemplateSelection | null) => void;
  appliedSelection: AppliedTemplateSelection | null;
  appliedStyleJson?: string | null;
  onApplySelection: (selection: TemplateSelection) => Promise<void> | void;
  isApplyingSelection?: boolean;
}

const buildUserSelection = (template: UserTemplate): TemplateSelection => ({
  kind: 'user',
  id: template.template_id,
  name: template.name || template.template_id,
  previewUrl: template.thumb_url || template.template_image_url,
  templateId: template.template_id,
});

const buildPresetSelection = (template: PresetTemplate): TemplateSelection => ({
  kind: 'preset',
  id: template.template_id,
  name: template.name || template.template_id,
  previewUrl: template.thumb_url || template.template_image_url,
  templateId: template.template_id,
});

const getStylePresetCover = (preset: StylePreset) => {
  const preview: Partial<StylePresetPreviewImages> = preset.preview_images || {};
  return preview.cover_url || preview.toc_url || preview.detail_url || preview.ending_url || '';
};

const buildStyleSelection = (preset: StylePreset): TemplateSelection => ({
  kind: 'style',
  id: preset.id,
  name: preset.name || preset.id,
  previewUrl: getStylePresetCover(preset),
  presetId: preset.id,
  styleJson: preset.style_json,
  previewImages: {
    cover_url: preset.preview_images?.cover_url || '',
    toc_url: preset.preview_images?.toc_url || '',
    detail_url: preset.preview_images?.detail_url || '',
    ending_url: preset.preview_images?.ending_url || '',
  },
});

const buildMaterialSelection = (material: Material): TemplateSelection => ({
  kind: 'material',
  id: material.id,
  name: (material.prompt && material.prompt.trim()) ||
    (material.name && material.name.trim()) ||
    material.filename ||
    material.url,
  previewUrl: material.url,
  material,
});

const isSameSelection = (
  left: Pick<TemplateSelection, 'kind' | 'id'> | null | undefined,
  right: Pick<TemplateSelection, 'kind' | 'id'> | null | undefined,
) => Boolean(left && right && left.kind === right.kind && left.id === right.id);

const previewSlotMeta: Array<{ key: keyof StylePresetPreviewImages; labelKey: keyof typeof templateI18n.zh.template.previewSlots }> = [
  { key: 'cover_url', labelKey: 'cover' },
  { key: 'toc_url', labelKey: 'toc' },
  { key: 'detail_url', labelKey: 'detail' },
  { key: 'ending_url', labelKey: 'ending' },
];

const TemplateCard: React.FC<{
  title: string;
  previewUrl?: string;
  state: 'current' | 'pending' | 'idle';
  onClick: () => void;
  testId: string;
}> = ({ title, previewUrl, state, onClick, testId }) => {
  const stateClass = state === 'current'
    ? 'border-gray-900 ring-2 ring-gray-200 dark:border-white dark:ring-white/20'
    : state === 'pending'
      ? 'border-banana-500 ring-2 ring-banana-200 shadow-lg shadow-banana-100/50'
      : 'border-gray-200 dark:border-border-primary hover:border-banana-300 hover:-translate-y-0.5';

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`group relative text-left aspect-[4/3] rounded-2xl border-2 overflow-hidden transition-all ${stateClass}`}
    >
      {previewUrl ? (
        <img
          src={getImageUrl(previewUrl)}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-background-tertiary text-gray-400">
          <ImageIcon size={26} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="text-sm font-medium text-white line-clamp-2">{title}</div>
      </div>
      {state === 'pending' && (
        <div className="absolute top-3 left-3 rounded-full bg-banana-500 px-2 py-1 text-xs font-semibold text-black inline-flex items-center gap-1">
          <Check size={12} />
          已选中
        </div>
      )}
      {state === 'current' && (
        <div className="absolute top-3 left-3 rounded-full bg-white/95 px-2 py-1 text-xs font-semibold text-gray-900 inline-flex items-center gap-1">
          <Layers3 size={12} />
          当前使用
        </div>
      )}
    </button>
  );
};

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  projectId,
  activeTab,
  onActiveTabChange,
  draftSelection,
  onDraftSelectionChange,
  appliedSelection,
  appliedStyleJson,
  onApplySelection,
  isApplyingSelection = false,
}) => {
  const t = useT(templateI18n);
  const { show, ToastContainer } = useToast();
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [presetTemplates, setPresetTemplates] = useState<PresetTemplate[]>([]);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [availableMaterials, setAvailableMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [imageSearch, setImageSearch] = useState('');
  const [jsonSearch, setJsonSearch] = useState('');
  const [imageVisible, setImageVisible] = useState({ user: INITIAL_BATCH, preset: INITIAL_BATCH });
  const [jsonVisible, setJsonVisible] = useState(INITIAL_BATCH);
  const [materialSelectedIds, setMaterialSelectedIds] = useState<Set<string>>(new Set());
  const imageScrollRef = useRef<HTMLDivElement | null>(null);
  const jsonScrollRef = useRef<HTMLDivElement | null>(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [userResp, presetResp, styleResp] = await Promise.all([
        listUserTemplates(),
        listPresetTemplates(),
        listStylePresets(),
      ]);
      setUserTemplates(userResp.data?.templates || []);
      setPresetTemplates(presetResp.data?.templates || []);
      setStylePresets(styleResp.data?.presets || []);
    } catch (error: any) {
      console.error('Failed to load templates:', error);
      show({
        message: `${t('template.loadFailed')}: ${error?.message || ''}`,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (activeTab !== 'material') return;
    if (draftSelection?.kind === 'material') {
      setMaterialSelectedIds(new Set([draftSelection.id]));
      return;
    }
    if (appliedSelection?.kind === 'material') {
      setMaterialSelectedIds(new Set([appliedSelection.id]));
      return;
    }
    setMaterialSelectedIds(new Set());
  }, [activeTab, appliedSelection, draftSelection]);

  const filteredUserTemplates = useMemo(() => {
    const keyword = imageSearch.trim().toLowerCase();
    if (!keyword) return userTemplates;
    return userTemplates.filter((template) => `${template.name || ''} ${template.template_id}`.toLowerCase().includes(keyword));
  }, [imageSearch, userTemplates]);

  const filteredPresetTemplates = useMemo(() => {
    const keyword = imageSearch.trim().toLowerCase();
    if (!keyword) return presetTemplates;
    return presetTemplates.filter((template) => `${template.name || ''} ${template.template_id}`.toLowerCase().includes(keyword));
  }, [imageSearch, presetTemplates]);

  const filteredStylePresets = useMemo(() => {
    const keyword = jsonSearch.trim().toLowerCase();
    if (!keyword) return stylePresets;
    return stylePresets.filter((preset) => `${preset.name || ''} ${preset.id}`.toLowerCase().includes(keyword));
  }, [jsonSearch, stylePresets]);

  useEffect(() => {
    setImageVisible({ user: INITIAL_BATCH, preset: INITIAL_BATCH });
    if (imageScrollRef.current) {
      imageScrollRef.current.scrollTop = 0;
    }
  }, [imageSearch, userTemplates.length, presetTemplates.length]);

  useEffect(() => {
    setJsonVisible(INITIAL_BATCH);
    if (jsonScrollRef.current) {
      jsonScrollRef.current.scrollTop = 0;
    }
  }, [jsonSearch, stylePresets.length]);

  const resolvedCurrentSelection = useMemo<TemplateSelection | null>(() => {
    if (appliedSelection) {
      if (appliedSelection.kind === 'user') {
        const template = userTemplates.find((item) => item.template_id === appliedSelection.id);
        return template ? buildUserSelection(template) : null;
      }
      if (appliedSelection.kind === 'preset') {
        const template = presetTemplates.find((item) => item.template_id === appliedSelection.id);
        return template ? buildPresetSelection(template) : null;
      }
      if (appliedSelection.kind === 'style') {
        const preset = stylePresets.find((item) => item.id === appliedSelection.id);
        return preset ? buildStyleSelection(preset) : null;
      }
      if (appliedSelection.kind === 'material') {
        const material = availableMaterials.find((item) => item.id === appliedSelection.id);
        return material ? buildMaterialSelection(material) : null;
      }
    }

    if (appliedStyleJson) {
      const matchedPreset = stylePresets.find((preset) => (preset.style_json || '').trim() === appliedStyleJson.trim());
      return matchedPreset ? buildStyleSelection(matchedPreset) : null;
    }

    return null;
  }, [appliedSelection, appliedStyleJson, availableMaterials, presetTemplates, stylePresets, userTemplates]);

  const displaySelection = draftSelection || resolvedCurrentSelection;
  const draftMatchesCurrent = isSameSelection(draftSelection, resolvedCurrentSelection);

  const getCardState = (selection: TemplateSelection): 'current' | 'pending' | 'idle' => {
    if (isSameSelection(draftSelection, selection) && !isSameSelection(selection, resolvedCurrentSelection)) {
      return 'pending';
    }
    if (isSameSelection(selection, resolvedCurrentSelection)) {
      return 'current';
    }
    if (isSameSelection(draftSelection, selection) && isSameSelection(selection, resolvedCurrentSelection)) {
      return 'current';
    }
    return 'idle';
  };

  const handleImageScroll = () => {
    const node = imageScrollRef.current;
    if (!node) return;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining < 180) {
      setImageVisible((prev) => ({
        user: Math.min(prev.user + BATCH_SIZE, filteredUserTemplates.length),
        preset: Math.min(prev.preset + BATCH_SIZE, filteredPresetTemplates.length),
      }));
    }
  };

  const handleJsonScroll = () => {
    const node = jsonScrollRef.current;
    if (!node) return;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining < 180) {
      setJsonVisible((prev) => Math.min(prev + BATCH_SIZE, filteredStylePresets.length));
    }
  };

  const openExternalPage = (path: string) => {
    if (typeof window === 'undefined') return;
    window.open(path, '_blank', 'noopener,noreferrer');
  };

  const renderSelectionSource = (selection: TemplateSelection) => {
    if (selection.kind === 'user') return t('template.sourceMyTemplate');
    if (selection.kind === 'preset') return t('template.sourcePresetTemplate');
    if (selection.kind === 'style') return t('template.sourceJsonTemplate');
    return t('template.sourceMaterial');
  };

  const renderSelectionStatus = () => {
    if (!displaySelection) return t('template.statusIdle');
    if (draftSelection && !draftMatchesCurrent) return t('template.statusPending');
    return t('template.statusCurrent');
  };

  return (
    <>
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="min-w-0 flex-1 rounded-3xl border border-gray-200 dark:border-border-primary bg-gray-50/75 dark:bg-background-tertiary/25 overflow-hidden">
          <div className="sticky top-0 z-10 border-b border-gray-200 dark:border-border-primary bg-white/90 dark:bg-background-secondary/90 backdrop-blur">
            <div className="flex gap-1 p-2">
              {([
                ['image', t('template.tabs.image')],
                ['json', t('template.tabs.json')],
                ['material', t('template.tabs.material')],
              ] as Array<[TemplateSelectorTab, string]>).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onActiveTabChange(tab)}
                  data-testid={`template-selector-tab-${tab}`}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                      : 'text-gray-600 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            <div className={activeTab === 'image' ? 'block' : 'hidden'}>
              <div className="flex items-center gap-3 mb-4">
                <input
                  value={imageSearch}
                  onChange={(e) => setImageSearch(e.target.value)}
                  placeholder={t('template.imageSearch')}
                  className="flex-1 px-4 py-2.5 text-sm rounded-2xl border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowUpRight size={16} />}
                  onClick={() => openExternalPage('/style-library?tab=presetTemplates')}
                  data-testid="template-selector-open-style-library-images"
                >
                  {t('template.goToStyleLibrary')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />}
                  onClick={() => void loadAll()}
                  disabled={isLoading}
                >
                  {t('template.refresh')}
                </Button>
              </div>

              <div ref={imageScrollRef} onScroll={handleImageScroll} className="max-h-[58vh] overflow-y-auto pr-1 space-y-6">
                <section>
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('template.myTemplates')}</div>
                  </div>
                  {filteredUserTemplates.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary px-4 py-10 text-center">
                      <div className="text-sm text-gray-500 dark:text-foreground-tertiary">{t('template.emptyImage')}</div>
                      <div className="mt-1 text-xs text-gray-400 dark:text-foreground-tertiary">{t('template.emptyImageHint')}</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredUserTemplates.slice(0, imageVisible.user).map((template) => {
                        const selection = buildUserSelection(template);
                        return (
                          <TemplateCard
                            key={template.template_id}
                            title={selection.name}
                            previewUrl={selection.previewUrl}
                            state={getCardState(selection)}
                            onClick={() => onDraftSelectionChange(selection)}
                            testId={`template-card-user-${template.template_id}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('template.presetTemplates')}</div>
                  </div>
                  {filteredPresetTemplates.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary px-4 py-10 text-center">
                      <div className="text-sm text-gray-500 dark:text-foreground-tertiary">{t('template.emptyImage')}</div>
                      <div className="mt-1 text-xs text-gray-400 dark:text-foreground-tertiary">{t('template.emptyImageHint')}</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredPresetTemplates.slice(0, imageVisible.preset).map((template) => {
                        const selection = buildPresetSelection(template);
                        return (
                          <TemplateCard
                            key={template.template_id}
                            title={selection.name}
                            previewUrl={selection.previewUrl}
                            state={getCardState(selection)}
                            onClick={() => onDraftSelectionChange(selection)}
                            testId={`template-card-preset-${template.template_id}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className={activeTab === 'json' ? 'block' : 'hidden'}>
              <div className="flex items-center gap-3 mb-4">
                <input
                  value={jsonSearch}
                  onChange={(e) => setJsonSearch(e.target.value)}
                  placeholder={t('template.jsonSearch')}
                  className="flex-1 px-4 py-2.5 text-sm rounded-2xl border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowUpRight size={16} />}
                  onClick={() => openExternalPage('/style-library?tab=presets')}
                  data-testid="template-selector-open-style-library-json"
                >
                  {t('template.goToStyleLibrary')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />}
                  onClick={() => void loadAll()}
                  disabled={isLoading}
                >
                  {t('template.refresh')}
                </Button>
              </div>

              <div ref={jsonScrollRef} onScroll={handleJsonScroll} className="max-h-[58vh] overflow-y-auto pr-1">
                {filteredStylePresets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary px-4 py-10 text-center">
                    <div className="text-sm text-gray-500 dark:text-foreground-tertiary">{t('template.emptyJson')}</div>
                    <div className="mt-1 text-xs text-gray-400 dark:text-foreground-tertiary">{t('template.emptyJsonHint')}</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredStylePresets.slice(0, jsonVisible).map((preset) => {
                      const selection = buildStyleSelection(preset);
                      return (
                        <TemplateCard
                          key={preset.id}
                          title={selection.name}
                          previewUrl={selection.previewUrl}
                          state={getCardState(selection)}
                          onClick={() => onDraftSelectionChange(selection)}
                          testId={`template-card-style-${preset.id}`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={activeTab === 'material' ? 'block' : 'hidden'}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="text-sm text-gray-500 dark:text-foreground-tertiary">{t('template.materialHint')}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowUpRight size={16} />}
                  onClick={() => openExternalPage('/materials')}
                  data-testid="template-selector-open-material-library"
                >
                  {t('template.goToMaterialLibrary')}
                </Button>
              </div>
              <MaterialLibraryPanel
                projectId={projectId || undefined}
                selectedIds={materialSelectedIds}
                onSelectedIdsChange={setMaterialSelectedIds}
                onSelectedMaterialsChange={(materials) => {
                  setAvailableMaterials(materials);
                  if (materials[0]) {
                    onDraftSelectionChange(buildMaterialSelection(materials[0]));
                    return;
                  }
                  if (draftSelection?.kind === 'material') {
                    onDraftSelectionChange(null);
                  }
                }}
                multiple={false}
                showUpload={false}
                showGenerate={false}
                showDelete={false}
                showSelectionSummary={false}
                emptyHintMode="select-only"
                className="space-y-4"
              />
            </div>
          </div>
        </div>

        <aside className="w-full lg:w-[360px] xl:w-[400px] shrink-0 rounded-3xl border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary p-5 flex flex-col">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-gray-400 dark:text-foreground-tertiary">
              {displaySelection ? t('template.selectionTitle') : t('template.currentTitle')}
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {displaySelection?.name || t('template.selectionPlaceholder')}
            </div>
            <div className="mt-3 inline-flex rounded-full border border-gray-200 dark:border-border-primary px-3 py-1 text-xs text-gray-600 dark:text-foreground-tertiary">
              {renderSelectionStatus()}
            </div>
            <p className="mt-3 text-sm text-gray-500 dark:text-foreground-tertiary">
              {displaySelection ? renderSelectionSource(displaySelection) : t('template.selectionTip')}
            </p>
          </div>

          <div className="mt-5 rounded-3xl overflow-hidden border border-gray-200 dark:border-border-primary bg-gray-100 dark:bg-background-tertiary aspect-[4/3] flex items-center justify-center">
            {displaySelection?.previewUrl ? (
              <img
                src={getImageUrl(displaySelection.previewUrl)}
                alt={displaySelection.name}
                className={`w-full h-full ${displaySelection.kind === 'style' ? 'object-contain bg-white' : 'object-cover'}`}
              />
            ) : (
              <div className="p-6 text-center text-gray-400 dark:text-foreground-tertiary">
                <ImageIcon size={36} className="mx-auto mb-3" />
                <div className="text-sm">{t('template.selectionPlaceholder')}</div>
              </div>
            )}
          </div>

          {displaySelection?.kind === 'style' && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {previewSlotMeta.map(({ key, labelKey }) => {
                const previewUrl = displaySelection.previewImages[key];
                return (
                  <div key={key} className="rounded-2xl border border-gray-200 dark:border-border-primary overflow-hidden bg-gray-50 dark:bg-background-tertiary">
                    <div className="aspect-[4/3] bg-gray-100 dark:bg-background-primary flex items-center justify-center">
                      {previewUrl ? (
                        <img
                          src={getImageUrl(previewUrl)}
                          alt={t(`template.previewSlots.${labelKey}` as any)}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <FileCode2 size={16} className="text-gray-400" />
                      )}
                    </div>
                    <div className="px-2 py-1 text-[11px] text-center text-gray-500 dark:text-foreground-tertiary">
                      {t(`template.previewSlots.${labelKey}` as any)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-auto pt-5">
            <Button
              variant="primary"
              onClick={() => draftSelection && void onApplySelection(draftSelection)}
              disabled={!draftSelection || draftMatchesCurrent || isApplyingSelection}
              className="w-full"
              data-testid="template-selector-apply"
            >
              {draftMatchesCurrent ? t('template.applyCurrent') : t('template.applySelection')}
            </Button>
          </div>
        </aside>
      </div>
      <ToastContainer />
    </>
  );
};

export const getTemplateFile = async (
  templateId: string,
  userTemplates: UserTemplate[],
  source: Exclude<TemplateSource, 'upload'> = 'user'
): Promise<File | null> => {
  const loadFromTemplateUrl = async (templateImageUrl: string, fallbackName = 'template.png') => {
    const imageUrl = getImageUrl(templateImageUrl);
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    return new File([blob], fallbackName, { type: blob.type });
  };

  if (source === 'preset') {
    try {
      const presetResponse = await listPresetTemplates();
      const presetTemplate = (presetResponse.data?.templates || []).find((template) => template.template_id === templateId);
      if (presetTemplate?.template_image_url) {
        return await loadFromTemplateUrl(presetTemplate.template_image_url, 'preset-template.png');
      }
    } catch (error) {
      console.error('Failed to load preset template:', error);
    }
  }

  const userTemplate = userTemplates.find((template) => template.template_id === templateId);
  if (userTemplate?.template_image_url) {
    try {
      return await loadFromTemplateUrl(userTemplate.template_image_url, 'template.png');
    } catch (error) {
      console.error('Failed to load user template:', error);
    }
  }

  return null;
};
