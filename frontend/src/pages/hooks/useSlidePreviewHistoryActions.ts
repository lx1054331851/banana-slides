import { useEffect, useRef, useState } from 'react';
import { normalizeErrorMessage } from '@/utils';
import type { ImageVersion } from '@/types';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type UseSlidePreviewHistoryActionsParams = {
  imageVersions: ImageVersion[];
  historyVersionsDescending: ImageVersion[];
  selectedHistoryVersion: ImageVersion | null;
  setSelectedHistoryVersionId: (value: string | null | ((prev: string | null) => string | null)) => void;
  setIsHistoryModalOpen: (value: boolean) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
};

export const useSlidePreviewHistoryActions = ({
  imageVersions,
  historyVersionsDescending,
  selectedHistoryVersion,
  setSelectedHistoryVersionId,
  setIsHistoryModalOpen,
  t,
  show,
}: UseSlidePreviewHistoryActionsParams) => {
  const [copiedHistoryVersionId, setCopiedHistoryVersionId] = useState<string | null>(null);
  const historyCopyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (historyCopyResetTimerRef.current) {
      clearTimeout(historyCopyResetTimerRef.current);
    }
  }, []);

  const getHistoryOperationLabel = (version: ImageVersion): string => {
    switch (version.operation_type) {
      case 'edit':
        return t('preview.historyActionEdit');
      case 'regenerate':
        return t('preview.historyActionRegenerate');
      case 'generate':
        return t('preview.historyActionGenerate');
      default:
        return version.version_number > 1 ? t('preview.historyActionRegenerate') : t('preview.historyActionGenerate');
    }
  };

  const handleOpenHistory = () => {
    if (historyVersionsDescending.length === 0) return;
    setSelectedHistoryVersionId(
      imageVersions.find((version) => version.is_current)?.version_id || historyVersionsDescending[0]?.version_id || null
    );
    setIsHistoryModalOpen(true);
  };

  const handleCopyHistoryPrompt = async () => {
    if (!selectedHistoryVersion?.prompt_text) return;
    try {
      await navigator.clipboard.writeText(selectedHistoryVersion.prompt_text);
      setCopiedHistoryVersionId(selectedHistoryVersion.version_id);
      if (historyCopyResetTimerRef.current) {
        clearTimeout(historyCopyResetTimerRef.current);
      }
      historyCopyResetTimerRef.current = setTimeout(() => {
        setCopiedHistoryVersionId(null);
      }, 2000);
      show({ message: t('preview.historyPromptCopied'), type: 'success' });
    } catch (error) {
      show({
        message: normalizeErrorMessage(
          error instanceof Error ? error.message : t('slidePreview.unknownError')
        ),
        type: 'error',
      });
    }
  };

  return {
    copiedHistoryVersionId,
    getHistoryOperationLabel,
    handleOpenHistory,
    handleCopyHistoryPrompt,
  };
};
