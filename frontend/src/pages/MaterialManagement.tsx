import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, ImageIcon, RefreshCw, Upload, X, Eye, Sparkles, Clock3, Trash2 } from 'lucide-react';
import { Button, Card, ImageLightbox, PageHeader, PAGE_CONTAINER_CLASS, useToast } from '@/components/shared';
import { useT } from '@/hooks/useT';
import {
  listMaterials,
  uploadMaterial,
  listProjects,
  deleteMaterial,
  type Material,
} from '@/api/endpoints';
import type { Project } from '@/types';
import { getImageUrl } from '@/api/client';
import { MaterialGeneratorForm } from '@/components/shared/MaterialGeneratorForm';

const i18nDict = {
  zh: {
    home: { title: '蕉幻' },
    nav: { back: '返回', home: '主页', refresh: '刷新', loading: '刷新中...' },
    settings: { language: { label: '界面语言' }, theme: { light: '浅色', dark: '深色' } },
    mg: {
      title: '素材管理',
      generate: '生成素材',
      count: '共 {{count}} 个素材',
      empty: '暂无素材',
      filterAll: '全部素材',
      filterNone: '未关联项目',
      moreProjects: '+ 更多项目…',
      preview: '预览',
      remove: '删除',
      closePreview: '关闭预览',
      emptyHint: '上传图片或通过素材生成功能创建素材',
      closeGenerator: '关闭生成面板',
      pending: '待生成',
      pendingHint: '任务已创建，生成完成后会自动出现在这里',
      msg: {
        loadErr: '加载素材失败',
        badFormat: '不支持的图片格式',
        uploaded: '素材上传成功',
        uploadErr: '上传素材失败',
        noId: '无法删除：缺少素材ID',
        deleted: '素材已删除',
        deleteErr: '删除素材失败',
        downloaded: '下载成功',
        downloadErr: '下载失败',
        zipped: '已打包 {{count}} 个素材',
        zipErr: '批量下载失败',
        pickFirst: '请先选择要下载的素材',
      },
    },
  },
  en: {
    home: { title: 'Banana Slides' },
    nav: { back: 'Back', home: 'Home', refresh: 'Refresh', loading: 'Refreshing...' },
    settings: { language: { label: 'Interface Language' }, theme: { light: 'Light', dark: 'Dark' } },
    mg: {
      title: 'Material Management',
      generate: 'Generate Material',
      count: '{{count}} materials',
      empty: 'No materials',
      filterAll: 'All Materials',
      filterNone: 'Unassociated',
      moreProjects: '+ More projects…',
      preview: 'Preview',
      remove: 'Delete',
      closePreview: 'Close Preview',
      emptyHint: 'Upload images or create materials via the generator',
      closeGenerator: 'Close generator panel',
      pending: 'Pending',
      pendingHint: 'Task created. The generated material will appear here automatically.',
      msg: {
        loadErr: 'Failed to load materials',
        badFormat: 'Unsupported image format',
        uploaded: 'Material uploaded',
        uploadErr: 'Failed to upload material',
        noId: 'Cannot delete: missing material ID',
        deleted: 'Material deleted',
        deleteErr: 'Failed to delete material',
        downloaded: 'Download complete',
        downloadErr: 'Download failed',
        zipped: 'Packaged {{count}} materials',
        zipErr: 'Batch download failed',
        pickFirst: 'Select materials to download first',
      },
    },
  },
};

interface State {
  items: Material[];
  deleting: Set<string>;
  loading: boolean;
  uploading: boolean;
  downloading: boolean;
  filter: string;
  projects: Project[];
  projectsReady: boolean;
  showAllProjects: boolean;
  preview: { items: Array<{ src: string; title: string }>; initialIndex: number; label: string } | null;
}

type Action =
  | { type: 'SET_ITEMS'; items: Material[] }
  | { type: 'SET_LOADING'; on: boolean }
  | { type: 'SET_UPLOADING'; on: boolean }
  | { type: 'SET_DOWNLOADING'; on: boolean }
  | { type: 'SET_FILTER'; value: string }
  | { type: 'SET_PROJECTS'; list: Project[] }
  | { type: 'EXPAND_PROJECTS' }
  | { type: 'REMOVE_ITEM'; key: string }
  | { type: 'ADD_DELETING'; id: string }
  | { type: 'REMOVE_DELETING'; id: string }
  | { type: 'SET_PREVIEW'; preview: State['preview'] }
  | { type: 'RESET_EPHEMERAL' };

const initial: State = {
  items: [],
  deleting: new Set(),
  loading: false,
  uploading: false,
  downloading: false,
  filter: 'all',
  projects: [],
  projectsReady: false,
  showAllProjects: false,
  preview: null,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'SET_ITEMS':
      return { ...s, items: a.items, loading: false };
    case 'SET_LOADING':
      return { ...s, loading: a.on };
    case 'SET_UPLOADING':
      return { ...s, uploading: a.on };
    case 'SET_DOWNLOADING':
      return { ...s, downloading: a.on };
    case 'SET_FILTER':
      return { ...s, filter: a.value };
    case 'SET_PROJECTS':
      return { ...s, projects: a.list, projectsReady: true };
    case 'EXPAND_PROJECTS':
      return { ...s, showAllProjects: true };
    case 'REMOVE_ITEM': {
      const items = s.items.filter((m) => m.id !== a.key);
      return { ...s, items };
    }
    case 'ADD_DELETING': {
      const d = new Set(s.deleting);
      d.add(a.id);
      return { ...s, deleting: d };
    }
    case 'REMOVE_DELETING': {
      const d = new Set(s.deleting);
      d.delete(a.id);
      return { ...s, deleting: d };
    }
    case 'SET_PREVIEW':
      return { ...s, preview: a.preview };
    case 'RESET_EPHEMERAL':
      return { ...s, showAllProjects: false, preview: null };
    default:
      return s;
  }
}

const displayName = (m: Material) =>
  m.prompt?.trim() ||
  m.name?.trim() ||
  m.original_filename?.trim() ||
  m.source_filename?.trim() ||
  m.filename ||
  m.url;

interface PendingMaterialItem {
  id: string;
  taskId: string;
  prompt: string;
  aspectRatio: string;
  status: 'pending';
}

const isPendingMaterial = (item: Material | PendingMaterialItem): item is PendingMaterialItem =>
  'status' in item && item.status === 'pending';

const pendingItemLabel = (item: PendingMaterialItem) => item.prompt?.trim() || item.taskId;

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];

const projectLabel = (p: Project) => {
  const raw = p.idea_prompt || p.outline_text || `Project ${p.project_id.slice(0, 8)}`;
  return raw.length > 20 ? `${raw.slice(0, 20)}…` : raw;
};

const ToolbarSection: React.FC<{
  t: ReturnType<typeof useT>;
  state: State;
  dispatch: React.Dispatch<Action>;
  onRefresh: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerate: () => void;
}> = ({ t, state, dispatch, onRefresh, onUpload, onGenerate }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-foreground-tertiary">
        <FolderOpen size={16} className="text-banana-500" />
        <span>{state.items.length > 0 ? t('mg.count', { count: state.items.length }) : t('mg.empty')}</span>
        {state.loading && state.items.length > 0 && <RefreshCw size={14} className="animate-spin text-gray-400" />}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={state.filter}
          onChange={(e) => {
            if (e.target.value === '_expand') {
              dispatch({ type: 'EXPAND_PROJECTS' });
              return;
            }
            dispatch({ type: 'SET_FILTER', value: e.target.value });
          }}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-border-primary rounded-md bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 w-40 sm:w-48 max-w-[200px] truncate"
        >
          <option value="all">{t('mg.filterAll')}</option>
          <option value="none">{t('mg.filterNone')}</option>
          {state.showAllProjects ? (
            <>
              <option disabled>───────────</option>
              {state.projects.map((p) => (
                <option key={p.project_id} value={p.project_id} title={p.idea_prompt || p.outline_text}>
                  {projectLabel(p)}
                </option>
              ))}
            </>
          ) : (
            state.projects.length > 0 && <option value="_expand">{t('mg.moreProjects')}</option>
          )}
        </select>

        <label className="inline-block cursor-pointer">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-foreground-secondary bg-white dark:bg-background-secondary border border-gray-300 dark:border-border-primary rounded-md hover:bg-gray-50 dark:hover:bg-background-hover disabled:opacity-50 disabled:cursor-not-allowed">
            <Upload size={16} />
            <span>{state.uploading ? t('common.uploading') : t('common.upload')}</span>
          </div>
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" disabled={state.uploading} />
        </label>

        <Button variant="primary" size="sm" icon={<Sparkles size={16} />} onClick={onGenerate}>
          {t('mg.generate')}
        </Button>
      </div>
    </div>

  </div>
);

const MaterialGrid: React.FC<{
  items: Array<Material | PendingMaterialItem>;
  deleting: Set<string>;
  t: ReturnType<typeof useT>;
  onPreview: (e: React.MouseEvent, m: Material) => void;
  onDelete: (e: React.MouseEvent<HTMLButtonElement>, m: Material) => void;
}> = ({ items, deleting, t, onPreview, onDelete }) => (
  <div className="grid grid-cols-4 gap-4 max-h-[70vh] overflow-y-auto p-4">
    {items.map((m) => {
      if (isPendingMaterial(m)) {
        return (
          <div
            key={m.id}
            className="aspect-video rounded-lg border-2 border-dashed border-banana-300 bg-gradient-to-br from-banana-50 to-amber-50 dark:from-banana-900/20 dark:to-amber-900/10 relative overflow-hidden"
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-white/80 dark:bg-white/10 flex items-center justify-center shadow-sm mb-3">
                <Clock3 size={22} className="text-banana-600 animate-pulse" />
              </div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t('mg.pending')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{pendingItemLabel(m)}</div>
              <div className="text-[11px] text-banana-700 dark:text-banana-300 mt-2">{t('mg.pendingHint')}</div>
            </div>
          </div>
        );
      }

      const busy = deleting.has(m.id);
      return (
        <div
          key={m.id}
          onClick={(e) => onPreview(e, m)}
          className="aspect-video rounded-lg border-2 cursor-zoom-in transition-all relative group border-gray-200 dark:border-border-primary hover:border-banana-300 overflow-hidden"
        >
          <img src={getImageUrl(m.url)} alt={displayName(m)} className="absolute inset-0 w-full h-full object-cover rounded-md" />

          <button
            type="button"
            onClick={(e) => onPreview(e, m)}
            className="absolute top-2 left-2 w-8 h-8 bg-black/55 backdrop-blur-sm text-white rounded-full flex items-center justify-center opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 transition-all duration-200 shadow-md z-10 hover:bg-black/75"
            aria-label={t('mg.preview')}
          >
            <Eye size={15} />
          </button>

          <button
            type="button"
            onClick={(e) => onDelete(e, m)}
            disabled={busy}
            className="absolute top-2 right-2 w-8 h-8 bg-black/55 backdrop-blur-sm text-white rounded-full flex items-center justify-center opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 transition-all duration-200 shadow-md z-10 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label={t('mg.remove')}
          >
            {busy ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </button>

          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent text-white text-xs px-2 py-2 truncate opacity-0 group-hover:opacity-100 transition-opacity rounded-b-md">
            {displayName(m)}
          </div>
        </div>
      );
    })}
  </div>
);

export const MaterialManagement: React.FC = () => {
  const navigate = useNavigate();
  const t = useT(i18nDict);
  const { show, ToastContainer } = useToast();
  const [s, dispatch] = useReducer(reducer, initial);
  const [pendingItems, setPendingItems] = useState<PendingMaterialItem[]>([]);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  useEffect(() => {
    const onResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (!isGeneratorOpen || isMobileView) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isGeneratorOpen, isMobileView]);

  const fetchItems = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', on: true });
    try {
      const target = s.filter === 'all' ? 'all' : s.filter === 'none' ? 'none' : s.filter;
      const res = await listMaterials(target);
      dispatch({ type: 'SET_ITEMS', items: res.data?.materials ?? [] });
    } catch (err: any) {
      dispatch({ type: 'SET_LOADING', on: false });
      show({ message: err?.response?.data?.error?.message || err.message || t('mg.msg.loadErr'), type: 'error' });
    }
  }, [s.filter, show, t]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await listProjects(100, 0);
      if (res.data?.projects) dispatch({ type: 'SET_PROJECTS', list: res.data.projects });
    } catch {
      // non critical
    }
  }, []);

  useEffect(() => {
    if (!s.projectsReady) fetchProjects();
    fetchItems();
  }, [s.filter, s.projectsReady]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      show({ message: t('mg.msg.badFormat'), type: 'error' });
      return;
    }
    dispatch({ type: 'SET_UPLOADING', on: true });
    try {
      const pid = s.filter === 'all' || s.filter === 'none' ? null : s.filter;
      await uploadMaterial(file, pid);
      show({ message: t('mg.msg.uploaded'), type: 'success' });
      fetchItems();
    } catch (err: any) {
      show({ message: err?.response?.data?.error?.message || err.message || t('mg.msg.uploadErr'), type: 'error' });
    } finally {
      dispatch({ type: 'SET_UPLOADING', on: false });
      e.target.value = '';
    }
  };

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>, m: Material) => {
    e.stopPropagation();
    if (!m.id) {
      show({ message: t('mg.msg.noId'), type: 'error' });
      return;
    }
    dispatch({ type: 'ADD_DELETING', id: m.id });
    try {
      await deleteMaterial(m.id);
      dispatch({ type: 'REMOVE_ITEM', key: m.id });
      show({ message: t('mg.msg.deleted'), type: 'success' });
    } catch (err: any) {
      show({ message: err?.response?.data?.error?.message || err.message || t('mg.msg.deleteErr'), type: 'error' });
    } finally {
      dispatch({ type: 'REMOVE_DELETING', id: m.id });
    }
  };



  const handlePreview = (e: React.MouseEvent, m: Material) => {
    e.stopPropagation();
    const lightboxItems = displayItems
      .filter((item): item is Material => !isPendingMaterial(item))
      .map((item) => ({ src: getImageUrl(item.url), title: displayName(item) }));
    const initialIndex = lightboxItems.findIndex((item) => item.src === getImageUrl(m.url));
    dispatch({
      type: 'SET_PREVIEW',
      preview: {
        items: lightboxItems,
        initialIndex: initialIndex >= 0 ? initialIndex : 0,
        label: displayName(m),
      },
    });
  };

  const shouldShowPending = s.filter === 'all' || s.filter === 'none';
  const displayItems = shouldShowPending ? [...pendingItems, ...s.items] : s.items;

  return (
    <div className="min-h-screen bg-gradient-to-br from-banana-50 dark:from-background-primary via-white dark:via-background-primary to-gray-50 dark:to-background-primary">
      <PageHeader
        title={t('mg.title')}
        icon={<FolderOpen size={18} />}
        onBack={handleBack}
        onHome={() => navigate('/')}
        backLabel={t('nav.back')}
        homeLabel={t('nav.home')}
        actions={(
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={16} className={s.loading ? 'animate-spin' : ''} />}
            onClick={() => void fetchItems()}
            disabled={s.loading}
          >
            {s.loading ? t('nav.loading') : t('nav.refresh')}
          </Button>
        )}
      />

      <main className={`${PAGE_CONTAINER_CLASS} py-6 md:py-8`}>
        <Card className="p-4 md:p-5 space-y-4">
          <ToolbarSection t={t} state={s} dispatch={dispatch} onRefresh={fetchItems} onUpload={handleUpload} onGenerate={() => setIsGeneratorOpen(true)} />

          {s.loading && displayItems.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-400">{t('common.loading')}</div>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 p-4">
              <ImageIcon size={48} className="mb-4 opacity-50" />
              <div className="text-sm">{t('mg.empty')}</div>
              <div className="text-xs mt-1">{t('mg.emptyHint')}</div>
            </div>
          ) : (
            <MaterialGrid
              items={displayItems}
              deleting={s.deleting}
              t={t}
              onPreview={handlePreview}
              onDelete={handleDelete}
            />
          )}
        </Card>
      </main>

      <ImageLightbox
        isOpen={Boolean(s.preview)}
        title={s.preview?.label || t('mg.preview')}
        items={s.preview?.items || []}
        initialIndex={s.preview?.initialIndex || 0}
        onClose={() => dispatch({ type: 'SET_PREVIEW', preview: null })}
      />

      {isMobileView && isGeneratorOpen && (
        <div className="fixed inset-0 z-[70] bg-white dark:bg-background-secondary" role="dialog" aria-modal="true" aria-label={t('mg.generate')}>
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-border-primary">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('mg.generate')}</h2>
              <button
                onClick={() => setIsGeneratorOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
                aria-label={t('mg.closeGenerator')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <MaterialGeneratorForm
                projectId={null}
                onGenerated={(taskId) => {
                  if (taskId) setPendingItems((items) => items.filter((item) => item.taskId !== taskId));
                  void fetchItems();
                }}
                onTaskCreated={({ taskId, prompt, aspectRatio }) => {
                  setPendingItems((items) => [
                    { id: `pending-${taskId}`, taskId, prompt, aspectRatio, status: 'pending' },
                    ...items.filter((item) => item.taskId !== taskId),
                  ]);
                }}
                onClose={() => setIsGeneratorOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {!isMobileView && (
        <>
          <div
            className={`fixed inset-0 z-[65] bg-black/45 transition-opacity duration-300 ${isGeneratorOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={() => setIsGeneratorOpen(false)}
          />
          <div
            className={`fixed top-0 right-0 h-full z-[70] transition-transform duration-300 ease-out w-[42vw] min-w-[420px] max-w-[620px] ${
              isGeneratorOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={t('mg.generate')}
          >
            <div className="h-full flex flex-col bg-white dark:bg-background-secondary border-l border-gray-200 dark:border-border-primary shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-border-primary">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('mg.generate')}</h2>
                <button
                  onClick={() => setIsGeneratorOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
                  aria-label={t('mg.closeGenerator')}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-5">
                {isGeneratorOpen && (
                  <MaterialGeneratorForm
                    projectId={null}
                    onGenerated={(taskId) => {
                      if (taskId) setPendingItems((items) => items.filter((item) => item.taskId !== taskId));
                      void fetchItems();
                    }}
                    onTaskCreated={({ taskId, prompt, aspectRatio }) => {
                      setPendingItems((items) => [
                        { id: `pending-${taskId}`, taskId, prompt, aspectRatio, status: 'pending' },
                        ...items.filter((item) => item.taskId !== taskId),
                      ]);
                    }}
                    showCloseButton={false}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <ToastContainer />
    </div>
  );
};
