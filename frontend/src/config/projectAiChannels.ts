import type {
  ImageChannelOption,
  OverrideRoute,
  ProviderProfileSummary,
} from '@/types';
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

export const BUILTIN_IMAGE_CHANNELS: ImageChannelOption[] = [];

let runtimeBuiltinImageChannels: ImageChannelOption[] = [...BUILTIN_IMAGE_CHANNELS];

export const setRuntimeBuiltinImageChannels = (channels?: ImageChannelOption[]) => {
  runtimeBuiltinImageChannels = Array.isArray(channels) && channels.length > 0
    ? channels
    : [...BUILTIN_IMAGE_CHANNELS];
};

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
): ImageChannelOption[] => [
  ...runtimeBuiltinImageChannels,
  ...providerProfiles
    .filter((profile) => (profile.capabilities || []).includes('image'))
    .map(toImageChannelOption),
];

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

export const formatImageModelDisplayName = (model: string): string => {
  const trimmedModel = String(model || '').trim();
  if (trimmedModel === 'gpt-image-2-low') {
    return `${trimmedModel}（低质量档，不等于低分辨率）`;
  }
  if (trimmedModel === 'gpt-image-2-medium') {
    return `${trimmedModel}（中质量档，不等于 2K）`;
  }
  if (trimmedModel === 'gpt-image-2-high') {
    return `${trimmedModel}（高质量档，不等于 4K）`;
  }
  return trimmedModel;
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
