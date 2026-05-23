import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useImagePaste } from '@/hooks/useImagePaste'

vi.mock('@/api/endpoints', () => ({
  uploadMaterial: vi.fn(),
  getMaterialByUrl: vi.fn(),
}))

import { uploadMaterial } from '@/api/endpoints'

describe('useImagePaste', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps placeholder preview urls alive until the hook unmounts', async () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.mocked(uploadMaterial).mockResolvedValue({
      data: {
        url: '/files/materials/uploaded-1.png',
        caption: '已上传图片',
      },
    } as any)

    let content = ''
    const setContent = (updater: (prev: string) => string) => {
      content = updater(content)
    }

    const { result, unmount } = renderHook(() => useImagePaste({
      projectId: 'project-1',
      setContent,
      showToast: vi.fn(),
    }))

    const file = new File(['demo'], 'demo.png', { type: 'image/png' })

    await act(async () => {
      await result.current.handleFiles([file])
    })

    await waitFor(() => {
      expect(content).toContain('/files/materials/uploaded-1.png')
    })

    expect(createObjectURLSpy).toHaveBeenCalledWith(file)
    expect(revokeObjectURLSpy).not.toHaveBeenCalled()

    unmount()

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:preview-1')
  })
})
