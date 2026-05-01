import { useCallback } from 'react';
import {
  exportPPTXTask as apiExportPPTXTask,
  exportPDFTask as apiExportPDFTask,
  exportImagesTask as apiExportImagesTask,
  exportEditablePPTX as apiExportEditablePPTX,
  exportVideo as apiExportVideo,
} from '@/api/endpoints';
import type { ExportTask, ExportTaskType } from '@/store/useExportTasksStore';
import { normalizeErrorMessage } from '@/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type UseSlidePreviewExportParams = {
  projectId?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
  addTask: (task: Omit<ExportTask, 'createdAt'>) => void;
  pollExportTask: (localTaskId: string, projectId: string, taskId: string) => void;
  setShowExportMenu: (value: boolean) => void;
  setShowExportTasksPanel: (value: boolean) => void;
  getSelectedPageIdsForExport: () => string[] | undefined;
  videoExportOptions?: {
    voice: string;
    enableKenBurns: boolean;
    includeNoImagePages: boolean;
  };
};

export const useSlidePreviewExport = ({
  projectId,
  t,
  show,
  addTask,
  pollExportTask,
  setShowExportMenu,
  setShowExportTasksPanel,
  getSelectedPageIdsForExport,
  videoExportOptions,
}: UseSlidePreviewExportParams) => {
  // Creates an export task and starts polling it for the selected export format.
  const handleExport = useCallback(async (type: 'pptx' | 'pdf' | 'editable-pptx' | 'images' | 'video') => {
    setShowExportMenu(false);
    if (!projectId) return;

    const pageIds = getSelectedPageIdsForExport();
    const exportTaskId = `export-${Date.now()}`;

    try {
      addTask({
        id: exportTaskId,
        taskId: '',
        projectId,
        type: type as ExportTaskType,
        status: 'PROCESSING',
        pageIds,
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
      } else if (type === 'video') {
        response = await apiExportVideo(projectId, {
          pageIds,
          voice: videoExportOptions?.voice,
          enableKenBurns: videoExportOptions?.enableKenBurns,
          includeNoImagePages: videoExportOptions?.includeNoImagePages,
        });
      }

      const taskId = response?.data?.task_id;
      if (!taskId) {
        throw new Error('导出任务创建失败');
      }

      addTask({
        id: exportTaskId,
        taskId,
        projectId,
        type: type as ExportTaskType,
        status: 'PROCESSING',
        pageIds,
        progress: { total: 100, completed: 0, percent: 0 },
      });

      pollExportTask(exportTaskId, projectId, taskId);
    } catch (error: any) {
      addTask({
        id: exportTaskId,
        taskId: '',
        projectId,
        type: type as ExportTaskType,
        status: 'FAILED',
        errorMessage: normalizeErrorMessage(error.message || t('preview.messages.exportFailed')),
        pageIds,
      });
      show({ message: normalizeErrorMessage(error.message || t('preview.messages.exportFailed')), type: 'error' });
    }
  }, [
    addTask,
    getSelectedPageIdsForExport,
    pollExportTask,
    projectId,
    setShowExportMenu,
    setShowExportTasksPanel,
    show,
    t,
    videoExportOptions?.enableKenBurns,
    videoExportOptions?.includeNoImagePages,
    videoExportOptions?.voice,
  ]);

  return {
    handleExport,
  };
};
