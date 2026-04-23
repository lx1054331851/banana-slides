import React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared';

type PreviewStatusBarProps = {
  selectedIndex: number;
  totalPages: number;
  isCurrentPageDirty: boolean;
  textStatusLabel: string;
  isSelectedPageGenerating: boolean;
  generationStatusDetail: string;
  generatingImageCount: number;
  selectedPageHasImage: boolean;
  imageStatusLabel: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export const PreviewStatusBar: React.FC<PreviewStatusBarProps> = ({
  selectedIndex,
  totalPages,
  isCurrentPageDirty,
  textStatusLabel,
  isSelectedPageGenerating,
  generationStatusDetail,
  generatingImageCount,
  selectedPageHasImage,
  imageStatusLabel,
  t,
  onPrevPage,
  onNextPage,
}) => (
  <div
    data-testid="preview-status-bar"
    className="border-t border-gray-200 bg-white/92 px-4 py-3 dark:border-border-primary dark:bg-background-secondary/95"
  >
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-foreground-secondary">
        <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-background-hover">
          第 {selectedIndex + 1} / {totalPages} 页
        </span>
        <span className={`rounded-full px-3 py-1 ${isCurrentPageDirty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {textStatusLabel}
        </span>
        {isSelectedPageGenerating ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            <Loader2 size={14} className="animate-spin" />
            <span className="inline-flex items-center">
              {generationStatusDetail}
              <span className="ml-1 inline-flex items-end gap-0.5 text-[12px] leading-none">
                <span className="animate-pulse">.</span>
                <span className="animate-pulse" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-pulse" style={{ animationDelay: '300ms' }}>.</span>
              </span>
            </span>
            {generatingImageCount > 1 && (
              <span className="text-[11px] text-amber-800/80 dark:text-amber-100/80">
                进行中 {generatingImageCount} 页
              </span>
            )}
          </span>
        ) : (
          <span className={`rounded-full px-3 py-1 ${selectedPageHasImage ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600 dark:bg-background-hover dark:text-foreground-tertiary'}`}>
            {imageStatusLabel}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft size={16} />}
          onClick={onPrevPage}
          disabled={selectedIndex === 0}
        >
          {t('preview.prevPage')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronRight size={16} />}
          onClick={onNextPage}
          disabled={selectedIndex === totalPages - 1}
        >
          {t('preview.nextPage')}
        </Button>
      </div>
    </div>
  </div>
);
