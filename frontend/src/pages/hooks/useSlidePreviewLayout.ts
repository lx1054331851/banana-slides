import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  FLOATING_FULLSCREEN_BUTTON_SIZE,
  PREVIEW_EDITOR_CANVAS_MIN_HEIGHT,
  PREVIEW_EDITOR_COLLAPSED_STORAGE_KEY,
  PREVIEW_EDITOR_MIN_WIDTH,
  PREVIEW_EDITOR_VERTICAL_SPLIT_DEFAULT_RATIO,
  PREVIEW_EDITOR_VERTICAL_SPLIT_DIVIDER_PX,
  PREVIEW_EDITOR_VERTICAL_SPLIT_STORAGE_KEY,
  PREVIEW_EDITOR_WORKBENCH_MIN_HEIGHT,
  PREVIEW_SPLIT_DEFAULT_RATIO,
  PREVIEW_SPLIT_DIVIDER_PX,
  PREVIEW_SPLIT_STORAGE_KEY,
  PREVIEW_VISUAL_MIN_WIDTH,
} from '../SlidePreview.constants';

type UseSlidePreviewLayoutParams = {
  currentProjectId?: string;
  selectedIndex: number;
  sidebarDefaultWidth: number;
  sidebarGridThumbMinPx: number;
  sidebarGridThumbMaxPx: number;
  sidebarGridThumbDefaultPx: number;
};

export const useSlidePreviewLayout = ({
  currentProjectId,
  selectedIndex,
  sidebarDefaultWidth,
  sidebarGridThumbMinPx,
  sidebarGridThumbMaxPx,
  sidebarGridThumbDefaultPx,
}: UseSlidePreviewLayoutParams) => {
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === 'undefined') return 1200;
    return window.innerWidth;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarViewMode, setSidebarViewMode] = useState<'list' | 'grid'>(() => {
    try {
      const stored = localStorage.getItem('previewSidebarViewMode');
      return stored === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });
  const [sidebarGridThumbMaxWidthPx, setSidebarGridThumbMaxWidthPx] = useState(() => {
    try {
      const stored = Number(localStorage.getItem('previewSidebarGridThumbMaxWidthPx'));
      if (Number.isFinite(stored) && stored >= sidebarGridThumbMinPx && stored <= sidebarGridThumbMaxPx) {
        return stored;
      }
    } catch {
      // ignore storage errors
    }
    return sidebarGridThumbDefaultPx;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarWidthPxExpanded, setSidebarWidthPxExpanded] = useState(sidebarDefaultWidth);
  const sidebarResizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarResizeRafRef = useRef<number | null>(null);
  const sidebarResizePendingRef = useRef<number | null>(null);
  const [previewSplitRatio, setPreviewSplitRatio] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(PREVIEW_SPLIT_STORAGE_KEY));
      if (Number.isFinite(stored) && stored > 0.2 && stored < 0.8) {
        return stored;
      }
    } catch {
      // ignore storage errors
    }
    return PREVIEW_SPLIT_DEFAULT_RATIO;
  });
  const [previewSplitContainerWidth, setPreviewSplitContainerWidth] = useState(0);
  const [isResizingPreviewSplit, setIsResizingPreviewSplit] = useState(false);
  const previewSplitContainerRef = useRef<HTMLDivElement | null>(null);
  const previewSplitResizeRef = useRef<{
    startX: number;
    startWidth: number;
    availableWidth: number;
    visualMinWidth: number;
    editorMinWidth: number;
  } | null>(null);
  const [isEditorPaneCollapsed, setIsEditorPaneCollapsed] = useState(() => {
    try {
      return localStorage.getItem(PREVIEW_EDITOR_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [editorVerticalSplitRatio, setEditorVerticalSplitRatio] = useState(() => {
    if (typeof window === 'undefined') return PREVIEW_EDITOR_VERTICAL_SPLIT_DEFAULT_RATIO;
    const stored = Number(window.localStorage.getItem(PREVIEW_EDITOR_VERTICAL_SPLIT_STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0.15 && stored < 0.9) {
      return stored;
    }
    return PREVIEW_EDITOR_VERTICAL_SPLIT_DEFAULT_RATIO;
  });
  const [editorVerticalSplitContainerHeight, setEditorVerticalSplitContainerHeight] = useState(0);
  const [isResizingEditorVerticalSplit, setIsResizingEditorVerticalSplit] = useState(false);
  const editorVerticalSplitContainerRef = useRef<HTMLDivElement | null>(null);
  const editorVerticalSplitResizeRef = useRef<{ startY: number; startHeight: number; availableHeight: number } | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const floatingFullscreenDragRef = useRef<{ moved: boolean } | null>(null);
  const [isDraggingFloatingFullscreenButton, setIsDraggingFloatingFullscreenButton] = useState(false);
  const suppressFloatingFullscreenClickRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [floatingFullscreenButtonPosition, setFloatingFullscreenButtonPosition] = useState({ x: 0.92, y: 0.1 });

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      setIsMobileView(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobileView && isSidebarCollapsed) {
      setSidebarWidthPxExpanded(sidebarDefaultWidth);
      setIsSidebarCollapsed(false);
    }
  }, [isMobileView, isSidebarCollapsed, sidebarDefaultWidth]);

  const sidebarCollapsedWidth = 72;
  const sidebarMinWidth = sidebarCollapsedWidth;
  const sidebarMaxWidth = Math.round(viewportWidth * (2 / 3));
  const sidebarWidthPx = isSidebarCollapsed ? sidebarCollapsedWidth : sidebarWidthPxExpanded;

  useEffect(() => {
    try {
      localStorage.setItem('previewSidebarViewMode', sidebarViewMode);
    } catch {
      // ignore storage errors
    }
  }, [sidebarViewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('previewSidebarGridThumbMaxWidthPx', String(sidebarGridThumbMaxWidthPx));
    } catch {
      // ignore storage errors
    }
  }, [sidebarGridThumbMaxWidthPx]);

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_SPLIT_STORAGE_KEY, String(previewSplitRatio));
    } catch {
      // ignore storage errors
    }
  }, [previewSplitRatio]);

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_EDITOR_COLLAPSED_STORAGE_KEY, isEditorPaneCollapsed ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [isEditorPaneCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_EDITOR_VERTICAL_SPLIT_STORAGE_KEY, String(editorVerticalSplitRatio));
    } catch {
      // ignore storage errors
    }
  }, [editorVerticalSplitRatio]);

  useEffect(() => {
    if (!viewportWidth) return;
    setSidebarWidthPxExpanded((prev) =>
      Math.min(Math.max(prev, sidebarMinWidth), sidebarMaxWidth)
    );
  }, [viewportWidth, sidebarMinWidth, sidebarMaxWidth]);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMove = (e: MouseEvent) => {
      if (!sidebarResizeStartRef.current) return;
      const delta = e.clientX - sidebarResizeStartRef.current.startX;
      const nextWidth = sidebarResizeStartRef.current.startWidth + delta;
      sidebarResizePendingRef.current = nextWidth;
      if (sidebarResizeRafRef.current !== null) return;
      sidebarResizeRafRef.current = window.requestAnimationFrame(() => {
        sidebarResizeRafRef.current = null;
        const pendingWidth = sidebarResizePendingRef.current;
        sidebarResizePendingRef.current = null;
        if (pendingWidth === null) return;
        const clampedWidth = Math.min(
          Math.max(pendingWidth, sidebarMinWidth),
          sidebarMaxWidth
        );
        if (clampedWidth <= sidebarCollapsedWidth) {
          if (!isSidebarCollapsed) {
            setIsSidebarCollapsed(true);
          }
        } else if (isSidebarCollapsed) {
          setIsSidebarCollapsed(false);
        }
        setSidebarWidthPxExpanded((prev) => (prev === clampedWidth ? prev : clampedWidth));
      });
    };
    const handleUp = () => {
      setIsResizingSidebar(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
      if (sidebarResizeRafRef.current !== null) {
        cancelAnimationFrame(sidebarResizeRafRef.current);
        sidebarResizeRafRef.current = null;
      }
      sidebarResizePendingRef.current = null;
    };
  }, [
    isResizingSidebar,
    sidebarMinWidth,
    sidebarMaxWidth,
    isSidebarCollapsed,
  ]);

  const handleSidebarResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    sidebarResizeStartRef.current = {
      startX: e.clientX,
      startWidth: isSidebarCollapsed ? sidebarCollapsedWidth : sidebarWidthPxExpanded,
    };
    setIsResizingSidebar(true);
  };

  useEffect(() => {
    const node = previewSplitContainerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => {
      setPreviewSplitContainerWidth(node.getBoundingClientRect().width);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sidebarWidthPx, isMobileView, currentProjectId]);

  const resolvePreviewSplitMinWidths = useCallback((availableWidth: number) => {
    const desiredTotalMinWidth = PREVIEW_VISUAL_MIN_WIDTH + PREVIEW_EDITOR_MIN_WIDTH;
    if (availableWidth >= desiredTotalMinWidth) {
      return {
        visualMinWidth: PREVIEW_VISUAL_MIN_WIDTH,
        editorMinWidth: PREVIEW_EDITOR_MIN_WIDTH,
      };
    }
    const visualRatio = PREVIEW_VISUAL_MIN_WIDTH / desiredTotalMinWidth;
    const visualMinWidth = Math.max(0, Math.floor(availableWidth * visualRatio));
    const editorMinWidth = Math.max(0, availableWidth - visualMinWidth);
    return { visualMinWidth, editorMinWidth };
  }, []);

  const resolvedPreviewSplitRatio = useMemo(() => {
    if (isMobileView) return PREVIEW_SPLIT_DEFAULT_RATIO;
    if (!previewSplitContainerWidth) return previewSplitRatio;

    const availableWidth = Math.max(1, previewSplitContainerWidth - PREVIEW_SPLIT_DIVIDER_PX);
    const { visualMinWidth, editorMinWidth } = resolvePreviewSplitMinWidths(availableWidth);
    const minRatio = visualMinWidth / availableWidth;
    const maxRatio = (availableWidth - editorMinWidth) / availableWidth;
    const clampedMin = Math.min(Math.max(minRatio, 0), 1);
    const clampedMax = Math.max(clampedMin, Math.min(maxRatio, 1));
    return Math.min(Math.max(previewSplitRatio, clampedMin), clampedMax);
  }, [isMobileView, previewSplitContainerWidth, previewSplitRatio, resolvePreviewSplitMinWidths]);

  const resolvedPreviewSplitMinWidths = useMemo(() => {
    if (isMobileView || !previewSplitContainerWidth) {
      return {
        visualMinWidth: PREVIEW_VISUAL_MIN_WIDTH,
        editorMinWidth: PREVIEW_EDITOR_MIN_WIDTH,
      };
    }
    const availableWidth = Math.max(1, previewSplitContainerWidth - PREVIEW_SPLIT_DIVIDER_PX);
    return resolvePreviewSplitMinWidths(availableWidth);
  }, [isMobileView, previewSplitContainerWidth, resolvePreviewSplitMinWidths]);

  useEffect(() => {
    if (!isResizingPreviewSplit) return;

    const handleMove = (event: MouseEvent) => {
      const resizeState = previewSplitResizeRef.current;
      if (!resizeState) return;
      const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);
      const clampedWidth = Math.min(
        Math.max(nextWidth, resizeState.visualMinWidth),
        Math.max(resizeState.visualMinWidth, resizeState.availableWidth - resizeState.editorMinWidth)
      );
      setPreviewSplitRatio(clampedWidth / resizeState.availableWidth);
    };

    const handleUp = () => {
      setIsResizingPreviewSplit(false);
      previewSplitResizeRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
    };
  }, [isResizingPreviewSplit]);

  const handlePreviewSplitResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isMobileView || !previewSplitContainerRef.current) return;
    event.preventDefault();
    const containerWidth = previewSplitContainerRef.current.getBoundingClientRect().width;
    const availableWidth = Math.max(1, containerWidth - PREVIEW_SPLIT_DIVIDER_PX);
    const { visualMinWidth, editorMinWidth } = resolvePreviewSplitMinWidths(availableWidth);
    previewSplitResizeRef.current = {
      startX: event.clientX,
      startWidth: availableWidth * resolvedPreviewSplitRatio,
      availableWidth,
      visualMinWidth,
      editorMinWidth,
    };
    setIsResizingPreviewSplit(true);
  }, [isMobileView, resolvedPreviewSplitRatio, resolvePreviewSplitMinWidths]);

  useEffect(() => {
    const node = editorVerticalSplitContainerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const updateHeight = () => {
      setEditorVerticalSplitContainerHeight(node.getBoundingClientRect().height);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isMobileView, currentProjectId, selectedIndex]);

  const resolvedEditorVerticalSplitRatio = useMemo(() => {
    if (isMobileView) return PREVIEW_EDITOR_VERTICAL_SPLIT_DEFAULT_RATIO;
    if (!editorVerticalSplitContainerHeight) return editorVerticalSplitRatio;

    const availableHeight = Math.max(1, editorVerticalSplitContainerHeight - PREVIEW_EDITOR_VERTICAL_SPLIT_DIVIDER_PX);
    const minRatio = PREVIEW_EDITOR_CANVAS_MIN_HEIGHT / availableHeight;
    const maxRatio = (availableHeight - PREVIEW_EDITOR_WORKBENCH_MIN_HEIGHT) / availableHeight;
    const clampedMin = Math.min(Math.max(minRatio, 0.2), 0.85);
    const clampedMax = Math.max(clampedMin, Math.min(maxRatio, 0.85));
    return Math.min(Math.max(editorVerticalSplitRatio, clampedMin), clampedMax);
  }, [isMobileView, editorVerticalSplitContainerHeight, editorVerticalSplitRatio]);

  useEffect(() => {
    if (!isResizingEditorVerticalSplit) return;

    const handleMove = (event: MouseEvent) => {
      const resizeState = editorVerticalSplitResizeRef.current;
      if (!resizeState) return;
      const nextHeight = resizeState.startHeight + (event.clientY - resizeState.startY);
      const clampedHeight = Math.min(
        Math.max(nextHeight, PREVIEW_EDITOR_CANVAS_MIN_HEIGHT),
        Math.max(PREVIEW_EDITOR_CANVAS_MIN_HEIGHT, resizeState.availableHeight - PREVIEW_EDITOR_WORKBENCH_MIN_HEIGHT)
      );
      setEditorVerticalSplitRatio(clampedHeight / resizeState.availableHeight);
    };

    const handleUp = () => {
      setIsResizingEditorVerticalSplit(false);
      editorVerticalSplitResizeRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
    };
  }, [isResizingEditorVerticalSplit]);

  const handleEditorVerticalSplitResizeStart = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (isMobileView || !editorVerticalSplitContainerRef.current) return;
    event.preventDefault();
    const containerHeight = editorVerticalSplitContainerRef.current.getBoundingClientRect().height;
    const availableHeight = Math.max(1, containerHeight - PREVIEW_EDITOR_VERTICAL_SPLIT_DIVIDER_PX);
    editorVerticalSplitResizeRef.current = {
      startY: event.clientY,
      startHeight: availableHeight * resolvedEditorVerticalSplitRatio,
      availableHeight,
    };
    setIsResizingEditorVerticalSplit(true);
  }, [isMobileView, resolvedEditorVerticalSplitRatio]);

  const handleLinkedSplitResizeStart = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (isMobileView || !previewSplitContainerRef.current || !editorVerticalSplitContainerRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const previewContainerWidth = previewSplitContainerRef.current.getBoundingClientRect().width;
    const previewAvailableWidth = Math.max(1, previewContainerWidth - PREVIEW_SPLIT_DIVIDER_PX);
    const { visualMinWidth, editorMinWidth } = resolvePreviewSplitMinWidths(previewAvailableWidth);
    previewSplitResizeRef.current = {
      startX: event.clientX,
      startWidth: previewAvailableWidth * resolvedPreviewSplitRatio,
      availableWidth: previewAvailableWidth,
      visualMinWidth,
      editorMinWidth,
    };

    const editorContainerHeight = editorVerticalSplitContainerRef.current.getBoundingClientRect().height;
    const editorAvailableHeight = Math.max(1, editorContainerHeight - PREVIEW_EDITOR_VERTICAL_SPLIT_DIVIDER_PX);
    editorVerticalSplitResizeRef.current = {
      startY: event.clientY,
      startHeight: editorAvailableHeight * resolvedEditorVerticalSplitRatio,
      availableHeight: editorAvailableHeight,
    };

    setIsResizingPreviewSplit(true);
    setIsResizingEditorVerticalSplit(true);
  }, [isMobileView, resolvedPreviewSplitRatio, resolvedEditorVerticalSplitRatio, resolvePreviewSplitMinWidths]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement ||
        null;
      setIsFullscreen(fullscreenElement === previewContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    document.addEventListener('msfullscreenchange', handleFullscreenChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange as EventListener);
    };
  }, []);

  const requestFullscreen = useCallback(async () => {
    const target = previewContainerRef.current;
    if (!target) return;
    const request =
      target.requestFullscreen ||
      (target as any).webkitRequestFullscreen ||
      (target as any).msRequestFullscreen;
    if (!request) return;
    try {
      await request.call(target);
    } catch (error) {
      console.warn('Failed to enter fullscreen:', error);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const exit =
      document.exitFullscreen ||
      (document as any).webkitExitFullscreen ||
      (document as any).msExitFullscreen;
    if (!exit) return;
    try {
      await exit.call(document);
    } catch (error) {
      console.warn('Failed to exit fullscreen:', error);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    const fullscreenElement =
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).msFullscreenElement ||
      null;
    if (fullscreenElement) {
      void exitFullscreen();
    } else {
      void requestFullscreen();
    }
  }, [exitFullscreen, requestFullscreen]);

  useEffect(() => {
    if (!isDraggingFloatingFullscreenButton) return;

    const handleMove = (event: MouseEvent) => {
      const container = previewContainerRef.current;
      const dragState = floatingFullscreenDragRef.current;
      if (!container || !dragState) return;

      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const nextX = (event.clientX - rect.left) / rect.width;
      const nextY = (event.clientY - rect.top) / rect.height;
      const xPadding = FLOATING_FULLSCREEN_BUTTON_SIZE / (2 * rect.width);
      const yPadding = FLOATING_FULLSCREEN_BUTTON_SIZE / (2 * rect.height);

      const clampedX = Math.min(Math.max(nextX, xPadding), 1 - xPadding);
      const clampedY = Math.min(Math.max(nextY, yPadding), 1 - yPadding);

      if (!dragState.moved) {
        dragState.moved =
          Math.abs(event.movementX) > 1 ||
          Math.abs(event.movementY) > 1;
      }

      setFloatingFullscreenButtonPosition({ x: clampedX, y: clampedY });
    };

    const handleUp = () => {
      if (floatingFullscreenDragRef.current?.moved) {
        suppressFloatingFullscreenClickRef.current = true;
      }
      floatingFullscreenDragRef.current = null;
      setIsDraggingFloatingFullscreenButton(false);
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
    };
  }, [isDraggingFloatingFullscreenButton]);

  const handleFloatingFullscreenButtonMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    floatingFullscreenDragRef.current = { moved: false };
    setIsDraggingFloatingFullscreenButton(true);
  }, []);

  const handleFloatingFullscreenButtonClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (suppressFloatingFullscreenClickRef.current) {
      suppressFloatingFullscreenClickRef.current = false;
      return;
    }
    toggleFullscreen();
  }, [toggleFullscreen]);

  return {
    isMobileView,
    viewportWidth,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    sidebarViewMode,
    setSidebarViewMode,
    sidebarGridThumbMaxWidthPx,
    setSidebarGridThumbMaxWidthPx,
    isResizingSidebar,
    sidebarWidthPxExpanded,
    setSidebarWidthPxExpanded,
    sidebarWidthPx,
    handleSidebarResizeStart,
    previewSplitContainerRef,
    resolvedPreviewSplitRatio,
    resolvedPreviewSplitMinWidths,
    isResizingPreviewSplit,
    handlePreviewSplitResizeStart,
    isEditorPaneCollapsed,
    setIsEditorPaneCollapsed,
    editorVerticalSplitContainerRef,
    resolvedEditorVerticalSplitRatio,
    isResizingEditorVerticalSplit,
    handleEditorVerticalSplitResizeStart,
    handleLinkedSplitResizeStart,
    previewContainerRef,
    isFullscreen,
    floatingFullscreenButtonPosition,
    isDraggingFloatingFullscreenButton,
    handleFloatingFullscreenButtonMouseDown,
    handleFloatingFullscreenButtonClick,
  };
};
