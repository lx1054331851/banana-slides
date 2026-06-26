import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { buildPageAiContextStoreKey } from '../SlidePreview.utils';
import type {
  PageAiContextState,
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

const buildPageAiModelStorageKey = (projectId: string) => `banana-page-ai-models:${projectId}`;
const buildPageAiModelDefaultStorageKey = (projectId: string) => `banana-page-ai-model-default:${projectId}`;

const readStoredPageAiModels = (projectId?: string | null): Record<string, string> => {
  if (!projectId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(buildPageAiModelStorageKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
      if (key && typeof value === 'string' && value.trim()) {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const readStoredPageAiModelDefault = (projectId?: string | null): string | null => {
  if (!projectId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(buildPageAiModelDefaultStorageKey(projectId));
    const normalized = String(raw || '').trim();
    return normalized || null;
  } catch {
    return null;
  }
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
  const lastHydratedContextKeyRef = useRef<string | null>(null);
  const lastHydratedStoredModelRef = useRef<string | null>(null);
  const justClearedContextKeyRef = useRef<string | null>(null);
  const [storedModelsByContextKey, setStoredModelsByContextKey] = useState<Record<string, string>>(() => (
    readStoredPageAiModels(currentProject?.id)
  ));
  const [storedProjectModel, setStoredProjectModel] = useState<string | null>(() => (
    readStoredPageAiModelDefault(currentProject?.id)
  ));
  const lastStoredProjectIdRef = useRef<string | null>(currentProject?.id || null);

  useEffect(() => {
    const nextProjectId = currentProject?.id || null;
    if (lastStoredProjectIdRef.current === nextProjectId) {
      return;
    }
    lastStoredProjectIdRef.current = nextProjectId;
    setStoredModelsByContextKey(readStoredPageAiModels(nextProjectId));
    setStoredProjectModel(readStoredPageAiModelDefault(nextProjectId));
    lastHydratedContextKeyRef.current = null;
    lastHydratedStoredModelRef.current = null;
  }, [currentProject?.id]);

  useLayoutEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) {
      lastHydratedContextKeyRef.current = null;
      setEditPrompt('');
      setPageAiMessages([]);
      setEditRunImageModel(storedProjectModel || defaultModel);
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedReferences: [],
      });
      return;
    }

    const versionScopedKey = buildPageAiContextStoreKey(pageId, currentImageVersionId);
    const fallbackKey = buildPageAiContextStoreKey(pageId, null);
    const storedModel = storedModelsByContextKey[versionScopedKey]
      || storedModelsByContextKey[fallbackKey]
      || storedProjectModel;
    if (
      lastHydratedContextKeyRef.current === versionScopedKey
      && lastHydratedStoredModelRef.current === (storedModel || null)
    ) {
      return;
    }
    const cached = pageAiContextByVersion[versionScopedKey]
      || (currentImageVersionId ? undefined : pageAiContextByVersion[fallbackKey]);
    if (!cached) {
      lastHydratedContextKeyRef.current = versionScopedKey;
      lastHydratedStoredModelRef.current = storedModel || null;
      setEditPrompt('');
      setPageAiMessages([]);
      setEditRunImageModel(storedModel || defaultModel);
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedReferences: [],
      });
      return;
    }

    lastHydratedContextKeyRef.current = versionScopedKey;
    lastHydratedStoredModelRef.current = storedModel || null;
    setEditPrompt(cached.draftInput);
    setPageAiMessages(cached.messages);
    setEditRunImageModel(storedModel || cached.model);
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
    storedModelsByContextKey,
    storedProjectModel,
  ]);

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) return;

    const contextKey = buildPageAiContextStoreKey(pageId, currentImageVersionId);
    if (lastHydratedContextKeyRef.current !== contextKey) {
      return;
    }
    if (justClearedContextKeyRef.current === contextKey) {
      if (
        !editPrompt
        && pageAiMessages.length === 0
        && selectedContextImages.descImageUrls.length === 0
        && selectedContextImages.uploadedReferences.length === 0
        && !selectedContextImages.useTemplate
      ) {
        justClearedContextKeyRef.current = null;
      }
      return;
    }
    setPageAiContextByVersion((prev) => {
      const isEmptyContext = (
        !editPrompt
        && pageAiMessages.length === 0
        && selectedContextImages.descImageUrls.length === 0
        && selectedContextImages.uploadedReferences.length === 0
        && !selectedContextImages.useTemplate
      );
      if (isEmptyContext && !prev[contextKey]) {
        return prev;
      }
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

  useEffect(() => {
    if (!currentProject?.id) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId || !editRunImageModel) return;

    const contextKey = buildPageAiContextStoreKey(pageId, currentImageVersionId);
    const existingStoredModel = storedModelsByContextKey[contextKey];
    if (
      existingStoredModel
      && existingStoredModel !== editRunImageModel
      && lastHydratedStoredModelRef.current !== existingStoredModel
    ) {
      // A persisted selection exists for this page/version, and the hydration
      // effect has not applied it to local state yet. Skip writing the stale
      // in-memory value back into storage.
      return;
    }
    setStoredModelsByContextKey((prev) => {
      if (prev[contextKey] === editRunImageModel) {
        return prev;
      }
      const next = {
        ...prev,
        [contextKey]: editRunImageModel,
      };
      try {
        window.localStorage.setItem(
          buildPageAiModelStorageKey(currentProject.id!),
          JSON.stringify(next),
        );
      } catch {
        // Ignore storage write failures and keep in-memory selection.
      }
      return next;
    });
    setStoredProjectModel((prev) => {
      if (prev === editRunImageModel) {
        return prev;
      }
      try {
        window.localStorage.setItem(
          buildPageAiModelDefaultStorageKey(currentProject.id!),
          editRunImageModel,
        );
      } catch {
        // Keep the in-memory selection even if storage is unavailable.
      }
      return editRunImageModel;
    });
  }, [currentImageVersionId, currentProject, editRunImageModel, selectedIndex, storedModelsByContextKey]);

  const bindPendingPageAiContext = useCallback((
    pageId: string,
    sourceVersionId: string | null,
    context: PageAiContextState,
  ) => {
    const sourceKey = buildPageAiContextStoreKey(pageId, sourceVersionId);
    setPageAiContextByVersion((prev) => ({
      ...prev,
      [sourceKey]: {
        draftInput: context.draftInput,
        messages: [...context.messages],
        model: context.model,
        contextImages: {
          useTemplate: context.contextImages.useTemplate,
          descImageUrls: [...context.contextImages.descImageUrls],
          uploadedReferences: [...context.contextImages.uploadedReferences],
        },
      },
    }));
  }, []);

  const clearCurrentPageAiContext = useCallback(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) return;

    const contextKey = buildPageAiContextStoreKey(pageId, currentImageVersionId);
    setEditPrompt('');
    setPageAiMessages([]);
    setSelectedContextImages({
      useTemplate: false,
      descImageUrls: [],
      uploadedReferences: [],
    });
    setPageAiContextByVersion((prev) => {
      if (!prev[contextKey]) return prev;
      const next = { ...prev };
      delete next[contextKey];
      return next;
    });
    justClearedContextKeyRef.current = contextKey;
    lastHydratedContextKeyRef.current = contextKey;
  }, [
    currentImageVersionId,
    currentProject,
    selectedIndex,
    setEditPrompt,
    setPageAiMessages,
    setSelectedContextImages,
  ]);

  return {
    pageAiContextByVersion,
    bindPendingPageAiContext,
    clearCurrentPageAiContext,
  };
};
