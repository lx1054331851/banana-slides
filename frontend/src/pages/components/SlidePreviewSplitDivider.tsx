import React from 'react';
import { ChevronRight } from 'lucide-react';

type SlidePreviewSplitDividerProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  isResizingPreviewSplit: boolean;
  previewSplitHitAreaPx: number;
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  onToggleEditorPane: () => void;
};

export const SlidePreviewSplitDivider: React.FC<SlidePreviewSplitDividerProps> = ({
  t,
  isResizingPreviewSplit,
  previewSplitHitAreaPx,
  onResizeStart,
  onToggleEditorPane,
}) => {
  return (
    <div
      data-testid="preview-split-divider"
      role="separator"
      aria-orientation="vertical"
      className="group relative"
    >
      <div
        className={`absolute inset-y-0 left-1/2 z-10 -translate-x-1/2 cursor-col-resize ${isResizingPreviewSplit ? 'bg-banana-300/70' : 'bg-transparent'}`}
        style={{ width: `${previewSplitHitAreaPx}px` }}
        onMouseDown={onResizeStart}
      />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:bg-banana-300 dark:bg-border-primary dark:group-hover:bg-banana-500/70" />
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onToggleEditorPane}
        aria-label={t('preview.collapseRightPanel')}
        title={t('preview.collapseRightPanel')}
        className="absolute left-1/2 top-2 z-20 -translate-x-1/2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d9c99d] bg-[#f9f2df] text-[#7c6840] shadow-sm transition-colors hover:bg-[#f6ebcf] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:bg-background-hover"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};
