import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Crop,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Layers3,
  Send,
  Settings2,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils';
import type { PageAiMessage, PageAiReference } from '@/types';
import { MarkdownTextarea, type MarkdownTextareaRef } from './MarkdownTextarea';

type DescriptionImageOption = {
  id: string;
  label: string;
  url: string;
  previewUrl?: string;
  selected: boolean;
};

type FloatingMenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  transform?: string;
};

interface PageAiWorkbenchProps {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
  inputPlaceholder: string;
  inputHint: string;
  sendLabel: string;
  sendTooltip: string;
  referencesTitle: string;
  referencesEmpty: string;
  descriptionSourcesTitle: string;
  templateLabel: string;
  materialLabel: string;
  uploadLabel: string;
  loadingLabel: string;
  regionSelectLabel: string;
  regionSelectActiveLabel: string;
  modelLabel: string;
  modelHint: string;
  messages: PageAiMessage[];
  references: PageAiReference[];
  descriptionImageOptions: DescriptionImageOption[];
  hasTemplateReference: boolean;
  templatePreviewUrl?: string;
  activeReferenceId?: string | null;
  inputValue: string;
  inputRef?: React.Ref<MarkdownTextareaRef>;
  slashActions?: Array<{
    id: string;
    label: string;
    description?: string;
    onSelect: () => void;
  }>;
  modelValue: string;
  modelOptions: readonly (string | { value: string; label: string })[];
  showModelPickerControl?: boolean;
  modelControlPlacement?: 'toolbar' | 'top';
  isSubmitting: boolean;
  isRegionSelectionActive: boolean;
  pendingRegionCommentValue?: string;
  pendingRegionPreviewUrl?: string | null;
  pendingRegionEscStep?: number;
  headerActions?: React.ReactNode;
  onInputChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSend: () => void;
  onToggleRegionSelect: () => void;
  onPendingRegionCommentChange?: (value: string) => void;
  onSubmitPendingRegionComment?: () => void;
  onCancelPendingRegionComment?: () => void;
  onPendingRegionEsc?: () => void;
  onToggleTemplate: () => void;
  onToggleDescriptionImage: (url: string) => void;
  onReferenceClick: (reference: PageAiReference) => void;
  onRemoveReference: (referenceId: string) => void;
  onOpenMaterialSelector?: () => void;
  onUploadFiles: (files: File[]) => void;
  cardless?: boolean;
}

export const PageAiWorkbench: React.FC<PageAiWorkbenchProps> = ({
  inputPlaceholder,
  inputHint,
  sendLabel,
  sendTooltip,
  descriptionSourcesTitle,
  templateLabel,
  materialLabel,
  uploadLabel,
  regionSelectLabel,
  regionSelectActiveLabel,
  modelLabel,
  references,
  descriptionImageOptions,
  hasTemplateReference,
  templatePreviewUrl,
  activeReferenceId,
  inputValue,
  inputRef,
  slashActions,
  modelValue,
  modelOptions,
  showModelPickerControl = true,
  modelControlPlacement = 'toolbar',
  isSubmitting,
  isRegionSelectionActive,
  pendingRegionCommentValue,
  pendingRegionPreviewUrl,
  pendingRegionEscStep,
  headerActions,
  onInputChange,
  onModelChange,
  onSend,
  onToggleRegionSelect,
  onPendingRegionCommentChange,
  onSubmitPendingRegionComment,
  onCancelPendingRegionComment,
  onPendingRegionEsc,
  onToggleTemplate,
  onToggleDescriptionImage,
  onReferenceClick,
  onRemoveReference,
  onOpenMaterialSelector,
  onUploadFiles,
  cardless = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionPickerRef = useRef<HTMLDivElement | null>(null);
  const descriptionPickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const descriptionPickerMenuRef = useRef<HTMLDivElement | null>(null);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const modelPickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelPickerMenuRef = useRef<HTMLDivElement | null>(null);
  const canSend = !isSubmitting && inputValue.trim().length > 0;
  const [showDescriptionPicker, setShowDescriptionPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [isPendingCommentShakeActive, setIsPendingCommentShakeActive] = useState(false);
  const [descriptionPickerPosition, setDescriptionPickerPosition] = useState<FloatingMenuPosition | null>(null);
  const [modelPickerPosition, setModelPickerPosition] = useState<FloatingMenuPosition | null>(null);
  const pendingCommentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const normalizedModelOptions = modelOptions.map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : option
  ));

  const resolveFloatingMenuPosition = (
    trigger: HTMLElement,
    menuWidth: number,
    preferredHeight: number,
    align: 'left' | 'right'
  ): FloatingMenuPosition => {
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalPadding = 12;
    const verticalPadding = 12;
    const gap = 8;
    const idealLeft = align === 'left' ? rect.left : rect.right - menuWidth;
    const left = Math.min(
      Math.max(horizontalPadding, idealLeft),
      Math.max(horizontalPadding, viewportWidth - menuWidth - horizontalPadding)
    );
    const spaceAbove = Math.max(0, rect.top - verticalPadding);
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - verticalPadding);
    const shouldOpenUpward = spaceAbove >= preferredHeight || spaceAbove > spaceBelow;
    const availableHeight = shouldOpenUpward ? spaceAbove : spaceBelow;

    return {
      top: shouldOpenUpward ? rect.top - gap : rect.bottom + gap,
      left,
      width: menuWidth,
      maxHeight: Math.max(0, Math.min(preferredHeight, availableHeight - gap)),
      transform: shouldOpenUpward ? 'translateY(-100%)' : undefined,
    };
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedDescriptionPicker = descriptionPickerRef.current?.contains(target)
        || descriptionPickerMenuRef.current?.contains(target);
      const clickedModelPicker = modelPickerRef.current?.contains(target)
        || modelPickerMenuRef.current?.contains(target);

      if (showDescriptionPicker && !clickedDescriptionPicker) {
        setShowDescriptionPicker(false);
      }
      if (showModelPicker && !clickedModelPicker) {
        setShowModelPicker(false);
      }
    };

    if (showDescriptionPicker || showModelPicker) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [showDescriptionPicker, showModelPicker]);

  useEffect(() => {
    if (typeof window === 'undefined' || (!showDescriptionPicker && !showModelPicker)) {
      return;
    }

    const updateFloatingMenuPositions = () => {
      if (showDescriptionPicker && descriptionPickerButtonRef.current) {
        setDescriptionPickerPosition(resolveFloatingMenuPosition(descriptionPickerButtonRef.current, 256, 320, 'left'));
      }
      if (showModelPicker && modelPickerButtonRef.current) {
        setModelPickerPosition(resolveFloatingMenuPosition(modelPickerButtonRef.current, 288, 320, 'right'));
      }
    };

    updateFloatingMenuPositions();
    window.addEventListener('resize', updateFloatingMenuPositions);
    window.addEventListener('scroll', updateFloatingMenuPositions, true);

    return () => {
      window.removeEventListener('resize', updateFloatingMenuPositions);
      window.removeEventListener('scroll', updateFloatingMenuPositions, true);
    };
  }, [showDescriptionPicker, showModelPicker]);

  useEffect(() => {
    if (!pendingRegionPreviewUrl) return;
    pendingCommentTextareaRef.current?.focus();
  }, [pendingRegionPreviewUrl]);

  useEffect(() => {
    if (pendingRegionEscStep !== 1) return;
    setIsPendingCommentShakeActive(true);
    const timer = window.setTimeout(() => setIsPendingCommentShakeActive(false), 360);
    return () => window.clearTimeout(timer);
  }, [pendingRegionEscStep]);

  useEffect(() => {
    if (!pendingRegionPreviewUrl || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onPendingRegionEsc?.();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onPendingRegionEsc, pendingRegionPreviewUrl]);

  return (
    <section
      data-testid="page-ai-workbench"
      className={cn(
        'relative h-full',
        cardless
          ? 'bg-transparent'
          : 'rounded-[28px] border border-slate-200 bg-white dark:border-border-primary dark:bg-[linear-gradient(180deg,rgba(30,30,36,0.96)_0%,rgba(23,23,30,0.98)_100%)]',
      )}
    >
      <style>
        {`@keyframes pending-comment-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }`}
      </style>
      <div className={cn(
        'flex h-full flex-col',
        cardless ? 'px-2 pt-0 pb-0 md:px-3 md:pt-0 md:pb-0' : 'px-5 pt-4 pb-2',
      )}>
        {headerActions && (
          <div className={cn('absolute z-20', cardless ? 'right-2 top-0' : 'right-4 top-3')}>
            {headerActions}
          </div>
        )}
        {showModelPickerControl && modelControlPlacement === 'top' && (
          <div className={cn('absolute z-20', cardless ? 'right-14 top-0' : 'right-14 top-3')}>
            <div className="relative" ref={modelPickerRef}>
              <button
                ref={modelPickerButtonRef}
                type="button"
                onClick={() => setShowModelPicker((prev) => !prev)}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/40 dark:hover:bg-background-hover',
                  showModelPicker && 'border-banana-300 bg-[#fff7d9] text-slate-900 dark:border-banana-500/60 dark:bg-banana-500/10 dark:text-banana',
                )}
                title={`${modelLabel}：${modelValue}`}
                aria-label={modelLabel}
              >
                <Settings2 size={16} />
              </button>
            </div>
          </div>
        )}
        <div className={cn(
          'flex min-h-0 flex-1 flex-col overflow-visible',
          cardless ? 'bg-transparent' : 'rounded-[24px] bg-white dark:bg-transparent',
        )}>
          {references.length > 0 && (
            <div className={cn(
              'border-b border-slate-100 dark:border-border-primary',
              cardless ? 'px-2 pt-3 pb-1.5' : 'px-4 py-2',
            )}>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {references.map((reference, index) => {
                  const regionOrder = references
                    .slice(0, index + 1)
                    .filter((item) => item.sourceType === 'region').length;
                  return (
                  <div
                    key={reference.id}
                    className="group relative flex-shrink-0"
                    title={reference.sourceType === 'region' ? `${reference.label}，点击回看原图选区` : reference.label}
                  >
                    <button
                      type="button"
                      onClick={() => onReferenceClick(reference)}
                      className={cn(
                        'relative overflow-hidden rounded-2xl border bg-slate-50 transition-all hover:border-banana-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 dark:bg-background-primary dark:hover:border-banana-500/60',
                        activeReferenceId === reference.id
                          ? 'border-banana-400 ring-2 ring-banana-200 dark:ring-banana-500/20'
                          : 'border-slate-200 dark:border-border-primary'
                      )}
                    >
                      {reference.previewUrl ? (
                        <img
                          src={reference.previewUrl}
                          alt={reference.label}
                          className="h-12 w-12 object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center text-slate-500 dark:text-foreground-tertiary">
                          <ImageIcon size={18} />
                        </div>
                      )}
                      <span className={`absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-bold text-white shadow-sm ${
                        reference.sourceType === 'region'
                          ? 'bg-[#1677ff]'
                          : 'bg-slate-900/92 ring-2 ring-white/90'
                      }`}>
                        {reference.sourceType === 'region' ? regionOrder : index + 1}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveReference(reference.id)}
                      className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-red-500 shadow-sm ring-1 ring-red-200 opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-red-50 hover:text-red-600 dark:bg-background-secondary dark:ring-red-900/50 dark:hover:bg-red-950/20"
                      aria-label={`remove ${reference.label}`}
                      title="移除引用"
                    >
                      <span className="text-sm leading-none">&times;</span>
                    </button>
                  </div>
                )})}
              </div>
            </div>
          )}

          <div className={cn('min-h-0 flex-1', cardless ? 'mx-2 mt-0 pt-5' : 'mx-4 mt-1')}>
            <MarkdownTextarea
              ref={inputRef}
              value={inputValue}
              onChange={onInputChange}
              onFiles={onUploadFiles}
              resizable={false}
              placeholder={inputPlaceholder}
              rows={4}
              maxHeight="100%"
              showUploadButton={false}
              showImagePreview={false}
              fillHeight
              slashActions={slashActions}
              data-testid="page-ai-input"
              className="h-full min-h-[128px] border-0 bg-transparent shadow-none focus-within:border-transparent focus-within:ring-0 dark:bg-transparent [&_[role=textbox]]:min-h-[128px] [&_[role=textbox]]:px-0 [&_[role=textbox]]:pt-0 [&_[role=textbox]]:pb-2 [&_[role=textbox]]:pr-0 [&_[role=textbox]]:text-sm [&_[role=textbox]]:leading-6"
            />
          </div>
          <div className={cn(
            'border-t border-slate-100 dark:border-border-primary',
            cardless ? 'px-2 pt-1.5 pb-0.5' : 'px-4 pt-2 pb-1',
          )}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onToggleRegionSelect}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300',
                  isRegionSelectionActive
                    ? 'border-banana-300 bg-[#fff7d9] text-slate-900 shadow-[0_12px_24px_rgba(250,204,21,0.12)] dark:border-banana-500/60 dark:bg-banana-500/10 dark:text-banana'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-[#e6ca67] hover:bg-[#fffdf2] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/40 dark:hover:bg-background-hover',
                )}
                data-testid="page-ai-region-select"
                title={isRegionSelectionActive ? `${regionSelectActiveLabel}：拖拽画面选区` : regionSelectLabel}
                aria-label={isRegionSelectionActive ? regionSelectActiveLabel : regionSelectLabel}
              >
                <Crop size={16} />
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/40 dark:hover:bg-background-hover"
                title={uploadLabel}
                aria-label={uploadLabel}
              >
                <Upload size={16} />
              </button>

              {onOpenMaterialSelector && (
                <button
                  type="button"
                  onClick={onOpenMaterialSelector}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/40 dark:hover:bg-background-hover"
                  title={materialLabel}
                  aria-label={materialLabel}
                >
                  <ImagePlus size={16} />
                </button>
              )}

              {templatePreviewUrl && (
                <button
                  type="button"
                  onClick={onToggleTemplate}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300',
                    hasTemplateReference
                      ? 'border-banana-300 bg-[#fff7d9] text-slate-900 shadow-[0_12px_24px_rgba(250,204,21,0.12)] dark:border-banana-500/60 dark:bg-banana-500/10 dark:text-banana'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-[#e6ca67] hover:bg-[#fffdf2] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/40 dark:hover:bg-background-hover',
                  )}
                  title={templateLabel}
                  aria-label={templateLabel}
                >
                  <Layers3 size={16} />
                </button>
              )}

              {descriptionImageOptions.length > 0 && (
                <div className="relative" ref={descriptionPickerRef}>
                  <button
                    ref={descriptionPickerButtonRef}
                    type="button"
                    onClick={() => setShowDescriptionPicker((prev) => !prev)}
                    className={cn(
                      'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/40 dark:hover:bg-background-hover',
                      showDescriptionPicker && 'border-banana-300 bg-[#fff7d9] text-slate-900 dark:border-banana-500/60 dark:bg-banana-500/10 dark:text-banana',
                    )}
                    title={descriptionSourcesTitle}
                    aria-label={descriptionSourcesTitle}
                  >
                    <ImageIcon size={16} />
                  </button>
                </div>
              )}

              {showModelPickerControl && modelControlPlacement === 'toolbar' && (
                <div className="relative" ref={modelPickerRef}>
                  <button
                    ref={modelPickerButtonRef}
                    type="button"
                    onClick={() => setShowModelPicker((prev) => !prev)}
                    className={cn(
                      'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:border-banana-500/40 dark:hover:bg-background-hover',
                      showModelPicker && 'border-banana-300 bg-[#fff7d9] text-slate-900 dark:border-banana-500/60 dark:bg-banana-500/10 dark:text-banana',
                    )}
                    title={`${modelLabel}：${modelValue}`}
                    aria-label={modelLabel}
                  >
                    <Settings2 size={16} />
                  </button>
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  title={sendTooltip}
                  aria-label={sendLabel}
                  className={cn(
                    'inline-flex h-9 flex-shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all',
                    cardless ? 'w-9 px-0' : 'min-w-[112px] px-3',
                    canSend
                      ? (cardless
                        ? 'border border-[#e6ca67] bg-white text-[#1f2937] shadow-sm hover:bg-[#fffdf2] dark:border-banana-500/50 dark:bg-background-secondary dark:text-foreground-primary dark:hover:bg-background-hover'
                        : 'bg-banana-500 text-black shadow-yellow hover:-translate-y-0.5 dark:bg-banana-500 dark:text-black')
                      : 'bg-slate-100 text-slate-300 dark:bg-background-hover dark:text-foreground-tertiary'
                  )}
                  data-testid="page-ai-send"
                >
                  <Send size={16} />
                  {!cardless && <span>{sendLabel}</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length > 0) onUploadFiles(files);
            event.currentTarget.value = '';
          }}
        />
      </div>
      {showDescriptionPicker && descriptionPickerPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={descriptionPickerMenuRef}
          className="fixed z-[120] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)] dark:border-border-primary dark:bg-background-elevated dark:shadow-[0_18px_40px_rgba(0,0,0,0.36)]"
          style={{
            top: descriptionPickerPosition.top,
            left: descriptionPickerPosition.left,
            width: descriptionPickerPosition.width,
            maxHeight: descriptionPickerPosition.maxHeight,
            transform: descriptionPickerPosition.transform,
          }}
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-foreground-tertiary">
            <Info size={12} />
            {descriptionSourcesTitle}
          </div>
          <div className="grid max-h-full grid-cols-2 gap-2 overflow-y-auto">
            {descriptionImageOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onToggleDescriptionImage(option.url)}
                className={cn(
                  'relative overflow-hidden rounded-2xl border-2 bg-slate-50 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 dark:bg-background-primary',
                  option.selected
                    ? 'border-banana-400 ring-2 ring-banana-200 dark:ring-banana-500/20'
                    : 'border-slate-200 hover:border-[#e6ca67] dark:border-border-primary dark:hover:border-banana-500/40',
                )}
                title={option.label}
              >
                <img src={option.previewUrl || option.url} alt={option.label} className="h-20 w-full object-cover" />
                <div className="px-2 py-2 text-xs font-medium text-slate-600 dark:text-foreground-secondary">{option.label}</div>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
      {showModelPickerControl && showModelPicker && modelPickerPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={modelPickerMenuRef}
          className="fixed z-[120] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)] dark:border-border-primary dark:bg-background-elevated dark:shadow-[0_18px_40px_rgba(0,0,0,0.36)]"
          style={{
            top: modelPickerPosition.top,
            left: modelPickerPosition.left,
            width: modelPickerPosition.width,
            maxHeight: modelPickerPosition.maxHeight,
            transform: modelPickerPosition.transform,
          }}
        >
          <div className="max-h-full overflow-y-auto">
            {normalizedModelOptions.map((option) => {
              const selected = option.value === modelValue;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onModelChange(option.value);
                    setShowModelPicker(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                    selected
                      ? 'bg-[#fff7d9] text-slate-900 dark:bg-banana-500/10 dark:text-banana'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-foreground-secondary dark:hover:bg-background-hover dark:hover:text-foreground-primary'
                  )}
                  title={option.label}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {selected && <Check size={16} className="flex-shrink-0 text-banana-600" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
      {pendingRegionPreviewUrl && typeof document !== 'undefined' && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[130]">
          <div className="pointer-events-auto absolute left-1/2 bottom-6 w-[min(540px,calc(100vw-32px))] -translate-x-1/2">
            <div
              className={cn(
                'rounded-[28px] border border-[#eadfbf] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] dark:border-border-primary dark:bg-background-elevated',
                isPendingCommentShakeActive && 'animate-[pending-comment-shake_0.32s_ease-in-out]',
              )}
            >
              <div className="flex items-start gap-3 px-5 pt-5 pb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff7d9] text-[#8b6a12]">
                  <Crop size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-foreground-primary">添加区域修改意见</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-foreground-tertiary">固定宽度，自动换行；最多显示 3 行，超出后可滚动</div>
                </div>
              </div>
              <div className="px-5 pb-4">
                <textarea
                  ref={pendingCommentTextareaRef}
                  value={pendingRegionCommentValue || ''}
                  onChange={(event) => onPendingRegionCommentChange?.(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      onPendingRegionEsc?.();
                      return;
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      onSubmitPendingRegionComment?.();
                    }
                  }}
                  rows={3}
                  placeholder="输入这个区域需要修改的内容..."
                  className="min-h-[88px] max-h-[88px] w-full resize-none overflow-y-auto rounded-2xl border border-[#eadfbf] bg-[#fffdfa] px-4 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400 focus:border-banana-400 focus:ring-2 focus:ring-banana-200 dark:border-border-primary dark:bg-background-primary dark:text-foreground-primary dark:placeholder:text-foreground-tertiary"
                />
              </div>
              <div className="flex items-center justify-between px-5 pb-5">
                <button
                  type="button"
                  onClick={onCancelPendingRegionComment}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[#e5d8b0] bg-white px-5 text-base font-medium text-slate-700 transition-colors hover:bg-[#fff8e8] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-primary dark:hover:bg-background-hover"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={onSubmitPendingRegionComment}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_12px_24px_rgba(15,23,42,0.2)] transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-banana-500 dark:text-black dark:disabled:bg-slate-600"
                  disabled={!pendingRegionCommentValue?.trim()}
                  aria-label="发送评论"
                >
                  <Check size={22} />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
};
