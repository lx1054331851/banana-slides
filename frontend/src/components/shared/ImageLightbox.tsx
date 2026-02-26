import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { cn } from '@/utils';

interface ImageLightboxProps {
  isOpen: boolean;
  src: string;
  title?: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ isOpen, src, title, onClose }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsAnimating(false);
      setIsLoaded(false);
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    requestAnimationFrame(() => setIsAnimating(true));

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const downloadName = useMemo(() => {
    const safe = (title || 'preview').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
    return `${safe}.png`;
  }, [title]);

  if (!isOpen) return null;

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
          aria-label={title || 'image preview'}
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
              <div className="text-sm font-semibold text-white truncate">{title || '预览图'}</div>
              <div className="text-xs text-white/70">点击空白处或按 Esc 关闭</div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={src}
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
              src={src}
              alt={title || 'preview'}
              onLoad={() => setIsLoaded(true)}
              onError={() => setIsLoaded(true)}
              className={cn(
                'w-full max-h-[calc(92vh-64px)] object-contain block',
                'transition-opacity duration-200',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
};

