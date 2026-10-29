import { getImageUrl } from '@/api/client';
import { listUserTemplates, listPresetTemplates, type UserTemplate } from '@/api/endpoints';
import type { TemplateSource } from './TemplateSelector';

/** Resolve user and preset templates into validated image files. */
export const getTemplateFile = async (
  templateId: string,
  userTemplates: UserTemplate[],
  source: Exclude<TemplateSource, 'upload'> = 'user'
): Promise<File | null> => {
  const presetFallbacks: Record<string, string> = {
    '1': '/templates/template_y.png',
    '2': '/templates/template_vector_illustration.png',
    '3': '/templates/template_glass.png',
  };

  const fetchImageFile = async (url: string, filename: string): Promise<File> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load template image (${response.status})`);
    }

    const blob = await response.blob();
    const contentType = response.headers.get('content-type') || blob.type;
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`Template response is not an image (${contentType})`);
    }
    if (blob.size === 0) {
      throw new Error('Template image is empty');
    }

    return new File([blob], filename, { type: blob.type || contentType || 'image/png' });
  };

  if (source === 'user' && !presetFallbacks[templateId] && !userTemplates.some((template) => template.template_id === templateId)) {
    try {
      const response = await listUserTemplates();
      userTemplates = response.data?.templates || [];
    } catch (error) {
      console.error('Failed to refresh user templates:', error);
      return null;
    }
    if (!userTemplates.some((template) => template.template_id === templateId)) return null;
  }

  const shouldTryPreset = source === 'preset' || !userTemplates.some((template) => template.template_id === templateId);
  if (shouldTryPreset) {
    try {
      const presetResponse = await listPresetTemplates();
      const presetTemplate = (presetResponse.data?.templates || []).find((template) => template.template_id === templateId);
      if (presetTemplate?.template_image_url) {
        const imageUrl = getImageUrl(presetTemplate.template_image_url);
        const filename = presetTemplate.template_image_url.split('/').pop() || 'template.png';
        return await fetchImageFile(imageUrl, filename);
      }
    } catch (error) {
      console.error('Failed to load preset template:', error);
    }

    const fallbackUrl = presetFallbacks[templateId];
    if (fallbackUrl) {
      try {
        return await fetchImageFile(fallbackUrl, fallbackUrl.split('/').pop() || 'template.png');
      } catch (error) {
        console.error('Failed to load fallback preset template:', error);
      }
    }
  }

  const userTemplate = userTemplates.find((template) => template.template_id === templateId);
  if (userTemplate?.template_image_url) {
    try {
      const imageUrl = getImageUrl(userTemplate.template_image_url);
      return await fetchImageFile(imageUrl, 'template.png');
    } catch (error) {
      console.error('Failed to load user template:', error);
    }
  }

  return null;
};
