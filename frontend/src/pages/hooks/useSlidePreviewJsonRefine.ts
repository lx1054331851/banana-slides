import { useEffect, useRef, useState } from 'react';
import { refineSinglePageDescription } from '@/api/endpoints';
import type { DescriptionContent, Project } from '@/types';
import {
  serializeExtraFields,
  serializeStyleGuideBindings,
  toCanonicalRenovationJsonText,
  toLocalizedRenovationJsonText,
  type StyleGuideBindings,
} from '../SlidePreview.utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type UseSlidePreviewJsonRefineParams = {
  currentProject?: Project | null;
  selectedIndex: number;
  projectId?: string;
  selectedPageId?: string;
  selectedPageOutlineContent?: unknown;
  editDescription: string;
  editExtraFields: Record<string, string>;
  editStyleGuideBindings: StyleGuideBindings;
  setEditDescription: (value: string) => void;
  persistCurrentPageDraft: (updates: {
    description?: string;
    extraFields?: Record<string, string>;
    styleGuideBindings?: StyleGuideBindings;
  }) => void;
  updatePageLocal: (pageId: string, updates: Partial<{ description_content: DescriptionContent }>) => void;
  saveAllPages: () => Promise<void>;
  selectedPageDescriptionContent?: DescriptionContent | string;
  t: (key: string, options?: Record<string, unknown>) => string;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
  onApplied?: () => void;
};

export const useSlidePreviewJsonRefine = ({
  currentProject,
  selectedIndex,
  projectId,
  selectedPageId,
  selectedPageOutlineContent,
  editDescription,
  editExtraFields,
  editStyleGuideBindings,
  setEditDescription,
  persistCurrentPageDraft,
  updatePageLocal,
  saveAllPages,
  selectedPageDescriptionContent,
  t,
  show,
  onApplied,
}: UseSlidePreviewJsonRefineParams) => {
  const [showJsonRefineDialog, setShowJsonRefineDialog] = useState(false);
  const [jsonRefineRequirement, setJsonRefineRequirement] = useState('');
  const [jsonRefineHistory, setJsonRefineHistory] = useState<string[]>([]);
  const [isJsonRefining, setIsJsonRefining] = useState(false);
  const jsonRefineInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentProject) {
      setJsonRefineRequirement('');
      setJsonRefineHistory([]);
      return;
    }

    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) {
      setJsonRefineRequirement('');
      setJsonRefineHistory([]);
      return;
    }

    const context = page.json_refine_context || {};
    const requirementDraft = typeof context.requirement_draft === 'string' ? context.requirement_draft : '';
    const history = Array.isArray(context.history)
      ? context.history.filter((item): item is string => typeof item === 'string')
      : [];

    setJsonRefineRequirement(requirementDraft);
    setJsonRefineHistory(history);
  }, [currentProject, selectedIndex]);

  useEffect(() => {
    if (!showJsonRefineDialog) return;
    const timer = window.setTimeout(() => {
      jsonRefineInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [showJsonRefineDialog]);

  useEffect(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) return;

    const context = page.json_refine_context || {};
    const requirementDraft = typeof context.requirement_draft === 'string' ? context.requirement_draft : '';
    const history = Array.isArray(context.history)
      ? context.history.filter((item): item is string => typeof item === 'string')
      : [];
    const sameRequirement = requirementDraft === jsonRefineRequirement;
    const sameHistory = history.length === jsonRefineHistory.length
      && history.every((item, index) => item === jsonRefineHistory[index]);

    if (sameRequirement && sameHistory) {
      return;
    }

    updatePageLocal(pageId, {
      json_refine_context: {
        requirement_draft: jsonRefineRequirement,
        history: [...jsonRefineHistory],
      },
    } as any);
  }, [currentProject, selectedIndex, jsonRefineRequirement, jsonRefineHistory, updatePageLocal]);

  const handleSubmitJsonRefine = async () => {
    if (!projectId || !selectedPageId) return;
    const requirement = jsonRefineRequirement.trim();
    if (!requirement || isJsonRefining) return;

    try {
      setIsJsonRefining(true);
      const response = await refineSinglePageDescription(
        projectId,
        selectedPageId,
        requirement,
        editDescription,
        selectedPageOutlineContent,
        jsonRefineHistory,
        undefined,
        'json',
      );
      const refinedText = response.data?.refined_description || '';
      const nextText = toLocalizedRenovationJsonText(refinedText, 4);
      const nextStoredText = toCanonicalRenovationJsonText(nextText, 4);
      setEditDescription(nextText);
      persistCurrentPageDraft({ description: nextText });
      const nextDescriptionContent: Record<string, any> = {
        ...(selectedPageDescriptionContent && typeof selectedPageDescriptionContent === 'object'
          ? selectedPageDescriptionContent as Record<string, any>
          : {}),
        text: nextStoredText,
      };
      const serializedExtraFields = serializeExtraFields(editExtraFields);
      const serializedStyleGuideBindings = serializeStyleGuideBindings(editStyleGuideBindings);
      if (serializedExtraFields) {
        nextDescriptionContent.extra_fields = serializedExtraFields;
      } else {
        delete nextDescriptionContent.extra_fields;
      }
      if (serializedStyleGuideBindings) {
        nextDescriptionContent.style_guide_bindings = serializedStyleGuideBindings;
      } else {
        delete nextDescriptionContent.style_guide_bindings;
      }
      updatePageLocal(selectedPageId, {
        description_content: nextDescriptionContent as DescriptionContent,
      });
      await saveAllPages();
      onApplied?.();
      setJsonRefineHistory((prev) => [...prev, requirement]);
      setJsonRefineRequirement('');
      setShowJsonRefineDialog(false);
      show({ message: t('preview.refineApplied'), type: 'success' });
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        t('preview.refineFailed');
      show({ message: errorMessage, type: 'error' });
    } finally {
      setIsJsonRefining(false);
    }
  };

  return {
    showJsonRefineDialog,
    setShowJsonRefineDialog,
    jsonRefineRequirement,
    setJsonRefineRequirement,
    jsonRefineHistory,
    setJsonRefineHistory,
    isJsonRefining,
    jsonRefineInputRef,
    handleSubmitJsonRefine,
  };
};
