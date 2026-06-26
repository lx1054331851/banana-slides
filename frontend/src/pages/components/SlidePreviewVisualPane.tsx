import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Maximize2, Minimize2, Trash2, X } from 'lucide-react';
import { cn } from '@/utils';
import type { PageAiRegionBounds } from '@/types';

type ImageVersionItem = {
  version_id: string;
  version_number: number;
  is_current: boolean;
  is_deleted: boolean;
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

type PendingRegionOverlay = {
  regionBounds: PageAiRegionBounds;
  indexLabel: number;
};

type PendingRegionComposer = {
  value: string;
  escStep: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onEsc: () => void;
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
  pendingRegionOverlay?: PendingRegionOverlay | null;
  pendingRegionComposer?: PendingRegionComposer | null;
  activePreviewReferenceId: string | null;
  selectionRect: SelectionRect | null;
  imageVersions: ImageVersionItem[];
  isUploadingPageImage?: boolean;
  onSelectionMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onSelectionMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onSelectionMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onFloatingFullscreenButtonMouseDown: React.MouseEventHandler<HTMLButtonElement>;
  onFloatingFullscreenButtonClick: React.MouseEventHandler<HTMLButtonElement>;
  onSwitchVersion: (versionId: string) => void;
  onDeleteVersion?: (versionId: string) => void;
  onUploadPageImage?: (file: File) => void | Promise<void>;
  onImageResolutionChange?: (size: { width: number; height: number } | null) => void;
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
  pendingRegionOverlay,
  pendingRegionComposer,
  activePreviewReferenceId,
  selectionRect,
  imageVersions,
  isUploadingPageImage = false,
  onSelectionMouseDown,
  onSelectionMouseMove,
  onSelectionMouseUp,
  onFloatingFullscreenButtonMouseDown,
  onFloatingFullscreenButtonClick,
  onSwitchVersion,
  onDeleteVersion,
  onUploadPageImage,
  onImageResolutionChange,
}) => {
  const visualPaneBodyRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCommentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const [availableSize, setAvailableSize] = useState<{ width: number; height: number } | null>(null);
  const [isPendingCommentShakeActive, setIsPendingCommentShakeActive] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      setImageAspectRatio(null);
      onImageResolutionChange?.(null);
    }
  }, [imageUrl, onImageResolutionChange]);

  useEffect(() => {
    if (!pendingRegionComposer) return;
    pendingCommentTextareaRef.current?.focus();
  }, [pendingRegionComposer]);

  useEffect(() => {
    if (pendingRegionComposer?.escStep !== 1) return;
    setIsPendingCommentShakeActive(true);
    const timer = window.setTimeout(() => setIsPendingCommentShakeActive(false), 360);
    return () => window.clearTimeout(timer);
  }, [pendingRegionComposer?.escStep]);

  useEffect(() => {
    if (isFullscreen) {
      setAvailableSize(null);
      return;
    }

    const node = visualPaneBodyRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const updateRatio = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setAvailableSize({ width, height });
      }
    };

    updateRatio();
    const observer = new ResizeObserver(updateRatio);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isFullscreen, imageVersions.length, selectedPageHasImage]);

  const previewCanvasStyle = useMemo(() => {
    if (isFullscreen) return undefined;

    const resolvedAspectRatio = selectedPageHasImage && imageAspectRatio
      ? `${imageAspectRatio}`
      : aspectRatioStyle;
    const maxWidth = availableSize?.width ?? undefined;
    const maxHeight = availableSize?.height ?? undefined;
    const parseAspectRatioValue = (value: React.CSSProperties['aspectRatio']): number | null => {
      if (typeof value !== 'string') return null;
      const normalized = value.replace(/\s+/g, '');
      const parts = normalized.includes('/') ? normalized.split('/') : normalized.includes(':') ? normalized.split(':') : [];
      if (parts.length !== 2) {
        const numeric = Number(normalized);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
      }
      const width = Number(parts[0]);
      const height = Number(parts[1]);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
      return width / height;
    };

    if (selectedPageHasImage && imageAspectRatio && maxWidth && maxHeight) {
      const fittedWidth = Math.min(maxWidth, maxHeight * imageAspectRatio);
      const fittedHeight = fittedWidth / imageAspectRatio;

      return {
        aspectRatio: resolvedAspectRatio,
        width: `${fittedWidth}px`,
        height: `${fittedHeight}px`,
        maxWidth: '100%',
        maxHeight: '100%',
        flexShrink: 0,
      } satisfies React.CSSProperties;
    }

    const targetAspectRatio = parseAspectRatioValue(resolvedAspectRatio);
    if (targetAspectRatio && maxWidth && maxHeight) {
      const fittedWidth = Math.min(maxWidth, maxHeight * targetAspectRatio);
      const fittedHeight = fittedWidth / targetAspectRatio;

      return {
        aspectRatio: resolvedAspectRatio,
        width: `${fittedWidth}px`,
        height: `${fittedHeight}px`,
        maxWidth: '100%',
        maxHeight: '100%',
        flexShrink: 0,
      } satisfies React.CSSProperties;
    }

    return {
      aspectRatio: resolvedAspectRatio,
      width: '100%',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
      flexShrink: 0,
    } satisfies React.CSSProperties;
  }, [aspectRatioStyle, availableSize, imageAspectRatio, isFullscreen, selectedPageHasImage]);

  const handleUploadInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onUploadPageImage) {
      void onUploadPageImage(file);
    }
    event.target.value = '';
  };

  const pendingComposerStyle = useMemo(() => {
    if (!pendingRegionOverlay) return null;
    const bounds = pendingRegionOverlay.regionBounds;
    const leftPercent = bounds.leftRatio * 100;
    const topPercent = bounds.topRatio * 100;
    const bottomPercent = (bounds.topRatio + bounds.heightRatio) * 100;
    const widthPercent = bounds.widthRatio * 100;
    const composerWidth = Math.min(Math.max(widthPercent, 60), 80);
    const preferredLeft = leftPercent;
    const maxLeft = 100 - composerWidth - 2;
    const left = Math.min(Math.max(2, preferredLeft), Math.max(2, maxLeft));
    const composerHeightPercent = 8.5;
    const gapPercent = 1.8;
    const canPlaceAbove = topPercent >= composerHeightPercent + gapPercent + 1;
    const top = canPlaceAbove
      ? Math.max(1, topPercent - composerHeightPercent - gapPercent)
      : Math.min(100 - composerHeightPercent - 1, bottomPercent + gapPercent);
    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${composerWidth}%`,
    } satisfies React.CSSProperties;
  }, [pendingRegionOverlay]);

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
                            onImageResolutionChange?.({ width: naturalWidth, height: naturalHeight });
                          }}
                          className="h-full w-full select-none object-contain"
                          draggable={false}
                          crossOrigin="anonymous"
                        />
                        <button
                          type="button"
                          aria-label={isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')}
                          title={isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            onFloatingFullscreenButtonMouseDown(event);
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            onFloatingFullscreenButtonClick(event);
                          }}
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
                        {pendingRegionOverlay && (
                          <div
                            className="pointer-events-none absolute"
                            style={{
                              left: `${pendingRegionOverlay.regionBounds.leftRatio * 100}%`,
                              top: `${pendingRegionOverlay.regionBounds.topRatio * 100}%`,
                              width: `${pendingRegionOverlay.regionBounds.widthRatio * 100}%`,
                              height: `${pendingRegionOverlay.regionBounds.heightRatio * 100}%`,
                            }}
                          >
                            <div className="h-full w-full rounded-[6px] border-2 border-dashed border-[#2f80ff] bg-[#2f80ff]/10 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]" />
                            <div className="absolute -bottom-2 -right-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#1677ff] px-1 text-xs font-semibold leading-none text-white shadow-sm">
                              {pendingRegionOverlay.indexLabel}
                            </div>
                          </div>
                        )}
                        {pendingRegionOverlay && pendingRegionComposer && pendingComposerStyle && (
                          <div
                            className={cn(
                              'absolute z-[240] overflow-hidden rounded-[28px] border border-[#e6e2d7] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
                              isPendingCommentShakeActive && 'animate-[pending-comment-shake_0.32s_ease-in-out]',
                            )}
                            style={pendingComposerStyle}
                          >
                            <div className="flex h-full items-start gap-2 px-3 py-2">
                              <textarea
                                ref={pendingCommentTextareaRef}
                                value={pendingRegionComposer.value}
                                onChange={(event) => pendingRegionComposer.onChange(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    pendingRegionComposer.onEsc();
                                    return;
                                  }
                                  if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    pendingRegionComposer.onSubmit();
                                  }
                                }}
                                rows={1}
                                placeholder=""
                                className="h-14 flex-1 resize-none overflow-y-auto bg-transparent py-0 text-[15px] leading-6 text-slate-800 outline-none placeholder:text-slate-300"
                              />
                              <div className="flex shrink-0 items-start gap-2">
                                <button
                                  type="button"
                                  onClick={pendingRegionComposer.onCancel}
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] border border-[#e9e5da] bg-white text-slate-700 shadow-sm transition-colors hover:bg-[#faf8f3]"
                                  aria-label="取消评论"
                                >
                                  <X size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={pendingRegionComposer.onSubmit}
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] bg-[#191c20] text-white shadow-[0_8px_18px_rgba(15,23,42,0.14)] transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-slate-300"
                                  disabled={!pendingRegionComposer.value.trim()}
                                  aria-label="发送评论"
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
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
                        {onDeleteVersion && imageVersions.some((version) => version.is_current) && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              const currentVersion = imageVersions.find((version) => version.is_current);
                              if (currentVersion) {
                                onDeleteVersion(currentVersion.version_id);
                              }
                            }}
                            aria-label={t('preview.historyDelete')}
                            title={t('preview.historyDelete')}
                            className="absolute bottom-2 right-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 shadow-[0_8px_20px_rgba(15,23,42,0.12)] transition-colors hover:bg-red-50 dark:border-red-900/60 dark:bg-background-secondary dark:hover:bg-background-hover"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-2xl bg-[#f7f5ef] px-6 text-center dark:bg-background-secondary">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-slate-500 dark:text-foreground-secondary">
                            {t('preview.notGenerated')}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-foreground-tertiary">
                            {t('preview.uploadPageImageHint')}
                          </div>
                        </div>
                        <input
                          ref={uploadInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleUploadInputChange}
                        />
                        <button
                          type="button"
                          onClick={() => uploadInputRef.current?.click()}
                          disabled={isUploadingPageImage || !onUploadPageImage}
                          className="inline-flex h-10 items-center justify-center rounded-full bg-banana-500 px-4 text-sm font-medium text-black shadow-[0_10px_24px_rgba(245,181,0,0.22)] transition hover:bg-banana-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isUploadingPageImage ? t('preview.uploadingPageImage') : t('preview.uploadPageImage')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {selectedPageHasImage && imageVersions.length > 0 && !isFullscreen && (
                  <div className="flex w-full flex-col items-center gap-2 px-2 pb-1">
                    <div className="text-xs font-medium tracking-[0.18em] text-[#9f8b5b] dark:text-foreground-tertiary">
                      {t('preview.historyVersions')} ({imageVersions.length})
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {[...imageVersions]
                        .sort((a, b) => a.version_number - b.version_number)
                        .map((version) => (
                          <div
                            key={version.version_id}
                            className="relative"
                          >
                            <button
                              type="button"
                              onClick={() => onSwitchVersion(version.version_id)}
                              aria-pressed={version.is_current}
                              aria-label={`${t('preview.version')} ${version.version_number}${version.is_current ? `，${t('preview.current')}` : ''}`}
                              title={`${t('preview.version')} ${version.version_number}${version.is_current ? ` (${t('preview.current')})` : ''}`}
                              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 ${
                                version.is_current
                                  ? 'border-banana-500 bg-banana-500 text-white shadow-[0_10px_24px_rgba(245,181,0,0.28)]'
                                  : 'border-[#d8caa6] bg-white text-[#6f5f3d] hover:border-banana-400 hover:text-banana-600 dark:border-border-primary dark:bg-background-primary dark:text-foreground-primary'
                              }`}
                            >
                              {version.version_number}
                            </button>
                          </div>
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
