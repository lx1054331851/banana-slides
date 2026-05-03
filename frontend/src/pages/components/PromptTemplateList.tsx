import React from 'react';
import type { PromptTemplate } from '@/types';

interface PromptTemplateListProps {
  templates: PromptTemplate[];
  selectedKey?: string;
  onSelect: (template: PromptTemplate) => void;
}

// Renders selectable prompt template rows grouped by the current page filters.
export const PromptTemplateList: React.FC<PromptTemplateListProps> = ({ templates, selectedKey, onSelect }) => (
  <div className="space-y-2" data-testid="prompt-template-list">
    {templates.map((template) => {
      const isSelected = template.key === selectedKey;
      return (
        <button
          key={template.key}
          type="button"
          data-testid={`prompt-template-row-${template.key}`}
          onClick={() => onSelect(template)}
          className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
            isSelected
              ? 'border-banana-500 bg-banana-50 dark:bg-background-hover'
              : 'border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary hover:border-banana-300'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900 dark:text-foreground-primary">{template.title}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">{template.mode} / {template.stage}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
              template.enabled
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-gray-100 text-gray-500 dark:bg-background-primary dark:text-foreground-tertiary'
            }`}>
              {template.enabled ? '已启用' : '默认'}
            </span>
          </div>
          {template.description && (
            <p className="mt-2 line-clamp-2 text-xs text-gray-500 dark:text-foreground-tertiary">{template.description}</p>
          )}
        </button>
      );
    })}
  </div>
);
