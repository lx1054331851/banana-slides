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

const areStringArraysEqual = (left: string[], right: string[]) => (
  left.length === right.length && left.every((item, index) => item === right[index])
);

const areUploadedReferencesEqual = (
  left: PageAiUploadedReference[],
  right: PageAiUploadedReference[],
) => (
  left.length === right.length
  && left.every((item, index) => (
    item.id === right[index]?.id
    && item.label === right[index]?.label
    && item.markdownUrl === right[index]?.markdownUrl
    && item.previewUrl === right[index]?.previewUrl
    && item.sourceType === right[index]?.sourceType
    && item.regionComment === right[index]?.regionComment
  ))
);

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
  const lastHydratedContextKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) {
      lastHydratedContextKeyRef.current = null;
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
    if (lastHydratedContextKeyRef.current === versionScopedKey) {
      return;
    }
    const pendingBoundContext = pendingPageAiContextBindingRef.current[pageId]?.context;
    const cached = pageAiContextByVersion[versionScopedKey]
      || pendingBoundContext
      || pageAiContextByVersion[fallbackKey];
    if (!cached) {
      lastHydratedContextKeyRef.current = versionScopedKey;
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

    lastHydratedContextKeyRef.current = versionScopedKey;
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
    pageAiContextByVersion,
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
    setPageAiContextByVersion((prev) => {
      const nextContext = {
        draftInput: editPrompt,
        messages: pageAiMessages,
        model: editRunImageModel,
        contextImages: {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: [...selectedContextImages.descImageUrls],
          uploadedReferences: [...selectedContextImages.uploadedReferences],
        },
      };
      const existing = prev[contextKey];
      if (
        existing
        && existing.draftInput === nextContext.draftInput
        && existing.model === nextContext.model
        && existing.messages === nextContext.messages
        && existing.contextImages.useTemplate === nextContext.contextImages.useTemplate
        && areStringArraysEqual(existing.contextImages.descImageUrls, nextContext.contextImages.descImageUrls)
        && areUploadedReferencesEqual(existing.contextImages.uploadedReferences, nextContext.contextImages.uploadedReferences)
      ) {
        return prev;
      }
      return {
        ...prev,
        [contextKey]: nextContext,
      };
    });
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
