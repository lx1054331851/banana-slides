import React from 'react';
import { History } from 'lucide-react';
import { Button, PageAiWorkbench } from '@/components/shared';
import {
  PREVIEW_SPLIT_DIVIDER_PX,
  PREVIEW_SPLIT_HIT_AREA_PX,
  PREVIEW_EDITOR_VERTICAL_SPLIT_DIVIDER_PX,
  PREVIEW_EDITOR_CANVAS_MIN_HEIGHT,
  PREVIEW_EDITOR_WORKBENCH_MIN_HEIGHT,
} from '../SlidePreview.constants';
import type { PageAiMessage, PageAiReference } from '@/types';

type SlidePreviewEditorPaneProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  isEditorPaneHidden: boolean;
  isMobileView: boolean;
  useRenovationPreviewForm: boolean;
  shouldUseEditorVerticalSplit: boolean;
  editorVerticalSplitContainerRef: React.RefObject<HTMLDivElement>;
  resolvedEditorVerticalSplitRatio: number;
  isResizingEditorVerticalSplit: boolean;
  editorCanvasContent: React.ReactNode;
  externalFieldTags: React.ReactNode;
  pageAiMessages: PageAiMessage[];
  selectedPageAiReferences: PageAiReference[];
  activePreviewReferenceId: string | null;
  editPrompt: string;
  pageAiTextareaRef: React.RefObject<any>;
  pageAiSlashActions: any[];
  editRunImageModel: string;
  editRunImageModelOptions: readonly (string | { value: string; label: string })[];
  isPageAiSubmitting: boolean;
  isRegionSelectionMode: boolean;
  pendingRegionCommentValue: string;
  pendingRegionPreviewUrl: string | null;
  pendingRegionEscStep: number;
  historyVersionsCount: number;
  onEditorVerticalSplitResizeStart: (event: React.MouseEvent<HTMLElement>) => void;
  onLinkedSplitResizeStart: (event: React.MouseEvent<HTMLElement>) => void;
  onOpenHistory: () => void;
  onEditPromptChange: (value: string) => void;
  onEditRunImageModelChange: (value: string) => void;
  onPageAiSend: () => void;
  onToggleRegionSelect: () => void;
  onPendingRegionCommentChange: (value: string) => void;
  onSubmitPendingRegionComment: () => void;
  onCancelPendingRegionComment: () => void;
  onPendingRegionEsc: () => void;
  onToggleTemplate: () => void;
  onToggleDescriptionImage: (...args: any[]) => void;
  onReferenceClick: (reference: PageAiReference) => void;
  onRemoveReference: (...args: any[]) => void;
  onOpenMaterialSelector?: () => void;
  onUploadFiles: (...args: any[]) => void;
  onPageAiPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
};

export const SlidePreviewEditorPane: React.FC<SlidePreviewEditorPaneProps> = ({
  t,
  isEditorPaneHidden,
  isMobileView,
  useRenovationPreviewForm,
  shouldUseEditorVerticalSplit,
  editorVerticalSplitContainerRef,
  resolvedEditorVerticalSplitRatio,
  isResizingEditorVerticalSplit,
  editorCanvasContent,
  externalFieldTags,
  pageAiMessages,
  selectedPageAiReferences,
  activePreviewReferenceId,
  editPrompt,
  pageAiTextareaRef,
  pageAiSlashActions,
  editRunImageModel,
  editRunImageModelOptions,
  isPageAiSubmitting,
  isRegionSelectionMode,
  pendingRegionCommentValue,
  pendingRegionPreviewUrl,
  pendingRegionEscStep,
  historyVersionsCount,
  onEditorVerticalSplitResizeStart,
  onLinkedSplitResizeStart,
  onOpenHistory,
  onEditPromptChange,
  onEditRunImageModelChange,
  onPageAiSend,
  onToggleRegionSelect,
  onPendingRegionCommentChange,
  onSubmitPendingRegionComment,
  onCancelPendingRegionComment,
  onPendingRegionEsc,
  onToggleTemplate,
  onToggleDescriptionImage,
  onReferenceClick,
  onRemoveReference,
  onOpenMaterialSelector,
  onUploadFiles,
  onPageAiPaste,
}) => {
  // Keep renovation-mode floating menus visible on desktop instead of clipping them inside the editor pane.
  return (
    <section
      data-testid="preview-editor-pane"
      className={`min-h-0 min-w-0 ${isEditorPaneHidden ? 'pointer-events-none opacity-0' : ''} ${isMobileView ? 'overflow-visible' : (useRenovationPreviewForm ? 'overflow-visible' : 'overflow-x-visible overflow-y-auto overscroll-contain')}`}
      aria-hidden={isEditorPaneHidden}
    >
      <div
        ref={shouldUseEditorVerticalSplit ? editorVerticalSplitContainerRef : undefined}
        className={`${shouldUseEditorVerticalSplit ? 'grid h-full min-h-0 overflow-x-visible overflow-y-visible pt-1 pb-0 md:pt-1 md:pb-0' : `flex h-full min-h-0 flex-col ${useRenovationPreviewForm ? 'px-2 pt-1 pb-0 md:px-3 md:pt-1 md:pb-0' : 'px-3 pt-3 pb-0 md:px-4 md:pt-4 md:pb-0'}`}`}
        style={shouldUseEditorVerticalSplit
          ? {
            gridTemplateRows: `minmax(${PREVIEW_EDITOR_CANVAS_MIN_HEIGHT}px, ${Math.max(resolvedEditorVerticalSplitRatio * 100, 1)}fr) ${PREVIEW_EDITOR_VERTICAL_SPLIT_DIVIDER_PX}px minmax(${PREVIEW_EDITOR_WORKBENCH_MIN_HEIGHT}px, ${Math.max((1 - resolvedEditorVerticalSplitRatio) * 100, 1)}fr)`,
          }
          : undefined}
      >
        <div className={shouldUseEditorVerticalSplit ? 'min-h-0 overflow-hidden' : `${useRenovationPreviewForm ? (isMobileView ? 'min-h-0 flex-1' : 'min-h-0 basis-0 flex-[3]') : 'shrink-0'}`}>
          {editorCanvasContent}
        </div>
        {shouldUseEditorVerticalSplit && (
          <div
            role="separator"
            aria-orientation="horizontal"
            className="group relative select-none"
          >
            <div
              className={`absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 cursor-row-resize ${isResizingEditorVerticalSplit ? 'bg-banana-300/70 dark:bg-banana-500/40' : 'bg-transparent'}`}
              style={{ height: `${PREVIEW_SPLIT_HIT_AREA_PX}px` }}
              onMouseDown={onEditorVerticalSplitResizeStart}
            />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-200 transition-colors group-hover:bg-banana-300 dark:bg-border-primary dark:group-hover:bg-banana-500/70" />
            <div
              role="separator"
              aria-label="联动调整左右与上下分区"
              className="absolute top-1/2 z-20 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-md bg-transparent hover:bg-banana-200/40"
              style={{ left: `-${Math.ceil(PREVIEW_SPLIT_DIVIDER_PX / 2)}px` }}
              onMouseDown={onLinkedSplitResizeStart}
            />
          </div>
        )}
        {!useRenovationPreviewForm && (
          <div className="mt-3 shrink-0">
            {externalFieldTags}
          </div>
        )}
        <div className={`${shouldUseEditorVerticalSplit ? 'min-h-0 overflow-hidden' : `${useRenovationPreviewForm ? (isMobileView ? 'mt-0 flex-1 justify-start' : 'mt-0 min-h-0 basis-0 flex-[1] justify-start') : 'mt-2 flex-1 justify-end'} min-h-0 overflow-visible flex flex-col`}`}>
          <div className={`relative ${useRenovationPreviewForm ? 'min-h-0 h-full' : 'min-h-0'}`}>
            <PageAiWorkbench
              title={t('preview.pageAiTitle')}
              subtitle={t('preview.pageAiSubtitle')}
              emptyTitle={t('preview.pageAiEmptyTitle')}
              emptyDescription={t('preview.pageAiEmptyDescription')}
              inputPlaceholder={t('preview.editPromptPlaceholder')}
              inputHint={t('preview.pageAiInputHint')}
              sendTooltip={t('preview.generateImage')}
              referencesTitle={t('preview.pageAiReferencesTitle')}
              referencesEmpty={t('preview.pageAiReferencesEmpty')}
              descriptionSourcesTitle={t('preview.pageAiDescriptionSourcesTitle')}
              templateLabel={t('preview.pageAiTemplateReference')}
              materialLabel={t('preview.pageAiMaterialReference')}
              uploadLabel={t('preview.pageAiUploadReference')}
              loadingLabel={t('preview.pageAiLoading')}
              regionSelectLabel={t('preview.regionSelect')}
              regionSelectActiveLabel={t('preview.endRegionSelect')}
              modelLabel={t('preview.editRunImageModelLabel')}
              modelHint={t('preview.editRunImageModelHint')}
              messages={pageAiMessages}
              references={selectedPageAiReferences}
              descriptionImageOptions={[]}
              hasTemplateReference={false}
              templatePreviewUrl={undefined}
              activeReferenceId={activePreviewReferenceId}
              inputValue={editPrompt}
              inputRef={pageAiTextareaRef}
              slashActions={pageAiSlashActions}
              onPaste={onPageAiPaste}
              sendLabel={t('preview.generateImage')}
              modelValue={editRunImageModel}
              modelOptions={editRunImageModelOptions}
              isSubmitting={isPageAiSubmitting}
              isRegionSelectionActive={isRegionSelectionMode}
              pendingRegionCommentValue={pendingRegionCommentValue}
              pendingRegionPreviewUrl={pendingRegionPreviewUrl}
              pendingRegionEscStep={pendingRegionEscStep}
              headerActions={!useRenovationPreviewForm ? (
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<History size={16} />}
                    onClick={onOpenHistory}
                    disabled={historyVersionsCount === 0}
                    aria-label={t('preview.historyButton')}
                    title={t('preview.historyButton')}
                    className="h-10 w-10 rounded-full border border-[#d9c99d] bg-[#f9f2df] p-0 text-[#7c6840] shadow-sm hover:bg-[#f6ebcf] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:bg-background-hover"
                  />
                  {historyVersionsCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-banana-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-black shadow-sm">
                      {historyVersionsCount}
                    </span>
                  )}
                </div>
              ) : undefined}
              onInputChange={onEditPromptChange}
              onModelChange={onEditRunImageModelChange}
              onSend={onPageAiSend}
              onToggleRegionSelect={onToggleRegionSelect}
              onPendingRegionCommentChange={onPendingRegionCommentChange}
              onSubmitPendingRegionComment={onSubmitPendingRegionComment}
              onCancelPendingRegionComment={onCancelPendingRegionComment}
              onPendingRegionEsc={onPendingRegionEsc}
              onToggleTemplate={onToggleTemplate}
              onToggleDescriptionImage={onToggleDescriptionImage}
              onReferenceClick={onReferenceClick}
              onRemoveReference={onRemoveReference}
              onOpenMaterialSelector={onOpenMaterialSelector}
              onUploadFiles={onUploadFiles}
              cardless={useRenovationPreviewForm}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
