export const PROJECT_DEFAULT_IMAGE_SOURCE = 'gemini';

export const PROJECT_SUPPORTED_IMAGE_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
] as const;

export type ProjectSupportedImageModel = (typeof PROJECT_SUPPORTED_IMAGE_MODELS)[number];

export const PROJECT_DEFAULT_IMAGE_MODEL: ProjectSupportedImageModel = PROJECT_SUPPORTED_IMAGE_MODELS[0];
export const PROJECT_DEFAULT_IMAGE_RESOLUTION = '4K';

export const PROJECT_IMAGE_RESOLUTION_OPTIONS: Record<ProjectSupportedImageModel, string[]> = {
  'gemini-3.1-flash-image-preview': ['0.5K', '1K', '2K', '4K'],
  'gemini-3-pro-image-preview': ['1K', '2K', '4K'],
};

export const normalizeProjectDefaultImageModel = (value?: string): ProjectSupportedImageModel => {
  const model = String(value || '').trim();
  return PROJECT_SUPPORTED_IMAGE_MODELS.includes(model as ProjectSupportedImageModel)
    ? (model as ProjectSupportedImageModel)
    : PROJECT_DEFAULT_IMAGE_MODEL;
};

export const normalizeProjectDefaultImageResolution = (value?: string, model?: string): string => {
  const normalizedModel = normalizeProjectDefaultImageModel(model);
  const options = PROJECT_IMAGE_RESOLUTION_OPTIONS[normalizedModel];
  const raw = String(value || '').trim();
  const resolution = raw === '0.5k' || raw === '0.5K' ? '0.5K' : raw.toUpperCase();
  return options.includes(resolution) ? resolution : PROJECT_DEFAULT_IMAGE_RESOLUTION;
};
