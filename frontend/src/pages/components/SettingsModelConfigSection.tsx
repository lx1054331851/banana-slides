import React from 'react';

import { Input } from '@/components/shared';
import { getSupportedResolutionsForModel } from '@/config/projectAiDefaults';
import {
  getImageChannelOptions,
  getImageModelConfigMode,
  getImageModelSchema,
  getSelectableImageModelsForChannel,
  getSupportedResolutionsForChannelModel,
} from '@/config/projectAiChannels';
import type { ProviderProfileSummary, Settings as SettingsType } from '@/types';

import {
  API_KEY_PROVIDERS,
  GLOBAL_PROVIDER_SOURCES,
  getImageModelSelectOptions,
  initialFormData,
  isLazyllmVendor,
  LAZYLLM_SOURCES,
} from '../Settings.config';

type SettingsTranslator = (key: string, vars?: Record<string, string | number>) => string;

interface ModelConfigItem {
  modelKey: keyof typeof initialFormData;
  sourceKey: keyof typeof initialFormData;
  apiKeyKey: keyof typeof initialFormData;
  apiBaseKey: keyof typeof initialFormData;
  apiKeyLengthKey: keyof SettingsType;
  label: string;
  placeholder: string;
  description: string;
  sourceLabel: string;
  usePresetModelSelect?: boolean;
}

interface SettingsModelConfigSectionProps {
  formData: typeof initialFormData;
  providerProfiles: ProviderProfileSummary[];
  settings: SettingsType | null;
  t: SettingsTranslator;
  handleFieldChange: (key: string, value: any) => void;
  handleImageChannelChange: (channelId: string) => void;
  handleImageModelChange: (model: string, channelId: string) => void;
  setFormData: React.Dispatch<React.SetStateAction<typeof initialFormData>>;
}

// Return the model config descriptors used by the settings model section.
function getModelConfigItems(t: SettingsTranslator): ModelConfigItem[] {
  return [
    {
      modelKey: 'text_model',
      sourceKey: 'text_model_source',
      apiKeyKey: 'text_api_key',
      apiBaseKey: 'text_api_base_url',
      apiKeyLengthKey: 'text_api_key_length',
      label: t('settings.fields.textModel'),
      placeholder: t('settings.fields.textModelPlaceholder'),
      description: t('settings.fields.textModelDesc'),
      sourceLabel: t('settings.fields.textModelSource'),
    },
    {
      modelKey: 'image_model',
      sourceKey: 'image_model_source',
      apiKeyKey: 'image_api_key',
      apiBaseKey: 'image_api_base_url',
      apiKeyLengthKey: 'image_api_key_length',
      label: t('settings.fields.imageModel'),
      placeholder: t('settings.fields.imageModelPlaceholder'),
      description: t('settings.fields.imageModelDesc'),
      sourceLabel: t('settings.fields.imageModelSource'),
      usePresetModelSelect: true,
    },
    {
      modelKey: 'image_caption_model',
      sourceKey: 'image_caption_model_source',
      apiKeyKey: 'image_caption_api_key',
      apiBaseKey: 'image_caption_api_base_url',
      apiKeyLengthKey: 'image_caption_api_key_length',
      label: t('settings.fields.imageCaptionModel'),
      placeholder: t('settings.fields.imageCaptionModelPlaceholder'),
      description: t('settings.fields.imageCaptionModelDesc'),
      sourceLabel: t('settings.fields.imageCaptionModelSource'),
    },
  ];
}

// Return profile source options that can be chosen in the per-model provider selector.
function getProfileSourceOptions(providerProfiles: ProviderProfileSummary[]) {
  return providerProfiles.map((profile) => ({
    value: `profile:${profile.id}`,
    label: `Profile: ${profile.id} (${String(profile.provider || '').toUpperCase()})`,
  }));
}

// Return the label and description for the schema-specific resolution control.
function getImageResolutionFieldCopy(
  schema: 'default' | 'gpt-image-2' | 'gemini-image',
  t: SettingsTranslator,
): { label: string; description: string } {
  if (schema === 'gpt-image-2') {
    return {
      label: t('settings.fields.gptImageResolutionLabel'),
      description: t('settings.fields.gptImageResolutionDesc'),
    };
  }
  if (schema === 'gemini-image') {
    return {
      label: t('settings.fields.geminiImageSizeLabel'),
      description: t('settings.fields.geminiImageSizeDesc'),
    };
  }
  return {
    label: t('settings.fields.imageResolutionGenericLabel'),
    description: t('settings.fields.imageResolutionGenericDesc'),
  };
}

// Render a compact schema-specific capability summary to make model differences explicit.
function SettingsImageSchemaSummary({
  schema,
  configMode,
  t,
}: {
  schema: 'default' | 'gpt-image-2' | 'gemini-image';
  configMode: 'default' | 'openai-images' | 'openai-compat-google-chat';
  t: SettingsTranslator;
}) {
  if (schema === 'gpt-image-2') {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
        <div className="mb-2 text-sm font-medium text-sky-900 dark:text-sky-200">
          {t('settings.fields.gptImagePanelTitle')}
        </div>
        <p className="text-sm text-sky-800 dark:text-sky-300">
          {t('settings.fields.gptImagePanelDesc')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-sky-900 dark:text-sky-200">
          <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-sky-900/30">schema=gpt-image-2</span>
          <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-sky-900/30">mode={configMode}</span>
          <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-sky-900/30">size / quality</span>
          <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-sky-900/30">background / format</span>
        </div>
      </div>
    );
  }
  if (schema === 'gemini-image') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="mb-2 text-sm font-medium text-emerald-900 dark:text-emerald-200">
          {t('settings.fields.geminiImagePanelTitle')}
        </div>
        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          {t('settings.fields.geminiImagePanelDesc')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-900 dark:text-emerald-200">
          <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-emerald-900/30">schema=gemini-image</span>
          <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-emerald-900/30">mode={configMode}</span>
          <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-emerald-900/30">aspect_ratio / image_size</span>
          <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-emerald-900/30">thinking / delivery</span>
        </div>
      </div>
    );
  }
  return null;
}

// Render the dedicated image model configuration block with model-family-aware controls.
function SettingsImageModelGroup({
  item,
  formData,
  providerProfiles,
  handleFieldChange,
  handleImageChannelChange,
  handleImageModelChange,
  t,
}: {
  item: ModelConfigItem;
  formData: typeof initialFormData;
  providerProfiles: ProviderProfileSummary[];
  handleFieldChange: (key: string, value: any) => void;
  handleImageChannelChange: (channelId: string) => void;
  handleImageModelChange: (model: string, channelId: string) => void;
  t: SettingsTranslator;
}) {
  const currentModelValue = String(formData[item.modelKey] || '');
  const channels = getImageChannelOptions(providerProfiles);
  const matchedChannel = channels.find((channel) => channel.source === formData.image_model_source);
  const resolvedImageChannel = matchedChannel?.id || channels[0]?.id || '';
  const selectableImageModels = getSelectableImageModelsForChannel(resolvedImageChannel, providerProfiles);
  const visibleImageResolutions = getSupportedResolutionsForChannelModel(
    resolvedImageChannel,
    currentModelValue,
    providerProfiles,
    getSupportedResolutionsForModel(currentModelValue),
  );
  const fallbackImageModelOptions = getImageModelSelectOptions(currentModelValue)
    .filter((option, index, list) => list.findIndex((candidate) => candidate.value === option.value) === index);
  const configMode = getImageModelConfigMode(resolvedImageChannel, currentModelValue, providerProfiles);
  const schema = getImageModelSchema(resolvedImageChannel, currentModelValue, providerProfiles);
  const resolutionFieldCopy = getImageResolutionFieldCopy(schema, t);
  const showOpenAIProtocol = configMode === 'openai-images';
  const showCompatHint = configMode === 'openai-compat-google-chat';

  return (
    <div className="pb-6 border-b border-gray-200 dark:border-border-primary last:border-b-0 last:pb-0 space-y-3">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            图片模型渠道
          </label>
          <select
            value={resolvedImageChannel}
            onChange={(e) => handleImageChannelChange(e.target.value)}
            className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 focus:border-transparent"
          >
            {(channels.length > 0 ? channels : [{ id: '', label: '默认通道' }]).map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            {item.label}
          </label>
          <select
            value={currentModelValue}
            onChange={(e) => handleImageModelChange(e.target.value, resolvedImageChannel)}
            className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 focus:border-transparent"
          >
            <option value="">{item.placeholder}</option>
            {(selectableImageModels.length > 0 ? selectableImageModels : fallbackImageModelOptions).map((option) => (
              <option
                key={('model' in option ? `${option.source}:${option.model}` : option.value)}
                value={('model' in option ? option.model : option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="-mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{item.description}</p>
      <SettingsImageSchemaSummary schema={schema} configMode={configMode} t={t} />
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
          {resolutionFieldCopy.label}
        </label>
        <select
          value={visibleImageResolutions.includes(formData.image_resolution) ? formData.image_resolution : (visibleImageResolutions[0] || formData.image_resolution)}
          onChange={(e) => handleFieldChange('image_resolution', e.target.value)}
          className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 focus:border-transparent"
        >
          {visibleImageResolutions.map((resolution) => (
            <option key={resolution} value={resolution}>{resolution}</option>
          ))}
        </select>
        <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
          {resolutionFieldCopy.description}
        </p>
      </div>
      {showOpenAIProtocol && (
        <div className="pl-3 border-l-2 border-banana-300 dark:border-banana-600">
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            {t('settings.fields.imageApiProtocol')}
          </label>
          <select
            value={formData.openai_image_api_protocol}
            onChange={(e) => handleFieldChange('openai_image_api_protocol', e.target.value)}
            className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 focus:border-transparent"
          >
            <option value="auto">{t('settings.fields.imageApiProtocolAuto')}</option>
            <option value="images">{t('settings.fields.imageApiProtocolImages')}</option>
            <option value="chat">{t('settings.fields.imageApiProtocolChat')}</option>
          </select>
          <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
            {t('settings.fields.imageApiProtocolDesc')}
          </p>
        </div>
      )}
      {showCompatHint && (
        <div className="pl-3 border-l-2 border-sky-300 dark:border-sky-600">
          <p className="text-sm text-gray-500 dark:text-foreground-tertiary">
            当前模型走兼容 Gemini / nano banana 参数通道，渠道会使用独立的 chat + image_config 配置，不复用 `gpt-image-2` 的 images API 参数。
          </p>
        </div>
      )}
    </div>
  );
}

// Render a generic non-image model configuration block.
function SettingsGenericModelGroup({
  item,
  formData,
  providerProfiles,
  settings,
  t,
  handleFieldChange,
  setFormData,
}: {
  item: ModelConfigItem;
  formData: typeof initialFormData;
  providerProfiles: ProviderProfileSummary[];
  settings: SettingsType | null;
  t: SettingsTranslator;
  handleFieldChange: (key: string, value: any) => void;
  setFormData: React.Dispatch<React.SetStateAction<typeof initialFormData>>;
}) {
  const sourceValue = formData[item.sourceKey] as string;
  const isApiKeyProvider = API_KEY_PROVIDERS.has(sourceValue);
  const isAzureOpenAI = sourceValue === 'azure-openai';
  const isLazyllm = sourceValue && isLazyllmVendor(sourceValue);
  const capabilityKey = item.sourceKey === 'text_model_source'
    ? 'text'
    : (item.sourceKey === 'image_caption_model_source' ? 'image_caption' : 'image');
  const modelProviderSources = [
    ...GLOBAL_PROVIDER_SOURCES,
    ...getProfileSourceOptions(providerProfiles).filter((option) => {
      const profileId = option.value.replace(/^profile:/, '');
      const profile = providerProfiles.find((candidate) => String(candidate.id) === profileId);
      const capabilities = Array.isArray(profile?.capabilities) ? profile.capabilities : [];
      return capabilities.includes(capabilityKey);
    }),
  ];

  return (
    <div className="pb-6 border-b border-gray-200 dark:border-border-primary last:border-b-0 last:pb-0 space-y-3">
      <Input
        label={item.label}
        type="text"
        placeholder={item.placeholder}
        value={formData[item.modelKey] as string}
        onChange={(e) => handleFieldChange(item.modelKey, e.target.value)}
      />
      <p className="-mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{item.description}</p>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
          {item.sourceLabel}
        </label>
        <select
          value={sourceValue}
          onChange={(e) => handleFieldChange(item.sourceKey, e.target.value)}
          className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 focus:border-transparent"
        >
          <option value="">{t('settings.fields.modelProviderPlaceholder')}</option>
          {modelProviderSources.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.value === 'codex' && !settings?.openai_oauth_connected}
            >
              {option.label}{option.value === 'codex' && !settings?.openai_oauth_connected ? ` (${t('settings.openaiOAuth.disconnected')})` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
          {t('settings.fields.modelProviderDesc')}
        </p>
      </div>
      {isApiKeyProvider && !isAzureOpenAI && (
        <div className="space-y-3 pl-3 border-l-2 border-banana-300 dark:border-banana-600">
          <Input
            label={t('settings.fields.perModelApiBaseUrl')}
            type="text"
            placeholder={t('settings.fields.perModelApiBaseUrlPlaceholder')}
            value={formData[item.apiBaseKey] as string}
            onChange={(e) => handleFieldChange(item.apiBaseKey, e.target.value)}
          />
          <div>
            <Input
              label={t('settings.fields.perModelApiKey')}
              type="password"
              placeholder={
                settings && (settings[item.apiKeyLengthKey] as number) > 0
                  ? t('settings.fields.perModelApiKeySet', { length: settings[item.apiKeyLengthKey] as number })
                  : t('settings.fields.perModelApiKeyPlaceholder')
              }
              value={formData[item.apiKeyKey] as string}
              onChange={(e) => handleFieldChange(item.apiKeyKey, e.target.value)}
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
              {t('settings.fields.perModelApiKeyDesc')}
            </p>
          </div>
        </div>
      )}
      {isAzureOpenAI && (
        <div className="space-y-3 pl-3 border-l-2 border-banana-300 dark:border-banana-600">
          <Input
            label={t('settings.fields.perModelAzureEndpoint')}
            type="text"
            placeholder={t('settings.fields.perModelAzureEndpointPlaceholder')}
            value={formData[`${String(item.modelKey).replace('_model', '')}_azure_openai_endpoint` as keyof typeof initialFormData] as string}
            onChange={(e) => handleFieldChange(`${String(item.modelKey).replace('_model', '')}_azure_openai_endpoint`, e.target.value)}
          />
          <Input
            label={t('settings.fields.perModelAzureApiVersion')}
            type="text"
            placeholder={t('settings.fields.perModelAzureApiVersionPlaceholder')}
            value={formData[`${String(item.modelKey).replace('_model', '')}_azure_openai_api_version` as keyof typeof initialFormData] as string}
            onChange={(e) => handleFieldChange(`${String(item.modelKey).replace('_model', '')}_azure_openai_api_version`, e.target.value)}
          />
          <div>
            <Input
              label={t('settings.fields.perModelApiKey')}
              type="password"
              placeholder={
                settings && (settings[item.apiKeyLengthKey] as number) > 0
                  ? t('settings.fields.perModelApiKeySet', { length: settings[item.apiKeyLengthKey] as number })
                  : t('settings.fields.perModelApiKeyPlaceholder')
              }
              value={formData[item.apiKeyKey] as string}
              onChange={(e) => handleFieldChange(item.apiKeyKey, e.target.value)}
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
              {t('settings.fields.perModelApiKeyDesc')}
            </p>
          </div>
        </div>
      )}
      {isLazyllm && (() => {
        const vendorLabel = LAZYLLM_SOURCES.find((source) => source.value === sourceValue)?.label || sourceValue.toUpperCase();
        const keyLength = settings?.lazyllm_api_keys_info?.[sourceValue] || 0;
        const placeholder = keyLength > 0
          ? t('settings.fields.vendorApiKeySet', { length: keyLength })
          : t('settings.fields.vendorApiKeyPlaceholder', { vendor: vendorLabel });
        return (
          <div className="pl-3 border-l-2 border-amber-300 dark:border-amber-600">
            <Input
              label={t('settings.fields.vendorApiKey', { vendor: vendorLabel })}
              type="password"
              placeholder={placeholder}
              value={formData.lazyllm_api_keys[sourceValue] || ''}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  lazyllm_api_keys: { ...prev.lazyllm_api_keys, [sourceValue]: e.target.value },
                }));
              }}
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
              {t('settings.fields.vendorApiKeyDesc')}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// Render the full model config section and keep image settings isolated from text/caption settings.
export const SettingsModelConfigSection: React.FC<SettingsModelConfigSectionProps> = ({
  formData,
  providerProfiles,
  settings,
  t,
  handleFieldChange,
  handleImageChannelChange,
  handleImageModelChange,
  setFormData,
}) => {
  const modelConfigItems = getModelConfigItems(t);

  return (
    <div className="space-y-4">
      {modelConfigItems.map((item) => (
        item.usePresetModelSelect
          ? (
            <SettingsImageModelGroup
              key={String(item.modelKey)}
              item={item}
              formData={formData}
              providerProfiles={providerProfiles}
              handleFieldChange={handleFieldChange}
              handleImageChannelChange={handleImageChannelChange}
              handleImageModelChange={handleImageModelChange}
              t={t}
            />
          )
          : (
            <SettingsGenericModelGroup
              key={String(item.modelKey)}
              item={item}
              formData={formData}
              providerProfiles={providerProfiles}
              settings={settings}
              t={t}
              handleFieldChange={handleFieldChange}
              setFormData={setFormData}
            />
          )
      ))}
    </div>
  );
};
