import React from 'react';
import { FilePreviewModal, GlobalAiAssistantDrawer } from '@/components/shared';
import { OutlineQuickEditModals } from './OutlineQuickEditModals';
import type { OutlineQuickEditMode } from './OutlineQuickEditPanel';

type SlidePreviewTopOverlaysProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  toastContainer: React.ReactNode;
  confirmDialog: React.ReactNode;
  isGlobalAiDrawerOpen: boolean;
  onCloseGlobalAiDrawer: () => void;
  onSubmitGlobalAi: (prompt: string) => Promise<void>;
  previewFileId: string | null;
  onClosePreviewFile: () => void;
  isOutlineQuickEditOpen: boolean;
  isOutlineQuickGeneratePromptOpen: boolean;
  isOutlineQuickGeneratingDescription: boolean;
  outlineQuickEditTitle: string;
  editOutlineTitle: string;
  editOutlinePoints: string;
  outlineQuickEditMode: OutlineQuickEditMode;
  outlineQuickGeneratePrompt: string;
  outlineQuickPointsTextareaRef: React.RefObject<any>;
  onCloseOutlineQuickEdit: () => void;
  onEditOutlineTitleChange: (value: string) => void;
  onEditOutlineModeChange: (value: OutlineQuickEditMode) => void;
  onEditOutlinePointsChange: (value: string) => void;
  onOutlineQuickPointsPaste: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  onOpenGeneratePrompt: () => void;
  onSaveOutline: () => void;
  onCloseGeneratePrompt: () => void;
  onOutlineQuickGeneratePromptChange: (value: string) => void;
  onConfirmGeneratePrompt: () => void;
};

export const SlidePreviewTopOverlays: React.FC<SlidePreviewTopOverlaysProps> = ({
  t,
  toastContainer,
  confirmDialog,
  isGlobalAiDrawerOpen,
  onCloseGlobalAiDrawer,
  onSubmitGlobalAi,
  previewFileId,
  onClosePreviewFile,
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
}) => {
  return (
    <>
      {toastContainer}
      {confirmDialog}
      <GlobalAiAssistantDrawer
        isOpen={isGlobalAiDrawerOpen}
        onClose={onCloseGlobalAiDrawer}
        title={t('preview.globalAiTitle')}
        subtitle={t('preview.globalAiSubtitle')}
        welcomeTitle={t('preview.globalAiWelcomeTitle')}
        welcomeDescription={t('preview.globalAiWelcomeDescription')}
        suggestions={[
          t('preview.globalAiSuggestionTone'),
          t('preview.globalAiSuggestionTrim'),
          t('preview.globalAiSuggestionFlow'),
        ]}
        placeholder={t('preview.globalAiPlaceholder')}
        loadingLabel={t('preview.globalAiLoading')}
        responseFallback={t('preview.globalAiResponseFallback')}
        errorFallback={t('preview.globalAiErrorFallback')}
        submitTooltip={t('preview.globalAiSubmitTooltip')}
        inputHint={t('preview.globalAiInputHint')}
        onSubmit={onSubmitGlobalAi}
      />
      <FilePreviewModal fileId={previewFileId} onClose={onClosePreviewFile} />

      <OutlineQuickEditModals
        t={t}
        isOutlineQuickEditOpen={isOutlineQuickEditOpen}
        isOutlineQuickGeneratePromptOpen={isOutlineQuickGeneratePromptOpen}
        isOutlineQuickGeneratingDescription={isOutlineQuickGeneratingDescription}
        outlineQuickEditTitle={outlineQuickEditTitle}
        editOutlineTitle={editOutlineTitle}
        editOutlinePoints={editOutlinePoints}
        outlineQuickEditMode={outlineQuickEditMode}
        outlineQuickGeneratePrompt={outlineQuickGeneratePrompt}
        outlineQuickPointsTextareaRef={outlineQuickPointsTextareaRef}
        onCloseOutlineQuickEdit={onCloseOutlineQuickEdit}
        onEditOutlineTitleChange={onEditOutlineTitleChange}
        onEditOutlineModeChange={onEditOutlineModeChange}
        onEditOutlinePointsChange={onEditOutlinePointsChange}
        onOutlineQuickPointsPaste={onOutlineQuickPointsPaste}
        onOpenGeneratePrompt={onOpenGeneratePrompt}
        onSaveOutline={onSaveOutline}
        onCloseGeneratePrompt={onCloseGeneratePrompt}
        onOutlineQuickGeneratePromptChange={onOutlineQuickGeneratePromptChange}
        onConfirmGeneratePrompt={onConfirmGeneratePrompt}
      />
    </>
  );
};
