import { useCallback, useMemo, type MutableRefObject, type RefObject } from 'react';
import type { Material } from '@/api/endpoints';
import { materialUrlToFile } from '@/components/shared/MaterialSelector';
import type { MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { DESCRIPTION_UPLOAD_ACCEPT, escapeMarkdownText, getMaterialMarkdownLabel } from '../SlidePreview.utils';
import type { PageAiUploadedReference } from '../SlidePreview.pageAi';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type UseSlidePreviewMaterialsParams = {
  materialSelectorMode: 'description' | 'pageAi' | 'pageAiInline';
  setMaterialSelectorMode: (mode: 'description' | 'pageAi' | 'pageAiInline') => void;
  setIsMaterialSelectorOpen: (value: boolean) => void;
  projectId?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
  handleDescriptionFiles: (files: File[]) => Promise<void>;
  descriptionTextareaRef: RefObject<MarkdownTextareaRef | null>;
  activeDescriptionInsertAtCursor: MutableRefObject<((markdown: string) => void) | undefined>;
  pageAiTextareaRef: RefObject<MarkdownTextareaRef | null>;
  appendPageAiFiles: (files: File[], options?: {
    sourceType?: PageAiUploadedReference['sourceType'];
    labels?: string[];
    insertIntoPrompt?: boolean;
  }) => PageAiUploadedReference[];
};

export const useSlidePreviewMaterials = ({
  materialSelectorMode,
  setMaterialSelectorMode,
  setIsMaterialSelectorOpen,
  projectId,
  t,
  show,
  handleDescriptionFiles,
  descriptionTextareaRef,
  activeDescriptionInsertAtCursor,
  pageAiTextareaRef,
  appendPageAiFiles,
}: UseSlidePreviewMaterialsParams) => {
  const handleSelectMaterials = useCallback(async (materials: Material[]) => {
    if (materialSelectorMode === 'description') {
      const markdown = materials
        .map((material) => `![${escapeMarkdownText(getMaterialMarkdownLabel(material))}](${material.url})`)
        .join('\n');
      if (markdown) {
        activeDescriptionInsertAtCursor.current?.(`${markdown}\n`);
        show({ message: t('slidePreview.materialsAdded', { count: materials.length }), type: 'success' });
      }
      return;
    }

    if (materialSelectorMode === 'pageAiInline') {
      const markdown = materials
        .map((material) => `![${escapeMarkdownText(getMaterialMarkdownLabel(material))}](${material.url})`)
        .join('\n');
      if (markdown) {
        pageAiTextareaRef.current?.insertAtCursor(`${markdown}\n`);
        pageAiTextareaRef.current?.focus();
        show({ message: t('slidePreview.materialsAdded', { count: materials.length }), type: 'success' });
      }
      return;
    }

    try {
      const files = await Promise.all(
        materials.map((material) => materialUrlToFile(material))
      );
      appendPageAiFiles(files, {
        sourceType: 'material',
        labels: materials.map((material) => material.name || material.filename || getMaterialMarkdownLabel(material)),
      });
      show({ message: t('slidePreview.materialsAdded', { count: materials.length }), type: 'success' });
    } catch (error: any) {
      console.error('加载素材失败:', error);
      show({
        message: t('slidePreview.loadMaterialFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    }
  }, [
    activeDescriptionInsertAtCursor,
    appendPageAiFiles,
    materialSelectorMode,
    pageAiTextareaRef,
    show,
    t,
  ]);

  const descriptionSlashActions = useMemo(() => {
    const actions = [
      {
        id: 'upload-local',
        label: t('preview.descriptionSlashUpload'),
        description: t('preview.descriptionSlashUploadDesc'),
        onSelect: () => {
          descriptionTextareaRef.current?.focus();
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = DESCRIPTION_UPLOAD_ACCEPT;
          input.multiple = true;
          input.style.position = 'fixed';
          input.style.left = '-9999px';
          document.body.appendChild(input);
          input.oncancel = () => {
            input.remove();
          };
          input.onchange = () => {
            const files = Array.from(input.files || []);
            input.remove();
            if (files.length > 0) {
              void handleDescriptionFiles(files);
            }
          };
          input.click();
        },
      },
    ];

    if (projectId) {
      actions.push({
        id: 'select-material',
        label: t('preview.descriptionSlashMaterials'),
        description: t('preview.descriptionSlashMaterialsDesc'),
        onSelect: () => {
          setMaterialSelectorMode('description');
          setIsMaterialSelectorOpen(true);
        },
      });
    }

    return actions;
  }, [descriptionTextareaRef, handleDescriptionFiles, projectId, setIsMaterialSelectorOpen, setMaterialSelectorMode, t]);

  const pageAiSlashActions = useMemo(() => {
    const actions = [
      {
        id: 'upload-local',
        label: t('preview.descriptionSlashUpload'),
        description: t('preview.descriptionSlashUploadDesc'),
        onSelect: () => {
          pageAiTextareaRef.current?.focus();
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = DESCRIPTION_UPLOAD_ACCEPT;
          input.multiple = true;
          input.style.position = 'fixed';
          input.style.left = '-9999px';
          document.body.appendChild(input);
          input.oncancel = () => {
            input.remove();
          };
          input.onchange = () => {
            const files = Array.from(input.files || []);
            input.remove();
            if (files.length > 0) {
              appendPageAiFiles(files, { sourceType: 'upload', insertIntoPrompt: true });
            }
          };
          input.click();
        },
      },
    ];

    if (projectId) {
      actions.push({
        id: 'select-material',
        label: t('preview.descriptionSlashMaterials'),
        description: t('preview.descriptionSlashMaterialsDesc'),
        onSelect: () => {
          setMaterialSelectorMode('pageAiInline');
          setIsMaterialSelectorOpen(true);
        },
      });
    }

    return actions;
  }, [appendPageAiFiles, pageAiTextareaRef, projectId, setIsMaterialSelectorOpen, setMaterialSelectorMode, t]);

  return {
    handleSelectMaterials,
    descriptionSlashActions,
    pageAiSlashActions,
  };
};
