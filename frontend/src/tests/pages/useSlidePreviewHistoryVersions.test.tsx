import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useSlidePreviewHistoryVersions } from '@/pages/hooks/useSlidePreviewHistoryVersions'

vi.mock('@/api/endpoints', () => ({
  getPageImageVersions: vi.fn(),
}))

import { getPageImageVersions } from '@/api/endpoints'

describe('useSlidePreviewHistoryVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('still requests history versions when the selected page has no current image, so deleted versions can be restored', async () => {
    vi.mocked(getPageImageVersions).mockResolvedValueOnce({
      success: true,
      data: {
        versions: [
          {
            version_id: 'v-1',
            version_number: 1,
            is_current: false,
            is_deleted: true,
          },
        ],
      },
    } as any)

    const { result } = renderHook(() => useSlidePreviewHistoryVersions({
      projectId: 'project-1',
      selectedPage: {
        id: 'page-1',
        generated_image_path: null,
        preview_image_path: null,
        updated_at: '2026-06-26T00:00:00',
      } as any,
    }))

    await waitFor(() => {
      expect(getPageImageVersions).toHaveBeenCalledWith('project-1', 'page-1')
      expect(result.current.imageVersions).toHaveLength(1)
    })
  })

  it('treats a 404 history response as an empty version list', async () => {
    vi.mocked(getPageImageVersions).mockRejectedValueOnce({
      response: { status: 404 },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useSlidePreviewHistoryVersions({
      projectId: 'project-1',
      selectedPage: {
        id: 'page-1',
        generated_image_path: '/files/project-1/pages/page-1_v1.png',
        preview_image_path: '/files/project-1/pages/page-1_v1_thumb.jpg',
        updated_at: '2026-06-26T00:00:00',
      } as any,
    }))

    await waitFor(() => {
      expect(result.current.imageVersions).toEqual([])
    })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
