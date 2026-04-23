import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { arrayMove, type DragEndEvent } from '@dnd-kit/sortable';
import type { Project } from '@/types';

type UseSlidePreviewReorderParams = {
  currentProject?: Project | null;
  isMobileView: boolean;
  isMultiSelectMode: boolean;
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  reorderPages: (pageIds: string[]) => Promise<unknown>;
};

export const useSlidePreviewReorder = ({
  currentProject,
  isMobileView,
  isMultiSelectMode,
  selectedIndex,
  setSelectedIndex,
  reorderPages,
}: UseSlidePreviewReorderParams) => {
  const previewSortablePageIds = useMemo(
    () => currentProject?.pages.map((page) => page.id).filter((id): id is string => Boolean(id)) || [],
    [currentProject?.pages]
  );
  const previewSortablePageIndexMap = useMemo(
    () => Object.fromEntries(previewSortablePageIds.map((id, index) => [id, index])),
    [previewSortablePageIds]
  );
  const getPreviewSortablePageIndex = useCallback(
    (id: string) => previewSortablePageIndexMap[id] ?? -1,
    [previewSortablePageIndexMap]
  );
  const canReorderPreviewPages = Boolean(
    !isMobileView &&
    !isMultiSelectMode &&
    currentProject &&
    currentProject.pages.length > 1 &&
    previewSortablePageIds.length === currentProject.pages.length
  );

  const handlePreviewThumbnailDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!currentProject || !over || active.id === over.id) return;

    const oldIndex = currentProject.pages.findIndex((page) => page.id === active.id);
    const newIndex = currentProject.pages.findIndex((page) => page.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reorderedPages = arrayMove(currentProject.pages, oldIndex, newIndex);
    const selectedPageId = currentProject.pages[selectedIndex]?.id;

    void reorderPages(reorderedPages.map((page) => page.id).filter((id): id is string => Boolean(id)));

    if (selectedPageId) {
      const nextSelectedIndex = reorderedPages.findIndex((page) => page.id === selectedPageId);
      if (nextSelectedIndex >= 0 && nextSelectedIndex !== selectedIndex) {
        setSelectedIndex(nextSelectedIndex);
      }
      return;
    }

    if (selectedIndex === oldIndex) {
      setSelectedIndex(newIndex);
    }
  }, [currentProject, reorderPages, selectedIndex, setSelectedIndex]);

  return {
    previewSortablePageIds,
    getPreviewSortablePageIndex,
    canReorderPreviewPages,
    handlePreviewThumbnailDragEnd,
  };
};
