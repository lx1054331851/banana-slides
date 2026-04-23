import { useCallback, useState } from 'react';
import { updateProject, uploadTemplate, type UserTemplate } from '@/api/endpoints';
import { materialUrlToFile } from '@/components/shared/MaterialSelector';
import {
  getTemplateFile,
  type AppliedTemplateSelection,
  type TemplateSelection,
  type TemplateSource,
} from '@/components/shared/TemplateSelector';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type UseSlidePreviewTemplateApplyParams = {
  projectId?: string;
  userTemplates: UserTemplate[];
  closeTemplateModal: () => void;
  persistAppliedTemplateSelection: (selection: AppliedTemplateSelection | null) => void;
  syncProject: (projectId?: string) => Promise<unknown>;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export const useSlidePreviewTemplateApply = ({
  projectId,
  userTemplates,
  closeTemplateModal,
  persistAppliedTemplateSelection,
  syncProject,
  show,
  t,
}: UseSlidePreviewTemplateApplyParams) => {
  const [isApplyingSelection, setIsApplyingSelection] = useState(false);

  const handleTemplateSelect = useCallback(async (templateFile: File | null, templateId?: string, source?: TemplateSource) => {
    if (!projectId) return false;

    let file = templateFile;
    if (templateId && !file) {
      file = await getTemplateFile(templateId, userTemplates, source === 'preset' ? 'preset' : 'user');
      if (!file) {
        show({ message: t('slidePreview.loadTemplateFailed'), type: 'error' });
        return false;
      }
    }

    if (!file) return false;

    setIsApplyingSelection(true);
    try {
      await uploadTemplate(projectId, file);
      await updateProject(projectId, { template_style_json: '' } as any);
      await syncProject(projectId);
      show({ message: t('slidePreview.templateChanged'), type: 'success' });
      return true;
    } catch (error: any) {
      show({
        message: t('slidePreview.templateChangeFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
      return false;
    } finally {
      setIsApplyingSelection(false);
    }
  }, [projectId, show, syncProject, t, userTemplates]);

  const handleStylePresetSelect = useCallback(async (presetId: string, styleJson: string) => {
    if (!projectId) return { ok: false, selection: null };
    setIsApplyingSelection(true);
    try {
      await updateProject(projectId, { template_style_json: styleJson || '' } as any);
      await syncProject(projectId);
      show({ message: t('slidePreview.templateChanged'), type: 'success' });
      return { ok: true, selection: { kind: 'style', id: presetId } as AppliedTemplateSelection };
    } catch (error: any) {
      show({
        message: t('slidePreview.templateChangeFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
      return { ok: false, selection: null };
    } finally {
      setIsApplyingSelection(false);
    }
  }, [projectId, show, syncProject, t]);

  const handleApplyTemplateSelection = useCallback(async (selection: TemplateSelection) => {
    if (!projectId) return;

    if (selection.kind === 'style') {
      const result = await handleStylePresetSelect(selection.presetId, selection.styleJson);
      if (result?.ok) {
        persistAppliedTemplateSelection(result.selection);
        closeTemplateModal();
      }
      return;
    }

    if (selection.kind === 'material') {
      const file = await materialUrlToFile(selection.material);
      const applied = await handleTemplateSelect(file, undefined, 'upload');
      if (applied) {
        persistAppliedTemplateSelection({ kind: 'material', id: selection.id });
        closeTemplateModal();
      }
      return;
    }

    const applied = await handleTemplateSelect(null, selection.templateId, selection.kind === 'preset' ? 'preset' : 'user');
    if (applied) {
      persistAppliedTemplateSelection({ kind: selection.kind, id: selection.id });
      closeTemplateModal();
    }
  }, [closeTemplateModal, handleStylePresetSelect, handleTemplateSelect, persistAppliedTemplateSelection, projectId]);

  return {
    isApplyingSelection,
    handleApplyTemplateSelection,
  };
};
