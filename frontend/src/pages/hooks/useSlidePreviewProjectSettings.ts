import { useCallback, useState, type MutableRefObject } from 'react';
import { updateProject } from '@/api/endpoints';
import type {
  ExportExtractorMethod,
  ExportInpaintMethod,
  GenerationOverride,
  Project,
} from '@/types';
import {
  getImageSourceForModel,
  normalizeProjectDefaultImageSource,
  normalizeProjectDefaultImageModel,
  normalizeProjectDefaultImageResolution,
} from '@/config/projectAiDefaults';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type UseSlidePreviewProjectSettingsParams = {
  currentProject?: Project | null;
  projectId?: string;
  extraRequirements: string;
  templateStyle: string;
  descriptionRequirementsDraft: string;
  projectDefaultImageSource: string;
  projectDefaultImageModel: string;
  projectDefaultImageResolution: string;
  exportExtractorMethod: ExportExtractorMethod;
  exportInpaintMethod: ExportInpaintMethod;
  exportAllowPartial: boolean;
  exportCompressEnabled: boolean;
  exportCompressFormat: 'jpeg' | 'png' | 'webp';
  exportCompressQuality: number;
  exportCompressPngQuantizeEnabled: boolean;
  aspectRatio: string;
  isEditingRequirementsRef: MutableRefObject<boolean>;
  isEditingTemplateStyleRef: MutableRefObject<boolean>;
  syncProject: (projectId?: string) => Promise<unknown>;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export const useSlidePreviewProjectSettings = ({
  currentProject,
  projectId,
  extraRequirements,
  templateStyle,
  descriptionRequirementsDraft,
  projectDefaultImageSource,
  projectDefaultImageModel,
  projectDefaultImageResolution,
  exportExtractorMethod,
  exportInpaintMethod,
  exportAllowPartial,
  exportCompressEnabled,
  exportCompressFormat,
  exportCompressQuality,
  exportCompressPngQuantizeEnabled,
  aspectRatio,
  isEditingRequirementsRef,
  isEditingTemplateStyleRef,
  syncProject,
  show,
  t,
}: UseSlidePreviewProjectSettingsParams) => {
  const [isSavingRequirements, setIsSavingRequirements] = useState(false);
  const [isSavingTemplateStyle, setIsSavingTemplateStyle] = useState(false);
  const [isSavingDescriptionRequirements, setIsSavingDescriptionRequirements] = useState(false);
  const [isSavingGenerationDefaults, setIsSavingGenerationDefaults] = useState(false);
  const [isSavingExportSettings, setIsSavingExportSettings] = useState(false);
  const [isSavingAspectRatio, setIsSavingAspectRatio] = useState(false);

  const handleSaveExtraRequirements = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingRequirements(true);
    try {
      await updateProject(projectId, { extra_requirements: extraRequirements || '' });
      isEditingRequirementsRef.current = false;
      await syncProject(projectId);
      show({ message: t('slidePreview.extraRequirementsSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    } finally {
      setIsSavingRequirements(false);
    }
  }, [currentProject, extraRequirements, isEditingRequirementsRef, projectId, show, syncProject, t]);

  const handleSaveTemplateStyle = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingTemplateStyle(true);
    try {
      await updateProject(projectId, { template_style: templateStyle || '' });
      isEditingTemplateStyleRef.current = false;
      await syncProject(projectId);
      show({ message: t('slidePreview.styleDescSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    } finally {
      setIsSavingTemplateStyle(false);
    }
  }, [currentProject, isEditingTemplateStyleRef, projectId, show, syncProject, t, templateStyle]);

  const handleSaveDescriptionRequirements = useCallback(async () => {
    if (!currentProject || !projectId) return;
    setIsSavingDescriptionRequirements(true);
    try {
      await updateProject(projectId, { description_requirements: descriptionRequirementsDraft || '' });
      await syncProject(projectId);
      show({ message: '描述生成要求已保存', type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    } finally {
      setIsSavingDescriptionRequirements(false);
    }
  }, [currentProject, descriptionRequirementsDraft, projectId, show, syncProject, t]);

  const handleSaveGenerationDefaults = useCallback(async () => {
    if (!currentProject || !projectId) return;
    setIsSavingGenerationDefaults(true);
    try {
      const normalizedModel = normalizeProjectDefaultImageModel(projectDefaultImageModel);
      const normalizedSource = normalizeProjectDefaultImageSource(
        projectDefaultImageSource,
        normalizedModel,
      );
      const normalizedResolution = normalizeProjectDefaultImageResolution(
        projectDefaultImageResolution,
        normalizedModel
      );
      const imageDefaults: Record<string, string> = {
        source: getImageSourceForModel(normalizedModel, normalizedSource),
        model: normalizedModel,
        resolution: normalizedResolution,
      };
      const generationDefaults: GenerationOverride = { image: imageDefaults };
      await updateProject(projectId, { generation_defaults: generationDefaults });
      await syncProject(projectId);
      show({ message: '项目 AI 默认已保存', type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    } finally {
      setIsSavingGenerationDefaults(false);
    }
  }, [
    currentProject,
    projectDefaultImageSource,
    projectDefaultImageModel,
    projectDefaultImageResolution,
    projectId,
    show,
    syncProject,
    t,
  ]);

  const handleSaveExportSettings = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingExportSettings(true);
    try {
      await updateProject(projectId, {
        export_extractor_method: exportExtractorMethod,
        export_inpaint_method: exportInpaintMethod,
        export_allow_partial: exportAllowPartial,
        export_compress_enabled: exportCompressEnabled,
        export_compress_format: exportCompressFormat,
        export_compress_quality: exportCompressQuality,
        export_compress_png_quantize_enabled: exportCompressPngQuantizeEnabled,
      });
      await syncProject(projectId);
      show({ message: t('slidePreview.exportSettingsSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    } finally {
      setIsSavingExportSettings(false);
    }
  }, [
    currentProject,
    exportAllowPartial,
    exportCompressEnabled,
    exportCompressFormat,
    exportCompressPngQuantizeEnabled,
    exportCompressQuality,
    exportExtractorMethod,
    exportInpaintMethod,
    projectId,
    show,
    syncProject,
    t,
  ]);

  const handleSaveAspectRatio = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingAspectRatio(true);
    try {
      await updateProject(projectId, { image_aspect_ratio: aspectRatio });
      await syncProject(projectId);
      show({ message: t('slidePreview.aspectRatioSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    } finally {
      setIsSavingAspectRatio(false);
    }
  }, [aspectRatio, currentProject, projectId, show, syncProject, t]);

  return {
    isSavingRequirements,
    isSavingTemplateStyle,
    isSavingDescriptionRequirements,
    isSavingGenerationDefaults,
    isSavingExportSettings,
    isSavingAspectRatio,
    handleSaveExtraRequirements,
    handleSaveTemplateStyle,
    handleSaveDescriptionRequirements,
    handleSaveGenerationDefaults,
    handleSaveExportSettings,
    handleSaveAspectRatio,
  };
};
