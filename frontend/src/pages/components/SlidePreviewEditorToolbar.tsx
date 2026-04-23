import React from 'react';
import { ArrowUpDown, ChevronDown, Download, ImagePlus, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/shared';

type SlidePreviewEditorToolbarProps = {
  isDescriptionStreaming: boolean;
  isDescriptionProgressVisible: boolean;
  descriptionGenerationProgressPercent: number;
  descriptionGenerationError: string | null;
  isRenovationProcessing: boolean;
  isGenerateDisabled: boolean;
  renovationProgress: { completed: number; total: number } | null;
  renovationProgressPercent: number;
  generateButtonText: string;
  fileMenuOpen: boolean;
  hasDescriptionContent: boolean;
  fileMenuRef: React.RefObject<HTMLDivElement>;
  importFileRef: React.RefObject<HTMLInputElement>;
  setFileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onGenerateDescriptions: () => void;
  onClearDescriptionGenerationError: () => void;
  onGenerateAll: () => void;
  onExportDescriptions: () => void;
  onExportFull: () => void;
  onImportDescriptions: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export const SlidePreviewEditorToolbar: React.FC<SlidePreviewEditorToolbarProps> = ({
  isDescriptionStreaming,
  isDescriptionProgressVisible,
  descriptionGenerationProgressPercent,
  descriptionGenerationError,
  isRenovationProcessing,
  isGenerateDisabled,
  renovationProgress,
  renovationProgressPercent,
  generateButtonText,
  fileMenuOpen,
  hasDescriptionContent,
  fileMenuRef,
  importFileRef,
  setFileMenuOpen,
  onGenerateDescriptions,
  onClearDescriptionGenerationError,
  onGenerateAll,
  onExportDescriptions,
  onExportFull,
  onImportDescriptions,
}) => {
  return (
    <>
      <div
        data-testid="preview-editor-toolbar"
        className="flex min-h-[40px] flex-wrap items-center gap-2 py-1"
      >
        <Button
          variant="secondary"
          size="sm"
          icon={<Sparkles size={16} />}
          className="h-9 rounded-xl px-3"
          data-testid="preview-batch-generate-descriptions"
          loading={isDescriptionStreaming}
          onClick={onGenerateDescriptions}
        >
          <span className="inline-flex items-center gap-1.5">
            <span>批量生成描述</span>
            {isDescriptionProgressVisible && (
              <span
                data-testid="preview-description-progress"
                className="inline-flex items-center gap-1 rounded-full border border-banana-200 bg-banana-50 px-2 py-0.5 text-[11px] leading-none dark:border-banana-700/50 dark:bg-banana-900/15"
              >
                <span className="font-semibold text-banana-700 dark:text-banana">
                  {descriptionGenerationProgressPercent}%
                </span>
              </span>
            )}
          </span>
        </Button>
        {descriptionGenerationError && (
          <div
            data-testid="preview-description-error-inline"
            className="inline-flex max-w-[560px] items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-200"
          >
            <span className="truncate" title={descriptionGenerationError}>{descriptionGenerationError}</span>
            <button
              type="button"
              onClick={onClearDescriptionGenerationError}
              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/40"
              aria-label="close description generation error"
            >
              <X size={12} />
            </button>
          </div>
        )}
        <Button
          variant="secondary"
          size="sm"
          icon={<ImagePlus size={16} />}
          className="h-9 rounded-xl px-3"
          data-testid="preview-batch-generate-images"
          onClick={onGenerateAll}
          loading={isRenovationProcessing}
          disabled={isGenerateDisabled || isRenovationProcessing}
        >
          {isRenovationProcessing ? (
            <span className="inline-flex items-center gap-1.5">
              <span>解析页面内容</span>
              {renovationProgress && renovationProgress.total > 0 && (
                <>
                  <span className="rounded-full bg-banana-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-banana-900/15 dark:text-foreground-secondary">
                    {renovationProgress.completed}/{renovationProgress.total}
                  </span>
                  <span className="text-[11px] font-semibold text-banana-700 dark:text-banana">
                    {renovationProgressPercent}%
                  </span>
                </>
              )}
            </span>
          ) : (
            generateButtonText
          )}
        </Button>

        <div className="relative" ref={fileMenuRef}>
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowUpDown size={16} />}
            className="h-9 rounded-xl"
            onClick={() => setFileMenuOpen((prev) => !prev)}
          >
            导入/导出
            <ChevronDown size={14} className={`ml-1 transition-transform ${fileMenuOpen ? 'rotate-180' : ''}`} />
          </Button>
          {fileMenuOpen && (
            <div className="absolute left-0 top-full mt-2 z-30 min-w-[170px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-border-primary dark:bg-background-secondary">
              <button
                type="button"
                onClick={() => {
                  onExportDescriptions();
                  setFileMenuOpen(false);
                }}
                disabled={!hasDescriptionContent}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:text-foreground-tertiary dark:hover:bg-background-hover"
              >
                <Download size={14} />
                导出描述
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportFull();
                  setFileMenuOpen(false);
                }}
                disabled={!hasDescriptionContent}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:text-foreground-tertiary dark:hover:bg-background-hover"
              >
                <Download size={14} />
                导出大纲+描述
              </button>
              <div className="border-t border-gray-100 dark:border-border-primary" />
              <button
                type="button"
                onClick={() => {
                  importFileRef.current?.click();
                  setFileMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-foreground-tertiary dark:hover:bg-background-hover"
              >
                <Upload size={14} />
                导入描述
              </button>
            </div>
          )}
        </div>

        <input
          ref={importFileRef}
          type="file"
          accept=".md,.txt"
          className="hidden"
          onChange={onImportDescriptions}
        />
      </div>
    </>
  );
};
