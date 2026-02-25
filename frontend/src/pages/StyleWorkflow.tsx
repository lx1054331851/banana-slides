import React, { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, StyleWorkflowPanel } from '@/components/shared';

export const StyleWorkflow: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const taskId = query.get('taskId') || '';

  const templateJsonText = useMemo(() => {
    const state: any = location.state;
    return (state?.templateJson || '').toString();
  }, [location.state]);

  if (!projectId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50/30 to-pink-50/50 dark:from-background-primary dark:via-background-primary dark:to-background-primary">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="text-sm text-gray-600 dark:text-foreground-tertiary">缺少项目ID</div>
          <div className="mt-4">
            <Button variant="ghost" onClick={() => navigate('/')}>返回主页</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50/30 to-pink-50/50 dark:from-background-primary dark:via-background-primary dark:to-background-primary">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">风格预览确认</h1>
            <p className="text-xs md:text-sm text-gray-600 dark:text-foreground-tertiary">
              项目：{projectId}{taskId ? ` | 任务：${taskId}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate(`/project/${projectId}/outline`)}>{'返回项目'}</Button>
          </div>
        </div>

        {taskId ? (
          <StyleWorkflowPanel
            projectId={projectId}
            taskId={taskId}
            templateJson={templateJsonText}
            showTemplateControls
            onBackToProject={() => navigate(`/project/${projectId}/outline`)}
          />
        ) : (
          <div className="text-sm text-gray-600 dark:text-foreground-tertiary">缺少 taskId 参数</div>
        )}
      </div>
    </div>
  );
};
