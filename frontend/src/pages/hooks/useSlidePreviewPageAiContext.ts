import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { buildPageAiContextStoreKey } from '../SlidePreview.utils';
import type {
  PageAiContextState,
  PendingPageAiContextBinding,
  PageAiUploadedReference,
} from '../SlidePreview.pageAi';
import type { PageAiMessage, Project } from '@/types';

type PageAiContextImages = {
  useTemplate: boolean;
  descImageUrls: string[];
  uploadedReferences: PageAiUploadedReference[];
};

type UseSlidePreviewPageAiContextParams = {
  currentProject?: Project | null;
  selectedIndex: number;
  currentImageVersionId: string | null;
  defaultModel: string;
  editPrompt: string;
  setEditPrompt: Dispatch<SetStateAction<string>>;
  pageAiMessages: PageAiMessage[];
  setPageAiMessages: Dispatch<SetStateAction<PageAiMessage[]>>;
  editRunImageModel: string;
  setEditRunImageModel: Dispatch<SetStateAction<string>>;
  selectedContextImages: PageAiContextImages;
  setSelectedContextImages: Dispatch<SetStateAction<PageAiContextImages>>;
};

export const useSlidePreviewPageAiContext = ({
  currentProject,
  selectedIndex,
  currentImageVersionId,
  defaultModel,
  editPrompt,
  setEditPrompt,
  pageAiMessages,
  setPageAiMessages,
  editRunImageModel,
  setEditRunImageModel,
  selectedContextImages,
  setSelectedContextImages,
}: UseSlidePreviewPageAiContextParams) => {
  const [pageAiContextByVersion, setPageAiContextByVersion] = useState<Record<string, PageAiContextState>>({});
  const pendingPageAiContextBindingRef = useRef<Record<string, PendingPageAiContextBinding>>({});

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) {
      setEditPrompt('');
      setPageAiMessages([]);
      setEditRunImageModel(defaultModel);
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedReferences: [],
      });
      return;
    }

    const versionScopedKey = buildPageAiContextStoreKey(pageId, currentImageVersionId);
    const fallbackKey = buildPageAiContextStoreKey(pageId, null);
    const pendingBoundContext = pendingPageAiContextBindingRef.current[pageId]?.context;
    const cached = pageAiContextByVersion[versionScopedKey]
      || pendingBoundContext
      || pageAiContextByVersion[fallbackKey];
    if (!cached) {
      setEditPrompt('');
      setPageAiMessages([]);
      setEditRunImageModel(defaultModel);
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedReferences: [],
      });
      return;
    }

    setEditPrompt(cached.draftInput);
    setPageAiMessages(cached.messages);
    setEditRunImageModel(cached.model);
    setSelectedContextImages({
      useTemplate: cached.contextImages.useTemplate,
      descImageUrls: [...cached.contextImages.descImageUrls],
      uploadedReferences: [...cached.contextImages.uploadedReferences],
    });
  }, [
    currentProject?.id,
    currentImageVersionId,
    defaultModel,
    selectedIndex,
  ]);

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId || !currentImageVersionId) return;

    const pendingBinding = pendingPageAiContextBindingRef.current[pageId];
    if (!pendingBinding || pendingBinding.sourceVersionId === currentImageVersionId) {
      return;
    }

    const versionScopedKey = buildPageAiContextStoreKey(pageId, currentImageVersionId);
    setPageAiContextByVersion((prev) => ({
      ...prev,
      [versionScopedKey]: {
        draftInput: pendingBinding.context.draftInput,
        messages: [...pendingBinding.context.messages],
        model: pendingBinding.context.model,
        contextImages: {
          useTemplate: pendingBinding.context.contextImages.useTemplate,
          descImageUrls: [...pendingBinding.context.contextImages.descImageUrls],
          uploadedReferences: [...pendingBinding.context.contextImages.uploadedReferences],
        },
      },
    }));
    delete pendingPageAiContextBindingRef.current[pageId];
  }, [currentProject, currentImageVersionId, selectedIndex]);

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) return;

    const contextKey = buildPageAiContextStoreKey(pageId, currentImageVersionId);
    setPageAiContextByVersion((prev) => ({
      ...prev,
      [contextKey]: {
        draftInput: editPrompt,
        messages: pageAiMessages,
        model: editRunImageModel,
        contextImages: {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: [...selectedContextImages.descImageUrls],
          uploadedReferences: [...selectedContextImages.uploadedReferences],
        },
      },
    }));
  }, [
    currentProject,
    currentImageVersionId,
    editPrompt,
    editRunImageModel,
    pageAiMessages,
    selectedContextImages,
    selectedIndex,
  ]);

  const bindPendingPageAiContext = useCallback((
    pageId: string,
    sourceVersionId: string | null,
    context: PageAiContextState,
  ) => {
    pendingPageAiContextBindingRef.current[pageId] = {
      sourceVersionId,
      context,
    };
  }, []);

  return {
    pageAiContextByVersion,
    bindPendingPageAiContext,
  };
};
