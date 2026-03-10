import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Code2, Eye, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { Button, Card, ImageLightbox, PageHeader, PAGE_CONTAINER_CLASS, useConfirm, useToast } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { getImageUrl } from '@/api/client';
import {
  createStyleTemplate,
  deletePresetTemplate,
  deleteStyleTemplate,
  listPresetTemplates,
  listStyleTemplates,
  uploadPresetTemplate,
  type PresetTemplate,
  type StyleTemplate,
} from '@/api/endpoints';
import { JsonPresetWorkspace } from '@/components/style-library/JsonPresetWorkspace';

type StyleTab = 'templates' | 'presets' | 'presetTemplates';

const styleLibraryI18n = {
  zh: {
    nav: { title: '模板管理', back: '返回', home: '主页', refresh: '刷新', loading: '加载中...' },
    tabs: {
      templates: 'JSON文本模版骨架',
      presets: 'JSON文本模版',
      presetTemplates: '图片模版',
    },
    templates: {
      title: 'JSON文本模版骨架',
      subtitle: '用于约束 AI 生成 JSON 文本模版的字段结构',
      name: '模版名称（可选）',
      json: 'JSON文本模版骨架',
      jsonHint: '必须是合法 JSON',
      save: '保存模版',
      list: '已保存骨架',
      empty: '暂无 JSON 文本模版骨架',
      view: '查看',
      delete: '删除',
      deleteConfirm: '将删除该 JSON 文本模版骨架，此操作不可撤销。确定继续？',
      saved: 'JSON 文本模版骨架已保存',
      deleted: 'JSON 文本模版骨架已删除',
      invalidJson: 'JSON 解析失败',
      jsonRequired: '请先输入 JSON 文本模版骨架',
      noSelection: '请选择一个 JSON 文本模版骨架查看 JSON',
    },
    presetTemplates: {
      title: '图片模版',
      subtitle: '用于首页模板选择的图片模版库',
      name: '模版名称（可选）',
      upload: '上传图片模版',
      empty: '暂无图片模版',
      count: '共 {{count}} 个图片模版',
      preview: '预览',
      delete: '删除',
      uploading: '上传中...',
      deleted: '图片模版已删除',
      uploaded: '图片模版已上传',
      deleteConfirm: '将删除该图片模版，此操作不可撤销。确定继续？',
    },
  },
  en: {
    nav: { title: 'Style Library', back: 'Back', home: 'Home', refresh: 'Refresh', loading: 'Loading...' },
    tabs: {
      templates: 'JSON Template Skeletons',
      presets: 'JSON Templates',
      presetTemplates: 'Image Templates',
    },
    templates: {
      title: 'JSON Template Skeletons',
      subtitle: 'Used to constrain AI generated JSON template fields',
      name: 'Template name (optional)',
      json: 'JSON template skeleton',
      jsonHint: 'Must be valid JSON',
      save: 'Save',
      list: 'Saved skeletons',
      empty: 'No JSON template skeletons',
      view: 'View',
      delete: 'Delete',
      deleteConfirm: 'This will permanently delete the skeleton. Continue?',
      saved: 'Skeleton saved',
      deleted: 'Skeleton deleted',
      invalidJson: 'Invalid JSON',
      jsonRequired: 'Please enter JSON first',
      noSelection: 'Select a skeleton to view JSON',
    },
    presetTemplates: {
      title: 'Image Templates',
      subtitle: 'Image template library used on the home page',
      name: 'Template name (optional)',
      upload: 'Upload',
      empty: 'No image templates',
      count: '{{count}} templates',
      preview: 'Preview',
      delete: 'Delete',
      uploading: 'Uploading...',
      deleted: 'Image template deleted',
      uploaded: 'Image template uploaded',
      deleteConfirm: 'This will permanently delete the image template. Continue?',
    },
  },
};

const TAB_STORAGE_KEY = 'style-library-tab';

export const StyleLibrary: React.FC = () => {
  const navigate = useNavigate();
  const t = useT(styleLibraryI18n);
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const presetTemplateInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<StyleTab>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(TAB_STORAGE_KEY) : '';
    return saved === 'templates' || saved === 'presets' || saved === 'presetTemplates' ? saved : 'presets';
  });
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [presetTemplates, setPresetTemplates] = useState<PresetTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);

  const [templateName, setTemplateName] = useState('');
  const [templateJsonText, setTemplateJsonText] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isTemplateViewerOpen, setIsTemplateViewerOpen] = useState(false);

  const [presetTemplateName, setPresetTemplateName] = useState('');
  const [selectedPresetTemplateId, setSelectedPresetTemplateId] = useState('');
  const [deletingPresetTemplateId, setDeletingPresetTemplateId] = useState<string | null>(null);
  const [isUploadingPresetTemplate, setIsUploadingPresetTemplate] = useState(false);
  const [previewModal, setPreviewModal] = useState<{ title: string; items: { src: string; title?: string }[]; initialIndex: number } | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const loadPageData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [templatesResp, presetTemplatesResp] = await Promise.all([listStyleTemplates(), listPresetTemplates()]);
      const nextTemplates = templatesResp.data?.templates || [];
      const nextPresetTemplates = presetTemplatesResp.data?.templates || [];
      setTemplates(nextTemplates);
      setPresetTemplates(nextPresetTemplates);
      setSelectedTemplateId((prev) => (prev && nextTemplates.some((item) => item.id === prev) ? prev : (nextTemplates[0]?.id || '')));
      setSelectedPresetTemplateId((prev) => (
        prev && nextPresetTemplates.some((item) => item.template_id === prev) ? prev : (nextPresetTemplates[0]?.template_id || '')
      ));
      setWorkspaceRefreshKey((value) => value + 1);
    } catch (error: any) {
      show({ message: `加载失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const openTemplateJsonDrawer = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    setIsTemplateViewerOpen(true);
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    if (!templateJsonText.trim()) {
      show({ message: t('templates.jsonRequired'), type: 'error' });
      return;
    }
    try {
      JSON.parse(templateJsonText);
    } catch {
      show({ message: t('templates.invalidJson'), type: 'error' });
      return;
    }

    setIsSavingTemplate(true);
    try {
      await createStyleTemplate({ name: templateName || undefined, template_json: templateJsonText });
      setTemplateName('');
      setTemplateJsonText('');
      show({ message: t('templates.saved'), type: 'success' });
      await loadPageData();
    } catch (error: any) {
      show({ message: `保存失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setIsSavingTemplate(false);
    }
  }, [loadPageData, show, t, templateJsonText, templateName]);

  const handleDeleteTemplate = useCallback((template: StyleTemplate) => {
    confirm(
      t('templates.deleteConfirm'),
      async () => {
        setDeletingTemplateId(template.id);
        try {
          await deleteStyleTemplate(template.id);
          if (selectedTemplateId === template.id) {
            setIsTemplateViewerOpen(false);
          }
          show({ message: t('templates.deleted'), type: 'success' });
          await loadPageData();
        } catch (error: any) {
          show({ message: `删除失败：${error?.message || '未知错误'}`, type: 'error' });
        } finally {
          setDeletingTemplateId(null);
        }
      },
      { title: t('templates.delete'), confirmText: t('templates.delete'), variant: 'danger' }
    );
  }, [confirm, loadPageData, selectedTemplateId, show, t]);

  const handleUploadPresetTemplate = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingPresetTemplate(true);
    try {
      await uploadPresetTemplate(file, presetTemplateName || undefined);
      setPresetTemplateName('');
      show({ message: t('presetTemplates.uploaded'), type: 'success' });
      await loadPageData();
    } catch (error: any) {
      show({ message: `上传失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setIsUploadingPresetTemplate(false);
      event.target.value = '';
    }
  }, [loadPageData, presetTemplateName, show, t]);

  const handleDeletePresetTemplate = useCallback((template: PresetTemplate) => {
    confirm(
      t('presetTemplates.deleteConfirm'),
      async () => {
        setDeletingPresetTemplateId(template.template_id);
        try {
          await deletePresetTemplate(template.template_id);
          show({ message: t('presetTemplates.deleted'), type: 'success' });
          await loadPageData();
        } catch (error: any) {
          show({ message: `删除失败：${error?.message || '未知错误'}`, type: 'error' });
        } finally {
          setDeletingPresetTemplateId(null);
        }
      },
      {
        title: t('presetTemplates.delete'),
        confirmText: t('presetTemplates.delete'),
        variant: 'danger',
      }
    );
  }, [confirm, loadPageData, show, t]);

  const openPresetTemplatePreview = useCallback((template: PresetTemplate) => {
    const src = getImageUrl(template.template_image_url);
    setPreviewModal({
      title: template.name || template.template_id,
      items: [{ src, title: template.name || template.template_id }],
      initialIndex: 0,
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50/30 to-pink-50/50 dark:from-background-primary dark:via-background-primary dark:to-background-primary">
      <PageHeader
        title={t('nav.title')}
        icon={<Code2 size={18} />}
        onBack={handleBack}
        onHome={() => navigate('/')}
        backLabel={t('nav.back')}
        homeLabel={t('nav.home')}
        actions={(
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />}
            onClick={() => void loadPageData()}
            disabled={isLoading}
          >
            {isLoading ? t('nav.loading') : t('nav.refresh')}
          </Button>
        )}
        backTestId="style-library-nav-back"
        homeTestId="style-library-nav-home"
      />

      <main className={`${PAGE_CONTAINER_CLASS} py-6 md:py-8 space-y-4`}>
        <Card className="p-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('presetTemplates')}
              data-testid="style-library-tab-preset-templates"
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${activeTab === 'presetTemplates' ? 'bg-banana-500 text-black' : 'text-black hover:bg-gray-100 dark:hover:bg-background-hover'}`}
            >
              {t('tabs.presetTemplates')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              data-testid="style-library-tab-presets"
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${activeTab === 'presets' ? 'bg-banana-500 text-black' : 'text-black hover:bg-gray-100 dark:hover:bg-background-hover'}`}
            >
              {t('tabs.presets')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              data-testid="style-library-tab-templates"
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${activeTab === 'templates' ? 'bg-banana-500 text-black' : 'text-black hover:bg-gray-100 dark:hover:bg-background-hover'}`}
            >
              {t('tabs.templates')}
            </button>
          </div>
        </Card>

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
              <Button size="sm" loading={isSavingTemplate} onClick={handleSaveTemplate}>{t('templates.save')}</Button>
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
                      className={`p-2 rounded-lg border transition-colors ${selectedTemplateId === tpl.id ? 'border-banana-500 bg-banana-50/60 dark:bg-background-hover' : 'border-gray-200 dark:border-border-primary'}`}
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
                          <Button variant="ghost" size="sm" onClick={() => openTemplateJsonDrawer(tpl.id)} data-testid={`template-${tpl.id}-view-json`}>
                            {t('templates.view')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            loading={deletingTemplateId === tpl.id}
                            onClick={() => void handleDeleteTemplate(tpl)}
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
        ) : null}

        {activeTab === 'presetTemplates' ? (
          <Card className="p-4 md:p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-col md:flex-row md:items-center">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('presetTemplates.title')}</h2>
                <p className="text-xs text-gray-600 dark:text-foreground-tertiary">{t('presetTemplates.subtitle')}</p>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  value={presetTemplateName}
                  onChange={(e) => setPresetTemplateName(e.target.value)}
                  placeholder={t('presetTemplates.name')}
                  className="w-full md:w-60 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                />
                <input ref={presetTemplateInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadPresetTemplate} />
                <Button size="sm" icon={<Upload size={14} />} loading={isUploadingPresetTemplate} onClick={() => presetTemplateInputRef.current?.click()}>
                  {isUploadingPresetTemplate ? t('presetTemplates.uploading') : t('presetTemplates.upload')}
                </Button>
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-foreground-tertiary">
              {presetTemplates.length > 0 ? t('presetTemplates.count', { count: presetTemplates.length }) : t('presetTemplates.empty')}
            </div>

            {presetTemplates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-border-primary p-5 text-sm text-gray-500 dark:text-foreground-tertiary">
                {t('presetTemplates.empty')}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {presetTemplates.map((presetTemplate) => {
                  const thumbSrc = getImageUrl(presetTemplate.thumb_url || presetTemplate.template_image_url);
                  return (
                    <div
                      key={presetTemplate.template_id}
                      className={`rounded-xl border p-3 bg-white dark:bg-background-secondary ${selectedPresetTemplateId === presetTemplate.template_id ? 'border-banana-500' : 'border-gray-200 dark:border-border-primary'}`}
                    >
                      <button type="button" className="w-full text-left" onClick={() => setSelectedPresetTemplateId(presetTemplate.template_id)}>
                        <div className="aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-border-primary bg-gray-100 dark:bg-background-tertiary">
                          <img src={thumbSrc} alt={presetTemplate.name || presetTemplate.template_id} className="w-full h-full object-cover" />
                        </div>
                        <div className="mt-3 text-sm font-medium text-gray-900 dark:text-white truncate">{presetTemplate.name || presetTemplate.template_id}</div>
                      </button>
                      <div className="mt-3 flex items-center gap-2">
                        <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => openPresetTemplatePreview(presetTemplate)}>
                          {t('presetTemplates.preview')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 size={14} />}
                          loading={deletingPresetTemplateId === presetTemplate.template_id}
                          onClick={() => void handleDeletePresetTemplate(presetTemplate)}
                        >
                          {t('presetTemplates.delete')}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}

        {activeTab === 'presets' ? <JsonPresetWorkspace templates={templates} refreshKey={workspaceRefreshKey} /> : null}
      </main>

      <TemplateJsonDrawer
        isOpen={isTemplateViewerOpen}
        title="JSON文本模版骨架预览"
        subtitle={selectedTemplate?.name || selectedTemplate?.id || ''}
        jsonText={selectedTemplate?.template_json || ''}
        emptyText={t('templates.noSelection')}
        onClose={() => setIsTemplateViewerOpen(false)}
        onCopy={() => {
          navigator.clipboard.writeText(selectedTemplate?.template_json || '').then(
            () => show({ message: 'JSON 已复制', type: 'success' }),
            () => show({ message: '复制失败', type: 'error' }),
          );
        }}
      />

      <ToastContainer />
      {ConfirmDialog}

      <ImageLightbox
        isOpen={Boolean(previewModal)}
        title={previewModal?.title || '预览'}
        items={previewModal?.items || []}
        initialIndex={previewModal?.initialIndex || 0}
        onClose={() => setPreviewModal(null)}
      />
    </div>
  );
};

interface TemplateJsonDrawerProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  jsonText: string;
  emptyText: string;
  onClose: () => void;
  onCopy: () => void;
}

const TemplateJsonDrawer: React.FC<TemplateJsonDrawerProps> = ({ isOpen, title, subtitle, jsonText, emptyText, onClose, onCopy }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)));
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    setIsAnimating(false);
    const timer = window.setTimeout(() => setIsVisible(false), 220);
    document.body.style.overflow = '';
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isVisible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50" aria-hidden={!isOpen}>
      <button type="button" className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-200 ${isAnimating ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} aria-label="close template json drawer backdrop" />
      <div
        role="dialog"
        aria-modal="true"
        data-testid="style-library-template-json-drawer"
        className={`absolute flex flex-col bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary shadow-2xl transition-transform duration-200 ease-out
          left-0 right-0 bottom-0 max-h-[80vh] rounded-t-2xl
          md:left-auto md:right-0 md:top-0 md:bottom-0 md:w-[min(720px,90vw)] md:max-h-none md:rounded-none md:rounded-l-2xl
          ${isAnimating ? 'translate-y-0 md:translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-border-primary">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
            <div className="text-xs text-gray-500 dark:text-foreground-tertiary truncate">{subtitle || ''}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onCopy}>复制</Button>
            <button
              type="button"
              onClick={onClose}
              data-testid="style-library-template-json-close"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-border-primary text-gray-500 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
              aria-label="close template json drawer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {jsonText ? (
          <div className="flex-1 overflow-auto p-4">
            <div className="rounded-lg border border-gray-200 dark:border-border-primary bg-gray-50 dark:bg-background-tertiary overflow-auto">
              <pre className="p-3 text-xs font-mono whitespace-pre text-gray-800 dark:text-white">{jsonText}</pre>
            </div>
          </div>
        ) : (
          <div className="p-4 text-xs text-gray-500 dark:text-foreground-tertiary">{emptyText}</div>
        )}
      </div>
    </div>,
    document.body,
  );
};
