import React, { useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, Save } from 'lucide-react';
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

type ExpandedEditor = 'default' | 'custom' | null;

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
  const [expandedEditor, setExpandedEditor] = useState<ExpandedEditor>(null);

  // Toggles one prompt editor between split view and expanded view.
  const toggleExpandedEditor = (editor: Exclude<ExpandedEditor, null>) => {
    setExpandedEditor((current) => (current === editor ? null : editor));
  };

  // Renders one prompt editor pane for the split view or fullscreen focus view.
  const renderPromptPane = (editor: Exclude<ExpandedEditor, null>, fullscreen = false) => {
    const isDefault = editor === 'default';
    const label = isDefault ? '默认提示词' : '自定义提示词';

    return (
      <div className={cn('min-h-0 flex-col', fullscreen ? 'flex flex-1' : 'flex')}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary">{label}</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-banana-500 dark:text-foreground-tertiary dark:hover:bg-background-primary dark:hover:text-foreground-primary"
            onClick={() => toggleExpandedEditor(editor)}
            aria-label={fullscreen ? `收起${label}编辑区` : `全屏${label}编辑区`}
            title={fullscreen ? '退出全屏' : '全屏编辑'}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
        <textarea
          aria-label={fullscreen ? `全屏${label}` : label}
          value={isDefault ? template.default_content : customContent}
          readOnly={isDefault}
          onChange={isDefault ? undefined : (event) => onCustomContentChange(event.target.value)}
          placeholder={isDefault ? undefined : '填写完整提示词；启用后将覆盖默认提示词。'}
          className={cn(
            'min-h-[240px] flex-1 resize-none rounded-lg border border-gray-200 p-3 font-mono text-sm focus:outline-none dark:border-border-primary',
            fullscreen && 'min-h-0 text-[15px] leading-7',
            isDefault
              ? 'bg-gray-50 text-gray-700 dark:bg-background-primary dark:text-foreground-secondary'
              : 'bg-white text-gray-900 focus:border-banana-500 focus:ring-2 focus:ring-banana-500 dark:bg-background-secondary dark:text-foreground-primary',
          )}
        />
      </div>
    );
  };

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
        {renderPromptPane('default')}
        {renderPromptPane('custom')}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={onReset}>
          恢复默认
        </Button>
        <Button icon={<Save size={16} />} onClick={onSave} loading={isSaving}>
          保存
        </Button>
      </div>

      {expandedEditor && (
        <div className="fixed inset-0 z-50 flex bg-gray-50 p-3 dark:bg-background-primary md:p-6" data-testid="prompt-editor-fullscreen">
          <div className="flex min-h-0 w-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-border-primary dark:bg-background-secondary md:p-5">
            <div className="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-border-primary md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary">{template.title}</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">
                  Key: <span className="font-mono">{template.key}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {expandedEditor === 'custom' && (
                  <label className="mr-1 inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-foreground-secondary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-banana-500"
                      checked={enabled}
                      onChange={(event) => onEnabledChange(event.target.checked)}
                      aria-label="全屏启用自定义提示词"
                    />
                    启用
                  </label>
                )}
                <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={onReset}>
                  恢复默认
                </Button>
                <Button icon={<Save size={16} />} onClick={onSave} loading={isSaving}>
                  保存
                </Button>
              </div>
            </div>
            {renderPromptPane(expandedEditor, true)}
          </div>
        </div>
      )}
    </Card>
  );
};
