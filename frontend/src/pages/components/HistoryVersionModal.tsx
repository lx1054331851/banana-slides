import React from 'react';
import { Check, Clock3, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { getImageUrl } from '@/api/client';
import { Button, Modal } from '@/components/shared';
import type { ImageVersion } from '@/types';

type HistoryVersionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  historyVersionsDescending: ImageVersion[];
  selectedHistoryVersion: ImageVersion | null;
  copiedHistoryVersionId: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  onSelectHistoryVersion: (versionId: string) => void;
  onSwitchVersion: (versionId: string) => void;
  onDeleteHistoryVersion: (versionId: string) => void;
  onRestoreHistoryVersion: (versionId: string) => void;
  onCopyHistoryPrompt: () => void;
  getHistoryOperationLabel: (version: ImageVersion) => string;
  formatImageVersionTimestamp: (createdAt?: string) => string;
};

export const HistoryVersionModal: React.FC<HistoryVersionModalProps> = ({
  isOpen,
  onClose,
  title,
  historyVersionsDescending,
  selectedHistoryVersion,
  copiedHistoryVersionId,
  t,
  onSelectHistoryVersion,
  onSwitchVersion,
  onDeleteHistoryVersion,
  onRestoreHistoryVersion,
  onCopyHistoryPrompt,
  getHistoryOperationLabel,
  formatImageVersionTimestamp,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    size="wide"
  >
    {historyVersionsDescending.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-[#eadfbf] bg-[#fffaf0] px-4 py-10 text-center text-sm text-[#8a7a57] dark:border-border-primary dark:bg-background-secondary dark:text-foreground-tertiary">
        {t('preview.historyModalEmpty')}
      </div>
    ) : (
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-0 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-3">
            {historyVersionsDescending.map((version) => {
              const isSelected = version.version_id === selectedHistoryVersion?.version_id;
              const previewUrl = version.image_url
                ? getImageUrl(version.image_url, version.created_at || version.version_number)
                : '';
              return (
                <button
                  key={version.version_id}
                  type="button"
                  onClick={() => onSelectHistoryVersion(version.version_id)}
                  className={`w-full overflow-hidden rounded-2xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-banana-300 ${
                    isSelected
                      ? 'border-banana-400 bg-[#fff7df] shadow-[0_14px_30px_rgba(245,181,0,0.16)] dark:border-banana-500/60 dark:bg-banana-500/10'
                      : 'border-[#eadfbf] bg-white hover:border-banana-300 hover:bg-[#fffaf0] dark:border-border-primary dark:bg-background-secondary dark:hover:bg-background-hover'
                  }`}
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={`${t('preview.version')} ${version.version_number}`}
                      className="h-32 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center bg-[#f7f5ef] text-sm text-slate-400 dark:bg-background-hover dark:text-foreground-tertiary">
                      {t('preview.notGenerated')}
                    </div>
                  )}
                  <div className="space-y-2 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-800 dark:text-foreground-primary">
                        {t('preview.version')} {version.version_number}
                      </div>
                      <div className="flex items-center gap-2">
                        {version.is_deleted && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            {t('preview.historyDeleted')}
                          </span>
                        )}
                        {version.is_current && (
                          <span className="rounded-full bg-banana-500 px-2 py-0.5 text-xs font-semibold text-black">
                            {t('preview.current')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-foreground-tertiary">
                      <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-background-hover">
                        {getHistoryOperationLabel(version)}
                      </span>
                      <span>{formatImageVersionTimestamp(version.created_at)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {selectedHistoryVersion && (
            <div className="rounded-2xl border border-[#eadfbf] bg-white p-4 dark:border-border-primary dark:bg-background-secondary">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-900 dark:text-foreground-primary">
                    {t('preview.version')} {selectedHistoryVersion.version_number}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-foreground-secondary">
                    <span className="rounded-full bg-[#f8f5eb] px-2 py-1 dark:bg-background-hover">
                      {getHistoryOperationLabel(selectedHistoryVersion)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f8f5eb] px-2 py-1 dark:bg-background-hover">
                      <Clock3 size={12} />
                      {t('preview.historyCreatedAt')}：{formatImageVersionTimestamp(selectedHistoryVersion.created_at)}
                    </span>
                    {selectedHistoryVersion.is_deleted && (
                      <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        {t('preview.historyDeleted')}
                      </span>
                    )}
                    {selectedHistoryVersion.is_current && (
                      <span className="rounded-full bg-banana-500 px-2 py-1 font-semibold text-black">
                        {t('preview.current')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedHistoryVersion.is_deleted
                    ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon={<RotateCcw size={15} />}
                          onClick={() => onRestoreHistoryVersion(selectedHistoryVersion.version_id)}
                          className="h-9 rounded-xl"
                        >
                          {t('preview.historyRestore')}
                        </Button>
                      )
                    : !selectedHistoryVersion.is_current
                      ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => onSwitchVersion(selectedHistoryVersion.version_id)}
                            className="h-9 rounded-xl"
                          >
                            {t('preview.historySwitchToVersion')}
                          </Button>
                        )
                      : null}
                  {!selectedHistoryVersion.is_deleted && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={15} />}
                      onClick={() => onDeleteHistoryVersion(selectedHistoryVersion.version_id)}
                      className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      {t('preview.historyDelete')}
                    </Button>
                  )}
                  {selectedHistoryVersion.prompt_text && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={copiedHistoryVersionId === selectedHistoryVersion.version_id ? <Check size={15} /> : <Copy size={15} />}
                      onClick={onCopyHistoryPrompt}
                      className="h-9 rounded-xl border border-[#eadfbf] bg-[#fffaf0] px-3 text-[#6f5f3d] hover:bg-[#fff3cf] dark:border-border-primary dark:bg-background-hover dark:text-foreground-secondary dark:hover:bg-background-primary"
                    >
                      {copiedHistoryVersionId === selectedHistoryVersion.version_id
                        ? t('preview.historyPromptCopied')
                        : t('preview.historyCopyPrompt')}
                    </Button>
                  )}
                </div>
              </div>

              <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-foreground-primary">
                {t('preview.historyPromptTitle')}
              </div>
              {selectedHistoryVersion.prompt_text ? (
                <pre className="max-h-[62vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[#f8f5eb] px-4 py-4 text-xs leading-6 text-slate-700 dark:bg-[#111827] dark:text-[#dbe4f3]">
                  {selectedHistoryVersion.prompt_text}
                </pre>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#eadfbf] bg-[#fffaf0] px-4 py-10 text-sm text-[#8a7a57] dark:border-border-primary dark:bg-background-hover dark:text-foreground-tertiary">
                  {t('preview.historyPromptMissing')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )}
  </Modal>
);
