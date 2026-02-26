import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { Card } from './Card';
import { Loading } from './Loading';
import { ImageLightbox } from './ImageLightbox';
import { Textarea } from './Textarea';
import { useToast } from './Toast';
import * as api from '@/api/endpoints';
import { normalizeProject } from '@/utils';
import { getProjectRoute } from '@/utils/projectUtils';
import type { Project, Task } from '@/types';

type StyleRecommendation = {
  id: string;
  name: string;
  rationale?: string;
  style_json: any;
  sample_pages: Record<'cover' | 'toc' | 'detail' | 'ending', string>;
  preview_images: Record<'cover_url' | 'toc_url' | 'detail_url' | 'ending_url', string>;
};

function getTaskRecommendations(task: Task | null): StyleRecommendation[] {
  const progress: any = task?.progress;
  const recs = progress?.recommendations;
  return Array.isArray(recs) ? recs : [];
}

export interface StyleWorkflowPanelProps {
  projectId: string;
  taskId: string;
  templateJson?: string;
  showTemplateControls?: boolean;
  applyMode?: 'continue' | 'apply_only';
  backButtonText?: string;
  onTaskIdChange?: (taskId: string) => void;
  onBackToProject?: () => void;
  onApplied?: () => void;
}

export const StyleWorkflowPanel: React.FC<StyleWorkflowPanelProps> = ({
  projectId,
  taskId,
  templateJson,
  showTemplateControls = false,
  applyMode = 'continue',
  backButtonText = '返回项目',
  onTaskIdChange,
  onBackToProject,
  onApplied,
}) => {
  const navigate = useNavigate();
  const { show, ToastContainer } = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const unmountedRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const pollDelayRef = useRef<number>(2000);
  const pollFailuresRef = useRef<number>(0);
  const [pollPaused, setPollPaused] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState<string>('');
  const [taskPollError, setTaskPollError] = useState<string>('');
  const didToastProjectLoadErrorRef = useRef(false);
  const didToastTaskPollErrorRef = useRef(false);

  const [templateJsonText, setTemplateJsonText] = useState<string>((templateJson || '').toString());
  const [templateName, setTemplateName] = useState<string>('');
  const [isRestarting, setIsRestarting] = useState(false);

  const [editedJsonByRecId, setEditedJsonByRecId] = useState<Record<string, string>>({});
  const [overridePreviewByRecId, setOverridePreviewByRecId] = useState<Record<string, any>>({});
  const [regenLoadingByRecId, setRegenLoadingByRecId] = useState<Record<string, boolean>>({});
  const [regenProgressByRecId, setRegenProgressByRecId] = useState<Record<string, { completed: number; total: number; failed: number }>>({});
  const [applyLoadingRecId, setApplyLoadingRecId] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const clearPollTimer = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const pollTask = useCallback(async (targetTaskId: string, onUpdate?: (t: Task) => void) => {
    clearPollTimer();
    setPollPaused(false);

    const poll = async () => {
      try {
        const resp = await api.getTaskStatus(projectId, targetTaskId);
        const t = resp.data as any as Task;
        if (t) {
          pollDelayRef.current = 2000;
          pollFailuresRef.current = 0;
          setTaskPollError('');
          didToastTaskPollErrorRef.current = false;
          onUpdate?.(t);
          if (t.status === 'COMPLETED' || t.status === 'FAILED') return;
        }
        pollTimerRef.current = window.setTimeout(poll, 2000);
      } catch (err: any) {
        const code = err?.response?.data?.error?.code ? String(err.response.data.error.code) : '';
        const msg = err?.response?.data?.error?.message || err?.message || '未知错误';
        const url = err?.config?.url ? String(err.config.url) : '';
        const fullMsg = url ? `${msg} (${url})` : msg;
        setTaskPollError(fullMsg);

        // If backend says the task/project is gone (common after backend restart / DB change),
        // stop polling immediately and show a clearer hint.
        if (code === 'TASK_NOT_FOUND' || code === 'PROJECT_NOT_FOUND') {
          setPollPaused(true);
          if (!didToastTaskPollErrorRef.current) {
            didToastTaskPollErrorRef.current = true;
            show({
              message: `任务不存在（${code}）。可能是后端重启/数据库切换导致，请关闭预览并重新生成。`,
              type: 'error',
              duration: 8000,
            });
          }
          return;
        }

        pollFailuresRef.current += 1;
        if (!didToastTaskPollErrorRef.current) {
          didToastTaskPollErrorRef.current = true;
          show({ message: `任务轮询失败：${fullMsg}`, type: 'error', duration: 5000 });
        }
        if (pollFailuresRef.current >= 3) {
          setPollPaused(true);
          return;
        }
        const nextDelay = Math.min(Math.floor(pollDelayRef.current * 1.6), 30000);
        pollDelayRef.current = nextDelay;
        pollTimerRef.current = window.setTimeout(poll, pollDelayRef.current);
      }
    };

    await poll();
  }, [projectId, show]);

  const refreshProject = useCallback(async () => {
    const resp = await api.getProject(projectId);
    const proj = resp.data as any as Project;
    if (proj) setProject(proj);
  }, [projectId]);

  const loadProjectWithToast = useCallback(async () => {
    try {
      await refreshProject();
      setProjectLoadError('');
      didToastProjectLoadErrorRef.current = false;
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || '未知错误';
      const url = e?.config?.url ? String(e.config.url) : '';
      const fullMsg = url ? `${msg} (${url})` : msg;
      setProjectLoadError(fullMsg);
      if (!didToastProjectLoadErrorRef.current) {
        didToastProjectLoadErrorRef.current = true;
        show({ message: `加载项目失败：${fullMsg}`, type: 'error', duration: 5000 });
      }
      throw e;
    }
  }, [refreshProject, show]);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        await loadProjectWithToast();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadProjectWithToast]);

  useEffect(() => {
    if (!taskId) return;
    setIsLoading(true);
    pollTask(taskId, (t) => {
      setTask(t);
      setIsLoading(false);
    });
    return () => clearPollTimer();
  }, [pollTask, taskId]);

  const recommendations = useMemo(() => getTaskRecommendations(task), [task]);

  useEffect(() => {
    if (!recommendations.length) return;
    setEditedJsonByRecId((prev) => {
      const next = { ...prev };
      for (const rec of recommendations) {
        if (!next[rec.id]) {
          next[rec.id] = JSON.stringify(rec.style_json ?? {}, null, 2);
        }
      }
      return next;
    });
  }, [recommendations]);

  const getPreviewImages = (rec: StyleRecommendation) => {
    const override = overridePreviewByRecId[rec.id];
    return override?.preview_images || rec.preview_images || {};
  };

  const hasAnyPreviewImages = (rec: StyleRecommendation) => {
    const preview = getPreviewImages(rec) || {};
    return Boolean(preview.cover_url || preview.toc_url || preview.detail_url || preview.ending_url);
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim() || '未命名模板';
    const text = templateJsonText.trim();
    if (!text) {
      show({ message: '请先粘贴风格模板 JSON 骨架', type: 'error' });
      return;
    }
    try {
      JSON.parse(text);
    } catch (e: any) {
      show({ message: `模板 JSON 解析失败：${e?.message || ''}`, type: 'error' });
      return;
    }
    try {
      await api.createStyleTemplate({ name, template_json: text });
      show({ message: '模板已保存', type: 'success' });
      setTemplateName('');
    } catch (e: any) {
      show({ message: `保存模板失败：${e?.message || ''}`, type: 'error' });
    }
  };

  const pollRegenTask = async (regenTaskId: string, recId: string) => {
    let failures = 0;
    let delay = 2000;

    // Dedicated polling loop for preview regeneration tasks.
    // Do NOT reuse the main pollTask() timer, otherwise it will stop polling the primary workflow task.
    // Also: keep regenLoading=true until this task reaches a terminal state, so the UI animation stays visible.
    while (!unmountedRef.current) {
      try {
        const resp = await api.getTaskStatus(projectId, regenTaskId);
        const t = resp.data as any as Task;

        const p: any = (t as any)?.progress || {};
        const preview_images: any = p?.preview_images;
        if (preview_images) {
          setOverridePreviewByRecId((prev) => ({
            ...prev,
            [recId]: { preview_images },
          }));
        }
        if (typeof p?.completed === 'number' && typeof p?.total === 'number') {
          setRegenProgressByRecId((prev) => ({
            ...prev,
            [recId]: {
              completed: p.completed,
              total: p.total,
              failed: typeof p.failed === 'number' ? p.failed : 0,
            },
          }));
        }

        failures = 0;
        delay = 2000;

        const status = String((t as any)?.status || '');
        if (status === 'COMPLETED') return;
        if (status === 'FAILED') {
          const errMsg = (t as any)?.error_message || (t as any)?.error || '预览生成任务失败';
          throw new Error(String(errMsg));
        }

        await sleep(2000);
      } catch (e: any) {
        failures += 1;
        if (failures >= 3) {
          throw e;
        }
        await sleep(delay);
        delay = Math.min(Math.floor(delay * 1.6), 15000);
      }
    }
  };

  const handleRegenerate = async (rec: StyleRecommendation) => {
    const hadPreview = hasAnyPreviewImages(rec);
    setRegenLoadingByRecId((prev) => ({ ...prev, [rec.id]: true }));
    setRegenProgressByRecId((prev) => ({ ...prev, [rec.id]: { completed: 0, total: 4, failed: 0 } }));
    show({ message: hadPreview ? '已开始重跑本组预览…' : '已开始生成本组预览…', type: 'info', duration: 2000 });

    // Yield one frame so the loading UI can paint before heavy JSON.parse/network work.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    const jsonText = (editedJsonByRecId[rec.id] || '').trim();
    let jsonObj: any;
    try {
      jsonObj = JSON.parse(jsonText);
    } catch (e: any) {
      show({ message: `JSON 解析失败：${e?.message || ''}`, type: 'error' });
      setRegenLoadingByRecId((prev) => ({ ...prev, [rec.id]: false }));
      return;
    }
    try {
      const resp = await api.regenerateStyleRecommendationPreviews(projectId, rec.id, {
        style_json: jsonObj,
        sample_pages: rec.sample_pages,
      });
      const regenTaskId = (resp.data as any)?.task_id;
      if (!regenTaskId) throw new Error('未返回任务ID');
      await pollRegenTask(regenTaskId, rec.id);
      show({ message: hadPreview ? '已更新本组预览' : '已生成本组预览', type: 'success' });
    } catch (e: any) {
      show({ message: `预览生成失败：${e?.message || ''}`, type: 'error' });
    } finally {
      setRegenLoadingByRecId((prev) => ({ ...prev, [rec.id]: false }));
    }
  };

  const handleSavePreset = async (rec: StyleRecommendation) => {
    const jsonText = (editedJsonByRecId[rec.id] || '').trim();
    if (!jsonText) {
      show({ message: 'style_json 不能为空', type: 'error' });
      return;
    }
    try {
      JSON.parse(jsonText);
    } catch (e: any) {
      show({ message: `JSON 解析失败：${e?.message || ''}`, type: 'error' });
      return;
    }
    try {
      await api.createStylePreset({ name: rec.name || '未命名风格', style_json: jsonText });
      show({ message: '已保存为风格预设', type: 'success' });
    } catch (e: any) {
      show({ message: `保存预设失败：${e?.message || ''}`, type: 'error' });
    }
  };

  const handleApplyAndContinue = async (rec: StyleRecommendation) => {
    const jsonText = (editedJsonByRecId[rec.id] || '').trim();
    if (!jsonText) {
      show({ message: 'style_json 不能为空', type: 'error' });
      return;
    }
    try {
      JSON.parse(jsonText);
    } catch (e: any) {
      show({ message: `JSON 解析失败：${e?.message || ''}`, type: 'error' });
      return;
    }
    setApplyLoadingRecId(rec.id);
    try {
      await api.updateProject(projectId, { template_style_json: jsonText } as any);
      localStorage.setItem('currentProjectId', projectId);
      await refreshProject();

      if (applyMode === 'apply_only') {
        show({ message: '已应用风格 JSON', type: 'success' });
        onApplied?.();
        return;
      }

      const creationType = (project as any)?.creation_type;
      const isDescription = creationType === 'descriptions' || creationType === 'description';

      if (isDescription) {
        await api.generateFromDescription(projectId);
      } else {
        // idea / outline / unknown -> generate outline pages
        await api.generateOutline(projectId);
      }

      try {
        const refreshed = await api.getProject(projectId);
        const nextRoute = getProjectRoute(normalizeProject(refreshed.data));
        navigate(nextRoute);
      } catch {
        const fallbackRoute = isDescription
          ? `/project/${projectId}/detail`
          : `/project/${projectId}/outline`;
        navigate(fallbackRoute);
      }
    } catch (e: any) {
      show({ message: `应用失败：${e?.message || ''}`, type: 'error' });
    } finally {
      setApplyLoadingRecId(null);
    }
  };

  const handleRestartRecommendations = async () => {
    const text = templateJsonText.trim();
    if (!text) {
      show({ message: '请先粘贴风格模板 JSON 骨架', type: 'error' });
      return;
    }
    try {
      JSON.parse(text);
    } catch (e: any) {
      show({ message: `模板 JSON 解析失败：${e?.message || ''}`, type: 'error' });
      return;
    }
    setIsRestarting(true);
    try {
      const styleReq = (project as any)?.template_style || '';
      const willGeneratePreviews = mode === 'recommendations_and_previews';
      const resp = await api.startStyleRecommendations(projectId, {
        template_json: text,
        style_requirements: styleReq,
        generate_previews: willGeneratePreviews,
      } as any);
      const newTaskId = (resp.data as any)?.task_id;
      if (!newTaskId) throw new Error('未返回任务ID');
      setTask(null);
      onTaskIdChange?.(newTaskId);
      await pollTask(newTaskId, (t) => setTask(t));
      show({ message: willGeneratePreviews ? '已重新开始生成推荐与预览' : '已重新开始生成推荐', type: 'success' });
    } catch (e: any) {
      show({ message: `重新生成失败：${e?.message || ''}`, type: 'error' });
    } finally {
      setIsRestarting(false);
    }
  };

  const taskStatus = (task as any)?.status;
  const progress: any = (task as any)?.progress || {};
  const mode = progress?.mode ? String(progress.mode) : '';
  const total = typeof progress?.total === 'number' ? progress.total : null;
  const completed = typeof progress?.completed === 'number' ? progress.completed : null;
  const failed = typeof progress?.failed === 'number' ? progress.failed : null;
  const currentStep = progress?.current_step ? String(progress.current_step) : '';
  const taskError = (task as any)?.error_message || (task as any)?.error;
  const isProcessing = taskStatus === 'PROCESSING';
  const overallPercent = total !== null && completed !== null ? Math.max(0, Math.min(100, Math.round((completed / Math.max(total, 1)) * 100))) : null;

  const handleRetry = async () => {
    setIsLoading(true);
    try {
      await loadProjectWithToast();
    } catch {
      // keep showing inline error
    } finally {
      setIsLoading(false);
    }
    if (taskId) {
      pollFailuresRef.current = 0;
      pollTask(taskId, (t) => setTask(t));
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">风格预览确认</div>
          <div className="text-xs text-gray-600 dark:text-foreground-tertiary">
            任务：{taskStatus || '-'}
            {total !== null && completed !== null ? ` | 进度：${completed}/${total}` : ''}
            {failed ? ` | 失败：${failed}` : ''}
            {currentStep ? ` | 阶段：${currentStep}` : ''}
          </div>
          <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">
            {applyMode === 'apply_only'
              ? '说明：「选用并应用」会把该组 style_json 写入项目，不会跳转页面。'
              : '说明：「选用并继续」会把该组 style_json 写入项目，并进入下一步生成流程。'}
          </div>
        </div>
        <div className="flex gap-2">
          {(projectLoadError || taskPollError) ? (
            <Button size="sm" variant="ghost" onClick={handleRetry}>重试</Button>
          ) : null}
          {onBackToProject ? (
            <Button size="sm" variant="ghost" onClick={onBackToProject}>{backButtonText}</Button>
          ) : null}
        </div>
      </div>

      {isProcessing ? (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-banana-500 border-t-transparent animate-spin" />
            <div className="text-sm font-medium text-gray-900 dark:text-white">正在生成中…</div>
            {overallPercent !== null ? (
              <div className="text-xs text-gray-600 dark:text-foreground-tertiary">{overallPercent}%</div>
            ) : null}
          </div>
          {overallPercent !== null ? (
            <div className="mt-3 h-2 w-full bg-gray-100 dark:bg-background-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-banana-500 to-banana-600 transition-all duration-300"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          ) : null}
          <div className="mt-2 text-xs text-gray-600 dark:text-foreground-tertiary">
            {currentStep ? `当前阶段：${currentStep}` : '任务已启动，请稍候…'}
          </div>
        </Card>
      ) : null}

      {(projectLoadError || taskPollError) ? (
        <Card className="p-4 text-xs border border-red-200 bg-red-50 dark:bg-background-tertiary dark:border-border-primary">
          <div className="font-semibold text-red-700 mb-1">网络异常</div>
          {projectLoadError ? (
            <div className="text-red-600 whitespace-pre-wrap break-words">加载项目失败：{projectLoadError}</div>
          ) : null}
          {taskPollError ? (
            <div className="text-red-600 whitespace-pre-wrap break-words mt-1">任务轮询失败：{taskPollError}</div>
          ) : null}
          <div className="mt-2 text-gray-700 dark:text-foreground-secondary whitespace-pre-wrap break-words">
            快速自检：打开
            {' '}
            <span className="font-mono">/api/projects/{projectId}</span>
            {' '}
            和
            {' '}
            <span className="font-mono">/api/projects/{projectId}/tasks/{taskId}</span>
            {' '}
            看是否能返回 JSON。
          </div>
          <div className="text-gray-600 dark:text-foreground-tertiary mt-2">
            请确认前端通过 `npm run dev` 运行（`http://localhost:3000`），且后端健康检查可访问（`http://localhost:5001/health`）。
          </div>
        </Card>
      ) : null}

      {pollPaused ? (
        <Card className="p-4 text-xs border border-amber-200 bg-amber-50 dark:bg-background-tertiary dark:border-border-primary">
          <div className="font-semibold text-amber-800 mb-1">已暂停自动轮询</div>
          <div className="text-amber-700">检测到连续网络失败（≥3 次），已暂停以避免页面抖动。点击右上角“重试”继续。</div>
        </Card>
      ) : null}

      {mode === 'recommendations_only' && taskStatus === 'COMPLETED' ? (
        <Card className="p-4 text-xs text-gray-700 dark:text-foreground-secondary border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary">
          已完成：仅推荐 `style_json`（未生成预览图）。你可以先编辑/保存 JSON，然后对某一组点击「生成本组预览」生成 4 张示例图确认效果。
        </Card>
      ) : null}

      {showTemplateControls ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">保存风格模板骨架</div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="模板名称（可选）"
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
              />
              <Button size="sm" className="whitespace-nowrap" onClick={handleSaveTemplate}>保存模板</Button>
              <Button size="sm" className="whitespace-nowrap" loading={isRestarting} onClick={handleRestartRecommendations}>重新生成推荐</Button>
            </div>
          </div>
          <Textarea
            value={templateJsonText}
            onChange={(e) => setTemplateJsonText(e.target.value)}
            rows={6}
            className="text-xs font-mono border-2 border-gray-200 dark:border-border-primary dark:bg-background-tertiary dark:text-white"
          />
        </Card>
      ) : null}

      {isLoading ? <Loading /> : null}

      {taskStatus === 'FAILED' && taskError ? (
        <Card className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 dark:bg-background-tertiary dark:border-border-primary">
          <div className="font-semibold mb-1">任务失败</div>
          <div className="whitespace-pre-wrap break-words text-xs">{String(taskError)}</div>
        </Card>
      ) : null}

      {recommendations.length === 0 && !isLoading ? (
        <Card className="p-6 text-sm text-gray-600 dark:text-foreground-tertiary">
          暂无推荐结果。请等待任务生成完成。
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {recommendations.map((rec) => {
          const preview = getPreviewImages(rec);
          const hasPreview = Boolean(preview?.cover_url || preview?.toc_url || preview?.detail_url || preview?.ending_url);
          const isGeneratingThisRec = Boolean(regenLoadingByRecId[rec.id]);
          const generatedCount = Number(Boolean(preview?.cover_url)) + Number(Boolean(preview?.toc_url)) + Number(Boolean(preview?.detail_url)) + Number(Boolean(preview?.ending_url));
          const regenProg = regenProgressByRecId[rec.id];
          const recProgressText = isGeneratingThisRec
            ? `本组预览生成中：${typeof regenProg?.completed === 'number' ? regenProg.completed : generatedCount}/4${regenProg?.failed ? `，失败 ${regenProg.failed}` : ''}`
            : hasPreview
              ? `已生成预览：${generatedCount}/4`
              : '';
          return (
            <Card key={rec.id} className="p-4 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 lg:pr-4">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{rec.name}</h3>
                  {rec.rationale ? (
                    <p className="text-xs text-gray-600 dark:text-foreground-tertiary mt-1">{rec.rationale}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap lg:flex-nowrap gap-2 justify-start lg:justify-end lg:shrink-0">
                  <Button size="sm" variant="secondary" className="whitespace-nowrap" loading={!!regenLoadingByRecId[rec.id]} onClick={() => handleRegenerate(rec)}>
                    {regenLoadingByRecId[rec.id]
                      ? (hasPreview ? '重跑中…' : '生成中…')
                      : (hasPreview ? '重跑本组预览' : '生成本组预览')}
                  </Button>
                  <Button size="sm" className="whitespace-nowrap" variant="secondary" onClick={() => handleSavePreset(rec)}>保存为预设</Button>
                  <Button size="sm" className="whitespace-nowrap" variant="primary" loading={applyLoadingRecId === rec.id} onClick={() => handleApplyAndContinue(rec)}>
                    {applyMode === 'apply_only' ? '选用并应用' : '选用并继续'}
                  </Button>
                </div>
              </div>

              {recProgressText ? (
                <div className="text-xs text-gray-600 dark:text-foreground-tertiary flex items-center gap-2">
                  {isGeneratingThisRec ? <span className="h-3 w-3 rounded-full border-2 border-banana-500 border-t-transparent animate-spin" /> : null}
                  <span>{recProgressText}</span>
                </div>
              ) : null}

              {hasPreview || isGeneratingThisRec ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    ['封面', 'cover_url'],
                    ['目录', 'toc_url'],
                    ['详情', 'detail_url'],
                    ['结尾', 'ending_url'],
                  ] as const).map(([label, key]) => (
                    <div key={key} className="space-y-1">
                      <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{label}</div>
                      <div className="w-full aspect-video bg-gray-100 dark:bg-background-tertiary rounded-lg overflow-hidden border border-gray-200 dark:border-border-primary">
                        {preview?.[key] ? (
                          <button
                            type="button"
                            className="w-full h-full block"
                            onClick={() => setPreviewModal({ title: `${rec.name}-${label}`, url: preview[key] })}
                          >
                            <img src={preview[key]} alt={`${rec.name}-${label}`} className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center gap-2 text-xs text-gray-400">
                            {isGeneratingThisRec ? (
                              <>
                                <span className="h-3 w-3 rounded-full border-2 border-banana-500 border-t-transparent animate-spin" />
                                <span>生成中…</span>
                              </>
                            ) : (
                              <span>未生成</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-600 dark:text-foreground-tertiary">
                  尚未生成预览图。可点击「生成本组预览」生成 4 张示例图（封面/目录/详情/结尾）。
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-700 dark:text-foreground-secondary">
                  style_json（可编辑）
                </div>
                <Textarea
                  value={editedJsonByRecId[rec.id] || ''}
                  onChange={(e) => setEditedJsonByRecId((prev) => ({ ...prev, [rec.id]: e.target.value }))}
                  rows={10}
                  className="text-xs font-mono border-2 border-gray-200 dark:border-border-primary dark:bg-background-tertiary dark:text-white"
                />
              </div>
            </Card>
          );
        })}
      </div>

      <ToastContainer />

      <ImageLightbox
        isOpen={Boolean(previewModal)}
        src={previewModal?.url || ''}
        title={previewModal?.title || '预览'}
        onClose={() => setPreviewModal(null)}
      />
    </div>
  );
};
