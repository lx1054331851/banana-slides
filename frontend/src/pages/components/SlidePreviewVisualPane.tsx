import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { PageAiRegionBounds } from '@/types';

type ImageVersionItem = {
  version_id: string;
  version_number: number;
  is_current: boolean;
};

type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type RegionOverlayReference = {
  id: string;
  regionBounds: PageAiRegionBounds;
};

type SlidePreviewVisualPaneProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  selectedIndex: number;
  imageUrl: string;
  selectedPageHasImage: boolean;
  isFullscreen: boolean;
  isDraggingFloatingFullscreenButton: boolean;
  floatingFullscreenButtonPosition: { x: number; y: number };
  aspectRatioStyle: React.CSSProperties['aspectRatio'];
  previewContainerRef: React.RefObject<HTMLDivElement>;
  imageRef: React.RefObject<HTMLImageElement>;
  regionOverlayReferences: RegionOverlayReference[];
  activePreviewReferenceId: string | null;
  selectionRect: SelectionRect | null;
  imageVersions: ImageVersionItem[];
  onSelectionMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onSelectionMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onSelectionMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onFloatingFullscreenButtonMouseDown: React.MouseEventHandler<HTMLButtonElement>;
  onFloatingFullscreenButtonClick: React.MouseEventHandler<HTMLButtonElement>;
  onSwitchVersion: (versionId: string) => void;
};

export const SlidePreviewVisualPane: React.FC<SlidePreviewVisualPaneProps> = ({
  t,
  selectedIndex,
  imageUrl,
  selectedPageHasImage,
  isFullscreen,
  isDraggingFloatingFullscreenButton,
  floatingFullscreenButtonPosition,
  aspectRatioStyle,
  previewContainerRef,
  imageRef,
  regionOverlayReferences,
  activePreviewReferenceId,
  selectionRect,
  imageVersions,
  onSelectionMouseDown,
  onSelectionMouseMove,
  onSelectionMouseUp,
  onFloatingFullscreenButtonMouseDown,
  onFloatingFullscreenButtonClick,
  onSwitchVersion,
}) => {
  const visualPaneBodyRef = useRef<HTMLDivElement | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const [availableAspectRatio, setAvailableAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    setImageAspectRatio(null);
  }, [imageUrl]);

  useEffect(() => {
    if (isFullscreen) {
      setAvailableAspectRatio(null);
      return;
    }

    const node = visualPaneBodyRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const updateRatio = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setAvailableAspectRatio(width / height);
      }
    };

    updateRatio();
    const observer = new ResizeObserver(updateRatio);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isFullscreen, imageVersions.length, selectedPageHasImage]);

  const fitByWidth = useMemo(() => {
    if (!selectedPageHasImage) return true;
    if (!imageAspectRatio || !availableAspectRatio) return true;
    return imageAspectRatio >= availableAspectRatio;
  }, [availableAspectRatio, imageAspectRatio, selectedPageHasImage]);

  const previewCanvasStyle = useMemo(() => {
    if (isFullscreen) return undefined;

    return {
      aspectRatio: aspectRatioStyle,
      width: fitByWidth ? '100%' : 'auto',
      height: fitByWidth ? 'auto' : '100%',
      maxWidth: '100%',
      maxHeight: '100%',
      flexShrink: 0,
    } satisfies React.CSSProperties;
  }, [aspectRatioStyle, fitByWidth, isFullscreen]);

  return (
    <section
      data-testid="preview-visual-pane"
      className="min-w-0 overflow-hidden"
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-hidden px-2 pb-2 pt-1 md:px-3 md:pb-3 md:pt-2">
          <div ref={visualPaneBodyRef} className="flex h-full min-h-[320px] items-center justify-stretch overflow-hidden">
            <div className="h-full w-full overflow-hidden">
              <div className={`flex ${selectedPageHasImage ? 'h-full min-h-0 flex-col items-center justify-center gap-4' : 'h-full min-h-0'}`}>
                <div className="flex min-h-0 flex-1 items-center justify-center self-stretch overflow-hidden">
                  <div
                    ref={previewContainerRef}
                    className={`relative overflow-hidden touch-manipulation ${isFullscreen
                      ? 'h-screen w-screen max-h-none max-w-none rounded-none bg-black shadow-none'
                      : 'rounded-2xl border border-[#eadfbf] bg-white dark:border-border-primary dark:bg-background-primary'
                      }`}
                    style={previewCanvasStyle}
                    onMouseDown={selectedPageHasImage ? onSelectionMouseDown : undefined}
                    onMouseMove={selectedPageHasImage ? onSelectionMouseMove : undefined}
                    onMouseUp={selectedPageHasImage ? onSelectionMouseUp : undefined}
                    onMouseLeave={selectedPageHasImage ? onSelectionMouseUp : undefined}
                  >
                    {selectedPageHasImage ? (
                      <>
                        <img
                          ref={imageRef}
                          src={imageUrl}
                          alt={`Slide ${selectedIndex + 1}`}
                          onLoad={(event) => {
                            const { naturalWidth, naturalHeight } = event.currentTarget;
                            if (!naturalWidth || !naturalHeight) return;
                            setImageAspectRatio(naturalWidth / naturalHeight);
                          }}
                          className={`h-full w-full select-none ${isFullscreen ? 'object-contain' : 'object-contain'}`}
                          draggable={false}
                          crossOrigin="anonymous"
                        />
                        <button
                          type="button"
                          aria-label={isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')}
                          title={isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')}
                          onMouseDown={onFloatingFullscreenButtonMouseDown}
                          onClick={onFloatingFullscreenButtonClick}
                          className={`absolute z-20 inline-flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-[0_10px_28px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:border-banana-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 ${isDraggingFloatingFullscreenButton ? 'cursor-grabbing' : 'cursor-grab'}`}
                          style={{
                            left: `${floatingFullscreenButtonPosition.x * 100}%`,
                            top: `${floatingFullscreenButtonPosition.y * 100}%`,
                          }}
                        >
                          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                        {regionOverlayReferences.map((reference, index) => {
                          const isActive = activePreviewReferenceId === reference.id;
                          const bounds = reference.regionBounds;
                          return (
                            <div
                              key={reference.id}
                              className="pointer-events-none absolute"
                              style={{
                                left: `${bounds.leftRatio * 100}%`,
                                top: `${bounds.topRatio * 100}%`,
                                width: `${bounds.widthRatio * 100}%`,
                                height: `${bounds.heightRatio * 100}%`,
                              }}
                            >
                              <div className={`h-full w-full rounded-[6px] border-2 border-dashed bg-[#2f80ff]/10 shadow-[0_0_0_1px_rgba(255,255,255,0.9)] ${isActive ? 'border-[#005eea]' : 'border-[#2f80ff]'}`} />
                              <div className="absolute -bottom-2 -right-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#1677ff] px-1 text-xs font-semibold leading-none text-white shadow-sm">
                                {index + 1}
                              </div>
                            </div>
                          );
                        })}
                        {selectionRect && (
                          <div
                            className="pointer-events-none absolute"
                            style={{
                              left: selectionRect.left,
                              top: selectionRect.top,
                              width: selectionRect.width,
                              height: selectionRect.height,
                            }}
                          >
                            <div className="h-full w-full rounded-[6px] border-2 border-dashed border-[#2f80ff] bg-[#2f80ff]/10 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]" />
                            <div className="absolute -bottom-2 -right-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#1677ff] px-1 text-xs font-semibold leading-none text-white shadow-sm">
                              {regionOverlayReferences.length + 1}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-[#f7f5ef] text-sm text-slate-400 dark:bg-background-secondary dark:text-foreground-tertiary">
                        尚未生成图片
                      </div>
                    )}
                  </div>
                </div>
                {selectedPageHasImage && imageVersions.length > 1 && !isFullscreen && (
                  <div className="flex w-full flex-col items-center gap-2 px-2 pb-1">
                    <div className="text-xs font-medium tracking-[0.18em] text-[#9f8b5b] dark:text-foreground-tertiary">
                      {t('preview.historyVersions')} ({imageVersions.length})
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {[...imageVersions]
                        .sort((a, b) => a.version_number - b.version_number)
                        .map((version, index) => (
                          <button
                            key={version.version_id}
                            type="button"
                            onClick={() => onSwitchVersion(version.version_id)}
                            aria-pressed={version.is_current}
                            aria-label={`${t('preview.version')} ${index + 1}${version.is_current ? `，${t('preview.current')}` : ''}`}
                            title={`${t('preview.version')} ${index + 1}${version.is_current ? ` (${t('preview.current')})` : ''}`}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 ${
                              version.is_current
                                ? 'border-banana-500 bg-banana-500 text-white shadow-[0_10px_24px_rgba(245,181,0,0.28)]'
                                : 'border-[#d8caa6] bg-white text-[#6f5f3d] hover:border-banana-400 hover:text-banana-600 dark:border-border-primary dark:bg-background-primary dark:text-foreground-primary'
                              }`}
                          >
                            {index + 1}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
