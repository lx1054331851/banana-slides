import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'

import { useImagePaste } from '@/hooks/useImagePaste'

vi.mock('@/api/endpoints', () => ({
  uploadMaterial: vi.fn(),
  getMaterialByUrl: vi.fn(),
}))

import { uploadMaterial } from '@/api/endpoints'

describe('useImagePaste slide preview draft sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('keeps slide preview draft content in sync after pasted image upload resolves', async () => {
    vi.mocked(uploadMaterial).mockResolvedValue({
      data: {
        url: '/files/materials/uploaded-1.png',
        caption: '已上传图片',
      },
    } as any)

    const showToast = vi.fn()

    const { result } = renderHook(() => {
      const [content, setContent] = useState('')
      const [draftDescription, setDraftDescription] = useState('')
      const contentRef = useRef(content)

      contentRef.current = content

      const setContentAndDraft = useRef((updater: (prev: string) => string) => {
        const nextValue = updater(contentRef.current)
        contentRef.current = nextValue
        setContent(nextValue)
        setDraftDescription(nextValue)
      })

      const imagePaste = useImagePaste({
        projectId: 'project-1',
        setContent: (updater) => setContentAndDraft.current(updater),
        showToast,
      })

      return {
        ...imagePaste,
        content,
        draftDescription,
      }
    })

    const file = new File(['demo'], 'demo.png', { type: 'image/png' })

    await act(async () => {
      await result.current.handleFiles([file])
    })

    await waitFor(() => {
      expect(result.current.content).toContain('/files/materials/uploaded-1.png')
      expect(result.current.draftDescription).toContain('/files/materials/uploaded-1.png')
    })

    expect(result.current.content).not.toContain('uploading:blob:preview-1')
    expect(result.current.draftDescription).not.toContain('uploading:blob:preview-1')
  })
})
