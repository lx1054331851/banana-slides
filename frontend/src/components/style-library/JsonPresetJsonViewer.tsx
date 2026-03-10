import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, X } from 'lucide-react';
import { Button } from '@/components/shared';

interface JsonPresetJsonViewerProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  jsonText: string;
  emptyText: string;
  onClose: () => void;
  onCopy: () => void;
}

export const JsonPresetJsonViewer: React.FC<JsonPresetJsonViewerProps> = ({
  isOpen,
  title,
  subtitle,
  jsonText,
  emptyText,
  onClose,
  onCopy,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const formattedJsonText = useMemo(() => {
    const raw = String(jsonText || '').trim();
    if (!raw) return '';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return jsonText;
    }
  }, [jsonText]);


  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsAnimating(true));
      });
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    setIsAnimating(false);
    const timer = window.setTimeout(() => setIsVisible(false), 220);
    document.body.style.overflow = '';
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isVisible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50" aria-hidden={!isOpen}>
      <button
        type="button"
        className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-200 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-label="close json drawer backdrop"
      />

      <div
        role="dialog"
        aria-modal="true"
        data-testid="style-library-preset-json-drawer"
        className={`absolute flex flex-col bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary shadow-2xl transition-transform duration-200 ease-out
          left-0 right-0 bottom-0 max-h-[80vh] rounded-t-2xl
          md:left-auto md:right-0 md:top-0 md:bottom-0 md:w-[min(720px,90vw)] md:max-h-none md:rounded-none md:rounded-l-2xl
          ${isAnimating ? 'translate-y-0 md:translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-border-primary">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
            <div className="text-xs text-gray-500 dark:text-foreground-tertiary truncate">{subtitle || ''}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={<Copy size={14} />} onClick={onCopy} disabled={!jsonText}>
              复制
            </Button>
            <button
              type="button"
              onClick={onClose}
              data-testid="style-library-preset-json-close"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-border-primary text-gray-500 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
              aria-label="close json drawer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {formattedJsonText ? (
          <div className="flex-1 overflow-auto p-4">
            <div className="rounded-lg border border-gray-200 dark:border-border-primary bg-gray-50 dark:bg-background-tertiary overflow-auto">
              <pre className="p-3 text-xs leading-6 font-mono whitespace-pre-wrap break-words text-gray-800 dark:text-white">{formattedJsonText}</pre>
            </div>
          </div>
        ) : (
          <div className="p-4 text-xs text-gray-500 dark:text-foreground-tertiary">{emptyText}</div>
        )}
      </div>
    </div>,
    document.body,
  );
};
