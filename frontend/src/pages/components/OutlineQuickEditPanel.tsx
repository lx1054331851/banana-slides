import React from 'react';
import { Button, Markdown, MarkdownTextarea } from '@/components/shared';
import type { MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';

export type OutlineQuickEditMode = 'edit' | 'preview';

type OutlineQuickEditPanelProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  editOutlineTitle: string;
  editOutlinePoints: string;
  outlineQuickEditMode: OutlineQuickEditMode;
  isOutlineQuickGeneratingDescription: boolean;
  outlineQuickPointsTextareaRef: React.RefObject<MarkdownTextareaRef>;
  onEditOutlineTitleChange: (value: string) => void;
  onEditOutlineModeChange: (mode: OutlineQuickEditMode) => void;
  onEditOutlinePointsChange: (value: string) => void;
  onOutlineQuickPointsPaste: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  onOpenGeneratePrompt: () => void;
  onSaveOutline: () => void;
  showCancelButton?: boolean;
  onCancel?: () => void;
};

// 复用大纲编辑主体，既支持右侧内嵌面板，也支持旧弹窗容器。
export const OutlineQuickEditPanel: React.FC<OutlineQuickEditPanelProps> = ({
  t,
  editOutlineTitle,
  editOutlinePoints,
  outlineQuickEditMode,
  isOutlineQuickGeneratingDescription,
  outlineQuickPointsTextareaRef,
  onEditOutlineTitleChange,
  onEditOutlineModeChange,
  onEditOutlinePointsChange,
  onOutlineQuickPointsPaste,
  onOpenGeneratePrompt,
  onSaveOutline,
  showCancelButton = false,
  onCancel,
}) => (
  <div className="flex h-full min-h-0 flex-col">
    <div className="shrink-0 space-y-2">
      <div className="text-xs font-medium text-gray-500 dark:text-foreground-tertiary">{t('preview.enterTitle')}</div>
      <input
        type="text"
        value={editOutlineTitle}
        onChange={(event) => onEditOutlineTitleChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-gray-200 px-4 text-base outline-none focus:border-banana-400 focus:ring-2 focus:ring-banana-200 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-primary"
        placeholder={t('preview.enterTitle')}
      />
    </div>

    <div className="mt-4 flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-gray-500 dark:text-foreground-tertiary">{t('preview.pointsPerLine')}</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-400 dark:text-foreground-tertiary">{t('preview.quickEditMarkdownHint')}</div>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 dark:border-border-primary dark:bg-background-secondary">
            <button
              type="button"
              onClick={() => onEditOutlineModeChange('edit')}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                outlineQuickEditMode === 'edit'
                  ? 'bg-banana-100 text-banana-900 dark:bg-banana-500/20 dark:text-banana'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:bg-background-hover'
              }`}
            >
              {t('preview.quickEditModeEdit')}
            </button>
            <button
              type="button"
              onClick={() => onEditOutlineModeChange('preview')}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                outlineQuickEditMode === 'preview'
                  ? 'bg-banana-100 text-banana-900 dark:bg-banana-500/20 dark:text-banana'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:bg-background-hover'
              }`}
            >
              {t('preview.quickEditModePreview')}
            </button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {outlineQuickEditMode === 'edit' ? (
          <MarkdownTextarea
            ref={outlineQuickPointsTextareaRef}
            value={editOutlinePoints}
            onChange={onEditOutlinePointsChange}
            onPaste={onOutlineQuickPointsPaste}
            placeholder={t('preview.enterPointsPerLine')}
            className="min-h-[300px] rounded-xl"
            fillHeight
            showUploadButton={false}
            showImagePreview={false}
            resizable={false}
          />
        ) : (
          <div className="h-full min-h-[300px] overflow-auto rounded-xl border border-gray-200 bg-white p-4 dark:border-border-primary dark:bg-background-secondary">
            <Markdown>{editOutlinePoints || ' '}</Markdown>
          </div>
        )}
      </div>
    </div>

    <div className="mt-4 flex shrink-0 justify-end gap-2 pt-4 dark:border-border-primary">
      {showCancelButton && onCancel ? (
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      ) : null}
      <Button
        variant="secondary"
        onClick={onOpenGeneratePrompt}
        disabled={isOutlineQuickGeneratingDescription}
      >
        {isOutlineQuickGeneratingDescription ? t('preview.descriptionGenerating') : t('preview.outlineQuickEditGenerateDescription')}
      </Button>
      <Button variant="primary" onClick={onSaveOutline}>
        {t('preview.outlineQuickEditSave')}
      </Button>
    </div>
  </div>
);
