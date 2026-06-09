import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'

import { useSlidePreviewPageAiReferences } from '@/pages/hooks/useSlidePreviewPageAiReferences'

vi.mock('@/api/endpoints', () => ({
  uploadMaterial: vi.fn(),
}))

import { uploadMaterial } from '@/api/endpoints'

describe('useSlidePreviewPageAiReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:page-ai-preview-1')
  })

  it('replaces page ai uploading placeholders after image upload resolves', async () => {
    vi.mocked(uploadMaterial).mockResolvedValue({
      data: {
        url: '/files/materials/page-ai-uploaded-1.png',
        caption: '页面级已上传图片',
      },
    } as any)

    const show = vi.fn()

    const { result } = renderHook(() => {
      const [editPrompt, setEditPrompt] = useState('')
      const [selectedContextImages, setSelectedContextImages] = useState({
        useTemplate: false,
        descImageUrls: [] as string[],
        uploadedReferences: [],
      })
      const textareaValueRef = useRef('')
      const pageAiTextareaRef = {
        current: {
          insertAtCursor: (text: string) => {
            textareaValueRef.current += text
            setEditPrompt((prev) => prev + text)
          },
          focus: vi.fn(),
        },
      }

      return useSlidePreviewPageAiReferences({
        editPrompt,
        setEditPrompt,
        selectedContextImages,
        setSelectedContextImages,
        pageAiTextareaRef: pageAiTextareaRef as any,
        activePreviewReferenceId: null,
        setActivePreviewReferenceId: vi.fn(),
        projectId: 'project-1',
        show,
        t: (key: string) => key,
      })
    })

    const file = new File(['demo'], 'demo.png', { type: 'image/png' })

    await act(async () => {
      await result.current.handleFileUpload([file])
    })

    await waitFor(() => {
      const payload = result.current.buildPageAiPayload()
      expect(payload.uploadedReferences[0]?.markdownUrl).toBe('/files/materials/page-ai-uploaded-1.png')
      expect(payload.uploadedReferences[0]?.label).toBe('页面级已上传图片')
    })

    const payload = result.current.buildPageAiPayload()
    expect(payload.promptText).toBe('')
    expect(payload.inlineImageUrls).toEqual([])
    expect(result.current.selectedPageAiReferences[0]?.previewUrl).toBe('blob:page-ai-preview-1')
    expect(result.current.selectedPageAiReferences[0]?.label).toBe('页面级已上传图片')
    expect(result.current.selectedPageAiReferences).toHaveLength(1)
  })
})
