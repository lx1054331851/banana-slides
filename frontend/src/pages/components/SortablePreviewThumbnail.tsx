import React from 'react';
import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export const SortablePreviewThumbnail: React.FC<{
  id: string;
  itemIndex: number;
  getItemIndex: (id: string) => number;
  layoutMode?: 'vertical' | 'grid';
  className?: string;
  children: React.ReactNode;
}> = ({ id, itemIndex, getItemIndex, layoutMode = 'vertical', className, children }) => {
  const { active, over } = useDndContext();
  const { attributes, setNodeRef, transform, transition, isDragging, listeners } = useSortable({ id });

  const activeId = active?.id ? String(active.id) : '';
  const overId = over?.id ? String(over.id) : '';
  const activeIndex = activeId ? getItemIndex(activeId) : -1;
  const isDropTarget = !isDragging && !!overId && overId === id && activeId !== id && activeIndex >= 0;
  const activeRect = active?.rect.current.translated || active?.rect.current.initial;
  const overRect = over?.rect || null;

  let dropIndicator: 'none' | 'above' | 'below' | 'left' | 'right' = 'none';

  if (isDropTarget) {
    if (layoutMode === 'grid' && activeRect && overRect) {
      const activeCenterX = activeRect.left + activeRect.width / 2;
      const activeCenterY = activeRect.top + activeRect.height / 2;
      const overCenterX = overRect.left + overRect.width / 2;
      const overCenterY = overRect.top + overRect.height / 2;
      const deltaX = activeCenterX - overCenterX;
      const deltaY = activeCenterY - overCenterY;

      dropIndicator = Math.abs(deltaX) > Math.abs(deltaY)
        ? (deltaX < 0 ? 'left' : 'right')
        : (deltaY < 0 ? 'above' : 'below');
    } else {
      dropIndicator = activeIndex > itemIndex ? 'above' : 'below';
    }
  }

  const showDropLineAbove = dropIndicator === 'above';
  const showDropLineBelow = dropIndicator === 'below';
  const showDropLineLeft = dropIndicator === 'left';
  const showDropLineRight = dropIndicator === 'right';

  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition: isDragging ? undefined : transition,
    zIndex: isDragging ? 30 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className || ''} select-none cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-90' : ''}`}
      {...attributes}
      {...listeners}
    >
      {showDropLineAbove && (
        <div className="pointer-events-none absolute -top-2 left-2 right-2 z-40 flex items-center">
          <span className="h-2.5 w-2.5 rounded-full bg-banana-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_2px_rgba(17,24,39,0.9)]" />
          <span className="h-0.5 flex-1 rounded-full bg-banana-500 shadow-[0_0_10px_rgba(245,158,11,0.45)]" />
        </div>
      )}
      {showDropLineBelow && (
        <div className="pointer-events-none absolute -bottom-2 left-2 right-2 z-40 flex items-center">
          <span className="h-2.5 w-2.5 rounded-full bg-banana-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_2px_rgba(17,24,39,0.9)]" />
          <span className="h-0.5 flex-1 rounded-full bg-banana-500 shadow-[0_0_10px_rgba(245,158,11,0.45)]" />
        </div>
      )}
      {showDropLineLeft && (
        <div className="pointer-events-none absolute -left-2 top-2 bottom-2 z-40 flex flex-col items-center">
          <span className="h-2.5 w-2.5 rounded-full bg-banana-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_2px_rgba(17,24,39,0.9)]" />
          <span className="w-0.5 flex-1 rounded-full bg-banana-500 shadow-[0_0_10px_rgba(245,158,11,0.45)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-banana-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_2px_rgba(17,24,39,0.9)]" />
        </div>
      )}
      {showDropLineRight && (
        <div className="pointer-events-none absolute -right-2 top-2 bottom-2 z-40 flex flex-col items-center">
          <span className="h-2.5 w-2.5 rounded-full bg-banana-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_2px_rgba(17,24,39,0.9)]" />
          <span className="w-0.5 flex-1 rounded-full bg-banana-500 shadow-[0_0_10px_rgba(245,158,11,0.45)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-banana-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_2px_rgba(17,24,39,0.9)]" />
        </div>
      )}
      {children}
    </div>
  );
};
