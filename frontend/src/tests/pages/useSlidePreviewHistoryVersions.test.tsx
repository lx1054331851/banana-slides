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

  it('does not request history versions when the selected page has no image yet', async () => {
    renderHook(() => useSlidePreviewHistoryVersions({
      projectId: 'project-1',
      selectedPage: {
        id: 'page-1',
        generated_image_path: null,
        preview_image_path: null,
      } as any,
    }))

    await waitFor(() => {
      expect(getPageImageVersions).not.toHaveBeenCalled()
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
      } as any,
    }))

    await waitFor(() => {
      expect(result.current.imageVersions).toEqual([])
    })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
