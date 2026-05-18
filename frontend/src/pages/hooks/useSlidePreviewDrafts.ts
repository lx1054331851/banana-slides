import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@/types';
import { getDescriptionText } from '@/utils/projectUtils';
import {
  getDescriptionExtraFields,
  getDescriptionStyleGuideBindings,
  getPageDraftKey,
  type StyleGuideBindings,
} from '../SlidePreview.utils';

export type PageDraft = {
  title: string;
  pageType: string;
  points: string;
  description: string;
  extraFields: Record<string, string>;
  styleGuideBindings: StyleGuideBindings;
};

type UseSlidePreviewDraftsParams = {
  currentProject?: Project | null;
  selectedIndex: number;
  formatDescriptionForEditor: (descriptionText: string, project?: Project | null) => string;
  setEditOutlineTitle: (value: string) => void;
  setEditPageType: (value: string) => void;
  setEditOutlinePoints: (value: string) => void;
  setEditDescription: (value: string) => void;
  setEditExtraFields: (value: Record<string, string>) => void;
  setEditStyleGuideBindings: (value: StyleGuideBindings) => void;
};

export const useSlidePreviewDrafts = ({
  currentProject,
  selectedIndex,
  formatDescriptionForEditor,
  setEditOutlineTitle,
  setEditPageType,
  setEditOutlinePoints,
  setEditDescription,
  setEditExtraFields,
  setEditStyleGuideBindings,
}: UseSlidePreviewDraftsParams) => {
  const [pageDrafts, setPageDrafts] = useState<Record<string, PageDraft>>({});

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    if (!page) {
      setEditOutlineTitle('');
      setEditPageType('');
      setEditOutlinePoints('');
      setEditDescription('');
      setEditExtraFields({});
      setEditStyleGuideBindings({});
      return;
    }

    const pageKey = getPageDraftKey(page, selectedIndex);
    if (!pageKey) return;

    const pageDraft = pageDrafts[pageKey];
    if (pageDraft) {
      setEditOutlineTitle(pageDraft.title);
      setEditPageType(pageDraft.pageType);
      setEditOutlinePoints(pageDraft.points);
      setEditDescription(pageDraft.description);
      setEditExtraFields(pageDraft.extraFields);
      setEditStyleGuideBindings(pageDraft.styleGuideBindings || {});
      return;
    }

    setEditOutlineTitle(page.outline_content?.title || '');
    setEditPageType(page.outline_content?.page_type || '');
    setEditOutlinePoints(page.outline_content?.points?.join('\n') || '');
    setEditDescription(formatDescriptionForEditor(getDescriptionText(page.description_content), currentProject));
    setEditExtraFields(getDescriptionExtraFields(page.description_content));
    setEditStyleGuideBindings(getDescriptionStyleGuideBindings(page.description_content));
  }, [
    currentProject,
    formatDescriptionForEditor,
    pageDrafts,
    selectedIndex,
    setEditDescription,
    setEditExtraFields,
    setEditPageType,
    setEditOutlinePoints,
    setEditOutlineTitle,
    setEditStyleGuideBindings,
  ]);

  const persistCurrentPageDraft = useCallback((updates: Partial<PageDraft>) => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageKey = getPageDraftKey(page, selectedIndex);
    if (!pageKey) return;

    setPageDrafts((prev) => {
      const baseDraft = prev[pageKey] || {
        title: page?.outline_content?.title || '',
        pageType: page?.outline_content?.page_type || '',
        points: page?.outline_content?.points?.join('\n') || '',
        description: formatDescriptionForEditor(getDescriptionText(page?.description_content), currentProject),
        extraFields: getDescriptionExtraFields(page?.description_content),
        styleGuideBindings: getDescriptionStyleGuideBindings(page?.description_content),
      };
      return {
        ...prev,
        [pageKey]: {
          ...baseDraft,
          ...updates,
        },
      };
    });
  }, [currentProject, formatDescriptionForEditor, selectedIndex]);

  const clearPageDraftsByIds = useCallback((pageIds: string[]) => {
    if (!pageIds.length) return;
    const targetIds = new Set(pageIds);
    setPageDrafts((prev) => {
      let changed = false;
      const next: Record<string, PageDraft> = {};
      Object.entries(prev).forEach(([key, draft]) => {
        if (targetIds.has(key)) {
          changed = true;
          return;
        }
        next[key] = draft;
      });
      return changed ? next : prev;
    });
  }, []);

  const hydrateSelectedPageEditor = useCallback((project?: Project | null) => {
    const page = project?.pages?.[selectedIndex];
    if (!page) {
      setEditOutlineTitle('');
      setEditPageType('');
      setEditOutlinePoints('');
      setEditDescription('');
      setEditExtraFields({});
      setEditStyleGuideBindings({});
      return;
    }

    setEditOutlineTitle(page.outline_content?.title || '');
    setEditPageType(page.outline_content?.page_type || '');
    setEditOutlinePoints(page.outline_content?.points?.join('\n') || '');
    setEditDescription(formatDescriptionForEditor(getDescriptionText(page.description_content), project));
    setEditExtraFields(getDescriptionExtraFields(page.description_content));
    setEditStyleGuideBindings(getDescriptionStyleGuideBindings(page.description_content));
  }, [
    formatDescriptionForEditor,
    selectedIndex,
    setEditDescription,
    setEditExtraFields,
    setEditPageType,
    setEditOutlinePoints,
    setEditOutlineTitle,
    setEditStyleGuideBindings,
  ]);

  const resetPageDrafts = useCallback(() => {
    setPageDrafts({});
  }, []);

  return {
    persistCurrentPageDraft,
    clearPageDraftsByIds,
    hydrateSelectedPageEditor,
    resetPageDrafts,
  };
};
