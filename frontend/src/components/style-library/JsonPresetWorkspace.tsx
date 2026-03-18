import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageLightbox, useConfirm, useToast } from '@/components/shared';
import {
  createStylePreset,
  deleteStylePreset,
  getStoredOutputLanguage,
  listStylePresetTasks,
  listStylePresets,
  regenerateStylePresetPreviewImage,
  startStylePresetGeneration,
  type StylePreset,
  type StylePresetPreviewImages,
} from '@/api/endpoints';
import { getImageUrl } from '@/api/client';
import { JsonPresetTaskBoard } from './JsonPresetTaskBoard';
import { JsonPresetList } from './JsonPresetList';
import { JsonPresetCreateDrawer } from './JsonPresetCreateDrawer';
import { JsonPresetJsonViewer } from './JsonPresetJsonViewer';
import type { JsonPresetWorkspaceProps, PreviewKey, StylePresetTaskRecord } from './types';
import { PREVIEW_ORDER, getPresetDisplayName, getTaskPreviewKey, isTaskRunning } from './types';

const MAX_RUNNING_TASKS = 4;

export const JsonPresetWorkspace: React.FC<JsonPresetWorkspaceProps> = ({ templates, refreshKey = 0 }) => {
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [tasks, setTasks] = useState<StylePresetTaskRecord[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [isManualCreating, setIsManualCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);
  const [pendingPreviewGeneration, setPendingPreviewGeneration] = useState<{ presetId: string; previewKey: PreviewKey } | null>(null);
  const [viewerPresetId, setViewerPresetId] = useState<string>('');
  const [previewModal, setPreviewModal] = useState<{ title: string; items: { src: string; title?: string }[]; initialIndex: number } | null>(null);
  const [dismissedTaskIds, setDismissedTaskIds] = useState<string[]>([]);
  const runningTaskIdsRef = useRef<string>('');

  const selectedPreset = useMemo(
    () => presets.find((item) => item.id === viewerPresetId) || null,
    [presets, viewerPresetId],
  );

  const runningTasks = useMemo(() => tasks.filter(isTaskRunning), [tasks]);


  const hasResolvedTaskFailure = useCallback((task: StylePresetTaskRecord) => {
    if (task.status !== 'FAILED') return false;
    const presetId = String(task.progress?.preset_id || '');
    if (!presetId) return false;
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return false;
    const previewImages: Partial<StylePresetPreviewImages> = preset.preview_images || {};

    if (task.task_type === 'STYLE_PRESET_IMAGE_REGENERATE') {
      const previewKey = getTaskPreviewKey(task);
      return Boolean(previewKey && previewImages[previewKey]);
    }

    return PREVIEW_ORDER.every(([key]) => Boolean(previewImages[key]));
  }, [presets]);

  const visibleTasks = useMemo(() => {
    const dismissed = new Set(dismissedTaskIds);
    return tasks.filter((task) => !dismissed.has(task.task_id) && !hasResolvedTaskFailure(task));
  }, [dismissedTaskIds, hasResolvedTaskFailure, tasks]);


  const loadPresets = useCallback(async () => {
    setIsLoadingPresets(true);
    try {
      const response = await listStylePresets();
      const nextPresets = response.data?.presets || [];
      setPresets(nextPresets);
      setViewerPresetId((prev) => (prev && nextPresets.some((item) => item.id === prev) ? prev : ''));
    } catch (error: any) {
      show({ message: `加载 JSON 文本模版失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setIsLoadingPresets(false);
    }
  }, [show]);

  const loadTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const response = await listStylePresetTasks();
      const nextTasks = (response.data?.tasks || []) as StylePresetTaskRecord[];
      setDismissedTaskIds((prev) => prev.filter((taskId) => nextTasks.some((task) => task.task_id === taskId)));
      const previousRunningIds = runningTaskIdsRef.current;
      const nextRunningIds = nextTasks.filter(isTaskRunning).map((task) => task.task_id).join(',');
      runningTaskIdsRef.current = nextRunningIds;
      setTasks(nextTasks);
      if (previousRunningIds && !nextRunningIds) {
        await loadPresets();
      }
    } catch (error: any) {
      show({ message: `加载生成任务失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setIsLoadingTasks(false);
    }
  }, [loadPresets, show]);

  useEffect(() => {
    void Promise.all([loadPresets(), loadTasks()]);
  }, [loadPresets, loadTasks, refreshKey]);

  useEffect(() => {
    if (!runningTasks.length) return;
    const timer = window.setInterval(() => {
      void loadTasks();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadTasks, runningTasks.length]);

  const openPresetPreview = useCallback((preset: StylePreset, previewKey?: PreviewKey) => {
    const previewImages: Partial<StylePresetPreviewImages> = preset.preview_images || {};
    const items = PREVIEW_ORDER
      .map(([key, label]) => {
        const url = previewImages[key];
        return url ? { src: getImageUrl(url), title: `${getPresetDisplayName(preset)}-${label}` } : null;
      })
      .filter(Boolean) as { src: string; title?: string }[];

    if (!items.length) {
      show({ message: '当前模板暂无预览图', type: 'info' });
      return;
    }

    const clickedIndex = previewKey
      ? Math.max(0, items.findIndex((item) => item.src === getImageUrl(previewImages[previewKey] || '')))
      : 0;

    setPreviewModal({
      title: getPresetDisplayName(preset),
      items,
      initialIndex: clickedIndex,
    });
  }, [show]);

  const openPresetJson = useCallback((presetId: string) => {
    setViewerPresetId(presetId);
  }, []);

  const handleCopyJson = useCallback(async () => {
    if (!selectedPreset?.style_json) return;
    try {
      await navigator.clipboard.writeText(selectedPreset.style_json);
      show({ message: 'JSON 已复制', type: 'success' });
    } catch {
      show({ message: '复制失败', type: 'error' });
    }
  }, [selectedPreset, show]);

  const handleDeletePreset = useCallback((preset: StylePreset) => {
    confirm(
      '将删除该 JSON 文本模版，此操作不可撤销。确定继续？',
      async () => {
        setDeletingPresetId(preset.id);
        try {
          await deleteStylePreset(preset.id);
          if (viewerPresetId === preset.id) {
            setViewerPresetId('');
          }
          show({ message: 'JSON 文本模版已删除', type: 'success' });
          await loadPresets();
          await loadTasks();
        } catch (error: any) {
          show({ message: `删除失败：${error?.message || '未知错误'}`, type: 'error' });
        } finally {
          setDeletingPresetId(null);
        }
      },
      {
        title: '删除',
        confirmText: '删除',
        variant: 'danger',
      }
    );
  }, [confirm, loadPresets, loadTasks, viewerPresetId, show]);

  const handleGenerateTask = useCallback(async ({ templateId, name, requirements }: { templateId: string; name: string; requirements: string }) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template?.template_json) {
      show({ message: '请先选择一个 JSON 文本模版骨架', type: 'error' });
      return;
    }
    if (runningTasks.length >= MAX_RUNNING_TASKS) {
      show({ message: `最多同时运行 ${MAX_RUNNING_TASKS} 个任务`, type: 'error' });
      return;
    }

    setIsGenerating(true);
    try {
      const language = await getStoredOutputLanguage();
      await startStylePresetGeneration({
        name: name || undefined,
        template_json: template.template_json,
        style_requirements: requirements || undefined,
        language,
      });
      show({ message: '已创建生成任务', type: 'success' });
      await loadTasks();
    } catch (error: any) {
      show({ message: `创建生成任务失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }, [loadTasks, runningTasks.length, show, templates]);

  const handleManualCreate = useCallback(async ({ name, styleJson }: { name: string; styleJson: string }) => {
    setIsManualCreating(true);
    try {
      await createStylePreset({ name: name || undefined, style_json: styleJson });
      show({ message: 'JSON 文本模版已保存', type: 'success' });
      await loadPresets();
    } catch (error: any) {
      show({ message: `保存失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setIsManualCreating(false);
    }
  }, [loadPresets, show]);

  const handleGeneratePreview = useCallback(async (preset: StylePreset, previewKey: PreviewKey) => {
    setPendingPreviewGeneration({ presetId: preset.id, previewKey });
    try {
      const language = await getStoredOutputLanguage();
      await regenerateStylePresetPreviewImage(preset.id, previewKey, { language });
      show({ message: '已创建补图任务', type: 'success' });
      await loadTasks();
    } catch (error: any) {
      show({ message: `补图失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setPendingPreviewGeneration(null);
    }
  }, [loadTasks, show]);

  const handleRetryTask = useCallback(async (task: StylePresetTaskRecord) => {
    const previewKey = getTaskPreviewKey(task);
    const presetId = String(task.progress?.preset_id || '');
    if (task.task_type === 'STYLE_PRESET_IMAGE_REGENERATE' && previewKey && presetId) {
      await handleGeneratePreview({ id: presetId, name: task.progress?.preset_name, style_json: '', preview_images: task.progress?.preview_images } as StylePreset, previewKey);
      return;
    }

    if (presetId) {
      const progressPreviewImages: Partial<StylePresetPreviewImages> = task.progress?.preview_images || {};
      const missingKey = (Object.entries(progressPreviewImages).find(([, value]) => !value)?.[0] as PreviewKey | undefined)
        || (Object.keys(task.progress?.preview_errors || {})[0] as PreviewKey | undefined);
      if (missingKey) {
        await handleGeneratePreview({ id: presetId, name: task.progress?.preset_name, style_json: '', preview_images: progressPreviewImages } as StylePreset, missingKey);
        return;
      }
    }

    const templateJson = String(task.progress?.template_json || '');
    if (!templateJson) {
      show({ message: '缺少原始骨架，无法重试', type: 'error' });
      return;
    }
    setIsGenerating(true);
    try {
      const language = await getStoredOutputLanguage();
      await startStylePresetGeneration({
        name: String(task.progress?.preset_name || '') || undefined,
        template_json: templateJson,
        style_requirements: String(task.progress?.style_requirements || '') || undefined,
        language,
      });
      show({ message: '已重新发起生成任务', type: 'success' });
      await loadTasks();
    } catch (error: any) {
      show({ message: `重试失败：${error?.message || '未知错误'}`, type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }, [handleGeneratePreview, loadTasks, show]);

  return (
    <>
      <div className="space-y-4">
        <JsonPresetTaskBoard
          tasks={visibleTasks}
          onRetryTask={(task) => void handleRetryTask(task)}
          onDismissTask={(taskId) => setDismissedTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]))}
        />
        <JsonPresetList
          presets={presets}
          deletingPresetId={deletingPresetId}
          generatingPreviewState={pendingPreviewGeneration}
          onViewJson={openPresetJson}
          onPreview={openPresetPreview}
          onDelete={(preset) => void handleDeletePreset(preset)}
          onGeneratePreview={(preset, previewKey) => void handleGeneratePreview(preset, previewKey)}
          onOpenCreateDrawer={() => setIsCreateDrawerOpen(true)}
        />
        {(isLoadingPresets || isLoadingTasks) && !presets.length && !tasks.length ? (
          <div className="text-xs text-gray-500 dark:text-foreground-tertiary">加载中...</div>
        ) : null}
      </div>

      <JsonPresetCreateDrawer
        isOpen={isCreateDrawerOpen}
        templates={templates}
        runningTaskCount={runningTasks.length}
        maxRunningTasks={MAX_RUNNING_TASKS}
        loadingGenerate={isGenerating}
        loadingManualCreate={isManualCreating}
        onClose={() => setIsCreateDrawerOpen(false)}
        onGenerate={handleGenerateTask}
        onManualCreate={handleManualCreate}
      />

      <JsonPresetJsonViewer
        isOpen={Boolean(selectedPreset)}
        title="JSON 文本模版预览"
        subtitle={selectedPreset ? getPresetDisplayName(selectedPreset) : ''}
        jsonText={selectedPreset?.style_json || ''}
        emptyText="请选择一个 JSON 文本模版查看 JSON"
        onClose={() => setViewerPresetId('')}
        onCopy={() => void handleCopyJson()}
      />

      <ImageLightbox
        isOpen={Boolean(previewModal)}
        title={previewModal?.title || '预览'}
        items={previewModal?.items || []}
        initialIndex={previewModal?.initialIndex || 0}
        onClose={() => setPreviewModal(null)}
      />

      <ToastContainer />
      {ConfirmDialog}
    </>
  );
};
