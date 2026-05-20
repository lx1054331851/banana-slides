import React from 'react';
import { Button, Modal } from '@/components/shared';
import type { MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { OutlineQuickEditPanel, type OutlineQuickEditMode } from './OutlineQuickEditPanel';

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
        <OutlineQuickEditPanel
          t={t}
          editOutlineTitle={editOutlineTitle}
          editOutlinePoints={editOutlinePoints}
          outlineQuickEditMode={outlineQuickEditMode}
          isOutlineQuickGeneratingDescription={isOutlineQuickGeneratingDescription}
          outlineQuickPointsTextareaRef={outlineQuickPointsTextareaRef}
          onEditOutlineTitleChange={onEditOutlineTitleChange}
          onEditOutlineModeChange={onEditOutlineModeChange}
          onEditOutlinePointsChange={onEditOutlinePointsChange}
          onOutlineQuickPointsPaste={onOutlineQuickPointsPaste}
          onOpenGeneratePrompt={onOpenGeneratePrompt}
          onSaveOutline={onSaveOutline}
          showCancelButton
          onCancel={onCloseOutlineQuickEdit}
        />
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
