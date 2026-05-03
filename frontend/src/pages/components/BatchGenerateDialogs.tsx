import React from 'react';
import { Button, Modal } from '@/components/shared';

export type GenerateScopeContext = {
  total: number;
  generated: number;
  generating: number;
  missing: number;
  targetPageIds: string[];
  missingPageIds: string[];
};

type BatchGenerateDialogsProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  showBatchGenerateDialog: boolean;
  batchGenerateContext: GenerateScopeContext | null;
  onCloseBatchGenerateDialog: () => void;
  onGenerateMissingImages: () => void;
  onRegenerateAllImages: () => void;
  showBatchDescriptionGenerateDialog: boolean;
  batchDescriptionGenerateContext: GenerateScopeContext | null;
  descriptionRangeStart: string;
  descriptionRangeEnd: string;
  onDescriptionRangeStartChange: (value: string) => void;
  onDescriptionRangeEndChange: (value: string) => void;
  onGenerateMissingDescriptions: () => void;
  onRegenerateAllDescriptions: () => void;
  onGenerateDescriptionsByRange: () => void;
  onCloseBatchDescriptionGenerateDialog: () => void;
};

// Renders batch image and description generation dialogs, including page-range controls.
export const BatchGenerateDialogs: React.FC<BatchGenerateDialogsProps> = ({
  t,
  showBatchGenerateDialog,
  batchGenerateContext,
  onCloseBatchGenerateDialog,
  onGenerateMissingImages,
  onRegenerateAllImages,
  showBatchDescriptionGenerateDialog,
  batchDescriptionGenerateContext,
  descriptionRangeStart,
  descriptionRangeEnd,
  onDescriptionRangeStartChange,
  onDescriptionRangeEndChange,
  onGenerateMissingDescriptions,
  onRegenerateAllDescriptions,
  onGenerateDescriptionsByRange,
  onCloseBatchDescriptionGenerateDialog,
}) => (
  <>
    <Modal
      isOpen={showBatchGenerateDialog}
      onClose={onCloseBatchGenerateDialog}
      title={t('preview.confirmPartialGenerateTitle')}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-foreground-secondary">
          {batchGenerateContext
            ? t(
              batchGenerateContext.generating > 0
                ? 'preview.confirmPartialGenerateWithGeneratingMessage'
                : 'preview.confirmPartialGenerateMessage',
              {
                generated: batchGenerateContext.generated,
                total: batchGenerateContext.total,
                missing: batchGenerateContext.missing,
                generating: batchGenerateContext.generating,
              }
            )
            : ''}
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            onClick={onGenerateMissingImages}
          >
            {batchGenerateContext
              ? t('preview.generateMissingOnly', { count: batchGenerateContext.missing })
              : t('preview.generateMissingOnly', { count: 0 })}
          </Button>
          <Button
            variant="primary"
            onClick={onRegenerateAllImages}
          >
            {batchGenerateContext
              ? t('preview.regenerateAllPages', { count: batchGenerateContext.total })
              : t('preview.regenerateAllPages', { count: 0 })}
          </Button>
          <Button
            variant="ghost"
            className="self-center h-9 min-w-20 border border-gray-300 bg-white px-4 text-sm shadow-sm hover:bg-gray-50 dark:border-border-primary dark:bg-background-secondary dark:hover:bg-background-hover"
            onClick={onCloseBatchGenerateDialog}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>

    <Modal
      isOpen={showBatchDescriptionGenerateDialog}
      onClose={onCloseBatchDescriptionGenerateDialog}
      title={t('preview.confirmPartialDescriptionGenerateTitle')}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-foreground-secondary">
          {batchDescriptionGenerateContext
            ? t(
              batchDescriptionGenerateContext.generating > 0
                ? 'preview.confirmPartialDescriptionGenerateWithGeneratingMessage'
                : 'preview.confirmPartialDescriptionGenerateMessage',
              {
                generated: batchDescriptionGenerateContext.generated,
                total: batchDescriptionGenerateContext.total,
                missing: batchDescriptionGenerateContext.missing,
                generating: batchDescriptionGenerateContext.generating,
              }
            )
            : ''}
        </p>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            disabled={!batchDescriptionGenerateContext || batchDescriptionGenerateContext.missing === 0}
            onClick={onGenerateMissingDescriptions}
          >
            {batchDescriptionGenerateContext
              ? t('preview.generateMissingDescriptionsOnly', { count: batchDescriptionGenerateContext.missing })
              : t('preview.generateMissingDescriptionsOnly', { count: 0 })}
          </Button>
          <Button
            variant="secondary"
            onClick={onRegenerateAllDescriptions}
          >
            {batchDescriptionGenerateContext
              ? t('preview.regenerateAllDescriptions', { count: batchDescriptionGenerateContext.total })
              : t('preview.regenerateAllDescriptions', { count: 0 })}
          </Button>
          <div className="pt-1">
            <div className="grid grid-cols-[5rem_auto_5rem_1fr] items-center gap-2">
              <input
                type="number"
                min={1}
                max={batchDescriptionGenerateContext?.total || 1}
                value={descriptionRangeStart}
                onChange={(e) => onDescriptionRangeStartChange(e.target.value)}
                placeholder={t('preview.rangePlaceholderStart')}
                aria-label={t('preview.rangeStartPage')}
                className="h-9 w-20 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-banana-400 dark:border-border-primary dark:bg-background-secondary"
              />
              <span className="inline-flex h-9 items-center justify-center whitespace-nowrap text-sm text-gray-500 dark:text-foreground-tertiary">
                {t('preview.rangeSeparator')}
              </span>
              <input
                type="number"
                min={1}
                max={batchDescriptionGenerateContext?.total || 1}
                value={descriptionRangeEnd}
                onChange={(e) => onDescriptionRangeEndChange(e.target.value)}
                placeholder={t('preview.rangePlaceholderEnd')}
                aria-label={t('preview.rangeEndPage')}
                className="h-9 w-20 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-banana-400 dark:border-border-primary dark:bg-background-secondary"
              />
              <Button
                variant="secondary"
                className="h-9 w-full whitespace-nowrap px-3"
                onClick={onGenerateDescriptionsByRange}
              >
                {t('preview.generateDescriptionsByRange')}
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            className="self-center h-9 min-w-20 border border-gray-300 bg-white px-4 text-sm shadow-sm hover:bg-gray-50 dark:border-border-primary dark:bg-background-secondary dark:hover:bg-background-hover"
            onClick={onCloseBatchDescriptionGenerateDialog}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  </>
);
