import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Code2, Copy, Eye, Globe, Home, RefreshCw, Trash2, X } from 'lucide-react';
import { Button, Card, ImageLightbox, useConfirm, useToast } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { getImageUrl } from '@/api/client';
import {
  createStyleTemplate,
  deleteStylePreset,
  deleteStyleTemplate,
  listStylePresets,
  listStyleTemplates,
  type StylePreset,
  type StyleTemplate,
} from '@/api/endpoints';

type PreviewKey = 'cover_url' | 'toc_url' | 'detail_url' | 'ending_url';
type StyleTab = 'templates' | 'presets';

const styleLibraryI18n = {
  zh: {
    nav: {
      title: '风格模板管理',
      back: '返回',
      home: '主页',
      refresh: '刷新',
      loading: '加载中...',
      language: '界面语言',
    },
    tabs: {
      templates: '风格模板骨架',
      presets: '风格预设',
    },
    templates: {
      title: '风格模板骨架',
      subtitle: '用于约束 AI 生成 style_json 的字段结构',
      name: '模板名称（可选）',
      json: '模板 JSON 骨架',
      jsonHint: '必须是合法 JSON',
      save: '保存模板',
      list: '已保存骨架',
      empty: '暂无模板骨架',
      view: '查看',
      delete: '删除',
      deleteConfirm: '将删除该风格模板骨架，此操作不可撤销。确定继续？',
      saved: '模板骨架已保存',
      deleted: '模板骨架已删除',
      invalidJson: 'JSON 解析失败',
      jsonRequired: '请先输入模板 JSON 骨架',
      noSelection: '请选择一个模板查看 JSON',
    },
    presets: {
      title: '风格预设',
      subtitle: '可直接应用到项目的 style_json + 4 张预览图',
      empty: '暂无风格预设',
      viewJson: '查看 JSON',
      preview: '预览',
      delete: '删除',
      deleteConfirm: '将删除该风格预设，此操作不可撤销。确定继续？',
      deleted: '风格预设已删除',
      noSelection: '请选择一个风格预设查看 JSON',
      noPreview: '无预览',
      labels: {
        cover: '封面',
        toc: '目录',
        detail: '详情',
        ending: '结尾',
      },
    },
    jsonViewer: {
      titleTemplate: '模板 JSON 预览',
      titlePreset: '预设 style_json',
      copy: '复制',
      copySuccess: 'JSON 已复制',
      copyFailed: '复制失败',
    },
    messages: {
      loadFailed: '加载失败',
      saveFailed: '保存失败',
      deleteFailed: '删除失败',
      unknownError: '未知错误',
    },
  },
  en: {
    nav: {
      title: 'Style Library',
      back: 'Back',
      home: 'Home',
      refresh: 'Refresh',
      loading: 'Loading...',
      language: 'Language',
    },
    tabs: {
      templates: 'Style Template Skeletons',
      presets: 'Style Presets',
    },
    templates: {
      title: 'Style Template Skeletons',
      subtitle: 'JSON skeletons used to constrain AI style_json structure',
      name: 'Template name (optional)',
      json: 'Template JSON skeleton',
      jsonHint: 'Must be valid JSON',
      save: 'Save Template',
      list: 'Saved Skeletons',
      empty: 'No style template skeletons',
      view: 'View',
      delete: 'Delete',
      deleteConfirm: 'This will permanently delete this style template skeleton. Continue?',
      saved: 'Style template skeleton saved',
      deleted: 'Style template skeleton deleted',
      invalidJson: 'Invalid JSON',
      jsonRequired: 'Please enter template JSON skeleton first',
      noSelection: 'Select a template to view JSON',
    },
    presets: {
      title: 'Style Presets',
      subtitle: 'Directly applicable style_json with 4 preview images',
      empty: 'No style presets',
      viewJson: 'View JSON',
      preview: 'Preview',
      delete: 'Delete',
      deleteConfirm: 'This will permanently delete this style preset. Continue?',
      deleted: 'Style preset deleted',
      noSelection: 'Select a style preset to view JSON',
      noPreview: 'No preview',
      labels: {
        cover: 'Cover',
        toc: 'TOC',
        detail: 'Detail',
        ending: 'Ending',
      },
    },
    jsonViewer: {
      titleTemplate: 'Template JSON',
      titlePreset: 'Preset style_json',
      copy: 'Copy',
      copySuccess: 'JSON copied',
      copyFailed: 'Copy failed',
    },
    messages: {
      loadFailed: 'Failed to load',
      saveFailed: 'Failed to save',
      deleteFailed: 'Failed to delete',
      unknownError: 'Unknown error',
    },
  },
};

const PREVIEW_ORDER: Array<[PreviewKey, string]> = [
  ['cover_url', 'presets.labels.cover'],
  ['toc_url', 'presets.labels.toc'],
  ['detail_url', 'presets.labels.detail'],
  ['ending_url', 'presets.labels.ending'],
];

const TAB_STORAGE_KEY = 'style-library-tab';

export const StyleLibrary: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const t = useT(styleLibraryI18n);
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<StyleTab>(() => {
    if (typeof window === 'undefined') return 'presets';
    const saved = sessionStorage.getItem(TAB_STORAGE_KEY);
    return saved === 'templates' || saved === 'presets' ? saved : 'presets';
  });
  const [templateName, setTemplateName] = useState('');
  const [templateJsonText, setTemplateJsonText] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [isPresetJsonDrawerOpen, setIsPresetJsonDrawerOpen] = useState(false);
  const [isPresetJsonDrawerVisible, setIsPresetJsonDrawerVisible] = useState(false);
  const [isPresetJsonDrawerAnimating, setIsPresetJsonDrawerAnimating] = useState(false);

  const [previewModal, setPreviewModal] = useState<{
    title: string;
    items: { src: string; title?: string }[];
    initialIndex: number;
  } | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );
  const selectedPreset = useMemo(
    () => presets.find((item) => item.id === selectedPresetId) || null,
    [presets, selectedPresetId]
  );

  const viewerJsonText = activeTab === 'templates'
    ? (selectedTemplate?.template_json || '')
    : (selectedPreset?.style_json || '');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'presets') {
      setIsPresetJsonDrawerOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (isPresetJsonDrawerOpen) {
      setIsPresetJsonDrawerVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsPresetJsonDrawerAnimating(true);
        });
      });

      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    setIsPresetJsonDrawerAnimating(false);
    const timer = window.setTimeout(() => {
      setIsPresetJsonDrawerVisible(false);
    }, 220);
    document.body.style.overflow = '';
    return () => window.clearTimeout(timer);
  }, [isPresetJsonDrawerOpen]);

  useEffect(() => {
    if (!isPresetJsonDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPresetJsonDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isPresetJsonDrawerOpen]);

  const openPresetJsonDrawer = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    setIsPresetJsonDrawerOpen(true);
  }, []);

  const closePresetJsonDrawer = useCallback(() => {
    setIsPresetJsonDrawerOpen(false);
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [tplResp, presetResp] = await Promise.all([listStyleTemplates(), listStylePresets()]);
      const nextTemplates = tplResp.data?.templates || [];
      const nextPresets = presetResp.data?.presets || [];
      setTemplates(nextTemplates);
      setPresets(nextPresets);
      setSelectedTemplateId((prev) => (prev && nextTemplates.some((x) => x.id === prev) ? prev : (nextTemplates[0]?.id || '')));
      setSelectedPresetId((prev) => (prev && nextPresets.some((x) => x.id === prev) ? prev : (nextPresets[0]?.id || '')));
    } catch (error: any) {
      show({
        message: `${t('messages.loadFailed')}: ${error?.message || t('messages.unknownError')}`,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  const handleCopyJson = async () => {
    if (!viewerJsonText) return;
    try {
      await navigator.clipboard.writeText(viewerJsonText);
      show({ message: t('jsonViewer.copySuccess'), type: 'success' });
    } catch {
      show({ message: t('jsonViewer.copyFailed'), type: 'error' });
    }
  };

  const handleSaveTemplate = async () => {
    const text = templateJsonText.trim();
    if (!text) {
      show({ message: t('templates.jsonRequired'), type: 'error' });
      return;
    }
    try {
      JSON.parse(text);
    } catch (error: any) {
      show({ message: `${t('templates.invalidJson')}: ${error?.message || ''}`, type: 'error' });
      return;
    }

    setIsSavingTemplate(true);
    try {
      const resp = await createStyleTemplate({
        name: templateName.trim(),
        template_json: text,
      });
      const created = resp.data;
      setTemplateName('');
      setTemplateJsonText('');
      if (created?.id) {
        setTemplates((prev) => [created, ...prev]);
        setSelectedTemplateId(created.id);
      } else {
        await loadAll();
      }
      show({ message: t('templates.saved'), type: 'success' });
    } catch (error: any) {
      show({
        message: `${t('messages.saveFailed')}: ${error?.message || t('messages.unknownError')}`,
        type: 'error',
      });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = (template: StyleTemplate) => {
    confirm(
      t('templates.deleteConfirm'),
      async () => {
        setDeletingTemplateId(template.id);
        try {
          await deleteStyleTemplate(template.id);
          setTemplates((prev) => {
            const next = prev.filter((item) => item.id !== template.id);
            setSelectedTemplateId((selected) => {
              if (selected !== template.id) return selected;
              return next[0]?.id || '';
            });
            return next;
          });
          show({ message: t('templates.deleted'), type: 'success' });
        } catch (error: any) {
          show({
            message: `${t('messages.deleteFailed')}: ${error?.message || t('messages.unknownError')}`,
            type: 'error',
          });
        } finally {
          setDeletingTemplateId(null);
        }
      },
      { title: t('templates.delete'), confirmText: t('templates.delete'), variant: 'danger' }
    );
  };

  const handleDeletePreset = (preset: StylePreset) => {
    confirm(
      t('presets.deleteConfirm'),
      async () => {
        setDeletingPresetId(preset.id);
        try {
          await deleteStylePreset(preset.id);
          const shouldCloseDrawer = isPresetJsonDrawerOpen && selectedPresetId === preset.id;
          setPresets((prev) => {
            const next = prev.filter((item) => item.id !== preset.id);
            setSelectedPresetId((selected) => {
              if (selected !== preset.id) return selected;
              return next[0]?.id || '';
            });
            return next;
          });
          if (shouldCloseDrawer) {
            setIsPresetJsonDrawerOpen(false);
          }
          show({ message: t('presets.deleted'), type: 'success' });
        } catch (error: any) {
          show({
            message: `${t('messages.deleteFailed')}: ${error?.message || t('messages.unknownError')}`,
            type: 'error',
          });
        } finally {
          setDeletingPresetId(null);
        }
      },
      { title: t('presets.delete'), confirmText: t('presets.delete'), variant: 'danger' }
    );
  };

  const openPresetPreview = (preset: StylePreset, key: PreviewKey = 'cover_url') => {
    const preview = preset.preview_images || {};
    const items = PREVIEW_ORDER.map(([k, labelKey]) => {
      const src = preview[k] ? getImageUrl(preview[k]) : '';
      return src ? { src, title: `${preset.name || preset.id}-${t(labelKey)}` } : null;
    }).filter(Boolean) as { src: string; title?: string }[];

    if (!items.length) return;

    const current = preview[key] ? getImageUrl(preview[key]) : '';
    const initialIndex = Math.max(0, items.findIndex((item) => item.src === current));
    setPreviewModal({
      title: preset.name || preset.id,
      items,
      initialIndex,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50/30 to-pink-50/50 dark:from-background-primary dark:via-background-primary dark:to-background-primary">
      <nav className="h-16 bg-white/70 dark:bg-background-secondary border-b border-gray-100 dark:border-border-primary backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={handleBack}
              className="text-xs md:text-sm"
              data-testid="style-library-nav-back"
            >
              {t('nav.back')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Home size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => navigate('/')}
              className="text-xs md:text-sm"
              data-testid="style-library-nav-home"
            >
              {t('nav.home')}
            </Button>
            <div className="h-5 w-px bg-gray-300 dark:bg-border-primary mx-1 hidden sm:block" />
            <div className="flex items-center gap-2">
              <Code2 size={18} className="text-orange-600 dark:text-banana" />
              <span className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">{t('nav.title')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => i18n.changeLanguage(i18n.language?.startsWith('zh') ? 'en' : 'zh')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-gray-100 hover:bg-banana-100/60 dark:hover:bg-background-hover rounded-md transition-all"
              title={t('nav.language')}
            >
              <Globe size={14} />
              <span>{i18n.language?.startsWith('zh') ? 'EN' : '中'}</span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />}
              onClick={() => void loadAll()}
              disabled={isLoading}
            >
              {isLoading ? t('nav.loading') : t('nav.refresh')}
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              data-testid="style-library-tab-presets"
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                activeTab === 'presets'
                  ? 'bg-banana-500 text-white'
                  : 'text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
              }`}
            >
              {t('tabs.presets')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              data-testid="style-library-tab-templates"
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                activeTab === 'templates'
                  ? 'bg-banana-500 text-white'
                  : 'text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
              }`}
            >
              {t('tabs.templates')}
            </button>
          </div>
        </Card>

        <div className={activeTab === 'templates' ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start' : ''}>
          <div className="space-y-4">
            {activeTab === 'templates' ? (
              <Card className="p-4 md:p-5 space-y-4" data-testid="style-library-templates-panel">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('templates.title')}</h2>
                  <p className="text-xs text-gray-600 dark:text-foreground-tertiary">{t('templates.subtitle')}</p>
                </div>

                <div className="space-y-2">
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder={t('templates.name')}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                  />
                  <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{t('templates.jsonHint')}</div>
                  <textarea
                    value={templateJsonText}
                    onChange={(e) => setTemplateJsonText(e.target.value)}
                    rows={10}
                    placeholder={t('templates.json')}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                  />
                  <Button size="sm" loading={isSavingTemplate} onClick={handleSaveTemplate}>
                    {t('templates.save')}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-800 dark:text-white">{t('templates.list')}</div>
                  {templates.length === 0 ? (
                    <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{t('templates.empty')}</div>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {templates.map((tpl) => (
                        <div
                          key={tpl.id}
                          data-testid={`template-row-${tpl.id}`}
                          className={`p-2 rounded-lg border transition-colors ${
                            selectedTemplateId === tpl.id
                              ? 'border-banana-500 bg-banana-50/60 dark:bg-background-hover'
                              : 'border-gray-200 dark:border-border-primary'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedTemplateId(tpl.id)}
                              className="flex-1 text-left text-sm text-gray-800 dark:text-white truncate"
                              title={tpl.name || tpl.id}
                            >
                              {tpl.name || tpl.id}
                            </button>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setSelectedTemplateId(tpl.id)}>
                                {t('templates.view')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={deletingTemplateId === tpl.id}
                                onClick={() => handleDeleteTemplate(tpl)}
                              >
                                {t('templates.delete')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="p-4 md:p-5 space-y-4" data-testid="style-library-presets-panel">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('presets.title')}</h2>
                  <p className="text-xs text-gray-600 dark:text-foreground-tertiary">{t('presets.subtitle')}</p>
                </div>

                {presets.length === 0 ? (
                  <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{t('presets.empty')}</div>
                ) : (
                  <div className="space-y-3">
                    {presets.map((preset) => {
                      const preview = preset.preview_images || {};
                      const isSelected = selectedPresetId === preset.id;
                      return (
                        <div
                          key={preset.id}
                          data-testid={`preset-row-${preset.id}`}
                          className={`rounded-xl border p-3 space-y-3 transition-colors ${
                            isSelected
                              ? 'border-banana-500 bg-banana-50/60 dark:bg-background-hover'
                              : 'border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary'
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2">
                            <button
                              type="button"
                              className="text-left min-w-0"
                              onClick={() => setSelectedPresetId(preset.id)}
                            >
                              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={preset.name || preset.id}>
                                {preset.name || preset.id}
                              </div>
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => openPresetPreview(preset)}>
                                {t('presets.preview')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openPresetJsonDrawer(preset.id)}
                                data-testid={`preset-${preset.id}-view-json`}
                              >
                                {t('presets.viewJson')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Trash2 size={14} />}
                                loading={deletingPresetId === preset.id}
                                onClick={() => handleDeletePreset(preset)}
                              >
                                {t('presets.delete')}
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {PREVIEW_ORDER.map(([key, labelKey]) => {
                              const src = preview[key] ? getImageUrl(preview[key]) : '';
                              return (
                                <div key={key} className="space-y-1">
                                  <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{t(labelKey)}</div>
                                  <div className="w-full aspect-video bg-gray-100 dark:bg-background-tertiary rounded-lg overflow-hidden border border-gray-200 dark:border-border-primary">
                                    {src ? (
                                      <button
                                        type="button"
                                        onClick={() => openPresetPreview(preset, key)}
                                        className="w-full h-full block"
                                        data-testid={`preset-${preset.id}-preview-${key}`}
                                      >
                                        <img
                                          src={src}
                                          alt={`${preset.name || preset.id}-${t(labelKey)}`}
                                          className="w-full h-full object-contain object-center"
                                        />
                                      </button>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-400">
                                        {t('presets.noPreview')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </div>

          {activeTab === 'templates' ? (
            <Card className="p-4 md:p-5 h-fit sticky top-20" data-testid="style-library-json-viewer">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-medium text-gray-800 dark:text-white">
                  {t('jsonViewer.titleTemplate')}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Copy size={14} />}
                  onClick={() => void handleCopyJson()}
                  disabled={!viewerJsonText}
                >
                  {t('jsonViewer.copy')}
                </Button>
              </div>
              {viewerJsonText ? (
                <div className="rounded-lg border border-gray-200 dark:border-border-primary bg-gray-50 dark:bg-background-tertiary max-h-[70vh] overflow-auto">
                  <pre className="p-3 text-xs font-mono whitespace-pre text-gray-800 dark:text-white">
                    {viewerJsonText}
                  </pre>
                </div>
              ) : (
                <div className="text-xs text-gray-500 dark:text-foreground-tertiary">
                  {t('templates.noSelection')}
                </div>
              )}
            </Card>
          ) : null}
        </div>
      </main>

      {activeTab === 'presets' && isPresetJsonDrawerVisible && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-50" aria-hidden={!isPresetJsonDrawerOpen}>
              <button
                type="button"
                className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-200 ${
                  isPresetJsonDrawerAnimating ? 'opacity-100' : 'opacity-0'
                }`}
                onClick={closePresetJsonDrawer}
                aria-label="close preset json drawer backdrop"
              />

              <div
                role="dialog"
                aria-modal="true"
                data-testid="style-library-preset-json-drawer"
                className={`absolute flex flex-col bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary shadow-2xl transition-transform duration-200 ease-out
                  left-0 right-0 bottom-0 max-h-[80vh] rounded-t-2xl
                  md:left-auto md:right-0 md:top-0 md:bottom-0 md:w-[min(720px,90vw)] md:max-h-none md:rounded-none md:rounded-l-2xl
                  ${isPresetJsonDrawerAnimating ? 'translate-y-0 md:translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}
              >
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-border-primary">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('jsonViewer.titlePreset')}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-foreground-tertiary truncate">
                      {selectedPreset?.name || selectedPreset?.id || ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Copy size={14} />}
                      onClick={() => void handleCopyJson()}
                      disabled={!viewerJsonText}
                    >
                      {t('jsonViewer.copy')}
                    </Button>
                    <button
                      type="button"
                      onClick={closePresetJsonDrawer}
                      data-testid="style-library-preset-json-close"
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-border-primary text-gray-500 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
                      aria-label="close preset json drawer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {viewerJsonText ? (
                  <div className="flex-1 overflow-auto p-4">
                    <div className="rounded-lg border border-gray-200 dark:border-border-primary bg-gray-50 dark:bg-background-tertiary overflow-auto">
                      <pre className="p-3 text-xs font-mono whitespace-pre text-gray-800 dark:text-white">
                        {viewerJsonText}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-xs text-gray-500 dark:text-foreground-tertiary">
                    {t('presets.noSelection')}
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}

      <ToastContainer />
      {ConfirmDialog}

      <ImageLightbox
        isOpen={Boolean(previewModal)}
        title={previewModal?.title || t('presets.preview')}
        items={previewModal?.items || []}
        initialIndex={previewModal?.initialIndex || 0}
        onClose={() => setPreviewModal(null)}
      />
    </div>
  );
};
