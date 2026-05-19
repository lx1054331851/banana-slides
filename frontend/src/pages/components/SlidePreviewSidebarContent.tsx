import React from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CheckSquare, Square, Check, Trash2, Plus } from 'lucide-react';
import { SlideCard } from '@/components/preview/SlideCard';
import { getPageImageUrl } from '@/api/client';
import type { Page } from '@/types';
import { SortablePreviewThumbnail } from './SortablePreviewThumbnail';

type SlidePreviewSidebarContentProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  pages: Page[];
  selectedIndex: number;
  isMobileView: boolean;
  isSidebarCollapsed: boolean;
  isSidebarCompact: boolean;
  isSidebarGridMode: boolean;
  isMultiSelectMode: boolean;
  selectedPageIds: Set<string>;
  pagesWithImages: Page[];
  canReorderPreviewPages: boolean;
  previewThumbnailSensors: SensorDescriptor<SensorOptions>[];
  previewSortablePageIds: string[];
  sidebarGridColumns: number;
  aspectRatio: string;
  aspectRatioStyle: React.CSSProperties['aspectRatio'];
  toggleMultiSelectMode: () => void;
  selectAllPages: () => void;
  deselectAllPages: () => void;
  togglePageSelection: (pageId: string) => void;
  getPreviewSortablePageIndex: (id: string) => number;
  isPageGenerating: (page?: Page | null) => boolean;
  onSelectPageByIndex: (index: number) => void;
  onDeletePage: (page: Page) => void;
  onInsertPageAfter: (targetPage?: Page | null, fallbackIndex?: number) => Promise<void>;
  onEditPage: (targetPageKey?: string | null, targetIndex?: number) => void;
  onPreviewThumbnailDragEnd: (event: DragEndEvent) => void;
};

export const SlidePreviewSidebarContent: React.FC<SlidePreviewSidebarContentProps> = ({
  t,
  pages,
  selectedIndex,
  isMobileView,
  isSidebarCollapsed,
  isSidebarCompact,
  isSidebarGridMode,
  isMultiSelectMode,
  selectedPageIds,
  pagesWithImages,
  canReorderPreviewPages,
  previewThumbnailSensors,
  previewSortablePageIds,
  sidebarGridColumns,
  aspectRatio,
  aspectRatioStyle,
  toggleMultiSelectMode,
  selectAllPages,
  deselectAllPages,
  togglePageSelection,
  getPreviewSortablePageIndex,
  isPageGenerating,
  onSelectPageByIndex,
  onDeletePage,
  onInsertPageAfter,
  onEditPage,
  onPreviewThumbnailDragEnd,
}) => {
  return isSidebarCollapsed && !isMobileView ? (
    <div className="flex-1 overflow-y-auto py-3 pb-8 md:pb-10 flex flex-col items-center gap-2 min-h-0">
      {canReorderPreviewPages ? (
        <DndContext
          sensors={previewThumbnailSensors}
          collisionDetection={closestCenter}
          onDragEnd={onPreviewThumbnailDragEnd}
        >
          <SortableContext items={previewSortablePageIds} strategy={verticalListSortingStrategy}>
            {pages.map((page, index) => (
              <SortablePreviewThumbnail
                key={page.id || `collapsed-${index}`}
                id={page.id!}
                itemIndex={index}
                getItemIndex={getPreviewSortablePageIndex}
                className="relative"
              >
                <button
                  data-preview-page-index={index}
                  onClick={() => {
                    if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                      togglePageSelection(page.id);
                    } else {
                      onSelectPageByIndex(index);
                    }
                  }}
                  title={`${t('preview.page', { num: index + 1 })} · ${t('preview.reorderPage')}`}
                  className={`w-12 h-9 rounded border-2 transition-all ${selectedIndex === index
                      ? 'border-banana-500 shadow-md'
                      : 'border-gray-200 dark:border-border-primary'
                    } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                >
                  {(page.preview_image_path || page.generated_image_path) ? (
                    <img
                      src={getPageImageUrl(page, { preferPreview: true })}
                      alt={`Slide ${index + 1}`}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 dark:bg-background-secondary rounded flex items-center justify-center text-[10px] text-gray-400">
                      {index + 1}
                    </div>
                  )}
                </button>
              </SortablePreviewThumbnail>
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        pages.map((page, index) => (
          <div key={page.id || `collapsed-${index}`} className="relative">
            <button
              data-preview-page-index={index}
              onClick={() => {
                if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                  togglePageSelection(page.id);
                } else {
                  onSelectPageByIndex(index);
                }
              }}
              title={t('preview.page', { num: index + 1 })}
              className={`w-12 h-9 rounded border-2 transition-all ${selectedIndex === index
                  ? 'border-banana-500 shadow-md'
                  : 'border-gray-200 dark:border-border-primary'
                } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
            >
              {(page.preview_image_path || page.generated_image_path) ? (
                <img
                  src={getPageImageUrl(page, { preferPreview: true })}
                  alt={`Slide ${index + 1}`}
                  className="w-full h-full object-cover rounded"
                />
              ) : (
                <div className="w-full h-full bg-gray-100 dark:bg-background-secondary rounded flex items-center justify-center text-[10px] text-gray-400">
                  {index + 1}
                </div>
              )}
            </button>
          </div>
        ))
      )}
    </div>
  ) : (
    <div className="flex-1 overflow-y-auto md:overflow-y-auto overflow-x-auto md:overflow-x-visible p-3 md:p-4 pb-10 md:pb-12 min-h-0">
      <div className="flex items-center gap-2 text-xs mb-3">
        {isSidebarCompact ? (
          <button
            onClick={toggleMultiSelectMode}
            title={isMultiSelectMode ? t('preview.cancelMultiSelect') : t('preview.multiSelect')}
            className={`w-8 h-8 rounded transition-colors inline-flex items-center justify-center ${isMultiSelectMode
                ? 'bg-banana-100 text-banana-700 hover:bg-banana-200'
                : 'text-gray-500 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover'
              }`}
          >
            {isMultiSelectMode ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>
        ) : (
          <button
            onClick={toggleMultiSelectMode}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${isMultiSelectMode
                ? 'bg-banana-100 text-banana-700 hover:bg-banana-200'
                : 'text-gray-500 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover'
              }`}
          >
            {isMultiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
            <span>{isMultiSelectMode ? t('preview.cancelMultiSelect') : t('preview.multiSelect')}</span>
          </button>
        )}
        {isMultiSelectMode && !isSidebarCompact && (
          <>
            <button
              onClick={selectedPageIds.size === pagesWithImages.length ? deselectAllPages : selectAllPages}
              className="text-gray-500 dark:text-foreground-tertiary hover:text-banana-600 transition-colors"
            >
              {selectedPageIds.size === pagesWithImages.length ? t('common.deselectAll') : t('common.selectAll')}
            </button>
            {selectedPageIds.size > 0 && (
              <span className="text-banana-600 font-medium">
                ({selectedPageIds.size}{t('preview.pagesUnit')})
              </span>
            )}
          </>
        )}
        {isMultiSelectMode && isSidebarCompact && selectedPageIds.size > 0 && (
          <span className="text-banana-600 font-medium">
            {selectedPageIds.size}
          </span>
        )}
      </div>
      {isSidebarGridMode ? (
        canReorderPreviewPages ? (
          <DndContext
            sensors={previewThumbnailSensors}
            collisionDetection={closestCenter}
            onDragEnd={onPreviewThumbnailDragEnd}
          >
            <SortableContext items={previewSortablePageIds} strategy={rectSortingStrategy}>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${sidebarGridColumns}, minmax(0, 1fr))` }}
              >
                {pages.map((page, index) => {
                  const hasImage = Boolean(page.preview_image_path || page.generated_image_path);
                  const isGenerating = isPageGenerating(page);
                  return (
                    <SortablePreviewThumbnail
                      key={page.id || `grid-${index}`}
                      id={page.id!}
                      itemIndex={index}
                      getItemIndex={getPreviewSortablePageIndex}
                      className="relative group"
                    >
                      <button
                        data-preview-page-index={index}
                        onClick={() => {
                          if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                            togglePageSelection(page.id);
                          } else {
                            onSelectPageByIndex(index);
                          }
                        }}
                        title={`${t('preview.page', { num: index + 1 })} · ${t('preview.reorderPage')}`}
                        className={`w-full overflow-hidden rounded-lg bg-white dark:bg-background-secondary shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all ${selectedIndex === index
                            ? 'ring-2 ring-banana-300 shadow-[0_10px_30px_rgba(250,204,21,0.18)]'
                            : 'ring-1 ring-gray-200 hover:ring-gray-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
                          } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                      >
                        <div className="text-xs font-medium px-2 py-1 text-left text-gray-600 dark:text-foreground-tertiary bg-white/90 dark:bg-background-secondary/90">
                          {t('preview.page', { num: index + 1 })}
                        </div>
                        <div
                          className="bg-gray-100 dark:bg-background-primary ring-1 ring-gray-200/90"
                          style={{ aspectRatio: aspectRatioStyle }}
                        >
                          {(page.preview_image_path || page.generated_image_path) ? (
                            <img
                              src={getPageImageUrl(page, { preferPreview: true })}
                              alt={`Slide ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                              {index + 1}
                            </div>
                          )}
                        </div>
                      </button>
                      {isMultiSelectMode && page.id && hasImage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePageSelection(page.id!);
                          }}
                          className={`absolute top-2 right-2 z-10 w-5 h-5 rounded flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                              ? 'bg-banana-500 text-white shadow-md'
                              : 'bg-white/90 border border-gray-300 dark:border-border-primary'
                            }`}
                        >
                          {selectedPageIds.has(page.id) && <Check size={12} />}
                        </button>
                      )}
                      {!isMultiSelectMode && !isGenerating && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePage(page);
                          }}
                          className={`absolute top-2 right-2 z-20 p-1.5 bg-white/95 dark:bg-background-secondary rounded-lg border border-gray-200 dark:border-border-primary text-red-600 transition-opacity hover:bg-red-50 ${hasImage ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'
                            }`}
                          title={t('preview.confirmDeleteTitle')}
                          aria-label={t('preview.confirmDeleteTitle')}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onInsertPageAfter(page, index);
                        }}
                        title={t('preview.insertAfterPage')}
                        aria-label={t('preview.insertAfterPage')}
                        className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 h-7 w-7 hidden md:inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-secondary shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:bg-banana-50 dark:hover:bg-background-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-400"
                      >
                        <Plus size={13} />
                      </button>
                    </SortablePreviewThumbnail>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${sidebarGridColumns}, minmax(0, 1fr))` }}
          >
            {pages.map((page, index) => {
              const hasImage = Boolean(page.preview_image_path || page.generated_image_path);
              const isGenerating = isPageGenerating(page);
              return (
                <div key={page.id || `grid-${index}`} className="relative group">
                  <button
                    data-preview-page-index={index}
                    onClick={() => {
                      if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                        togglePageSelection(page.id);
                      } else {
                        onSelectPageByIndex(index);
                      }
                    }}
                    className={`w-full overflow-hidden rounded-lg bg-white dark:bg-background-secondary shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all ${selectedIndex === index
                        ? 'ring-2 ring-banana-300 shadow-[0_10px_30px_rgba(250,204,21,0.18)]'
                        : 'ring-1 ring-gray-200 hover:ring-gray-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
                      } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                  >
                    <div className="text-xs font-medium px-2 py-1 text-left text-gray-600 dark:text-foreground-tertiary bg-white/90 dark:bg-background-secondary/90">
                      {t('preview.page', { num: index + 1 })}
                    </div>
                    <div
                      className="bg-gray-100 dark:bg-background-primary ring-1 ring-gray-200/90"
                      style={{ aspectRatio: aspectRatioStyle }}
                    >
                      {(page.preview_image_path || page.generated_image_path) ? (
                        <img
                          src={getPageImageUrl(page, { preferPreview: true })}
                          alt={`Slide ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                          {index + 1}
                        </div>
                      )}
                    </div>
                  </button>
                  {isMultiSelectMode && page.id && hasImage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePageSelection(page.id!);
                      }}
                      className={`absolute top-2 right-2 z-10 w-5 h-5 rounded flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                          ? 'bg-banana-500 text-white shadow-md'
                          : 'bg-white/90 border border-gray-300 dark:border-border-primary'
                        }`}
                    >
                      {selectedPageIds.has(page.id) && <Check size={12} />}
                    </button>
                  )}
                  {!isMultiSelectMode && !isGenerating && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePage(page);
                      }}
                      className={`absolute top-2 right-2 z-20 p-1.5 bg-white/95 dark:bg-background-secondary rounded-lg border border-gray-200 dark:border-border-primary text-red-600 transition-opacity hover:bg-red-50 ${hasImage ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'
                        }`}
                      title={t('preview.confirmDeleteTitle')}
                      aria-label={t('preview.confirmDeleteTitle')}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onInsertPageAfter(page, index);
                    }}
                    title={t('preview.insertAfterPage')}
                    aria-label={t('preview.insertAfterPage')}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 h-7 w-7 hidden md:inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-secondary shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:bg-banana-50 dark:hover:bg-background-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-400"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : (
        canReorderPreviewPages ? (
          <DndContext
            sensors={previewThumbnailSensors}
            collisionDetection={closestCenter}
            onDragEnd={onPreviewThumbnailDragEnd}
          >
            <SortableContext items={previewSortablePageIds} strategy={verticalListSortingStrategy}>
              <div className="flex md:flex-col gap-2 md:gap-4 min-w-max md:min-w-0">
                {pages.map((page, index) => (
                  <SortablePreviewThumbnail
                    key={page.id || `list-${index}`}
                    id={page.id!}
                    itemIndex={index}
                    getItemIndex={getPreviewSortablePageIndex}
                    className="md:w-full flex-shrink-0 relative group"
                  >
                    <div className="md:hidden relative">
                      <button
                        data-preview-page-index={index}
                        onClick={() => {
                          if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                            togglePageSelection(page.id);
                          } else {
                            onSelectPageByIndex(index);
                          }
                        }}
                        className={`h-14 w-20 rounded bg-white dark:bg-background-secondary shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all ${selectedIndex === index
                            ? 'ring-2 ring-banana-300 shadow-[0_10px_30px_rgba(250,204,21,0.18)]'
                            : 'ring-1 ring-gray-200'
                          } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                      >
                        {(page.preview_image_path || page.generated_image_path) ? (
                          <img
                            src={getPageImageUrl(page, { preferPreview: true })}
                            alt={`Slide ${index + 1}`}
                            className="w-full h-full object-cover rounded"
                          />
                        ) : (
                          <div className="w-full h-full rounded bg-gray-100 dark:bg-background-secondary flex items-center justify-center text-xs text-gray-400">
                            {index + 1}
                          </div>
                        )}
                      </button>
                      {isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePageSelection(page.id!);
                          }}
                          className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                              ? 'bg-banana-500 text-white'
                              : 'bg-white dark:bg-background-secondary border-2 border-gray-300 dark:border-border-primary'
                            }`}
                        >
                          {selectedPageIds.has(page.id) && <Check size={12} />}
                        </button>
                      )}
                    </div>
                    <div className="hidden md:block relative" data-preview-page-index={index}>
                      {isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePageSelection(page.id!);
                          }}
                          className={`absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                              ? 'bg-banana-500 text-white shadow-md'
                              : 'bg-white/90 border-2 border-gray-300 dark:border-border-primary hover:border-banana-400'
                            }`}
                        >
                          {selectedPageIds.has(page.id) && <Check size={14} />}
                        </button>
                      )}
                      <SlideCard
                        page={page}
                        index={index}
                        isSelected={selectedIndex === index}
                        onClick={() => {
                          if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                            togglePageSelection(page.id);
                          } else {
                            onSelectPageByIndex(index);
                          }
                        }}
                        onEdit={() => {
                          onEditPage(page.id || page.page_id, index);
                        }}
                        onDelete={() => onDeletePage(page)}
                        showDelete={!isMultiSelectMode}
                        isGenerating={page.id ? isPageGenerating(page) : false}
                        aspectRatio={aspectRatio}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onInsertPageAfter(page, index);
                        }}
                        title={t('preview.insertAfterPage')}
                        aria-label={t('preview.insertAfterPage')}
                        className="absolute left-1/2 -bottom-3 -translate-x-1/2 z-20 h-7 w-7 hidden md:inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-secondary shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:bg-banana-50 dark:hover:bg-background-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-400"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </SortablePreviewThumbnail>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="flex md:flex-col gap-2 md:gap-4 min-w-max md:min-w-0">
            {pages.map((page, index) => (
              <div key={page.id || `list-${index}`} className="md:w-full flex-shrink-0 relative group">
                <div className="md:hidden relative">
                  <button
                    data-preview-page-index={index}
                    onClick={() => {
                      if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                        togglePageSelection(page.id);
                      } else {
                        onSelectPageByIndex(index);
                      }
                    }}
                    className={`h-14 w-20 rounded bg-white dark:bg-background-secondary shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all ${selectedIndex === index
                        ? 'ring-2 ring-banana-300 shadow-[0_10px_30px_rgba(250,204,21,0.18)]'
                        : 'ring-1 ring-gray-200'
                      } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                  >
                    {(page.preview_image_path || page.generated_image_path) ? (
                      <img
                        src={getPageImageUrl(page, { preferPreview: true })}
                        alt={`Slide ${index + 1}`}
                        className="w-full h-full object-cover rounded"
                      />
                    ) : (
                      <div className="w-full h-full rounded bg-gray-100 dark:bg-background-secondary flex items-center justify-center text-xs text-gray-400">
                        {index + 1}
                      </div>
                    )}
                  </button>
                  {isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePageSelection(page.id!);
                      }}
                      className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                          ? 'bg-banana-500 text-white'
                          : 'bg-white dark:bg-background-secondary border-2 border-gray-300 dark:border-border-primary'
                        }`}
                    >
                      {selectedPageIds.has(page.id) && <Check size={12} />}
                    </button>
                  )}
                </div>
                <div className="hidden md:block relative" data-preview-page-index={index}>
                  {isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePageSelection(page.id!);
                      }}
                      className={`absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center transition-all ${selectedPageIds.has(page.id)
                          ? 'bg-banana-500 text-white shadow-md'
                          : 'bg-white/90 border-2 border-gray-300 dark:border-border-primary hover:border-banana-400'
                        }`}
                    >
                      {selectedPageIds.has(page.id) && <Check size={14} />}
                    </button>
                  )}
                  <SlideCard
                    page={page}
                    index={index}
                    isSelected={selectedIndex === index}
                    onClick={() => {
                      if (isMultiSelectMode && page.id && (page.generated_image_path || page.preview_image_path)) {
                        togglePageSelection(page.id);
                      } else {
                        onSelectPageByIndex(index);
                      }
                    }}
                    onEdit={() => {
                      onEditPage(page.id || page.page_id, index);
                    }}
                    onDelete={() => onDeletePage(page)}
                    showDelete={!isMultiSelectMode}
                    isGenerating={page.id ? isPageGenerating(page) : false}
                    aspectRatio={aspectRatio}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onInsertPageAfter(page, index);
                    }}
                    title={t('preview.insertAfterPage')}
                    aria-label={t('preview.insertAfterPage')}
                    className="absolute left-1/2 -bottom-3 -translate-x-1/2 z-20 h-7 w-7 hidden md:inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-600 dark:text-foreground-secondary shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:bg-banana-50 dark:hover:bg-background-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-400"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};
