import React from 'react';
import { Button, Markdown, MarkdownTextarea, Modal } from '@/components/shared';
import type { MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';

type OutlineQuickEditMode = 'edit' | 'preview';

type OutlineQuickEditModalsProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  isOutlineQuickEditOpen: boolean;
  isOutlineQuickGeneratePromptOpen: boolean;
  isOutlineQuickGeneratingDescription: boolean;
  outlineQuickEditTitle: string;
  editOutlineTitle: string;
  editOutlinePoints: string;
  outlineQuickEditMode: OutlineQuickEditMode;
  outlineQuickGeneratePrompt: string;
  outlineQuickPointsTextareaRef: React.RefObject<MarkdownTextareaRef>;
  onCloseOutlineQuickEdit: () => void;
  onEditOutlineTitleChange: (value: string) => void;
  onEditOutlineModeChange: (mode: OutlineQuickEditMode) => void;
  onEditOutlinePointsChange: (value: string) => void;
  onOutlineQuickPointsPaste: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  onOpenGeneratePrompt: () => void;
  onSaveOutline: () => void;
  onCloseGeneratePrompt: () => void;
  onOutlineQuickGeneratePromptChange: (value: string) => void;
  onConfirmGeneratePrompt: () => void;
};

export const OutlineQuickEditModals: React.FC<OutlineQuickEditModalsProps> = ({
  t,
  isOutlineQuickEditOpen,
  isOutlineQuickGeneratePromptOpen,
  isOutlineQuickGeneratingDescription,
  outlineQuickEditTitle,
  editOutlineTitle,
  editOutlinePoints,
  outlineQuickEditMode,
  outlineQuickGeneratePrompt,
  outlineQuickPointsTextareaRef,
  onCloseOutlineQuickEdit,
  onEditOutlineTitleChange,
  onEditOutlineModeChange,
  onEditOutlinePointsChange,
  onOutlineQuickPointsPaste,
  onOpenGeneratePrompt,
  onSaveOutline,
  onCloseGeneratePrompt,
  onOutlineQuickGeneratePromptChange,
  onConfirmGeneratePrompt,
}) => (
  <>
    <Modal
      isOpen={isOutlineQuickEditOpen}
      onClose={onCloseOutlineQuickEdit}
      title={outlineQuickEditTitle}
      size="wide75"
      closeOnOverlayClick={false}
    >
      <div className="mx-auto flex h-[min(72vh,780px)] max-h-[78vh] w-full max-w-[980px] flex-col">
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
          <Button
            variant="ghost"
            onClick={onCloseOutlineQuickEdit}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="secondary"
            onClick={onOpenGeneratePrompt}
            disabled={isOutlineQuickGeneratingDescription}
          >
            {isOutlineQuickGeneratingDescription ? t('preview.descriptionGenerating') : t('preview.outlineQuickEditGenerateDescription')}
          </Button>
          <Button
            variant="primary"
            onClick={onSaveOutline}
          >
            {t('preview.outlineQuickEditSave')}
          </Button>
        </div>
      </div>
    </Modal>

    <Modal
      isOpen={isOutlineQuickGeneratePromptOpen}
      onClose={onCloseGeneratePrompt}
      title={t('preview.outlineQuickGeneratePromptTitle')}
      size="md"
      closeOnOverlayClick={!isOutlineQuickGeneratingDescription}
    >
      <div className="space-y-4">
        <textarea
          value={outlineQuickGeneratePrompt}
          onChange={(event) => onOutlineQuickGeneratePromptChange(event.target.value)}
          placeholder={t('preview.outlineQuickGeneratePromptPlaceholder')}
          className="h-36 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-banana-400 focus:ring-2 focus:ring-banana-200 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-primary"
        />
        <div className="text-xs text-gray-500 dark:text-foreground-tertiary">
          {t('preview.outlineQuickGeneratePromptHint')}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={onCloseGeneratePrompt}
            disabled={isOutlineQuickGeneratingDescription}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirmGeneratePrompt}
            disabled={isOutlineQuickGeneratingDescription}
          >
            {isOutlineQuickGeneratingDescription ? t('preview.descriptionGenerating') : t('preview.outlineQuickGeneratePromptConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  </>
);
