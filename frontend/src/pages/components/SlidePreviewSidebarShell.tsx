import React from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';

type SlidePreviewSidebarShellProps = {
  children: React.ReactNode;
  t: (key: string, options?: Record<string, unknown>) => string;
  currentPageCount: number;
  isMobileView: boolean;
  isResizingSidebar: boolean;
  isSidebarCollapsed: boolean;
  isSidebarCompact: boolean;
  sidebarWidthPx: number;
  sidebarDefaultWidth: number;
  setSidebarWidthPxExpanded: (value: number) => void;
  setIsSidebarCollapsed: (value: boolean) => void;
  handleSidebarResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  sidebarViewMode: 'list' | 'grid';
  setSidebarViewMode: (mode: 'list' | 'grid') => void;
  sidebarGridThumbMinPx: number;
  sidebarGridThumbMaxPx: number;
  sidebarGridThumbMaxWidthPx: number;
  setSidebarGridThumbMaxWidthPx: (value: number) => void;
};

export const SlidePreviewSidebarShell: React.FC<SlidePreviewSidebarShellProps> = ({
  children,
  t,
  currentPageCount,
  isMobileView,
  isResizingSidebar,
  isSidebarCollapsed,
  isSidebarCompact,
  sidebarWidthPx,
  sidebarDefaultWidth,
  setSidebarWidthPxExpanded,
  setIsSidebarCollapsed,
  handleSidebarResizeStart,
  sidebarViewMode,
  setSidebarViewMode,
  sidebarGridThumbMinPx,
  sidebarGridThumbMaxPx,
  sidebarGridThumbMaxWidthPx,
  setSidebarGridThumbMaxWidthPx,
}) => {
  return (
    <aside
      className={`relative w-full md:w-auto bg-white dark:bg-background-secondary border-b md:border-b-0 md:border-r border-gray-200 dark:border-border-primary flex flex-col flex-shrink-0 ${isResizingSidebar ? 'transition-none' : 'transition-[width] duration-300 ease-out'
        } ${isSidebarCollapsed ? 'md:items-center' : ''}`}
      style={isMobileView ? undefined : { width: sidebarWidthPx }}
    >
      {!isMobileView && (
        <div
          className="absolute -right-2 top-0 h-full w-3 cursor-col-resize bg-transparent hover:bg-banana-100/60 z-20"
          onMouseDown={handleSidebarResizeStart}
        />
      )}
      <div
        className={`border-b border-gray-200 dark:border-border-primary flex-shrink-0 space-y-2 md:space-y-3 ${isSidebarCollapsed ? 'px-2 py-3' : 'p-3 md:p-4'
          }`}
      >
        <div className={`flex items-center gap-2 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isSidebarCollapsed && !isSidebarCompact && (
            <span className="text-xs font-semibold text-gray-600 dark:text-foreground-tertiary">
              {t('preview.pageCount', { count: currentPageCount })}
            </span>
          )}
          {!isMobileView && (
            <button
              type="button"
              onClick={() => {
                if (isSidebarCollapsed) {
                  setSidebarWidthPxExpanded(sidebarDefaultWidth);
                  setIsSidebarCollapsed(false);
                } else {
                  setIsSidebarCollapsed(true);
                }
              }}
              title={isSidebarCollapsed ? t('preview.expandSidebar') : t('preview.collapseSidebar')}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:text-foreground-secondary dark:hover:bg-background-hover transition-colors"
            >
              {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          )}
        </div>
        {!isSidebarCollapsed && !isSidebarCompact && !isMobileView && (
          <div className="space-y-2">
            <div className="inline-flex w-full rounded-lg border border-gray-200 dark:border-border-primary overflow-hidden">
              <button
                type="button"
                onClick={() => setSidebarViewMode('list')}
                className={`flex-1 h-8 inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ${sidebarViewMode === 'list'
                    ? 'bg-banana-50 text-banana-700 dark:bg-banana-900/30 dark:text-banana-400'
                    : 'bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-tertiary hover:bg-gray-50 dark:hover:bg-background-hover'
                  }`}
                title={t('preview.sidebarView.list')}
                aria-label={t('preview.sidebarView.list')}
              >
                <List size={14} />
                <span>{t('preview.sidebarView.list')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarViewMode('grid')}
                className={`flex-1 h-8 inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-colors border-l border-gray-200 dark:border-border-primary ${sidebarViewMode === 'grid'
                    ? 'bg-banana-50 text-banana-700 dark:bg-banana-900/30 dark:text-banana-400'
                    : 'bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-tertiary hover:bg-gray-50 dark:hover:bg-background-hover'
                  }`}
                title={t('preview.sidebarView.grid')}
                aria-label={t('preview.sidebarView.grid')}
              >
                <LayoutGrid size={14} />
                <span>{t('preview.sidebarView.grid')}</span>
              </button>
            </div>
            {sidebarViewMode === 'grid' && (
              <div className="rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-foreground-tertiary">
                  <span>{t('preview.gridZoomLabel')}</span>
                  <span>{sidebarGridThumbMaxWidthPx}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 dark:text-foreground-tertiary">{t('preview.gridZoomSmall')}</span>
                  <input
                    type="range"
                    min={sidebarGridThumbMinPx}
                    max={sidebarGridThumbMaxPx}
                    step={10}
                    value={sidebarGridThumbMaxWidthPx}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      const clamped = Math.min(Math.max(next, sidebarGridThumbMinPx), sidebarGridThumbMaxPx);
                      setSidebarGridThumbMaxWidthPx(clamped);
                    }}
                    className="h-1.5 w-full cursor-pointer accent-banana-500"
                    aria-label={t('preview.gridZoomLabel')}
                    title={t('preview.gridZoomLabel')}
                  />
                  <span className="text-[10px] text-gray-400 dark:text-foreground-tertiary">{t('preview.gridZoomLarge')}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </aside>
  );
};
