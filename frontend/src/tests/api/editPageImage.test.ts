import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

import { apiClient } from '@/api/client';
import { editPageImage } from '@/api/endpoints';

describe('editPageImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { success: true } });
  });

  it('sends the selected source version in JSON requests', async () => {
    await editPageImage(
      'project-1',
      'page-1',
      '修改标题',
      undefined,
      undefined,
      'version-6',
    );

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/projects/project-1/pages/page-1/edit/image',
      expect.objectContaining({ source_image_version_id: 'version-6' }),
      expect.any(Object),
    );
  });

  it('sends the selected source version in multipart requests', async () => {
    const image = new File(['image'], 'reference.png', { type: 'image/png' });

    await editPageImage(
      'project-1',
      'page-1',
      '修改标题',
      { uploadedFiles: [image] },
      undefined,
      'version-6',
    );

    const formData = vi.mocked(apiClient.post).mock.calls[0]?.[1] as FormData;
    expect(formData.get('source_image_version_id')).toBe('version-6');
  });
});
