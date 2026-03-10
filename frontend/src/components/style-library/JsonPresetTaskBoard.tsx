import React from 'react';
import { AlertCircle, Loader2, RefreshCw, X } from 'lucide-react';
import { Button, Card } from '@/components/shared';
import type { StylePresetTaskRecord } from './types';
import { getTaskDisplayName, getTaskPreviewKey, getTaskStage, isTaskRunning } from './types';

interface JsonPresetTaskBoardProps {
  tasks: StylePresetTaskRecord[];
  onRetryTask: (task: StylePresetTaskRecord) => void;
  onDismissTask: (taskId: string) => void;
}

function getTaskSummary(task: StylePresetTaskRecord): string {
  const stage = getTaskStage(task);
  const progress = (task.progress || {}) as NonNullable<StylePresetTaskRecord['progress']>;
  const completed = typeof progress.completed === 'number' ? progress.completed : 0;
  const total = typeof progress.total === 'number' ? progress.total : 0;
  const failed = typeof progress.failed === 'number' ? progress.failed : 0;

  if (stage === 'json_generating') return '阶段 1/2：正在填充 JSON';
  if (stage === 'preview_generating') return `阶段 2/2：正在生成预览图 ${Math.max(0, completed - 1)}/4${failed ? `，失败 ${failed}` : ''}`;
  if (stage === 'single_preview_generating') {
    const previewKey = getTaskPreviewKey(task);
    const label = previewKey === 'cover_url' ? '首页' : previewKey === 'toc_url' ? '目录' : previewKey === 'detail_url' ? '详情' : '结尾';
    return `正在补生成 ${label} 预览图 ${completed}/${Math.max(1, total)}`;
  }
  if (task.status === 'FAILED') return task.error_message || '生成失败';
  return `${completed}/${total}`;
}

export const JsonPresetTaskBoard: React.FC<JsonPresetTaskBoardProps> = ({ tasks, onRetryTask, onDismissTask }) => {
  if (!tasks.length) return null;

  return (
    <Card className="p-4 md:p-5 space-y-3" data-testid="style-library-preset-task-board">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">生成任务</h3>
          <p className="text-xs text-gray-600 dark:text-foreground-tertiary">展示进行中与最近失败的 JSON 文本模版任务</p>
        </div>
        <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{tasks.filter(isTaskRunning).length} 个进行中</div>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => {
          const running = isTaskRunning(task);
          const failed = task.status === 'FAILED';
          return (
            <div
              key={task.task_id}
              data-testid={`style-preset-task-${task.task_id}`}
              className={`rounded-xl border p-3 md:p-4 ${
                failed
                  ? 'border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/20'
                  : 'border-gray-200 bg-white dark:border-border-primary dark:bg-background-secondary'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {running ? <Loader2 size={16} className="animate-spin text-banana-600" /> : failed ? <AlertCircle size={16} className="text-red-500" /> : null}
                    <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{getTaskDisplayName(task)}</div>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-foreground-tertiary mt-1">{getTaskSummary(task)}</div>
                  {failed && task.error_message ? (
                    <div className="text-xs text-red-600 dark:text-red-300 mt-2 break-words">{task.error_message}</div>
                  ) : null}
                </div>
                {failed ? (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => onRetryTask(task)}>
                      重试
                    </Button>
                    <button
                      type="button"
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-border-primary text-gray-500 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
                      onClick={() => onDismissTask(task.task_id)}
                      aria-label="关闭任务卡"
                      data-testid={`style-preset-task-${task.task_id}-dismiss`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
