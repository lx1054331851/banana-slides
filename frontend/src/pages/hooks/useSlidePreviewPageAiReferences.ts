import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { getImageUrl } from '@/api/client';
import type { PageAiReference } from '@/types';
import {
  escapeMarkdownText,
  isSupportedDescriptionImageUrl,
  removeMarkdownImageByUrl,
  stripMarkdownImages,
} from '../SlidePreview.utils';
import { createUploadedReference, type PageAiUploadedReference } from '../SlidePreview.pageAi';

type PageAiContextImages = {
  useTemplate: boolean;
  descImageUrls: string[];
  uploadedReferences: PageAiUploadedReference[];
};

type UseSlidePreviewPageAiReferencesParams = {
  editPrompt: string;
  setEditPrompt: Dispatch<SetStateAction<string>>;
  selectedContextImages: PageAiContextImages;
  setSelectedContextImages: Dispatch<SetStateAction<PageAiContextImages>>;
  pageAiTextareaRef: RefObject<MarkdownTextareaRef | null>;
  activePreviewReferenceId: string | null;
  setActivePreviewReferenceId: Dispatch<SetStateAction<string | null>>;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export const useSlidePreviewPageAiReferences = ({
  editPrompt,
  setEditPrompt,
  selectedContextImages,
  setSelectedContextImages,
  pageAiTextareaRef,
  activePreviewReferenceId,
  setActivePreviewReferenceId,
  t,
}: UseSlidePreviewPageAiReferencesParams) => {
  const extractImageUrlsFromDescription = useCallback((descriptionText: string | undefined): string[] => {
    if (!descriptionText) return [];
    const pattern = /!\[.*?\]\((.*?)\)/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(descriptionText)) !== null) {
      const url = match[1]?.trim();
      if (url && isSupportedDescriptionImageUrl(url)) {
        matches.push(url);
      }
    }
    return matches;
  }, []);

  const handleFileUpload = useCallback((files: File[]) => {
    setSelectedContextImages((prev) => ({
      ...prev,
      uploadedReferences: [
        ...prev.uploadedReferences,
        ...files.map((file) => createUploadedReference(file, 'upload')),
      ],
    }));
  }, [setSelectedContextImages]);

  const appendPageAiFiles = useCallback((files: File[], options?: {
    sourceType?: PageAiUploadedReference['sourceType'];
    labels?: string[];
    insertIntoPrompt?: boolean;
  }) => {
    const nextReferences = files.map((file, index) => createUploadedReference(
      file,
      options?.sourceType || 'upload',
      options?.labels?.[index] || file.name,
    ));
    setSelectedContextImages((prev) => ({
      ...prev,
      uploadedReferences: [...prev.uploadedReferences, ...nextReferences],
    }));

    if (options?.insertIntoPrompt) {
      nextReferences.forEach((reference) => {
        pageAiTextareaRef.current?.insertAtCursor(
          `![${escapeMarkdownText(reference.label)}](${reference.markdownUrl || reference.previewUrl})\n`
        );
      });
      pageAiTextareaRef.current?.focus();
    }

    return nextReferences;
  }, [pageAiTextareaRef, setSelectedContextImages]);

  const removeUploadedReference = useCallback((referenceId: string) => {
    setSelectedContextImages((prev) => {
      const target = prev.uploadedReferences.find((reference) => reference.id === referenceId);
      const nextUploadedReferences = prev.uploadedReferences.filter((reference) => reference.id !== referenceId);
      if (target?.markdownUrl && target.sourceType !== 'region') {
        setEditPrompt((current) => removeMarkdownImageByUrl(current, target.markdownUrl!));
      }
      if (target?.sourceType === 'region') {
        const nextRegionLines = nextUploadedReferences
          .filter((reference) => reference.sourceType === 'region' && reference.regionComment?.trim())
          .map((reference, index) => `区域${index + 1}：${reference.regionComment?.trim()}`);
        setEditPrompt(nextRegionLines.join('\n'));
      }
      return {
        ...prev,
        uploadedReferences: nextUploadedReferences,
      };
    });
  }, [setEditPrompt, setSelectedContextImages]);

  const selectedPageAiReferences: PageAiReference[] = useMemo(() => {
    const references: PageAiReference[] = [];
    const uploadedMarkdownUrls = new Set(
      selectedContextImages.uploadedReferences
        .map((reference) => reference.markdownUrl)
        .filter((url): url is string => Boolean(url))
    );
    const pageAiInlineImageUrls = extractImageUrlsFromDescription(editPrompt);
    pageAiInlineImageUrls
      .filter((url) => !uploadedMarkdownUrls.has(url))
      .forEach((url, index) => {
        references.push({
          id: `inline-reference:${url}`,
          sourceType: 'description',
          label: `${t('preview.imagesInDescription')} ${index + 1}`,
          previewUrl: isSupportedDescriptionImageUrl(url) ? getImageUrl(url) : url,
        });
      });

    selectedContextImages.uploadedReferences.forEach((reference) => {
      references.push({
        id: reference.id,
        sourceType: reference.sourceType,
        label: reference.label,
        previewUrl: reference.previewUrl,
        regionBounds: reference.regionBounds,
      });
    });
    return references;
  }, [editPrompt, extractImageUrlsFromDescription, selectedContextImages.uploadedReferences, t]);

  const buildPageAiPayload = useCallback(() => {
    const uploadedMarkdownUrls = new Set(
      selectedContextImages.uploadedReferences
        .map((reference) => reference.markdownUrl)
        .filter((url): url is string => Boolean(url))
    );
    const inlineImageUrls = extractImageUrlsFromDescription(editPrompt)
      .filter((url) => !uploadedMarkdownUrls.has(url));
    return {
      promptText: stripMarkdownImages(editPrompt),
      inlineImageUrls,
      uploadedReferences: selectedContextImages.uploadedReferences,
    };
  }, [editPrompt, extractImageUrlsFromDescription, selectedContextImages.uploadedReferences]);

  const handleToggleTemplateReference = useCallback(() => {
    setSelectedContextImages((prev) => ({
      ...prev,
      useTemplate: !prev.useTemplate,
    }));
  }, [setSelectedContextImages]);

  const handleToggleDescriptionImage = useCallback((url: string) => {
    setSelectedContextImages((prev) => {
      const isSelected = prev.descImageUrls.includes(url);
      return {
        ...prev,
        descImageUrls: isSelected
          ? prev.descImageUrls.filter((item) => item !== url)
          : [...prev.descImageUrls, url],
      };
    });
  }, [setSelectedContextImages]);

  const handleRemovePageAiReference = useCallback((referenceId: string) => {
    if (activePreviewReferenceId === referenceId) {
      setActivePreviewReferenceId(null);
    }
    if (referenceId.startsWith('inline-reference:')) {
      const url = referenceId.replace('inline-reference:', '');
      setEditPrompt((current) => removeMarkdownImageByUrl(current, url));
      return;
    }
    removeUploadedReference(referenceId);
  }, [activePreviewReferenceId, removeUploadedReference, setActivePreviewReferenceId, setEditPrompt]);

  return {
    selectedPageAiReferences,
    handleFileUpload,
    appendPageAiFiles,
    removeUploadedReference,
    buildPageAiPayload,
    handleToggleTemplateReference,
    handleToggleDescriptionImage,
    handleRemovePageAiReference,
  };
};
