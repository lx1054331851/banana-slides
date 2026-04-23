import { useCallback, useState } from 'react';
import type { GenerateScopeContext } from '../components/BatchGenerateDialogs';
import type { GenerationOverride, Project } from '@/types';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type UseSlidePreviewGenerationParams = {
  currentProject?: Project | null;
  currentImageGenerationOverride: GenerationOverride;
  projectId?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
  generateDescriptions: (projectId?: string, pageIds?: string[], descriptionRequirements?: string) => Promise<unknown>;
  syncProject: (projectId?: string) => Promise<unknown>;
  clearPageDraftsByIds: (pageIds: string[]) => void;
  hydrateSelectedPageEditor: (project?: Project | null) => void;
  getLatestProject: () => Project | null;
  handleBatchGenerate: (pageIds?: string[]) => Promise<void>;
};

export const useSlidePreviewGeneration = ({
  currentProject,
  currentImageGenerationOverride,
  projectId,
  t,
  show,
  generateDescriptions,
  syncProject,
  clearPageDraftsByIds,
  hydrateSelectedPageEditor,
  getLatestProject,
  handleBatchGenerate,
}: UseSlidePreviewGenerationParams) => {
  const [show1KWarningDialog, setShow1KWarningDialog] = useState(false);
  const [skip1KWarningChecked, setSkip1KWarningChecked] = useState(false);
  const [pending1KAction, setPending1KAction] = useState<(() => Promise<void>) | null>(null);
  const [showBatchDescriptionGenerateDialog, setShowBatchDescriptionGenerateDialog] = useState(false);
  const [showBatchGenerateDialog, setShowBatchGenerateDialog] = useState(false);
  const [batchGenerateContext, setBatchGenerateContext] = useState<GenerateScopeContext | null>(null);
  const [batchDescriptionGenerateContext, setBatchDescriptionGenerateContext] = useState<GenerateScopeContext | null>(null);
  const [descriptionRangeStart, setDescriptionRangeStart] = useState('');
  const [descriptionRangeEnd, setDescriptionRangeEnd] = useState('');

  const checkResolutionAndExecute = useCallback(async (action: () => Promise<void>) => {
    const skipWarning = localStorage.getItem('skip1KResolutionWarning') === 'true';
    if (skipWarning) {
      await action();
      return true;
    }

    const resolution = currentImageGenerationOverride.image?.resolution;
    if (resolution === '1K') {
      setPending1KAction(() => action);
      setSkip1KWarningChecked(false);
      setShow1KWarningDialog(true);
      return false;
    }

    await action();
    return true;
  }, [currentImageGenerationOverride]);

  const handleConfirm1KWarning = useCallback(async () => {
    if (skip1KWarningChecked) {
      localStorage.setItem('skip1KResolutionWarning', 'true');
    }
    setShow1KWarningDialog(false);
    if (pending1KAction) {
      await pending1KAction();
      setPending1KAction(null);
    }
  }, [skip1KWarningChecked, pending1KAction]);

  const handleCancel1KWarning = useCallback(() => {
    setShow1KWarningDialog(false);
    setPending1KAction(null);
  }, []);

  const handleGenerateDescriptions = useCallback(async () => {
    if (!currentProject) return;
    const pagesToGenerate = currentProject.pages.filter((page) => page.id);
    const generatedPages = pagesToGenerate.filter((page) => page.status !== 'GENERATING_DESCRIPTION' && Boolean(page.description_content));
    const generatingPages = pagesToGenerate.filter((page) => page.status === 'GENERATING_DESCRIPTION');
    const targetPageIds = pagesToGenerate.map((page) => page.id!).filter(Boolean);
    const missingPageIds = pagesToGenerate
      .filter((page) => page.status !== 'GENERATING_DESCRIPTION' && !page.description_content)
      .map((page) => page.id!)
      .filter(Boolean);
    const totalCount = targetPageIds.length;
    const generatedCount = generatedPages.length;
    const generatingCount = generatingPages.length;
    const missingCount = missingPageIds.length;

    if (totalCount === 0) return;

    setBatchDescriptionGenerateContext({
      total: totalCount,
      generated: generatedCount,
      generating: generatingCount,
      missing: missingCount,
      targetPageIds,
      missingPageIds,
    });
    setDescriptionRangeStart('1');
    setDescriptionRangeEnd(String(totalCount));
    setShowBatchDescriptionGenerateDialog(true);
  }, [currentProject]);

  const closeBatchGenerateDialog = useCallback(() => {
    setShowBatchGenerateDialog(false);
    setBatchGenerateContext(null);
  }, []);

  const closeBatchDescriptionGenerateDialog = useCallback(() => {
    setShowBatchDescriptionGenerateDialog(false);
    setBatchDescriptionGenerateContext(null);
  }, []);

  const handleGenerateDescriptionsByRange = useCallback(async () => {
    if (!batchDescriptionGenerateContext || !currentProject) return;

    const start = Number(descriptionRangeStart);
    const end = Number(descriptionRangeEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      show({ message: t('preview.rangeInvalidNumber'), type: 'error' });
      return;
    }

    const maxPage = batchDescriptionGenerateContext.total;
    if (start < 1 || end < 1 || start > maxPage || end > maxPage) {
      show({ message: t('preview.rangeOutOfBounds', { max: maxPage }), type: 'error' });
      return;
    }

    if (start > end) {
      show({ message: t('preview.rangeInvalidOrder'), type: 'error' });
      return;
    }

    const pageIdsInRange = currentProject.pages
      .slice(start - 1, end)
      .filter((page) => page.id)
      .map((page) => page.id as string);
    const generatingSet = new Set(
      currentProject.pages
        .filter((page) => page.status === 'GENERATING_DESCRIPTION' && page.id)
        .map((page) => page.id as string)
    );
    const executablePageIds = pageIdsInRange.filter((id) => !generatingSet.has(id));
    const skippedCount = pageIdsInRange.length - executablePageIds.length;

    if (executablePageIds.length === 0) {
      show({ message: t('preview.rangeNoAvailablePages'), type: 'info' });
      return;
    }

    closeBatchDescriptionGenerateDialog();
    await generateDescriptions(undefined, executablePageIds);
    await syncProject(projectId);
    clearPageDraftsByIds(executablePageIds);
    hydrateSelectedPageEditor(getLatestProject());
    if (skippedCount > 0) {
      show({ message: t('preview.rangeGeneratingSkipped', { count: skippedCount }), type: 'info' });
    }
  }, [
    batchDescriptionGenerateContext,
    clearPageDraftsByIds,
    closeBatchDescriptionGenerateDialog,
    currentProject,
    descriptionRangeEnd,
    descriptionRangeStart,
    generateDescriptions,
    getLatestProject,
    hydrateSelectedPageEditor,
    projectId,
    show,
    syncProject,
    t,
  ]);

  const handleGenerateMissingImagesFromDialog = useCallback(async () => {
    if (!batchGenerateContext) return;
    const context = batchGenerateContext;
    closeBatchGenerateDialog();
    await handleBatchGenerate(context.missingPageIds);
  }, [batchGenerateContext, closeBatchGenerateDialog, handleBatchGenerate]);

  const handleRegenerateAllImagesFromDialog = useCallback(async () => {
    if (!batchGenerateContext) return;
    const context = batchGenerateContext;
    closeBatchGenerateDialog();
    await handleBatchGenerate(context.targetPageIds);
  }, [batchGenerateContext, closeBatchGenerateDialog, handleBatchGenerate]);

  const handleGenerateMissingDescriptionsFromDialog = useCallback(async () => {
    if (!batchDescriptionGenerateContext) return;
    const context = batchDescriptionGenerateContext;
    closeBatchDescriptionGenerateDialog();
    await generateDescriptions(undefined, context.missingPageIds);
    await syncProject(projectId);
    clearPageDraftsByIds(context.missingPageIds);
    hydrateSelectedPageEditor(getLatestProject());
  }, [
    batchDescriptionGenerateContext,
    clearPageDraftsByIds,
    closeBatchDescriptionGenerateDialog,
    generateDescriptions,
    getLatestProject,
    hydrateSelectedPageEditor,
    projectId,
    syncProject,
  ]);

  const handleRegenerateAllDescriptionsFromDialog = useCallback(async () => {
    if (!batchDescriptionGenerateContext) return;
    const context = batchDescriptionGenerateContext;
    closeBatchDescriptionGenerateDialog();
    await generateDescriptions(undefined, context.targetPageIds);
    await syncProject(projectId);
    clearPageDraftsByIds(context.targetPageIds);
    hydrateSelectedPageEditor(getLatestProject());
  }, [
    batchDescriptionGenerateContext,
    clearPageDraftsByIds,
    closeBatchDescriptionGenerateDialog,
    generateDescriptions,
    getLatestProject,
    hydrateSelectedPageEditor,
    projectId,
    syncProject,
  ]);

  return {
    show1KWarningDialog,
    skip1KWarningChecked,
    setSkip1KWarningChecked,
    handleConfirm1KWarning,
    handleCancel1KWarning,
    showBatchDescriptionGenerateDialog,
    setShowBatchDescriptionGenerateDialog,
    showBatchGenerateDialog,
    setShowBatchGenerateDialog,
    batchGenerateContext,
    setBatchGenerateContext,
    batchDescriptionGenerateContext,
    setBatchDescriptionGenerateContext,
    descriptionRangeStart,
    setDescriptionRangeStart,
    descriptionRangeEnd,
    setDescriptionRangeEnd,
    checkResolutionAndExecute,
    handleGenerateDescriptions,
    handleGenerateDescriptionsByRange,
    closeBatchGenerateDialog,
    closeBatchDescriptionGenerateDialog,
    handleGenerateMissingImagesFromDialog,
    handleRegenerateAllImagesFromDialog,
    handleGenerateMissingDescriptionsFromDialog,
    handleRegenerateAllDescriptionsFromDialog,
  };
};
