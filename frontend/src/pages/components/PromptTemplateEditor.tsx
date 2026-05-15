import React from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { Button, Card } from '@/components/shared';
import type { PromptTemplate } from '@/types';
import { cn } from '@/utils';

interface PromptTemplateEditorProps {
  template: PromptTemplate | null;
  customContent: string;
  enabled: boolean;
  isSaving: boolean;
  onCustomContentChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
  onSave: () => void;
  onReset: () => void;
  className?: string;
}

// Provides default/custom prompt editing controls for the selected template.
export const PromptTemplateEditor: React.FC<PromptTemplateEditorProps> = ({
  template,
  customContent,
  enabled,
  isSaving,
  onCustomContentChange,
  onEnabledChange,
  onSave,
  onReset,
  className,
}) => {
  if (!template) {
    return (
      <Card className={cn('min-h-0 overflow-y-auto p-6', className)}>
        <p className="text-sm text-gray-500 dark:text-foreground-tertiary">请选择一个提示词模板</p>
      </Card>
    );
  }

  return (
    <Card className={cn('flex min-h-0 flex-col gap-5 overflow-hidden p-5 md:p-6', className)} data-testid="prompt-template-editor">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary">{template.title}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{template.description}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-foreground-tertiary">
            Key: <span className="font-mono">{template.key}</span>
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-foreground-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 accent-banana-500"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            aria-label="启用自定义提示词"
          />
          启用自定义提示词
        </label>
      </div>

      <div className="grid min-h-[360px] flex-1 gap-4 lg:min-h-0 lg:grid-cols-2">
        <label className="flex min-h-0 flex-col">
          <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-foreground-secondary">默认提示词</span>
          <textarea
            aria-label="默认提示词"
            value={template.default_content}
            readOnly
            className="min-h-[240px] flex-1 resize-none rounded-lg border border-gray-200 dark:border-border-primary bg-gray-50 dark:bg-background-primary p-3 font-mono text-sm text-gray-700 dark:text-foreground-secondary focus:outline-none"
          />
        </label>
        <label className="flex min-h-0 flex-col">
          <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-foreground-secondary">自定义提示词</span>
          <textarea
            aria-label="自定义提示词"
            value={customContent}
            onChange={(event) => onCustomContentChange(event.target.value)}
            placeholder="填写完整提示词；启用后将覆盖默认提示词。"
            className="min-h-[240px] flex-1 resize-none rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary p-3 font-mono text-sm text-gray-900 dark:text-foreground-primary focus:border-banana-500 focus:outline-none focus:ring-2 focus:ring-banana-500"
          />
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={onReset}>
          恢复默认
        </Button>
        <Button icon={<Save size={16} />} onClick={onSave} loading={isSaving}>
          保存
        </Button>
      </div>
    </Card>
  );
};
