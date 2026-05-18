import React from 'react';
import {
  Modal,
  MaterialSelector,
  ProjectSettingsModal,
} from '@/components/shared';
import { MaterialGeneratorModal } from '@/components/shared/MaterialGeneratorModal';
import { TemplateSelector } from '@/components/shared/TemplateSelector';
import { HistoryVersionModal } from './HistoryVersionModal';
import { ResolutionWarningModal } from './ResolutionWarningModal';
import { BatchGenerateDialogs } from './BatchGenerateDialogs';
import type { ProjectScenario, ProviderProfileSummary } from '@/types';

type SlidePreviewDialogsProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  projectId?: string;
  projectScenario?: ProjectScenario;
  isTemplateModalOpen: boolean;
  closeTemplateModal: () => void;
  activeTemplateTab: any;
  setActiveTemplateTab: (value: any) => void;
  draftTemplateSelection: any;
  setDraftTemplateSelection: (value: any) => void;
  appliedTemplateSelection: any;
  currentProjectTemplateStyleJson: string;
  handleApplyTemplateSelection: (...args: any[]) => Promise<void> | void;
  isUploadingTemplate: boolean;
  isMaterialModalOpen: boolean;
  setIsMaterialModalOpen: (value: boolean) => void;
  isMaterialSelectorOpen: boolean;
  setIsMaterialSelectorOpen: (value: boolean) => void;
  handleSelectMaterials: (...args: any[]) => void;
  isProjectSettingsOpen: boolean;
  setIsProjectSettingsOpen: (value: boolean) => void;
  extraRequirements: string;
  templateStyle: string;
  onExtraRequirementsChange: (value: string) => void;
  onTemplateStyleChange: (value: string) => void;
  handleSaveExtraRequirements: (...args: any[]) => void;
  handleSaveTemplateStyle: (...args: any[]) => void;
  isSavingRequirements: boolean;
  isSavingTemplateStyle: boolean;
  generationMode: any;
  extraFieldNames: string[];
  availableFields: string[];
  imagePromptFields: string[];
  descriptionRequirementsDraft: string;
  presetDescriptionFields: string[];
  handleDescriptionGenerationModeChange: (...args: any[]) => void;
  handleDescriptionExtraFieldsChange: (...args: any[]) => void;
  handleAvailableDescriptionFieldsChange: (...args: any[]) => void;
  handleDescriptionImagePromptFieldsChange: (...args: any[]) => void;
  setDescriptionRequirementsDraft: (value: string) => void;
  handleSaveDescriptionRequirements: (...args: any[]) => Promise<void> | void;
  isSavingDescriptionRequirements: boolean;
  exportExtractorMethod: any;
  exportInpaintMethod: any;
  exportAllowPartial: boolean;
  exportCompressEnabled: boolean;
  exportCompressFormat: any;
  exportCompressQuality: number;
  exportCompressPngQuantizeEnabled: boolean;
  setExportExtractorMethod: (value: any) => void;
  setExportInpaintMethod: (value: any) => void;
  setExportAllowPartial: (value: boolean) => void;
  setExportCompressEnabled: (value: boolean) => void;
  setExportCompressFormat: (value: any) => void;
  setExportCompressQuality: (value: number) => void;
  setExportCompressPngQuantizeEnabled: (value: boolean) => void;
  handleSaveExportSettings: (...args: any[]) => void;
  isSavingExportSettings: boolean;
  aspectRatio: string;
  setAspectRatio: (value: string) => void;
  handleSaveAspectRatio: (...args: any[]) => void;
  isSavingAspectRatio: boolean;
  hasImages: boolean;
  projectDefaultImageSource: any;
  projectDefaultImageModel: string;
  projectDefaultImageResolution: string;
  providerProfiles: ProviderProfileSummary[];
  setProjectDefaultImageSource: (value: any) => void;
  setProjectDefaultImageModel: (value: string) => void;
  setProjectDefaultImageResolution: (value: string) => void;
  handleSaveGenerationDefaults: (...args: any[]) => void;
  isSavingGenerationDefaults: boolean;
  isHistoryModalOpen: boolean;
  setIsHistoryModalOpen: (value: boolean) => void;
  selectedIndex: number;
  historyVersionsDescending: any[];
  selectedHistoryVersion: any;
  copiedHistoryVersionId: string | null;
  setSelectedHistoryVersionId: (value: string) => void;
  handleSwitchVersion: (versionId: string) => Promise<void> | void;
  handleCopyHistoryPrompt: (...args: any[]) => Promise<void> | void;
  getHistoryOperationLabel: (...args: any[]) => string;
  formatImageVersionTimestamp: (...args: any[]) => string;
  show1KWarningDialog: boolean;
  skip1KWarningChecked: boolean;
  handleCancel1KWarning: () => void;
  setSkip1KWarningChecked: (value: boolean) => void;
  handleConfirm1KWarning: () => void;
  showBatchGenerateDialog: boolean;
  batchGenerateContext: any;
  closeBatchGenerateDialog: () => void;
  handleGenerateMissingImagesFromDialog: () => Promise<void> | void;
  handleRegenerateAllImagesFromDialog: () => Promise<void> | void;
  showBatchDescriptionGenerateDialog: boolean;
  batchDescriptionGenerateContext: any;
  descriptionRangeStart: number;
  descriptionRangeEnd: number;
  setDescriptionRangeStart: (value: number) => void;
  setDescriptionRangeEnd: (value: number) => void;
  handleGenerateMissingDescriptionsFromDialog: () => Promise<void> | void;
  handleRegenerateAllDescriptionsFromDialog: () => Promise<void> | void;
  handleGenerateDescriptionsByRange: () => Promise<void> | void;
  closeBatchDescriptionGenerateDialog: () => void;
};

export const SlidePreviewDialogs: React.FC<SlidePreviewDialogsProps> = ({
  t,
  projectId,
  projectScenario,
  isTemplateModalOpen,
  closeTemplateModal,
  activeTemplateTab,
  setActiveTemplateTab,
  draftTemplateSelection,
  setDraftTemplateSelection,
  appliedTemplateSelection,
  currentProjectTemplateStyleJson,
  handleApplyTemplateSelection,
  isUploadingTemplate,
  isMaterialModalOpen,
  setIsMaterialModalOpen,
  isMaterialSelectorOpen,
  setIsMaterialSelectorOpen,
  handleSelectMaterials,
  isProjectSettingsOpen,
  setIsProjectSettingsOpen,
  extraRequirements,
  templateStyle,
  onExtraRequirementsChange,
  onTemplateStyleChange,
  handleSaveExtraRequirements,
  handleSaveTemplateStyle,
  isSavingRequirements,
  isSavingTemplateStyle,
  generationMode,
  extraFieldNames,
  availableFields,
  imagePromptFields,
  descriptionRequirementsDraft,
  presetDescriptionFields,
  handleDescriptionGenerationModeChange,
  handleDescriptionExtraFieldsChange,
  handleAvailableDescriptionFieldsChange,
  handleDescriptionImagePromptFieldsChange,
  setDescriptionRequirementsDraft,
  handleSaveDescriptionRequirements,
  isSavingDescriptionRequirements,
  exportExtractorMethod,
  exportInpaintMethod,
  exportAllowPartial,
  exportCompressEnabled,
  exportCompressFormat,
  exportCompressQuality,
  exportCompressPngQuantizeEnabled,
  setExportExtractorMethod,
  setExportInpaintMethod,
  setExportAllowPartial,
  setExportCompressEnabled,
  setExportCompressFormat,
  setExportCompressQuality,
  setExportCompressPngQuantizeEnabled,
  handleSaveExportSettings,
  isSavingExportSettings,
  aspectRatio,
  setAspectRatio,
  handleSaveAspectRatio,
  isSavingAspectRatio,
  hasImages,
  projectDefaultImageSource,
  projectDefaultImageModel,
  projectDefaultImageResolution,
  providerProfiles,
  setProjectDefaultImageSource,
  setProjectDefaultImageModel,
  setProjectDefaultImageResolution,
  handleSaveGenerationDefaults,
  isSavingGenerationDefaults,
  isHistoryModalOpen,
  setIsHistoryModalOpen,
  selectedIndex,
  historyVersionsDescending,
  selectedHistoryVersion,
  copiedHistoryVersionId,
  setSelectedHistoryVersionId,
  handleSwitchVersion,
  handleCopyHistoryPrompt,
  getHistoryOperationLabel,
  formatImageVersionTimestamp,
  show1KWarningDialog,
  skip1KWarningChecked,
  handleCancel1KWarning,
  setSkip1KWarningChecked,
  handleConfirm1KWarning,
  showBatchGenerateDialog,
  batchGenerateContext,
  closeBatchGenerateDialog,
  handleGenerateMissingImagesFromDialog,
  handleRegenerateAllImagesFromDialog,
  showBatchDescriptionGenerateDialog,
  batchDescriptionGenerateContext,
  descriptionRangeStart,
  descriptionRangeEnd,
  setDescriptionRangeStart,
  setDescriptionRangeEnd,
  handleGenerateMissingDescriptionsFromDialog,
  handleRegenerateAllDescriptionsFromDialog,
  handleGenerateDescriptionsByRange,
  closeBatchDescriptionGenerateDialog,
}) => {
  return (
    <>
      <Modal
        isOpen={isTemplateModalOpen}
        onClose={closeTemplateModal}
        title={t('preview.changeTemplate')}
        size="wide"
      >
        <TemplateSelector
          projectId={projectId || null}
          projectScenario={projectScenario}
          activeTab={activeTemplateTab}
          onActiveTabChange={setActiveTemplateTab}
          draftSelection={draftTemplateSelection}
          onDraftSelectionChange={setDraftTemplateSelection}
          appliedSelection={appliedTemplateSelection}
          appliedStyleJson={currentProjectTemplateStyleJson || ''}
          onApplySelection={handleApplyTemplateSelection}
          isApplyingSelection={isUploadingTemplate}
        />
      </Modal>
      {projectId && (
        <>
          <MaterialGeneratorModal
            projectId={projectId}
            isOpen={isMaterialModalOpen}
            onClose={() => setIsMaterialModalOpen(false)}
          />
          <MaterialSelector
            projectId={projectId}
            isOpen={isMaterialSelectorOpen}
            onClose={() => setIsMaterialSelectorOpen(false)}
            onSelect={handleSelectMaterials}
            multiple={true}
          />
          <ProjectSettingsModal
            isOpen={isProjectSettingsOpen}
            onClose={() => setIsProjectSettingsOpen(false)}
            extraRequirements={extraRequirements}
            templateStyle={templateStyle}
            onExtraRequirementsChange={onExtraRequirementsChange}
            onTemplateStyleChange={onTemplateStyleChange}
            onSaveExtraRequirements={handleSaveExtraRequirements}
            onSaveTemplateStyle={handleSaveTemplateStyle}
            isSavingRequirements={isSavingRequirements}
            isSavingTemplateStyle={isSavingTemplateStyle}
            descriptionGenerationMode={generationMode}
            descriptionExtraFields={extraFieldNames}
            availableDescriptionFields={availableFields}
            descriptionImagePromptFields={imagePromptFields}
            descriptionRequirements={descriptionRequirementsDraft}
            presetDescriptionFields={presetDescriptionFields}
            onDescriptionGenerationModeChange={handleDescriptionGenerationModeChange}
            onDescriptionExtraFieldsChange={handleDescriptionExtraFieldsChange}
            onAvailableDescriptionFieldsChange={handleAvailableDescriptionFieldsChange}
            onDescriptionImagePromptFieldsChange={handleDescriptionImagePromptFieldsChange}
            onDescriptionRequirementsChange={setDescriptionRequirementsDraft}
            onSaveDescriptionRequirements={() => void handleSaveDescriptionRequirements()}
            isSavingDescriptionRequirements={isSavingDescriptionRequirements}
            exportExtractorMethod={exportExtractorMethod}
            exportInpaintMethod={exportInpaintMethod}
            exportAllowPartial={exportAllowPartial}
            exportCompressEnabled={exportCompressEnabled}
            exportCompressFormat={exportCompressFormat}
            exportCompressQuality={exportCompressQuality}
            exportCompressPngQuantizeEnabled={exportCompressPngQuantizeEnabled}
            onExportExtractorMethodChange={setExportExtractorMethod}
            onExportInpaintMethodChange={setExportInpaintMethod}
            onExportAllowPartialChange={setExportAllowPartial}
            onExportCompressEnabledChange={setExportCompressEnabled}
            onExportCompressFormatChange={setExportCompressFormat}
            onExportCompressQualityChange={setExportCompressQuality}
            onExportCompressPngQuantizeEnabledChange={setExportCompressPngQuantizeEnabled}
            onSaveExportSettings={handleSaveExportSettings}
            isSavingExportSettings={isSavingExportSettings}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            onSaveAspectRatio={handleSaveAspectRatio}
            isSavingAspectRatio={isSavingAspectRatio}
            hasImages={hasImages}
            generationDefaultImageSource={projectDefaultImageSource}
            generationDefaultImageModel={projectDefaultImageModel}
            generationDefaultImageResolution={projectDefaultImageResolution}
            providerProfiles={providerProfiles}
            onGenerationDefaultImageSourceChange={setProjectDefaultImageSource}
            onGenerationDefaultImageModelChange={setProjectDefaultImageModel}
            onGenerationDefaultImageResolutionChange={setProjectDefaultImageResolution}
            onSaveGenerationDefaults={handleSaveGenerationDefaults}
            isSavingGenerationDefaults={isSavingGenerationDefaults}
          />
        </>
      )}

      <HistoryVersionModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={`${t('preview.historyModalTitle')} · ${t('preview.page', { num: selectedIndex + 1 })}`}
        historyVersionsDescending={historyVersionsDescending}
        selectedHistoryVersion={selectedHistoryVersion}
        copiedHistoryVersionId={copiedHistoryVersionId}
        t={t}
        onSelectHistoryVersion={setSelectedHistoryVersionId}
        onSwitchVersion={(versionId) => void handleSwitchVersion(versionId)}
        onCopyHistoryPrompt={() => void handleCopyHistoryPrompt()}
        getHistoryOperationLabel={getHistoryOperationLabel}
        formatImageVersionTimestamp={formatImageVersionTimestamp}
      />

      <ResolutionWarningModal
        t={t}
        isOpen={show1KWarningDialog}
        skipChecked={skip1KWarningChecked}
        onClose={handleCancel1KWarning}
        onSkipCheckedChange={setSkip1KWarningChecked}
        onConfirm={handleConfirm1KWarning}
      />

      <BatchGenerateDialogs
        t={t}
        showBatchGenerateDialog={showBatchGenerateDialog}
        batchGenerateContext={batchGenerateContext}
        onCloseBatchGenerateDialog={closeBatchGenerateDialog}
        onGenerateMissingImages={() => void handleGenerateMissingImagesFromDialog()}
        onRegenerateAllImages={() => void handleRegenerateAllImagesFromDialog()}
        showBatchDescriptionGenerateDialog={showBatchDescriptionGenerateDialog}
        batchDescriptionGenerateContext={batchDescriptionGenerateContext}
        descriptionRangeStart={descriptionRangeStart}
        descriptionRangeEnd={descriptionRangeEnd}
        onDescriptionRangeStartChange={setDescriptionRangeStart}
        onDescriptionRangeEndChange={setDescriptionRangeEnd}
        onGenerateMissingDescriptions={() => void handleGenerateMissingDescriptionsFromDialog()}
        onRegenerateAllDescriptions={() => void handleRegenerateAllDescriptionsFromDialog()}
        onGenerateDescriptionsByRange={() => void handleGenerateDescriptionsByRange()}
        onCloseBatchDescriptionGenerateDialog={closeBatchDescriptionGenerateDialog}
      />
    </>
  );
};
