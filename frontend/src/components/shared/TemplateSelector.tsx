import React, { useState, useEffect, useMemo } from 'react';
import { Button, Modal, useToast, MaterialSelector } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { getImageUrl } from '@/api/client';
import {
  listUserTemplates,
  uploadUserTemplate,
  deleteUserTemplate,
  listPresetTemplates,
  listStylePresets,
  type UserTemplate,
  type PresetTemplate,
  type Material,
  type StylePreset,
  type StylePresetPreviewImages,
} from '@/api/endpoints';
import { materialUrlToFile } from '@/components/shared/MaterialSelector';
import { ImagePlus, X } from 'lucide-react';

export type TemplateSource = 'user' | 'preset' | 'upload';

const templateI18n = {
  zh: {
    template: {
      myTemplates: '我的模板',
      presetTemplates: '预设模板',
      styleTemplates: '风格模板',
      morePresetTemplates: '更多预设模板',
      moreStyleTemplates: '更多风格模板',
      more: '更多',
      noPresetTemplates: '暂无预设模板',
      noStyleTemplates: '暂无风格模板',
      uploadTemplate: '上传模板',
      deleteTemplate: '删除模板',
      templateSelected: '已选择',
      saveToLibraryOnUpload: '上传模板时同时保存到我的模板库',
      selectFromMaterials: '从素材库选择',
      selectAsTemplate: '从素材库选择作为模板',
      cannotDeleteInUse: '当前使用中的模板不能删除，请先取消选择或切换',
      messages: {
        uploadSuccess: '模板上传成功',
        uploadFailed: '模板上传失败',
        deleteSuccess: '模板已删除',
        deleteFailed: '删除模板失败',
        styleTemplateApplied: '已选择风格模板',
        styleTemplateApplyFailed: '选择风格模板失败',
      }
    },
    material: {
      messages: {
        savedToLibrary: '素材已保存到模板库',
        selectedAsTemplate: '已从素材库选择作为模板',
        loadMaterialFailed: '加载素材失败'
      }
    }
  },
  en: {
    template: {
      myTemplates: 'My Templates',
      presetTemplates: 'Preset Templates',
      styleTemplates: 'Style Templates',
      morePresetTemplates: 'More Preset Templates',
      moreStyleTemplates: 'More Style Templates',
      more: 'More',
      noPresetTemplates: 'No preset templates',
      noStyleTemplates: 'No style templates',
      uploadTemplate: 'Upload Template',
      deleteTemplate: 'Delete Template',
      templateSelected: 'Selected',
      saveToLibraryOnUpload: 'Save to my template library when uploading',
      selectFromMaterials: 'Select from Materials',
      selectAsTemplate: 'Select from materials as template',
      cannotDeleteInUse: 'Cannot delete template in use, please deselect or switch first',
      messages: {
        uploadSuccess: 'Template uploaded successfully',
        uploadFailed: 'Failed to upload template',
        deleteSuccess: 'Template deleted',
        deleteFailed: 'Failed to delete template',
        styleTemplateApplied: 'Style template selected',
        styleTemplateApplyFailed: 'Failed to select style template',
      }
    },
    material: {
      messages: {
        savedToLibrary: 'Material saved to template library',
        selectedAsTemplate: 'Selected from library as template',
        loadMaterialFailed: 'Failed to load materials'
      }
    }
  }
};

interface TemplateSelectorProps {
  onSelect: (templateFile: File | null, templateId?: string, source?: TemplateSource) => void;
  onSelectStylePreset?: (preset: StylePreset | null) => Promise<void> | void;
  selectedTemplateId?: string | null;
  selectedPresetTemplateId?: string | null;
  selectedStylePresetId?: string | null;
  showUpload?: boolean;
  projectId?: string | null;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  onSelect,
  onSelectStylePreset,
  selectedTemplateId,
  selectedPresetTemplateId,
  selectedStylePresetId,
  showUpload = true,
  projectId,
}) => {
  const t = useT(templateI18n);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [presetTemplates, setPresetTemplates] = useState<PresetTemplate[]>([]);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingPresetTemplates, setIsLoadingPresetTemplates] = useState(false);
  const [isLoadingStylePresets, setIsLoadingStylePresets] = useState(false);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const [isPresetTemplateModalOpen, setIsPresetTemplateModalOpen] = useState(false);
  const [isStylePresetModalOpen, setIsStylePresetModalOpen] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [selectingStylePresetId, setSelectingStylePresetId] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const { show, ToastContainer } = useToast();

  useEffect(() => {
    void loadUserTemplates();
    void loadPresetTemplates();
    void loadStylePresets();
  }, []);

  const loadUserTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await listUserTemplates();
      setUserTemplates(response.data?.templates || []);
    } catch (error: any) {
      console.error('Failed to load user templates:', error);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const loadPresetTemplates = async () => {
    setIsLoadingPresetTemplates(true);
    try {
      const response = await listPresetTemplates();
      setPresetTemplates(response.data?.templates || []);
    } catch (error: any) {
      console.error('Failed to load preset templates:', error);
    } finally {
      setIsLoadingPresetTemplates(false);
    }
  };

  const loadStylePresets = async () => {
    setIsLoadingStylePresets(true);
    try {
      const response = await listStylePresets();
      setStylePresets(response.data?.presets || []);
    } catch (error: any) {
      console.error('Failed to load style presets:', error);
    } finally {
      setIsLoadingStylePresets(false);
    }
  };

  const clearStylePresetSelection = async () => {
    if (!onSelectStylePreset) return;
    try {
      await onSelectStylePreset(null);
    } catch {
      // Parent handles toast if needed.
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        if (showUpload) {
          const response = await uploadUserTemplate(file);
          if (response.data) {
            const template = response.data;
            setUserTemplates(prev => [template, ...prev]);
            await clearStylePresetSelection();
            onSelect(file, template.template_id, 'user');
            show({ message: t('template.messages.uploadSuccess'), type: 'success' });
          }
        } else if (saveToLibrary) {
          const response = await uploadUserTemplate(file);
          if (response.data) {
            const template = response.data;
            setUserTemplates(prev => [template, ...prev]);
            await clearStylePresetSelection();
            onSelect(file, template.template_id, 'user');
            show({ message: t('material.messages.savedToLibrary'), type: 'success' });
          }
        } else {
          await clearStylePresetSelection();
          onSelect(file, undefined, 'upload');
        }
      } catch (error: any) {
        console.error('Failed to upload template:', error);
        show({ message: t('template.messages.uploadFailed') + ': ' + (error.message || t('common.unknownError')), type: 'error' });
      }
    }
    e.target.value = '';
  };

  const handleSelectUserTemplate = async (template: UserTemplate) => {
    await clearStylePresetSelection();
    onSelect(null, template.template_id, 'user');
  };

  const handleSelectPresetTemplate = async (template: PresetTemplate, closeModal: boolean = false) => {
    await clearStylePresetSelection();
    onSelect(null, template.template_id, 'preset');
    if (closeModal) {
      setIsPresetTemplateModalOpen(false);
    }
  };

  const handleSelectStylePreset = async (preset: StylePreset, closeModal: boolean = false) => {
    if (!onSelectStylePreset) return;
    setSelectingStylePresetId(preset.id);
    try {
      await onSelectStylePreset(preset);
      show({ message: t('template.messages.styleTemplateApplied'), type: 'success' });
      if (closeModal) {
        setIsStylePresetModalOpen(false);
      }
    } catch (error: any) {
      console.error('Failed to apply style preset:', error);
      show({
        message: t('template.messages.styleTemplateApplyFailed') + ': ' + (error?.message || t('common.unknownError')),
        type: 'error'
      });
    } finally {
      setSelectingStylePresetId(null);
    }
  };

  const handleSelectMaterials = async (materials: Material[], saveAsTemplate?: boolean) => {
    if (materials.length === 0) return;

    try {
      const file = await materialUrlToFile(materials[0]);

      if (saveAsTemplate) {
        const response = await uploadUserTemplate(file);
        if (response.data) {
          const template = response.data;
          setUserTemplates(prev => [template, ...prev]);
          await clearStylePresetSelection();
          onSelect(file, template.template_id, 'user');
          show({ message: t('material.messages.savedToLibrary'), type: 'success' });
        }
      } else {
        await clearStylePresetSelection();
        onSelect(file, undefined, 'upload');
        show({ message: t('material.messages.selectedAsTemplate'), type: 'success' });
      }
    } catch (error: any) {
      console.error('Failed to load material:', error);
      show({ message: t('material.messages.loadMaterialFailed') + ': ' + (error.message || t('common.unknownError')), type: 'error' });
    }
  };

  const handleDeleteUserTemplate = async (template: UserTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedTemplateId === template.template_id) {
      show({ message: t('template.cannotDeleteInUse'), type: 'info' });
      return;
    }
    setDeletingTemplateId(template.template_id);
    try {
      await deleteUserTemplate(template.template_id);
      setUserTemplates((prev) => prev.filter((item) => item.template_id !== template.template_id));
      show({ message: t('template.messages.deleteSuccess'), type: 'success' });
    } catch (error: any) {
      console.error('Failed to delete template:', error);
      show({ message: t('template.messages.deleteFailed') + ': ' + (error.message || t('common.unknownError')), type: 'error' });
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const getStylePresetCover = (preset: StylePreset) => {
    const preview: Partial<StylePresetPreviewImages> = preset.preview_images || {};
    return preview.cover_url || preview.toc_url || preview.detail_url || preview.ending_url || '';
  };

  const visiblePresetTemplates = useMemo(() => presetTemplates.slice(0, 4), [presetTemplates]);
  const hasMorePresetTemplates = presetTemplates.length > 4;
  const visibleStylePresets = useMemo(() => stylePresets.slice(0, 4), [stylePresets]);
  const hasMoreStylePresets = stylePresets.length > 4;

  return (
    <>
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">{t('template.myTemplates')}</h4>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {userTemplates.map((template) => (
              <div
                key={template.template_id}
                onClick={() => void handleSelectUserTemplate(template)}
                className={`aspect-[4/3] rounded-lg border-2 cursor-pointer transition-all relative group ${
                  selectedTemplateId === template.template_id
                    ? 'border-banana-500 ring-2 ring-banana-200'
                    : 'border-gray-200 dark:border-border-primary hover:border-banana-300'
                }`}
              >
                <img
                  src={getImageUrl(template.thumb_url || template.template_image_url)}
                  alt={template.name || 'Template'}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {selectedTemplateId !== template.template_id && (
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteUserTemplate(template, e)}
                    disabled={deletingTemplateId === template.template_id}
                    className={`absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
                      deletingTemplateId === template.template_id ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                    aria-label={t('template.deleteTemplate')}
                  >
                    <X size={12} />
                  </button>
                )}
                {selectedTemplateId === template.template_id && (
                  <div className="absolute inset-0 bg-banana-500 bg-opacity-20 flex items-center justify-center pointer-events-none">
                    <span className="text-white font-semibold text-sm">{t('template.templateSelected')}</span>
                  </div>
                )}
              </div>
            ))}

            <label className="aspect-[4/3] rounded-lg border-2 border-dashed border-gray-300 dark:border-border-primary hover:border-banana-500 cursor-pointer transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden">
              <span className="text-2xl">+</span>
              <span className="text-sm text-gray-500 dark:text-foreground-tertiary">{t('template.uploadTemplate')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleTemplateUpload}
                className="hidden"
                disabled={isLoadingTemplates}
              />
            </label>
          </div>

          {!showUpload && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                  className="w-4 h-4 text-banana-500 border-gray-300 dark:border-border-primary rounded focus:ring-banana-500"
                />
                <span className="text-sm text-gray-700 dark:text-foreground-secondary">
                  {t('template.saveToLibraryOnUpload')}
                </span>
              </label>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">{t('template.presetTemplates')}</h4>
            {hasMorePresetTemplates && (
              <button
                type="button"
                data-testid="preset-template-more-button"
                onClick={() => setIsPresetTemplateModalOpen(true)}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-border-primary hover:border-banana-500 hover:text-banana-600 dark:hover:text-banana transition-colors"
              >
                {t('template.more')}
              </button>
            )}
          </div>
          {isLoadingPresetTemplates ? (
            <div className="text-xs text-gray-500 dark:text-foreground-tertiary">Loading…</div>
          ) : presetTemplates.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{t('template.noPresetTemplates')}</div>
          ) : (
            <div className="grid grid-cols-4 gap-4" data-testid="preset-templates-grid">
              {visiblePresetTemplates.map((template) => {
                const isSelected = selectedPresetTemplateId === template.template_id;
                return (
                  <div
                    key={template.template_id}
                    onClick={() => void handleSelectPresetTemplate(template)}
                    className={`aspect-[4/3] rounded-lg border-2 cursor-pointer transition-all bg-gray-100 dark:bg-background-secondary relative overflow-hidden flex items-center justify-center ${
                      isSelected
                        ? 'border-banana-500 ring-2 ring-banana-200'
                        : 'border-gray-200 dark:border-border-primary hover:border-banana-500'
                    }`}
                  >
                    <img
                      src={getImageUrl(template.thumb_url || template.template_image_url)}
                      alt={template.name || 'Preset Template'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute left-1 right-1 bottom-1 px-1 py-0.5 rounded bg-black/45 text-white text-[10px] truncate">
                      {template.name || template.template_id}
                    </div>
                    {isSelected && (
                      <div className="absolute inset-0 bg-banana-500 bg-opacity-20 flex items-center justify-center pointer-events-none">
                        <span className="text-white font-semibold text-sm">{t('template.templateSelected')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">{t('template.styleTemplates')}</h4>
            {hasMoreStylePresets && (
              <button
                type="button"
                data-testid="style-more-button"
                onClick={() => setIsStylePresetModalOpen(true)}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-border-primary hover:border-banana-500 hover:text-banana-600 dark:hover:text-banana transition-colors"
              >
                {t('template.more')}
              </button>
            )}
          </div>
          {isLoadingStylePresets ? (
            <div className="text-xs text-gray-500 dark:text-foreground-tertiary">Loading…</div>
          ) : stylePresets.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{t('template.noStyleTemplates')}</div>
          ) : (
            <div className="grid grid-cols-4 gap-4" data-testid="style-presets-grid">
              {visibleStylePresets.map((preset) => {
                const coverUrl = getStylePresetCover(preset);
                const isSelected = selectedStylePresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => void handleSelectStylePreset(preset)}
                    className={`aspect-[4/3] rounded-lg border-2 cursor-pointer transition-all bg-gray-100 dark:bg-background-secondary relative overflow-hidden flex items-center justify-center ${
                      isSelected
                        ? 'border-banana-500 ring-2 ring-banana-200'
                        : 'border-gray-200 dark:border-border-primary hover:border-banana-500'
                    }`}
                  >
                    {coverUrl ? (
                      <img
                        src={getImageUrl(coverUrl)}
                        alt={preset.name || 'Style Preset'}
                        className="w-full h-full object-contain object-center"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-2 text-xs text-gray-500 dark:text-foreground-tertiary text-center">
                        {preset.name || preset.id}
                      </div>
                    )}
                    <div className="absolute left-1 right-1 bottom-1 px-1 py-0.5 rounded bg-black/45 text-white text-[10px] truncate">
                      {preset.name || preset.id}
                    </div>
                    {isSelected && (
                      <div className="absolute inset-0 bg-banana-500 bg-opacity-20 flex items-center justify-center pointer-events-none">
                        <span className="text-white font-semibold text-sm">{t('template.templateSelected')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {projectId && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">{t('template.selectFromMaterials')}</h4>
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus size={16} />}
              onClick={() => setIsMaterialSelectorOpen(true)}
              className="w-full"
            >
              {t('template.selectAsTemplate')}
            </Button>
          </div>
        )}
      </div>

      <ToastContainer />

      <Modal
        isOpen={isPresetTemplateModalOpen}
        onClose={() => setIsPresetTemplateModalOpen(false)}
        title={t('template.morePresetTemplates')}
        size="xl"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {presetTemplates.map((template) => {
            const isSelected = selectedPresetTemplateId === template.template_id;
            return (
              <button
                key={template.template_id}
                type="button"
                onClick={() => void handleSelectPresetTemplate(template, true)}
                className={`relative aspect-[4/3] rounded-lg border-2 overflow-hidden text-left transition-all flex items-center justify-center bg-gray-100 dark:bg-background-secondary ${
                  isSelected
                    ? 'border-banana-500 ring-2 ring-banana-200'
                    : 'border-gray-200 dark:border-border-primary hover:border-banana-400'
                }`}
              >
                <img
                  src={getImageUrl(template.thumb_url || template.template_image_url)}
                  alt={template.name || 'Preset Template'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/45 text-white text-xs truncate">
                  {template.name || template.template_id}
                </div>
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal
        isOpen={isStylePresetModalOpen}
        onClose={() => setIsStylePresetModalOpen(false)}
        title={t('template.moreStyleTemplates')}
        size="xl"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {stylePresets.map((preset) => {
            const coverUrl = getStylePresetCover(preset);
            const isSelected = selectedStylePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={selectingStylePresetId === preset.id}
                onClick={() => void handleSelectStylePreset(preset, true)}
                className={`relative aspect-[4/3] rounded-lg border-2 overflow-hidden text-left transition-all flex items-center justify-center bg-gray-100 dark:bg-background-secondary ${
                  isSelected
                    ? 'border-banana-500 ring-2 ring-banana-200'
                    : 'border-gray-200 dark:border-border-primary hover:border-banana-400'
                } ${selectingStylePresetId === preset.id ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {coverUrl ? (
                  <img
                    src={getImageUrl(coverUrl)}
                    alt={preset.name || 'Style Preset'}
                    className="w-full h-full object-contain object-center"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gray-100 dark:bg-background-secondary flex items-center justify-center p-2 text-xs text-gray-500 dark:text-foreground-tertiary text-center">
                    {preset.name || preset.id}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/45 text-white text-xs truncate">
                  {preset.name || preset.id}
                </div>
              </button>
            );
          })}
        </div>
      </Modal>

      {projectId && (
        <MaterialSelector
          projectId={projectId}
          isOpen={isMaterialSelectorOpen}
          onClose={() => setIsMaterialSelectorOpen(false)}
          onSelect={handleSelectMaterials}
          multiple={false}
          showSaveAsTemplateOption={true}
        />
      )}
    </>
  );
};

export const getTemplateFile = async (
  templateId: string,
  userTemplates: UserTemplate[],
  source: Exclude<TemplateSource, 'upload'> = 'user'
): Promise<File | null> => {
  const loadFromTemplateUrl = async (templateImageUrl: string, fallbackName = 'template.png') => {
    const imageUrl = getImageUrl(templateImageUrl);
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    return new File([blob], fallbackName, { type: blob.type });
  };

  if (source === 'preset') {
    try {
      const presetResponse = await listPresetTemplates();
      const presetTemplate = (presetResponse.data?.templates || []).find((t) => t.template_id === templateId);
      if (presetTemplate?.template_image_url) {
        return await loadFromTemplateUrl(presetTemplate.template_image_url, 'preset-template.png');
      }
    } catch (error) {
      console.error('Failed to load preset template:', error);
    }
  }

  const userTemplate = userTemplates.find((t) => t.template_id === templateId);
  if (userTemplate?.template_image_url) {
    try {
      return await loadFromTemplateUrl(userTemplate.template_image_url, 'template.png');
    } catch (error) {
      console.error('Failed to load user template:', error);
      return null;
    }
  }

  if (source !== 'preset') {
    try {
      const presetResponse = await listPresetTemplates();
      const presetTemplate = (presetResponse.data?.templates || []).find((t) => t.template_id === templateId);
      if (presetTemplate?.template_image_url) {
        return await loadFromTemplateUrl(presetTemplate.template_image_url, 'preset-template.png');
      }
    } catch (error) {
      console.error('Fallback load preset template failed:', error);
    }
  }

  return null;
};
