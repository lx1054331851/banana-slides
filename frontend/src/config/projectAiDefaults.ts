export const PROJECT_DEFAULT_IMAGE_SOURCE = 'gemini';
export const PROJECT_OPENAI_IMAGE_SOURCE = 'openai';

export const PROJECT_IMAGE_MODEL_CATALOG = [
  {
    source: 'gemini',
    model: 'gemini-3.1-flash-image-preview',
    label: 'Gemini · gemini-3.1-flash-image-preview',
    resolutions: ['0.5K', '1K', '2K', '4K'],
  },
  {
    source: 'gemini',
    model: 'gemini-3-pro-image-preview',
    label: 'Gemini · gemini-3-pro-image-preview',
    resolutions: ['1K', '2K', '4K'],
  },
  {
    source: 'openai',
    model: 'gpt-image-2',
    label: 'Azure OpenAI · gpt-image-2',
    resolutions: ['1K', '2K', '4K'],
  },
] as const;

export type ProjectImageModelSource = (typeof PROJECT_IMAGE_MODEL_CATALOG)[number]['source'];
export type ProjectSupportedImageModel = (typeof PROJECT_IMAGE_MODEL_CATALOG)[number]['model'];

export const PROJECT_SUPPORTED_IMAGE_MODELS = PROJECT_IMAGE_MODEL_CATALOG.map((item) => item.model);
export const PROJECT_SUPPORTED_IMAGE_SOURCES = Array.from(new Set(PROJECT_IMAGE_MODEL_CATALOG.map((item) => item.source)));
export const PROJECT_BUILTIN_IMAGE_SOURCES = [...PROJECT_SUPPORTED_IMAGE_SOURCES];

export const PROJECT_DEFAULT_IMAGE_MODEL: ProjectSupportedImageModel = PROJECT_SUPPORTED_IMAGE_MODELS[0];
export const PROJECT_DEFAULT_IMAGE_RESOLUTION = '4K';

// Return provider source by selected image model.
export const getImageSourceForModel = (
  model?: string,
  fallback: string = PROJECT_DEFAULT_IMAGE_SOURCE,
): ProjectImageModelSource => {
  const normalizedModel = String(model || '').trim();
  const found = PROJECT_IMAGE_MODEL_CATALOG.find((item) => item.model === normalizedModel);
  if (found?.source) return found.source as ProjectImageModelSource;
  if (PROJECT_SUPPORTED_IMAGE_SOURCES.includes(fallback as ProjectImageModelSource)) {
    return fallback as ProjectImageModelSource;
  }
  return PROJECT_DEFAULT_IMAGE_SOURCE as ProjectImageModelSource;
};

// Normalize image model to one supported model.
export const normalizeProjectDefaultImageModel = (value?: string): ProjectSupportedImageModel => {
  const model = String(value || '').trim();
  return PROJECT_SUPPORTED_IMAGE_MODELS.includes(model as ProjectSupportedImageModel)
    ? (model as ProjectSupportedImageModel)
    : PROJECT_DEFAULT_IMAGE_MODEL;
};

// Normalize provider source to supported values, fallback from model mapping.
export const normalizeProjectDefaultImageSource = (source?: string, model?: string): ProjectImageModelSource => {
  const normalizedSource = String(source || '').trim();
  if (normalizedSource.startsWith('profile:')) {
    return normalizedSource as ProjectImageModelSource;
  }
  if (PROJECT_SUPPORTED_IMAGE_SOURCES.includes(normalizedSource as ProjectImageModelSource)) {
    return normalizedSource as ProjectImageModelSource;
  }
  return getImageSourceForModel(model, PROJECT_DEFAULT_IMAGE_SOURCE);
};

// Return supported resolution options for a model.
export const getSupportedResolutionsForModel = (model?: string): string[] => {
  const normalizedModel = normalizeProjectDefaultImageModel(model);
  const found = PROJECT_IMAGE_MODEL_CATALOG.find((item) => item.model === normalizedModel);
  return found?.resolutions ? [...found.resolutions] : ['1K'];
};

// Normalize resolution by model capability.
export const normalizeProjectDefaultImageResolution = (value?: string, model?: string): string => {
  const options = getSupportedResolutionsForModel(model);
  const raw = String(value || '').trim();
  const resolution = raw === '0.5k' || raw === '0.5K' ? '0.5K' : raw.toUpperCase();
  if (options.includes(resolution)) return resolution;
  if (options.includes(PROJECT_DEFAULT_IMAGE_RESOLUTION)) return PROJECT_DEFAULT_IMAGE_RESOLUTION;
  return options[0] || '1K';
};
