import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { PendingRegionCapture, PageAiUploadedReference } from '../SlidePreview.pageAi';
import { createUploadedReference } from '../SlidePreview.pageAi';
import { buildRegionInstructionLines } from '../pageAiRegionUtils';

type PageAiContextImages = {
  useTemplate: boolean;
  descImageUrls: string[];
  uploadedReferences: PageAiUploadedReference[];
};

type UseSlidePreviewRegionCommentsParams = {
  pendingRegionCapture: PendingRegionCapture | null;
  setPendingRegionCapture: Dispatch<SetStateAction<PendingRegionCapture | null>>;
  pendingRegionComment: string;
  setPendingRegionComment: Dispatch<SetStateAction<string>>;
  pendingRegionEscStep: number;
  setPendingRegionEscStep: Dispatch<SetStateAction<number>>;
  setSelectedContextImages: Dispatch<SetStateAction<PageAiContextImages>>;
  setEditPrompt: Dispatch<SetStateAction<string>>;
  isRegionSelectionMode: boolean;
  setIsRegionSelectionMode: Dispatch<SetStateAction<boolean>>;
  clearSelectionPreview: () => void;
};

// Manage the lifecycle for pending region comments and committed page AI references.
export const useSlidePreviewRegionComments = ({
  pendingRegionCapture,
  setPendingRegionCapture,
  pendingRegionComment,
  setPendingRegionComment,
  pendingRegionEscStep,
  setPendingRegionEscStep,
  setSelectedContextImages,
  setEditPrompt,
  isRegionSelectionMode,
  setIsRegionSelectionMode,
  clearSelectionPreview,
}: UseSlidePreviewRegionCommentsParams) => {
  const clearPendingRegionCapture = useCallback(() => {
    setPendingRegionCapture(null);
    setPendingRegionComment('');
    setPendingRegionEscStep(0);
  }, [setPendingRegionCapture, setPendingRegionComment, setPendingRegionEscStep]);

  const commitPendingRegionCapture = useCallback(() => {
    const comment = pendingRegionComment.trim();
    if (!pendingRegionCapture || !comment) {
      setPendingRegionEscStep(1);
      return;
    }

    setSelectedContextImages((prev) => {
      const nextReference = createUploadedReference(
        new File([], `region-${Date.now()}.json`, { type: 'application/octet-stream' }),
        'region',
        `框选区域 ${prev.uploadedReferences.filter((item) => item.sourceType === 'region').length + 1}`,
        { regionBounds: pendingRegionCapture.regionBounds, regionComment: comment },
      );
      const uploadedReferences = [...prev.uploadedReferences, nextReference];
      setEditPrompt(buildRegionInstructionLines(uploadedReferences).join('\n'));
      return { ...prev, uploadedReferences };
    });
    clearPendingRegionCapture();
  }, [clearPendingRegionCapture, pendingRegionCapture, pendingRegionComment, setEditPrompt, setPendingRegionEscStep, setSelectedContextImages]);

  const cancelPendingRegionCapture = useCallback(() => {
    clearPendingRegionCapture();
    clearSelectionPreview();
  }, [clearPendingRegionCapture, clearSelectionPreview]);

  const handlePendingRegionEsc = useCallback(() => {
    if (!pendingRegionCapture) {
      setIsRegionSelectionMode(false);
      clearSelectionPreview();
    } else if (pendingRegionEscStep === 0) {
      setPendingRegionEscStep(1);
    } else {
      cancelPendingRegionCapture();
    }
  }, [cancelPendingRegionCapture, clearSelectionPreview, pendingRegionCapture, pendingRegionEscStep, setIsRegionSelectionMode, setPendingRegionEscStep]);

  useEffect(() => setPendingRegionEscStep(0), [pendingRegionComment, setPendingRegionEscStep]);
  useEffect(() => {
    if (!pendingRegionCapture) return;
    setPendingRegionComment('');
    setPendingRegionEscStep(0);
  }, [pendingRegionCapture, setPendingRegionComment, setPendingRegionEscStep]);
  useEffect(() => {
    if (!isRegionSelectionMode || typeof window === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pendingRegionCapture) return;
      event.preventDefault();
      setIsRegionSelectionMode(false);
      clearSelectionPreview();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [clearSelectionPreview, isRegionSelectionMode, pendingRegionCapture, setIsRegionSelectionMode]);

  return { clearPendingRegionCapture, commitPendingRegionCapture, cancelPendingRegionCapture, handlePendingRegionEsc };
};
