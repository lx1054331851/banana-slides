import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { MarkdownTextareaRef } from './MarkdownTextarea';
import { cn } from '@/utils';
import 'jsoneditor/dist/jsoneditor.css';

interface JsonSlideEditorProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  className?: string;
  'data-testid'?: string;
}

interface JsonEditorInstance {
  destroy: () => void;
  set: (json: unknown) => void;
  setText: (text: string) => void;
  getText: () => string;
  setMode?: (mode: 'tree' | 'code' | 'text' | 'preview') => void;
  getMode?: () => string;
  focus?: () => void;
}

interface JsonEditorModule {
  JSONEditor: new (container: HTMLElement, options?: Record<string, unknown>) => JsonEditorInstance;
}

const SLIDE_JSON_SCHEMA = {
  type: 'object',
  required: ['type', 'title', 'content'],
  properties: {
    source_ref: { type: 'string' },
    type: { type: 'string' },
    title: { type: 'string' },
    layout_suggestion: { type: 'string' },
    visual_suggestion: { type: 'string' },
    note: { type: 'string' },
    content: { type: 'object' },
  },
  additionalProperties: true,
};

const tryParseJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  const raw = (text || '').trim();
  if (!raw) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

export const JsonSlideEditor = forwardRef<MarkdownTextareaRef, JsonSlideEditorProps>(({
  value,
  onChange,
  onFocus,
  className,
  'data-testid': dataTestId,
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<JsonEditorInstance | null>(null);
  const latestTextRef = useRef<string>(value || '');
  const applyingExternalRef = useRef(false);
  const [validationErrorCount, setValidationErrorCount] = useState(0);
  const [hasSyntaxError, setHasSyntaxError] = useState(false);

  const applyTextToEditor = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const rawText = text || '';
    const parsed = tryParseJson(rawText);
    applyingExternalRef.current = true;
    try {
      if (parsed.ok) {
        editor.setMode?.('tree');
        editor.set(parsed.value);
        setHasSyntaxError(false);
      } else {
        editor.setMode?.('text');
        editor.setText(rawText);
        setHasSyntaxError(true);
      }
      latestTextRef.current = rawText;
    } finally {
      applyingExternalRef.current = false;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      const editor = editorRef.current;
      const current = editor?.getText() || '';
      const merged = `${current}${current.endsWith('\n') || !current ? '' : '\n'}${text}`;
      onChange(merged);
      latestTextRef.current = merged;
      applyTextToEditor(merged);
    },
    focus: () => {
      editorRef.current?.focus?.();
    },
  }), [applyTextToEditor, onChange]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!containerRef.current) return;
      const mod = (await import('jsoneditor')) as unknown as JsonEditorModule;
      if (!mounted || !containerRef.current) return;
      const initialParsed = tryParseJson(value || '');

      const instance = new mod.JSONEditor(containerRef.current, {
        mode: initialParsed.ok ? 'tree' : 'text',
        modes: ['tree', 'code', 'text', 'preview'],
        mainMenuBar: true,
        navigationBar: true,
        statusBar: true,
        schema: SLIDE_JSON_SCHEMA,
        onChangeText: (text: string) => {
          if (applyingExternalRef.current) return;
          latestTextRef.current = text;
          setHasSyntaxError(!tryParseJson(text).ok);
          onChange(text);
        },
        onChangeJSON: (json: unknown) => {
          if (applyingExternalRef.current) return;
          const text = JSON.stringify(json, null, 4);
          latestTextRef.current = text;
          setHasSyntaxError(false);
          onChange(text);
        },
        onValidationError: (errors: unknown[]) => {
          setValidationErrorCount(Array.isArray(errors) ? errors.length : 0);
        },
      });

      editorRef.current = instance;
      applyTextToEditor(value || '{}');
    };

    void init();

    return () => {
      mounted = false;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [applyTextToEditor, onChange]);

  useEffect(() => {
    if (!editorRef.current) return;
    if ((value || '') === latestTextRef.current) return;
    applyTextToEditor(value || '');
  }, [applyTextToEditor, value]);

  return (
    <div className={cn(
      'json-slide-editor flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-border-primary dark:bg-background-secondary',
      className
    )}>
      <div
        className="min-h-[220px] flex-1"
        ref={containerRef}
        onFocusCapture={onFocus}
        data-testid={dataTestId}
      />
      <div className={cn(
        'shrink-0 border-t px-3 py-1.5 text-[11px]',
        hasSyntaxError || validationErrorCount > 0
          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
          : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-border-primary dark:bg-background-tertiary dark:text-foreground-tertiary'
      )}>
        {hasSyntaxError
          ? '当前内容不是严格 JSON，已切换为文本模式展示原文'
          : validationErrorCount > 0
            ? `JSON 校验提示：${validationErrorCount} 个问题`
            : 'JSON 校验通过'}
      </div>
    </div>
  );
});

JsonSlideEditor.displayName = 'JsonSlideEditor';
