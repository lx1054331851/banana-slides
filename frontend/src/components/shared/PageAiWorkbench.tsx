import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Crop,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Layers3,
  Settings2,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils';
import type { PageAiMessage, PageAiReference } from '@/types';

type DescriptionImageOption = {
  id: string;
  label: string;
  url: string;
  selected: boolean;
};

interface PageAiWorkbenchProps {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
  inputPlaceholder: string;
  inputHint: string;
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
  modelValue: string;
  modelOptions: readonly string[];
  isSubmitting: boolean;
  isRegionSelectionActive: boolean;
  onInputChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSend: () => void;
  onToggleRegionSelect: () => void;
  onToggleTemplate: () => void;
  onToggleDescriptionImage: (url: string) => void;
  onReferenceClick: (reference: PageAiReference) => void;
  onRemoveReference: (referenceId: string) => void;
  onOpenMaterialSelector?: () => void;
  onUploadFiles: (files: File[]) => void;
}

export const PageAiWorkbench: React.FC<PageAiWorkbenchProps> = ({
  inputPlaceholder,
  inputHint,
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
  modelValue,
  modelOptions,
  isSubmitting,
  isRegionSelectionActive,
  onInputChange,
  onModelChange,
  onSend,
  onToggleRegionSelect,
  onToggleTemplate,
  onToggleDescriptionImage,
  onReferenceClick,
  onRemoveReference,
  onOpenMaterialSelector,
  onUploadFiles,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionPickerRef = useRef<HTMLDivElement | null>(null);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const canSend = !isSubmitting && (inputValue.trim().length > 0 || references.length > 0);
  const [showDescriptionPicker, setShowDescriptionPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showDescriptionPicker && descriptionPickerRef.current && !descriptionPickerRef.current.contains(target)) {
        setShowDescriptionPicker(false);
      }
      if (showModelPicker && modelPickerRef.current && !modelPickerRef.current.contains(target)) {
        setShowModelPicker(false);
      }
    };

    if (showDescriptionPicker || showModelPicker) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [showDescriptionPicker, showModelPicker]);

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.nativeEvent as KeyboardEvent).isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <section
      data-testid="page-ai-workbench"
      className="h-full rounded-[28px] border border-[#eadfba] bg-[linear-gradient(180deg,#fbf7ec_0%,#fffdf7_12%,#fff_100%)] shadow-[0_20px_48px_rgba(15,23,42,0.08)]"
    >
      <div className="flex h-full flex-col px-5 pt-4 pb-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-visible rounded-[24px]">
          {references.length > 0 && (
            <div className="border-b border-slate-100 px-4 py-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {references.map((reference) => (
                  <div
                    key={reference.id}
                    className="group relative flex-shrink-0"
                    title={reference.sourceType === 'region' ? `${reference.label}，点击回看原图选区` : reference.label}
                  >
                    <button
                      type="button"
                      onClick={() => onReferenceClick(reference)}
                      className={cn(
                        'relative overflow-hidden rounded-2xl border bg-slate-50 transition-all hover:border-banana-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300',
                        activeReferenceId === reference.id ? 'border-banana-400 ring-2 ring-banana-200' : 'border-slate-200'
                      )}
                    >
                      {reference.previewUrl ? (
                        <img
                          src={reference.previewUrl}
                          alt={reference.label}
                          className="h-12 w-12 object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center text-slate-500">
                          <ImageIcon size={18} />
                        </div>
                      )}
                      {reference.sourceType === 'region' && (
                        <span className="absolute bottom-1 left-1 rounded-full bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          区域
                        </span>
                      )}
                      <span className="absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900/92 px-1 text-[10px] font-bold text-white ring-2 ring-white/90 shadow-sm">
                        {references.findIndex((item) => item.id === reference.id) + 1}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveReference(reference.id)}
                      className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-red-500 shadow-sm ring-1 ring-red-200 opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-red-50 hover:text-red-600"
                      aria-label={`remove ${reference.label}`}
                      title="移除引用"
                    >
                      <span className="text-sm leading-none">&times;</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <textarea
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={inputPlaceholder}
            rows={4}
            className="min-h-[128px] w-full flex-1 resize-none bg-transparent px-4 py-4 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
            disabled={isSubmitting}
            data-testid="page-ai-input"
          />
          <div className="border-t border-slate-100 px-4 pt-2 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onToggleRegionSelect}
                className={cn(
                  'inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300',
                  isRegionSelectionActive
                    ? 'border-banana-300 bg-[#fff7d9] text-slate-900 shadow-[0_12px_24px_rgba(250,204,21,0.12)]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-[#e6ca67] hover:bg-[#fffdf2]',
                )}
                data-testid="page-ai-region-select"
                title={isRegionSelectionActive ? `${regionSelectActiveLabel}：拖拽画面选区` : regionSelectLabel}
                aria-label={isRegionSelectionActive ? regionSelectActiveLabel : regionSelectLabel}
              >
                <Crop size={18} />
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300"
                title={uploadLabel}
                aria-label={uploadLabel}
              >
                <Upload size={18} />
              </button>

              {onOpenMaterialSelector && (
                <button
                  type="button"
                  onClick={onOpenMaterialSelector}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300"
                  title={materialLabel}
                  aria-label={materialLabel}
                >
                  <ImagePlus size={18} />
                </button>
              )}

              {templatePreviewUrl && (
                <button
                  type="button"
                  onClick={onToggleTemplate}
                  className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300',
                    hasTemplateReference
                      ? 'border-banana-300 bg-[#fff7d9] text-slate-900 shadow-[0_12px_24px_rgba(250,204,21,0.12)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-[#e6ca67] hover:bg-[#fffdf2]',
                  )}
                  title={templateLabel}
                  aria-label={templateLabel}
                >
                  <Layers3 size={18} />
                </button>
              )}

              {descriptionImageOptions.length > 0 && (
                <div className="relative" ref={descriptionPickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowDescriptionPicker((prev) => !prev)}
                    className={cn(
                      'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300',
                      showDescriptionPicker && 'border-banana-300 bg-[#fff7d9] text-slate-900',
                    )}
                    title={descriptionSourcesTitle}
                    aria-label={descriptionSourcesTitle}
                  >
                    <ImageIcon size={18} />
                  </button>
                  {showDescriptionPicker && (
                    <div className="absolute bottom-full left-0 z-40 mb-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        <Info size={12} />
                        {descriptionSourcesTitle}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {descriptionImageOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => onToggleDescriptionImage(option.url)}
                            className={cn(
                              'relative overflow-hidden rounded-2xl border-2 bg-slate-50 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300',
                              option.selected ? 'border-banana-400 ring-2 ring-banana-200' : 'border-slate-200 hover:border-[#e6ca67]',
                            )}
                            title={option.label}
                          >
                            <img src={option.url} alt={option.label} className="h-20 w-full object-cover" />
                            <div className="px-2 py-2 text-xs font-medium text-slate-600">{option.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="relative" ref={modelPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowModelPicker((prev) => !prev)}
                  className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#e6ca67] hover:bg-[#fffdf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300',
                    showModelPicker && 'border-banana-300 bg-[#fff7d9] text-slate-900',
                  )}
                  title={`${modelLabel}：${modelValue}`}
                  aria-label={modelLabel}
                >
                  <Settings2 size={18} />
                </button>
                {showModelPicker && (
                  <div className="absolute bottom-full right-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                    <div className="max-h-64 overflow-y-auto">
                      {modelOptions.map((model) => {
                        const selected = model === modelValue;
                        return (
                          <button
                            key={model}
                            type="button"
                            onClick={() => {
                              onModelChange(model);
                              setShowModelPicker(false);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                              selected
                                ? 'bg-[#fff7d9] text-slate-900'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            )}
                            title={model}
                          >
                            <span className="min-w-0 truncate">{model}</span>
                            {selected && <Check size={16} className="flex-shrink-0 text-banana-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="hidden text-xs text-slate-400 md:block">{inputHint}</div>
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  title={sendTooltip}
                  className={`inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition-all ${
                    canSend
                      ? 'bg-slate-900 text-[#facc15] hover:-translate-y-0.5'
                      : 'bg-slate-100 text-slate-300'
                  }`}
                  data-testid="page-ai-send"
                >
                  <ArrowUp size={18} />
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
    </section>
  );
};
