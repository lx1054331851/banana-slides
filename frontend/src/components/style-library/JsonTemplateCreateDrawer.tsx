import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/shared';

interface JsonTemplateCreateDrawerProps {
  isOpen: boolean;
  name: string;
  jsonText: string;
  loading: boolean;
  title: string;
  subtitle: string;
  namePlaceholder: string;
  jsonPlaceholder: string;
  jsonHint: string;
  submitText: string;
  cancelText: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onJsonChange: (value: string) => void;
  onSubmit: () => void;
}

export const JsonTemplateCreateDrawer: React.FC<JsonTemplateCreateDrawerProps> = ({
  isOpen,
  name,
  jsonText,
  loading,
  title,
  subtitle,
  namePlaceholder,
  jsonPlaceholder,
  jsonHint,
  submitText,
  cancelText,
  onClose,
  onNameChange,
  onJsonChange,
  onSubmit,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)));
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
        className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-200 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-label="close create template drawer backdrop"
      />

      <div
        role="dialog"
        aria-modal="true"
        data-testid="style-library-create-template-drawer"
        className={`absolute flex flex-col bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary shadow-2xl transition-transform duration-200 ease-out
          left-0 right-0 bottom-0 max-h-[85vh] rounded-t-2xl
          md:left-auto md:right-0 md:top-0 md:bottom-0 md:w-[min(680px,90vw)] md:max-h-none md:rounded-none md:rounded-l-2xl
          ${isAnimating ? 'translate-y-0 md:translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-border-primary">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
            <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="style-library-create-template-close"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-border-primary text-gray-500 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
            aria-label="close create template drawer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-700 dark:text-foreground-secondary">{namePlaceholder}</div>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={namePlaceholder}
              data-testid="style-library-create-template-name"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-gray-700 dark:text-foreground-secondary">{jsonPlaceholder}</div>
              <div className="text-[11px] text-gray-500 dark:text-foreground-tertiary">{jsonHint}</div>
            </div>
            <textarea
              value={jsonText}
              onChange={(event) => onJsonChange(event.target.value)}
              rows={16}
              placeholder={jsonPlaceholder}
              data-testid="style-library-create-template-json"
              className="w-full px-3 py-2 text-xs leading-6 font-mono rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-border-primary px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>{cancelText}</Button>
          <Button size="sm" loading={loading} data-testid="style-library-create-template-submit" onClick={onSubmit}>{submitText}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
