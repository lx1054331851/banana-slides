import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AppliedTemplateSelection,
  TemplateSelection,
  TemplateSelectorTab,
} from '@/components/shared/TemplateSelector';

type UseSlidePreviewTemplateSelectionParams = {
  projectId?: string;
  templateStyleJson?: string | null;
};

export const useSlidePreviewTemplateSelection = ({
  projectId,
  templateStyleJson,
}: UseSlidePreviewTemplateSelectionParams) => {
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<TemplateSelectorTab>('image');
  const [draftTemplateSelection, setDraftTemplateSelection] = useState<TemplateSelection | null>(null);
  const [appliedTemplateSelection, setAppliedTemplateSelection] = useState<AppliedTemplateSelection | null>(null);

  const templateSelectionStorageKey = useMemo(
    () => (projectId ? `preview-template-selection:${projectId}` : null),
    [projectId]
  );

  useEffect(() => {
    if (!templateSelectionStorageKey) {
      setAppliedTemplateSelection(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(templateSelectionStorageKey);
      if (!raw) {
        setAppliedTemplateSelection(null);
        return;
      }
      const parsed = JSON.parse(raw) as AppliedTemplateSelection;
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.kind === 'string' &&
        typeof parsed.id === 'string'
      ) {
        setAppliedTemplateSelection(parsed);
        return;
      }
    } catch (error) {
      console.warn('Failed to restore applied template selection:', error);
    }
    setAppliedTemplateSelection(null);
  }, [templateSelectionStorageKey]);

  const persistAppliedTemplateSelection = useCallback((selection: AppliedTemplateSelection | null) => {
    setAppliedTemplateSelection(selection);
    if (!templateSelectionStorageKey) return;
    if (!selection) {
      sessionStorage.removeItem(templateSelectionStorageKey);
      return;
    }
    sessionStorage.setItem(templateSelectionStorageKey, JSON.stringify(selection));
  }, [templateSelectionStorageKey]);

  const closeTemplateModal = useCallback(() => {
    setDraftTemplateSelection(null);
    setIsTemplateModalOpen(false);
  }, []);

  const openTemplateModal = useCallback(() => {
    setDraftTemplateSelection(null);
    const nextTab: TemplateSelectorTab = templateStyleJson
      ? 'json'
      : appliedTemplateSelection?.kind === 'material'
        ? 'material'
        : 'image';
    setActiveTemplateTab(nextTab);
    setIsTemplateModalOpen(true);
  }, [appliedTemplateSelection?.kind, templateStyleJson]);

  return {
    isTemplateModalOpen,
    activeTemplateTab,
    setActiveTemplateTab,
    draftTemplateSelection,
    setDraftTemplateSelection,
    appliedTemplateSelection,
    persistAppliedTemplateSelection,
    closeTemplateModal,
    openTemplateModal,
  };
};
