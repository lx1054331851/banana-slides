import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils';

type ImageLightboxItem = {
  src: string;
  title?: string;
};

interface ImageLightboxProps {
  isOpen: boolean;
  src?: string;
  title?: string;
  items?: ImageLightboxItem[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ isOpen, src, title, items, initialIndex = 0, onClose }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [index, setIndex] = useState(0);

  const effectiveItems = useMemo<ImageLightboxItem[]>(() => {
    const list = (items || []).filter((it) => Boolean(it?.src));
    if (list.length) return list;
    if (src) return [{ src, title }];
    return [];
  }, [items, src, title]);

  const hasGallery = effectiveItems.length > 1;
  const current = effectiveItems[index] || effectiveItems[0];
  const currentSrc = current?.src || '';
  const currentTitle = current?.title || title;

  useEffect(() => {
    if (!isOpen) {
      setIsAnimating(false);
      setIsLoaded(false);
      return;
    }

    const safeIndex = Math.max(0, Math.min(initialIndex, Math.max(effectiveItems.length - 1, 0)));
    setIndex(safeIndex);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!hasGallery) return;
      if (e.key === 'ArrowLeft') setIndex((prev) => (prev - 1 + effectiveItems.length) % effectiveItems.length);
      if (e.key === 'ArrowRight') setIndex((prev) => (prev + 1) % effectiveItems.length);
    };
    document.addEventListener('keydown', onKeyDown);

    requestAnimationFrame(() => setIsAnimating(true));

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [effectiveItems.length, hasGallery, initialIndex, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoaded(false);
  }, [index, isOpen]);

  const downloadName = useMemo(() => {
    const safe = (currentTitle || 'preview').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
    return `${safe}.png`;
  }, [currentTitle]);

  if (!isOpen) return null;
  if (!currentSrc) return null;

  const goPrev = () => setIndex((prev) => (prev - 1 + effectiveItems.length) % effectiveItems.length);
  const goNext = () => setIndex((prev) => (prev + 1) % effectiveItems.length);

  const node = (
    <div
      className="fixed inset-0 z-[60] overflow-hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-hidden={false}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-200',
          'bg-black/70',
          'backdrop-blur-sm',
          isAnimating ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Center */}
      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={currentTitle || 'image preview'}
          className={cn(
            'relative w-full max-w-[min(1600px,98vw)] max-h-[92vh]',
            'rounded-2xl overflow-hidden',
            'bg-white/5 dark:bg-white/5',
            'border border-white/15',
            'shadow-[0_20px_80px_rgba(0,0,0,0.55)]',
            'transition-all duration-200 ease-out',
            isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-b from-black/40 to-black/10">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{currentTitle || '预览图'}</div>
              <div className="text-xs text-white/70">
                点击空白处或按 Esc 关闭{hasGallery ? '，←/→ 切换' : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasGallery ? (
                <div className="text-xs font-semibold px-2 py-1 rounded-md bg-white/10 text-white border border-white/15">
                  {index + 1}/{effectiveItems.length}
                </div>
              ) : null}
              <a
                href={currentSrc}
                download={downloadName}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-colors"
                title="下载/在新标签页打开"
              >
                <Download size={14} />
                下载
              </a>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-colors"
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Image area */}
          <div className="relative bg-black/30">
            {!isLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 text-white/80">
                  <span className="h-4 w-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                  <span className="text-sm">加载中…</span>
                </div>
              </div>
            ) : null}
            <img
              src={currentSrc}
              alt={currentTitle || 'preview'}
              onLoad={() => setIsLoaded(true)}
              onError={() => setIsLoaded(true)}
              className={cn(
                'w-full max-h-[calc(92vh-64px)] object-contain block',
                'transition-opacity duration-200',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
              draggable={false}
            />

            {hasGallery ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/35 hover:bg-black/50 text-white border border-white/20 flex items-center justify-center transition-colors"
                  aria-label="上一张"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/35 hover:bg-black/50 text-white border border-white/20 flex items-center justify-center transition-colors"
                  aria-label="下一张"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
};

