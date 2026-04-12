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
  default?: new (container: HTMLElement, options?: Record<string, unknown>) => JsonEditorInstance;
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

const JSON_FIELD_NAME_MAP: Record<string, string> = {
  source_ref: '来源页',
  type: '页面类型',
  title: '标题',
  layout_suggestion: '布局建议',
  content: '内容',
  headline_summary: '摘要',
  detailed_items: '详细条目',
  sub_title: '小标题',
  body: '正文',
  highlight_phrases: '高亮短语',
  visual_suggestion: '视觉建议',
  note: '备注',
};

const JSON_FIELD_NAME_REVERSE_MAP = Object.entries(JSON_FIELD_NAME_MAP).reduce<Record<string, string>>((acc, [en, zh]) => {
  acc[zh] = en;
  return acc;
}, {});

const mapJsonKeys = (value: unknown, mapper: (key: string) => string): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => mapJsonKeys(item, mapper));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, val]) => {
      acc[mapper(key)] = mapJsonKeys(val, mapper);
      return acc;
    }, {});
  }
  return value;
};

const toDisplayKey = (key: string): string => JSON_FIELD_NAME_MAP[key] ?? key;
const toStorageKey = (key: string): string => JSON_FIELD_NAME_REVERSE_MAP[key] ?? key;
const toDisplayJson = (value: unknown): unknown => mapJsonKeys(value, toDisplayKey);
const toStorageJson = (value: unknown): unknown => mapJsonKeys(value, toStorageKey);

const mapSchemaKeys = (schema: unknown): unknown => {
  if (!schema || typeof schema !== 'object') return schema;
  const obj = schema as Record<string, unknown>;
  const next: Record<string, unknown> = { ...obj };

  if (Array.isArray(obj.required)) {
    next.required = obj.required.map((key) => (typeof key === 'string' ? toDisplayKey(key) : key));
  }

  if (obj.properties && typeof obj.properties === 'object' && !Array.isArray(obj.properties)) {
    next.properties = Object.entries(obj.properties as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, val]) => {
      acc[toDisplayKey(key)] = mapSchemaKeys(val);
      return acc;
    }, {});
  }

  if (obj.items) {
    next.items = mapSchemaKeys(obj.items);
  }

  return next;
};

const DISPLAY_SLIDE_JSON_SCHEMA = mapSchemaKeys(SLIDE_JSON_SCHEMA);

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
  const fallbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<JsonEditorInstance | null>(null);
  const latestTextRef = useRef<string>(value || '');
  const applyingExternalRef = useRef(false);
  const [validationErrorCount, setValidationErrorCount] = useState(0);
  const [hasSyntaxError, setHasSyntaxError] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const applyTextToEditor = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const rawText = text || '';
    const parsed = tryParseJson(rawText);
    applyingExternalRef.current = true;
    try {
      if (parsed.ok) {
        editor.setMode?.('tree');
        editor.set(toDisplayJson(parsed.value));
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
      const current = editor?.getText() ?? fallbackTextareaRef.current?.value ?? '';
      const merged = `${current}${current.endsWith('\n') || !current ? '' : '\n'}${text}`;
      onChange(merged);
      latestTextRef.current = merged;
      if (editor) {
        applyTextToEditor(merged);
      } else if (fallbackTextareaRef.current) {
        fallbackTextareaRef.current.value = merged;
      }
    },
    focus: () => {
      if (editorRef.current) {
        editorRef.current.focus?.();
      } else {
        fallbackTextareaRef.current?.focus();
      }
    },
  }), [applyTextToEditor, onChange]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!containerRef.current) return;
      const mod = (await import('jsoneditor')) as unknown as JsonEditorModule & Record<string, unknown>;
      if (!mounted || !containerRef.current) return;
      const EditorCtor =
        mod.JSONEditor ||
        mod.default ||
        ((mod as unknown as { default?: unknown })?.default as JsonEditorModule['JSONEditor']) ||
        (mod as unknown as JsonEditorModule['JSONEditor']);

      if (typeof EditorCtor !== 'function') {
        throw new Error('JSONEditor constructor unavailable');
      }
      const initialParsed = tryParseJson(value || '');

      const instance = new EditorCtor(containerRef.current, {
        mode: initialParsed.ok ? 'tree' : 'text',
        modes: ['tree', 'code', 'text', 'preview'],
        mainMenuBar: true,
        navigationBar: true,
        statusBar: true,
        schema: DISPLAY_SLIDE_JSON_SCHEMA,
        onChangeText: (text: string) => {
          if (applyingExternalRef.current) return;
          latestTextRef.current = text;
          setHasSyntaxError(!tryParseJson(text).ok);
          onChange(text);
        },
        onChangeJSON: (json: unknown) => {
          if (applyingExternalRef.current) return;
          const text = JSON.stringify(toStorageJson(json), null, 4);
          latestTextRef.current = text;
          setHasSyntaxError(false);
          onChange(text);
        },
        onValidationError: (errors: unknown[]) => {
          setValidationErrorCount(Array.isArray(errors) ? errors.length : 0);
        },
      });

      editorRef.current = instance;
      setFallbackReason(null);
      applyTextToEditor(value || '{}');
    };

    void init().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      setFallbackReason(message);
      editorRef.current = null;
    });

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
      {fallbackReason ? (
        <textarea
          ref={fallbackTextareaRef}
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            latestTextRef.current = next;
            setHasSyntaxError(!tryParseJson(next).ok);
            onChange(next);
          }}
          onFocus={onFocus}
          data-testid={dataTestId}
          className="min-h-[220px] flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-6 text-gray-900 outline-none dark:text-foreground-primary"
        />
      ) : (
        <div
          className="min-h-[220px] flex-1"
          ref={containerRef}
          onFocusCapture={onFocus}
          data-testid={dataTestId}
        />
      )}
      <div className={cn(
        'shrink-0 border-t px-3 py-1.5 text-[11px]',
        fallbackReason || hasSyntaxError || validationErrorCount > 0
          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
          : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-border-primary dark:bg-background-tertiary dark:text-foreground-tertiary'
      )}>
        {fallbackReason
          ? `JSON 结构编辑器不可用，已回退为文本模式（${fallbackReason}）`
          : hasSyntaxError
          ? '当前内容不是严格 JSON，已切换为文本模式展示原文'
          : validationErrorCount > 0
            ? `JSON 校验提示：${validationErrorCount} 个问题`
          : 'JSON 校验通过（字段名可中文展示，保存仍为英文键）'}
      </div>
    </div>
  );
});

JsonSlideEditor.displayName = 'JsonSlideEditor';
