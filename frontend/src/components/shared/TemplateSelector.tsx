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
      imageTemplates: '图片模版库',
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
      imageTemplates: 'Image Template Library',
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
  previewFit?: 'contain' | 'cover';
}> = ({ title, previewUrl, state, onClick, testId, previewFit = 'contain' }) => {
  const stateClass = state === 'current'
    ? 'ring-2 ring-banana-300 shadow-[0_10px_30px_rgba(250,204,21,0.18)]'
    : state === 'pending'
      ? 'ring-2 ring-banana-500 shadow-[0_12px_32px_rgba(250,204,21,0.24)]'
      : 'ring-1 ring-gray-200 hover:ring-gray-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]';
  const previewClass = previewFit === 'contain'
    ? 'absolute inset-0 w-full h-full object-contain bg-white p-3'
    : 'absolute inset-0 w-full h-full object-cover';

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`group relative text-left aspect-[4/3] rounded-2xl overflow-hidden bg-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all ${stateClass}`}
    >
      {previewUrl ? (
        <img
          src={getImageUrl(previewUrl)}
          alt={title}
          className={previewClass}
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
  const [imageVisible, setImageVisible] = useState(INITIAL_BATCH);
  const [jsonVisible, setJsonVisible] = useState(INITIAL_BATCH);
  const [materialSelectedIds, setMaterialSelectedIds] = useState<Set<string>>(new Set());
  const [selectedStylePreviewKey, setSelectedStylePreviewKey] = useState<keyof StylePresetPreviewImages>('cover_url');
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

  const filteredImageTemplates = useMemo(() => {
    return [
      ...filteredUserTemplates.map((template) => ({
        key: `user-${template.template_id}`,
        testId: `template-card-user-${template.template_id}`,
        selection: buildUserSelection(template),
      })),
      ...filteredPresetTemplates.map((template) => ({
        key: `preset-${template.template_id}`,
        testId: `template-card-preset-${template.template_id}`,
        selection: buildPresetSelection(template),
      })),
    ];
  }, [filteredPresetTemplates, filteredUserTemplates]);

  const filteredStylePresets = useMemo(() => {
    const keyword = jsonSearch.trim().toLowerCase();
    if (!keyword) return stylePresets;
    return stylePresets.filter((preset) => `${preset.name || ''} ${preset.id}`.toLowerCase().includes(keyword));
  }, [jsonSearch, stylePresets]);

  useEffect(() => {
    setImageVisible(INITIAL_BATCH);
    if (imageScrollRef.current) {
      imageScrollRef.current.scrollTop = 0;
    }
  }, [filteredImageTemplates.length, imageSearch]);

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

  useEffect(() => {
    if (displaySelection?.kind !== 'style') {
      setSelectedStylePreviewKey('cover_url');
      return;
    }

    const nextKey = previewSlotMeta.find(({ key }) => displaySelection.previewImages[key])?.key || 'cover_url';
    setSelectedStylePreviewKey(nextKey);
  }, [displaySelection?.id, displaySelection?.kind]);

  const activePreviewUrl = useMemo(() => {
    if (!displaySelection) return '';
    if (displaySelection.kind !== 'style') return displaySelection.previewUrl;
    return displaySelection.previewImages[selectedStylePreviewKey] || displaySelection.previewUrl;
  }, [displaySelection, selectedStylePreviewKey]);

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
      setImageVisible((prev) => Math.min(prev + BATCH_SIZE, filteredImageTemplates.length));
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
      <div
        data-testid="template-selector-layout"
        className="grid h-[78vh] min-h-[620px] max-h-[820px] gap-5 lg:grid-cols-[minmax(0,1.55fr)_360px] xl:grid-cols-[minmax(0,1.65fr)_392px]"
      >
        <div className="min-w-0 rounded-[28px] border border-[#e8ddbf] bg-[#fbf8ef] shadow-[0_14px_32px_rgba(15,23,42,0.06)] dark:border-border-primary dark:bg-background-tertiary/25 overflow-hidden flex flex-col min-h-0">
          <div className="sticky top-0 z-10 border-b border-[#eadfbf] bg-white/92 backdrop-blur dark:border-border-primary dark:bg-background-secondary/92">
            <div className="px-4 pt-4 pb-3">
              <div className="flex max-w-[760px] gap-1 rounded-2xl border border-[#eadfbf] bg-[#f7f4ea] p-1 dark:border-border-primary dark:bg-background-primary/70">
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
                    className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-banana-500 text-black shadow-sm'
                        : 'text-gray-600 dark:text-foreground-tertiary hover:bg-white/80 dark:hover:bg-background-hover'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 px-4 pb-4">
            <div className={`${activeTab === 'image' ? 'flex' : 'hidden'} h-full min-h-0 flex-col`}>
              <div className="mb-4 flex items-center gap-3 pt-4">
                <input
                  value={imageSearch}
                  onChange={(e) => setImageSearch(e.target.value)}
                  placeholder={t('template.imageSearch')}
                  className="flex-1 rounded-2xl border border-[#eadfbf] bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-banana-500 dark:border-border-primary dark:bg-background-secondary"
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

              <div ref={imageScrollRef} onScroll={handleImageScroll} className="min-h-0 flex-1 overflow-y-auto pr-1">
                <section>
                  <div className="mb-3 px-1">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('template.imageTemplates')}</div>
                  </div>
                  {filteredImageTemplates.length === 0 ? (
                    <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[#eadfbf] bg-white/75 px-6 text-center dark:border-border-primary dark:bg-background-secondary">
                      <div className="max-w-md">
                        <div className="text-base font-semibold text-slate-700 dark:text-foreground-secondary">{t('template.emptyImage')}</div>
                        <div className="mt-2 text-sm text-gray-500 dark:text-foreground-tertiary">{t('template.emptyImageHint')}</div>
                        <div className="mt-5 flex justify-center">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<ArrowUpRight size={16} />}
                            onClick={() => openExternalPage('/style-library?tab=presetTemplates')}
                          >
                            {t('template.goToStyleLibrary')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                      {filteredImageTemplates.slice(0, imageVisible).map(({ key, selection, testId }) => {
                        return (
                          <TemplateCard
                            key={key}
                            title={selection.name}
                            previewUrl={selection.previewUrl}
                            state={getCardState(selection)}
                            onClick={() => onDraftSelectionChange(selection)}
                            testId={testId}
                            previewFit="contain"
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className={`${activeTab === 'json' ? 'flex' : 'hidden'} h-full min-h-0 flex-col`}>
              <div className="mb-4 flex items-center gap-3 pt-4">
                <input
                  value={jsonSearch}
                  onChange={(e) => setJsonSearch(e.target.value)}
                  placeholder={t('template.jsonSearch')}
                  className="flex-1 rounded-2xl border border-[#eadfbf] bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-banana-500 dark:border-border-primary dark:bg-background-secondary"
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

              <div ref={jsonScrollRef} onScroll={handleJsonScroll} className="min-h-0 flex-1 overflow-y-auto pr-1">
                {filteredStylePresets.length === 0 ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[#eadfbf] bg-white/75 px-6 text-center dark:border-border-primary dark:bg-background-secondary">
                    <div className="max-w-md">
                      <div className="text-base font-semibold text-slate-700 dark:text-foreground-secondary">{t('template.emptyJson')}</div>
                      <div className="mt-2 text-sm text-gray-500 dark:text-foreground-tertiary">{t('template.emptyJsonHint')}</div>
                      <div className="mt-5 flex justify-center">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<ArrowUpRight size={16} />}
                          onClick={() => openExternalPage('/style-library?tab=presets')}
                        >
                          {t('template.goToStyleLibrary')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
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
                          previewFit="contain"
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={`${activeTab === 'material' ? 'flex' : 'hidden'} h-full min-h-0 flex-col`}>
              <div className="mb-4 flex items-center justify-between gap-3 pt-4">
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
              {activeTab === 'material' ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1 pr-2">
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
              ) : null}
            </div>
          </div>
        </div>

        <aside
          data-testid="template-selector-sidebar"
          className="w-full shrink-0 rounded-[28px] border border-[#eadfbf] bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.06)] dark:border-border-primary dark:bg-background-secondary flex flex-col h-full min-h-0 overflow-y-auto"
        >
          <div className="shrink-0">
            <div className="text-xs uppercase tracking-[0.14em] text-gray-400 dark:text-foreground-tertiary">
              {displaySelection ? t('template.selectionTitle') : t('template.currentTitle')}
            </div>
            <div className="mt-3 inline-flex rounded-full border border-[#eadfbf] px-3 py-1 text-xs text-gray-600 dark:border-border-primary dark:text-foreground-tertiary">
              {renderSelectionStatus()}
            </div>
            <p className="mt-3 text-sm text-gray-500 dark:text-foreground-tertiary">
              {displaySelection ? renderSelectionSource(displaySelection) : t('template.selectionTip')}
            </p>
          </div>

          <div className="mt-5 rounded-[24px] overflow-hidden border border-[#eadfbf] bg-[#fbf8ef] dark:border-border-primary dark:bg-background-tertiary aspect-[4/3] flex items-center justify-center">
            {activePreviewUrl ? (
              <img
                src={getImageUrl(activePreviewUrl)}
                alt={displaySelection?.name || t('template.selectionPlaceholder')}
                className={`w-full h-full ${
                  displaySelection?.kind === 'material'
                    ? 'object-cover'
                    : 'object-contain bg-white p-3'
                }`}
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
                const isActive = selectedStylePreviewKey === key && Boolean(previewUrl);
                return (
                  <button
                    key={key}
                    type="button"
                    data-testid={`template-style-preview-${key}`}
                    onClick={() => previewUrl && setSelectedStylePreviewKey(key)}
                    disabled={!previewUrl}
                    aria-pressed={isActive}
                    className={`overflow-hidden rounded-2xl bg-gray-50 dark:bg-background-tertiary text-left transition-all ${
                      isActive
                        ? 'ring-2 ring-banana-300 shadow-[0_8px_22px_rgba(250,204,21,0.18)]'
                        : 'ring-1 ring-gray-200 hover:ring-gray-300'
                    } ${previewUrl ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                  >
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
                  </button>
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
