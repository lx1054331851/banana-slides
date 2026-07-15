import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { PageAiMessage, PageAiReference, Project } from '@/types';
import {
  createPageAiMessage,
  type PageAiContextState,
  type PageAiReferenceMeta,
  type PageAiUploadedReference,
} from '../SlidePreview.pageAi';

type PageAiContextImages = {
  useTemplate: boolean;
  descImageUrls: string[];
  uploadedReferences: PageAiUploadedReference[];
};

type BuildPageAiPayloadResult = {
  promptText: string;
  inlineImageUrls: string[];
  uploadedReferences: PageAiUploadedReference[];
  referenceMetas: PageAiReferenceMeta[];
};

type UseSlidePreviewPageAiSubmitParams = {
  currentProject?: Project | null;
  selectedIndex: number;
  t: (key: string, options?: Record<string, unknown>) => string;
  buildPageAiPayload: () => BuildPageAiPayloadResult;
  selectedPageAiReferences: PageAiReference[];
  pageAiMessages: PageAiMessage[];
  setPageAiMessages: Dispatch<SetStateAction<PageAiMessage[]>>;
  runGenerateFlow: (action: () => Promise<void>) => Promise<boolean>;
  executePageImageGeneration: (options?: {
    prompt?: string;
    sourceImageVersionId?: string | null;
    contextImages?: {
      useTemplate?: boolean;
      descImageUrls?: string[];
      uploadedReferences?: PageAiUploadedReference[];
      referenceMetas?: PageAiReferenceMeta[];
    };
    model?: string;
  }) => Promise<void>;
  editRunImageModel: string;
  currentImageVersionId: string | null;
  sourceImageVersionId: string | null;
  editPrompt: string;
  selectedContextImages: PageAiContextImages;
  bindPendingPageAiContext: (pageId: string, sourceVersionId: string | null, context: PageAiContextState) => void;
};

/** Coordinates current-page AI edits and pins their source image version. */
export const useSlidePreviewPageAiSubmit = ({
  currentProject,
  selectedIndex,
  t,
  buildPageAiPayload,
  selectedPageAiReferences,
  pageAiMessages,
  setPageAiMessages,
  runGenerateFlow,
  executePageImageGeneration,
  editRunImageModel,
  currentImageVersionId,
  sourceImageVersionId,
  editPrompt,
  selectedContextImages,
  bindPendingPageAiContext,
}: UseSlidePreviewPageAiSubmitParams) => {
  const [isPageAiSubmitting, setIsPageAiSubmitting] = useState(false);

  const handleSubmitCurrentPageGeneration = useCallback(async (options?: {
    appendPageAiMessages?: boolean;
  }) => {
    if (!currentProject) return;
    const currentPage = currentProject.pages[selectedIndex];
    const pageId = currentPage?.id;
    if (!pageId) return;

    const payload = buildPageAiPayload();
    const draftText = payload.promptText.trim() || (selectedPageAiReferences.length > 0
      ? t('preview.pageAiReferenceOnlyFallback')
      : '');
    const referenceSnapshot = selectedPageAiReferences.map((reference) => ({ ...reference }));
    const shouldAppendPageAiMessages = Boolean(
      options?.appendPageAiMessages && (draftText || referenceSnapshot.length > 0)
    );
    const userMessage = shouldAppendPageAiMessages
      ? createPageAiMessage(
        'user',
        draftText || t('preview.pageAiReferenceOnlyFallback'),
        referenceSnapshot,
      )
      : null;

    if (userMessage) {
      setPageAiMessages((prev) => [
        ...prev,
        userMessage,
      ]);
    }

    setIsPageAiSubmitting(true);
    try {
      const didStartGeneration = await runGenerateFlow(async () => {
        await executePageImageGeneration({
          prompt: draftText,
          sourceImageVersionId,
          contextImages: {
            useTemplate: false,
            descImageUrls: payload.inlineImageUrls,
            uploadedReferences: payload.uploadedReferences,
            referenceMetas: payload.referenceMetas,
          },
          model: editRunImageModel,
        });
      });

      if (!didStartGeneration) {
        return;
      }

      const assistantMessage = shouldAppendPageAiMessages
        ? createPageAiMessage('assistant', t('preview.pageAiResponseFallback'))
        : null;
      if (assistantMessage) {
        setPageAiMessages((prev) => [
          ...prev,
          assistantMessage,
        ]);
      }

      bindPendingPageAiContext(pageId, currentImageVersionId, {
        draftInput: editPrompt,
        messages: [
          ...pageAiMessages,
          ...(userMessage ? [userMessage] : []),
          ...(assistantMessage ? [assistantMessage] : []),
        ],
        model: editRunImageModel,
        contextImages: {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: [...selectedContextImages.descImageUrls],
          uploadedReferences: [...selectedContextImages.uploadedReferences],
        },
      });

    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        t('preview.generationFailed');

      if (shouldAppendPageAiMessages) {
        setPageAiMessages((prev) => [
          ...prev,
          createPageAiMessage('assistant', errorMessage, [], 'error'),
        ]);
      }
    } finally {
      setIsPageAiSubmitting(false);
    }
  }, [
    bindPendingPageAiContext,
    buildPageAiPayload,
    currentImageVersionId,
    currentProject,
    editPrompt,
    editRunImageModel,
    executePageImageGeneration,
    pageAiMessages,
    runGenerateFlow,
    selectedContextImages,
    selectedIndex,
    selectedPageAiReferences,
    setPageAiMessages,
    sourceImageVersionId,
    t,
  ]);

  const handlePageAiSend = useCallback(async () => {
    await handleSubmitCurrentPageGeneration({ appendPageAiMessages: true });
  }, [handleSubmitCurrentPageGeneration]);

  return {
    isPageAiSubmitting,
    handleSubmitCurrentPageGeneration,
    handlePageAiSend,
  };
};
