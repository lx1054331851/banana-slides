import React from 'react';
import { Database, Play } from 'lucide-react';

import { cn } from '@/utils';

import { Button } from './Button';
import { Textarea } from './Textarea';

export interface DbAnalysisSourceOption {
  id: string;
  name: string;
  meta?: string;
}

export interface DbAnalysisEntryLabels {
  title: string;
  description: string;
  sourceLabel: string;
  sourcePlaceholder: string;
  currentSelection: string;
  currentSelectionEmpty: string;
  emptyState: string;
  loadingSources: string;
  manageSources: string;
  businessContextLabel: string;
  businessContextPlaceholder: string;
  analysisGoalLabel: string;
  analysisGoalPlaceholder: string;
  start: string;
  tip: string;
}

interface DbAnalysisEntryProps {
  labels: DbAnalysisEntryLabels;
  sourceOptions: DbAnalysisSourceOption[];
  selectedSourceId: string;
  onSelectedSourceIdChange: (value: string) => void;
  businessContext: string;
  onBusinessContextChange: (value: string) => void;
  analysisGoal: string;
  onAnalysisGoalChange: (value: string) => void;
  onStart: () => void;
  onManageSources: () => void;
  loading?: boolean;
  sourcesLoading?: boolean;
  className?: string;
}

export const DbAnalysisEntry: React.FC<DbAnalysisEntryProps> = ({
  labels,
  sourceOptions,
  selectedSourceId,
  onSelectedSourceIdChange,
  businessContext,
  onBusinessContextChange,
  analysisGoal,
  onAnalysisGoalChange,
  onStart,
  onManageSources,
  loading = false,
  sourcesLoading = false,
  className,
}) => {
  const selectedSource = sourceOptions.find((item) => item.id === selectedSourceId) || null;
  const canStart = Boolean(selectedSourceId && businessContext.trim() && analysisGoal.trim());

  return (
    <div className={cn('rounded-2xl border-2 border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary p-4 md:p-5 space-y-4', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-base md:text-lg font-semibold text-gray-900 dark:text-foreground-primary">
            <Database size={18} className="text-banana-600 dark:text-banana" />
            <span>{labels.title}</span>
          </div>
          <p className="text-sm leading-6 text-gray-600 dark:text-foreground-secondary max-w-2xl">
            {labels.description}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onManageSources} className="w-full md:w-auto shrink-0">
          {labels.manageSources}
        </Button>
      </div>

      {sourcesLoading ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-border-primary px-4 py-8 text-center text-sm text-gray-500 dark:text-foreground-tertiary">
          {labels.loadingSources}
        </div>
      ) : sourceOptions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-border-primary px-4 py-8 text-center">
          <p className="text-sm text-gray-500 dark:text-foreground-tertiary">{labels.emptyState}</p>
          <Button size="sm" className="mt-4" onClick={onManageSources}>
            {labels.manageSources}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary">
                {labels.sourceLabel}
              </label>
              <select
                value={selectedSourceId}
                onChange={(event) => onSelectedSourceIdChange(event.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary text-sm text-gray-900 dark:text-foreground-primary focus:outline-none focus:ring-2 focus:ring-banana-500"
              >
                <option value="">{labels.sourcePlaceholder}</option>
                {sourceOptions.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-border-primary bg-gray-50 dark:bg-background-primary px-4 py-3">
              <div className="text-xs font-medium tracking-wide text-gray-500 dark:text-foreground-tertiary uppercase">
                {labels.currentSelection}
              </div>
              <div className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-foreground-primary">
                {selectedSource?.name || labels.currentSelectionEmpty}
              </div>
              {selectedSource?.meta ? (
                <div className="mt-1 text-xs leading-5 text-gray-500 dark:text-foreground-tertiary break-all">
                  {selectedSource.meta}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            <Textarea
              label={labels.businessContextLabel}
              value={businessContext}
              onChange={(event) => onBusinessContextChange(event.target.value)}
              placeholder={labels.businessContextPlaceholder}
              rows={5}
            />
            <Textarea
              label={labels.analysisGoalLabel}
              value={analysisGoal}
              onChange={(event) => onAnalysisGoalChange(event.target.value)}
              placeholder={labels.analysisGoalPlaceholder}
              rows={4}
            />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs leading-5 text-gray-500 dark:text-foreground-tertiary">
              {labels.tip}
            </p>
            <Button
              icon={<Play size={16} />}
              onClick={onStart}
              loading={loading}
              disabled={!canStart}
              className="w-full md:w-auto"
            >
              {labels.start}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
