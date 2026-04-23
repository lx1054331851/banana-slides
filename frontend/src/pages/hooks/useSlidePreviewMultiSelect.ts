import { useCallback, useState } from 'react';
import type { Page } from '@/types';

type UseSlidePreviewMultiSelectParams = {
  pagesWithImages: Page[];
};

export const useSlidePreviewMultiSelect = ({
  pagesWithImages,
}: UseSlidePreviewMultiSelectParams) => {
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());

  const togglePageSelection = useCallback((pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  const selectAllPages = useCallback(() => {
    const allPageIds = pagesWithImages.map((page) => page.id).filter(Boolean) as string[];
    setSelectedPageIds(new Set(allPageIds));
  }, [pagesWithImages]);

  const deselectAllPages = useCallback(() => {
    setSelectedPageIds(new Set());
  }, []);

  const toggleMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode((prev) => {
      if (prev) {
        setSelectedPageIds(new Set());
      }
      return !prev;
    });
  }, []);

  const getSelectedPageIdsForExport = useCallback((): string[] | undefined => {
    if (!isMultiSelectMode || selectedPageIds.size === 0) {
      return undefined;
    }
    return Array.from(selectedPageIds);
  }, [isMultiSelectMode, selectedPageIds]);

  return {
    isMultiSelectMode,
    selectedPageIds,
    togglePageSelection,
    selectAllPages,
    deselectAllPages,
    toggleMultiSelectMode,
    getSelectedPageIdsForExport,
  };
};
