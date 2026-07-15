import type { PageAiReferenceMeta } from '@/pages/SlidePreview.pageAi';
import type { ApiResponse, GenerationOverride, ImageVersion, Page } from '@/types';
import { apiClient } from './client';

const IMAGE_OPERATION_TIMEOUT_MS = 300000;

/** Edits a page image while pinning the selected source version. */
export const editPageImage = async (
  projectId: string,
  pageId: string,
  editPrompt: string,
  contextImages?: {
    useTemplate?: boolean;
    descImageUrls?: string[];
    uploadedFiles?: File[];
    referenceMetas?: PageAiReferenceMeta[];
  },
  generationOverride?: GenerationOverride,
  sourceImageVersionId?: string | null,
): Promise<ApiResponse> => {
  if (contextImages?.uploadedFiles && contextImages.uploadedFiles.length > 0) {
    const formData = new FormData();
    formData.append('edit_instruction', editPrompt);
    if (sourceImageVersionId) {
      formData.append('source_image_version_id', sourceImageVersionId);
    }
    formData.append('use_template', String(contextImages.useTemplate || false));
    if (contextImages.descImageUrls && contextImages.descImageUrls.length > 0) {
      formData.append('desc_image_urls', JSON.stringify(contextImages.descImageUrls));
    }
    if (contextImages.referenceMetas && contextImages.referenceMetas.length > 0) {
      formData.append('reference_metas', JSON.stringify(contextImages.referenceMetas));
    }
    contextImages.uploadedFiles.forEach((file) => {
      formData.append('context_images', file);
    });
    if (generationOverride) {
      formData.append('generation_override', JSON.stringify(generationOverride));
    }

    const response = await apiClient.post<ApiResponse>(
      `/api/projects/${projectId}/pages/${pageId}/edit/image`,
      formData,
      { timeout: IMAGE_OPERATION_TIMEOUT_MS },
    );
    return response.data;
  }

  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/edit/image`,
    {
      edit_instruction: editPrompt,
      ...(sourceImageVersionId ? { source_image_version_id: sourceImageVersionId } : {}),
      context_images: {
        use_template: contextImages?.useTemplate || false,
        desc_image_urls: contextImages?.descImageUrls || [],
        reference_metas: contextImages?.referenceMetas || [],
      },
      ...(generationOverride ? { generation_override: generationOverride } : {}),
    },
    { timeout: IMAGE_OPERATION_TIMEOUT_MS },
  );
  return response.data;
};

/** Uploads a local image as the current page image. */
export const uploadPageImage = async (
  projectId: string,
  pageId: string,
  image: File,
): Promise<ApiResponse<Page>> => {
  const formData = new FormData();
  formData.append('image', image);

  const response = await apiClient.post<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/upload/image`,
    formData,
    { timeout: IMAGE_OPERATION_TIMEOUT_MS },
  );
  return response.data;
};

/** Gets every stored image version for a page. */
export const getPageImageVersions = async (
  projectId: string,
  pageId: string,
): Promise<ApiResponse<{ versions: ImageVersion[] }>> => {
  const response = await apiClient.get<ApiResponse<{ versions: ImageVersion[] }>>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions`,
  );
  return response.data;
};

/** Marks one active image version as the page's current version. */
export const setCurrentImageVersion = async (
  projectId: string,
  pageId: string,
  versionId: string,
): Promise<ApiResponse> => {
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions/${versionId}/set-current`,
  );
  return response.data;
};

/** Soft-deletes one page image version. */
export const deletePageImageVersion = async (
  projectId: string,
  pageId: string,
  versionId: string,
): Promise<ApiResponse<Page>> => {
  const response = await apiClient.delete<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions/${versionId}`,
  );
  return response.data;
};

/** Restores one page image version and makes it current. */
export const restorePageImageVersion = async (
  projectId: string,
  pageId: string,
  versionId: string,
): Promise<ApiResponse<Page>> => {
  const response = await apiClient.post<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions/${versionId}/restore`,
  );
  return response.data;
};
