import type {
  OverrideRoute,
  ProviderProfileSummary,
  ImageChannelOption,
} from '@/types';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import {
  PROJECT_DEFAULT_IMAGE_MODEL,
  PROJECT_DEFAULT_IMAGE_RESOLUTION,
  PROJECT_IMAGE_MODEL_CATALOG,
  normalizeProjectDefaultImageModel,
  normalizeProjectDefaultImageResolution,
} from '@/config/projectAiDefaults';

export const IMAGE_PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI' },
] as const;

const BASE_MODEL_SUPPORTED_ASPECT_RATIO_SET = new Set([
  '16:9',
  '21:9',
  '4:3',
  '3:2',
  '5:4',
  '1:1',
  '4:5',
  '2:3',
  '3:4',
  '9:16',
]);

const GEMINI_31_EXTRA_ASPECT_RATIO_SET = new Set([
  '8:1',
  '4:1',
  '1:4',
  '1:8',
]);

const GPT_IMAGE_SIZE_OPTIONS = [
  { value: '1024x1024', aspectRatio: '1:1' },
  { value: '1536x1024', aspectRatio: '3:2' },
  { value: '1536x1152', aspectRatio: '4:3' },
  { value: '1440x1152', aspectRatio: '5:4' },
  { value: '1536x864', aspectRatio: '16:9' },
  { value: '1680x720', aspectRatio: '21:9' },
  { value: '1024x1536', aspectRatio: '2:3' },
  { value: '1152x1536', aspectRatio: '3:4' },
  { value: '1152x1440', aspectRatio: '4:5' },
  { value: '864x1536', aspectRatio: '9:16' },
  { value: '2048x2048', aspectRatio: '1:1' },
  { value: '2016x1344', aspectRatio: '3:2' },
  { value: '2048x1536', aspectRatio: '4:3' },
  { value: '1920x1536', aspectRatio: '5:4' },
  { value: '2048x1152', aspectRatio: '16:9' },
  { value: '2352x1008', aspectRatio: '21:9' },
  { value: '1344x2016', aspectRatio: '2:3' },
  { value: '1536x2048', aspectRatio: '3:4' },
  { value: '1536x1920', aspectRatio: '4:5' },
  { value: '1152x2048', aspectRatio: '9:16' },
  { value: '2880x2880', aspectRatio: '1:1' },
  { value: '3840x2160', aspectRatio: '16:9' },
  { value: '2160x3840', aspectRatio: '9:16' },
] as const;

export type GptImageSizeOption = (typeof GPT_IMAGE_SIZE_OPTIONS)[number];

export const toImageChannelOption = (profile: ProviderProfileSummary): ImageChannelOption => ({
  id: String(profile.channel || profile.id),
  provider: String(profile.provider || ''),
  label: String(profile.label || `Profile · ${profile.id}`),
  kind: String(profile.kind || 'relay'),
  source: `profile:${profile.id}`,
  adapter: profile.adapter,
  api_base: profile.api_base,
  capabilities: profile.capabilities || [],
  models: profile.models || [],
  model_defaults: profile.model_defaults || {},
  model_capabilities: profile.model_capabilities || {},
  supported_resolutions: profile.supported_resolutions || {},
  adapter_options: profile.adapter_options || {},
  enabled: profile.enabled,
  configured: profile.configured,
  config_status: profile.config_status,
  config_note: profile.config_note,
  is_profile: true,
});

export const getImageChannelOptions = (
  providerProfiles: ProviderProfileSummary[],
): ImageChannelOption[] => (
  providerProfiles
    .filter((profile) => (profile.capabilities || []).includes('image'))
    .map(toImageChannelOption)
);

export const getPreferredImageChannel = (
  providerProfiles: ProviderProfileSummary[],
  preferredProvider?: string,
): ImageChannelOption | undefined => {
  const availableChannels = getImageChannelOptions(providerProfiles);
  const configuredChannels = availableChannels.filter((channel) => channel.enabled !== false && channel.configured !== false);
  const preferredPool = configuredChannels.length > 0 ? configuredChannels : availableChannels.filter((channel) => channel.enabled !== false);
  if (preferredProvider) {
    const matched = preferredPool.find((channel) => channel.provider === preferredProvider);
    if (matched) return matched;
  }
  return preferredPool[0] || availableChannels[0];
};

export const getImageChannelOptionById = (
  channelId: string | undefined,
  providerProfiles: ProviderProfileSummary[],
): ImageChannelOption | undefined => (
  getImageChannelOptions(providerProfiles).find((channel) => channel.id === channelId)
);

export const getImageChannelsForProvider = (
  provider: string,
  providerProfiles: ProviderProfileSummary[],
): ImageChannelOption[] => {
  const channels = getImageChannelOptions(providerProfiles).filter((channel) => channel.provider === provider);
  const enabled = channels.filter((channel) => channel.enabled !== false);
  if (enabled.length > 0) {
    return enabled.sort((a, b) => {
      const configuredDelta = Number(Boolean(b.configured)) - Number(Boolean(a.configured));
      if (configuredDelta !== 0) return configuredDelta;
      return a.label.localeCompare(b.label);
    });
  }
  return channels.sort((a, b) => a.label.localeCompare(b.label));
};

export const resolveImageProviderFromSource = (source?: string): string => {
  const normalizedSource = String(source || '').trim().toLowerCase();
  if (normalizedSource === 'gemini') return 'gemini';
  if (normalizedSource === 'openai' || normalizedSource === 'azure-openai' || normalizedSource === 'azure') return 'openai';
  if (normalizedSource.startsWith('profile:')) return '';
  return 'gemini';
};

export const deriveImageChannelSelection = (
  route: Partial<OverrideRoute> | undefined,
  providerProfiles: ProviderProfileSummary[],
): { provider: string; channel: string; model: string; resolution: string } => {
  const routeModel = String(route?.model || '').trim();
  const normalizedModel = routeModel
    ? normalizeProjectDefaultImageModel(routeModel as Parameters<typeof normalizeProjectDefaultImageModel>[0])
    : PROJECT_DEFAULT_IMAGE_MODEL;
  const normalizedResolution = normalizeProjectDefaultImageResolution(
    route?.resolution || PROJECT_DEFAULT_IMAGE_RESOLUTION,
    normalizedModel,
  );
  const availableChannels = getImageChannelOptions(providerProfiles);
  const preferredChannel = getPreferredImageChannel(providerProfiles, String(route?.provider || ''));
  const directChannel = String(route?.channel || '').trim();
  if (directChannel) {
    const matched = availableChannels.find((channel) => channel.id === directChannel);
    return {
      provider: matched?.provider || preferredChannel?.provider || String(route?.provider || 'gemini'),
      channel: matched?.id || preferredChannel?.id || directChannel,
      model: normalizedModel,
      resolution: normalizedResolution,
    };
  }

  const source = String(route?.source || '').trim();
  if (source.startsWith('profile:')) {
    const profileId = source.slice('profile:'.length);
    const matched = availableChannels.find((channel) => channel.id === profileId);
    return {
      provider: matched?.provider || preferredChannel?.provider || String(route?.provider || 'gemini'),
      channel: matched?.id || preferredChannel?.id || profileId,
      model: normalizedModel,
      resolution: normalizedResolution,
    };
  }

  const provider = String(route?.provider || preferredChannel?.provider || resolveImageProviderFromSource(source) || 'gemini');
  const matched = availableChannels.find((channel) => channel.source === source && channel.provider === provider);
  const providerChannels = availableChannels.filter((channel) => channel.provider === provider);
  return {
    provider,
    channel: matched?.id || providerChannels[0]?.id || preferredChannel?.id || '',
    model: normalizedModel || PROJECT_DEFAULT_IMAGE_MODEL,
    resolution: normalizedResolution,
  };
};

export const normalizeImageProvider = (provider?: string): string => {
  const normalized = String(provider || '').trim().toLowerCase();
  return IMAGE_PROVIDER_OPTIONS.some((item) => item.value === normalized) ? normalized : 'gemini';
};

export const normalizeImageChannel = (
  channelId: string | undefined,
  provider: string,
  providerProfiles: ProviderProfileSummary[],
): string => {
  const channels = getImageChannelsForProvider(provider, providerProfiles);
  if (channels.some((channel) => channel.id === channelId)) {
    return String(channelId);
  }
  return channels[0]?.id || '';
};

export const getSourceForImageChannel = (
  channelId: string,
  providerProfiles: ProviderProfileSummary[],
): string => {
  const matched = getImageChannelOptionById(channelId, providerProfiles);
  return matched?.source || '';
};

export const getSelectableImageModelsForChannel = (
  channelId: string,
  providerProfiles: ProviderProfileSummary[],
) => {
  const channel = getImageChannelOptionById(channelId, providerProfiles);
  if (!channel) return PROJECT_IMAGE_MODEL_CATALOG;
  if (!channel.models?.length) {
    return PROJECT_IMAGE_MODEL_CATALOG.filter((item) => item.source === channel.provider);
  }
  const knownModelMap = new Map<string, (typeof PROJECT_IMAGE_MODEL_CATALOG)[number]>(
    PROJECT_IMAGE_MODEL_CATALOG.map((item) => [item.model, item]),
  );
  return channel.models.map((model) => {
    const known = knownModelMap.get(model);
    if (known) return known;
    return {
      source: channel.provider as 'gemini' | 'openai',
      model,
      label: `${channel.label} · ${model}`,
      resolutions: ['1K'],
    };
  });
};

// Return channel-aware resolution options for the selected model.
export const getSupportedResolutionsForChannelModel = (
  channelId: string,
  model: string,
  providerProfiles: ProviderProfileSummary[],
  fallbackResolutions: string[],
): string[] => {
  const channel = getImageChannelOptionById(channelId, providerProfiles);
  const supported = channel?.supported_resolutions?.[String(model || '').trim()];
  if (Array.isArray(supported) && supported.length > 0) {
    return [...supported];
  }
  return [...fallbackResolutions];
};

// Return whether the model belongs to the Gemini 3.1 flash image family.
const isGemini31FlashImageModel = (model: string): boolean => {
  return String(model || '').trim().toLowerCase().startsWith('gemini-3.1-flash-image-preview');
};

// Return whether the model uses OpenAI-compatible chat + google image config on this channel.
const isOpenAICompatGoogleChatModel = (
  channel: ImageChannelOption | undefined,
  model: string,
): boolean => {
  const normalizedModel = String(model || '').trim().toLowerCase();
  if (!channel || channel.provider !== 'openai') return false;
  const explicitMode = channel.model_capabilities?.[String(model || '').trim()]?.request_mode;
  if (explicitMode === 'openai-compat-google-chat') return true;
  if (explicitMode) return false;
  if (String(channel.adapter || '').trim() !== 'openai_image_compat') return false;
  return normalizedModel.startsWith('gemini-');
};

// Return whether the model uses the native OpenAI images API parameter family.
const isOpenAIImagesModel = (channel: ImageChannelOption | undefined, model: string): boolean => {
  const normalizedModel = String(model || '').trim().toLowerCase();
  if (!channel || channel.provider !== 'openai') return false;
  const explicitMode = channel.model_capabilities?.[String(model || '').trim()]?.request_mode;
  if (explicitMode === 'openai-images') return true;
  if (explicitMode) return false;
  return normalizedModel === 'gpt-image-2' || normalizedModel.startsWith('gpt-image-2-');
};

export type ImageModelConfigMode =
  | 'default'
  | 'openai-images'
  | 'openai-compat-google-chat';

export type ImageModelSchema =
  | 'default'
  | 'gpt-image-2'
  | 'gemini-image';

// Return the explicit schema for the selected channel/model pair when available.
export const getImageModelSchema = (
  channelId: string,
  model: string,
  providerProfiles: ProviderProfileSummary[],
): ImageModelSchema => {
  const channel = getImageChannelOptionById(channelId, providerProfiles);
  const explicitSchema = String(channel?.model_capabilities?.[String(model || '').trim()]?.schema || '').trim();
  if (explicitSchema === 'gpt-image-2' || explicitSchema === 'gemini-image') {
    return explicitSchema;
  }
  const mode = getImageModelConfigMode(channelId, model, providerProfiles);
  if (mode === 'openai-images') return 'gpt-image-2';
  if (mode === 'openai-compat-google-chat') return 'gemini-image';
  return 'default';
};

// Return the config mode for the selected channel/model pair.
export const getImageModelConfigMode = (
  channelId: string,
  model: string,
  providerProfiles: ProviderProfileSummary[],
): ImageModelConfigMode => {
  const channel = getImageChannelOptionById(channelId, providerProfiles);
  if (isOpenAICompatGoogleChatModel(channel, model)) {
    return 'openai-compat-google-chat';
  }
  if (isOpenAIImagesModel(channel, model)) {
    return 'openai-images';
  }
  return 'default';
};

// Return the page aspect ratios supported by the selected channel/model pair.
export const getSupportedAspectRatiosForChannelModel = (
  channelId: string,
  model: string,
  providerProfiles: ProviderProfileSummary[],
): string[] => {
  const schema = getImageModelSchema(channelId, model, providerProfiles);
  const normalizedModel = String(model || '').trim().toLowerCase();
  const supportedSet = new Set(BASE_MODEL_SUPPORTED_ASPECT_RATIO_SET);

  if (schema === 'gpt-image-2') {
    return ASPECT_RATIO_OPTIONS
      .map((option) => option.value)
      .filter((value) => supportedSet.has(value));
  }

  if (isGemini31FlashImageModel(normalizedModel)) {
    GEMINI_31_EXTRA_ASPECT_RATIO_SET.forEach((value) => supportedSet.add(value));
  }

  return ASPECT_RATIO_OPTIONS
    .map((option) => option.value)
    .filter((value) => supportedSet.has(value));
};

// Return whether the current page aspect ratio is compatible with the selected model.
export const isAspectRatioSupportedForChannelModel = (
  channelId: string,
  model: string,
  aspectRatio: string,
  providerProfiles: ProviderProfileSummary[],
): boolean => {
  const normalizedAspectRatio = String(aspectRatio || '').trim();
  return getSupportedAspectRatiosForChannelModel(channelId, model, providerProfiles).includes(normalizedAspectRatio);
};

// Return GPT Image 2 real size options for one page aspect ratio.
export const getGptImageSizeOptionsForAspectRatio = (aspectRatio: string): GptImageSizeOption[] => {
  const normalizedAspectRatio = String(aspectRatio || '').trim();
  return GPT_IMAGE_SIZE_OPTIONS.filter((option) => option.aspectRatio === normalizedAspectRatio);
};

export const formatImageModelDisplayName = (model: string): string => {
  return String(model || '').trim();
};

export const getImageModelDisplayLabel = (
  channelId: string,
  model: string,
  providerProfiles: ProviderProfileSummary[],
): string => {
  const channel = getImageChannelOptionById(channelId, providerProfiles);
  const trimmedModel = String(model || '').trim();
  const normalizedModelLabel = formatImageModelDisplayName(trimmedModel);
  if (!channel?.label) return normalizedModelLabel;
  return `${channel.label} -> ${normalizedModelLabel}`;
};
