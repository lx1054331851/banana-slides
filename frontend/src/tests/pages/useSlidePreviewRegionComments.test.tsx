import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PendingRegionCapture } from '@/pages/SlidePreview.pageAi'
import { useSlidePreviewRegionComments } from '@/pages/hooks/useSlidePreviewRegionComments'

describe('useSlidePreviewRegionComments', () => {
  it('commits a pending region comment into the page AI context', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:region-placeholder')
    const previewImageUrl = '/files/project-1/pages/page-1.png'

    const { result } = renderHook(() => {
      const [editPrompt, setEditPrompt] = useState('')
      const [pendingRegionCapture, setPendingRegionCapture] = useState<PendingRegionCapture | null>(null)
      const [pendingRegionComment, setPendingRegionComment] = useState('')
      const [pendingRegionEscStep, setPendingRegionEscStep] = useState(0)
      const [selectedContextImages, setSelectedContextImages] = useState({
        useTemplate: false,
        descImageUrls: [] as string[],
        uploadedReferences: [],
      })

      const controls = useSlidePreviewRegionComments({
        pendingRegionCapture,
        setPendingRegionCapture,
        pendingRegionComment,
        setPendingRegionComment,
        pendingRegionEscStep,
        setPendingRegionEscStep,
        setSelectedContextImages,
        setEditPrompt,
        previewImageUrl,
        clearSelectionPreview: vi.fn(),
        setIsRegionSelectionMode: vi.fn(),
      })

      return {
        controls,
        editPrompt,
        pendingRegionCapture,
        selectedContextImages,
        setPendingRegionCapture,
        setPendingRegionComment,
      }
    })

    act(() => result.current.setPendingRegionCapture({
      regionBounds: {
        leftRatio: 0.1,
        topRatio: 0.2,
        widthRatio: 0.3,
        heightRatio: 0.4,
      },
    }))
    act(() => result.current.setPendingRegionComment('移除具体数字'))
    act(() => result.current.controls.commitPendingRegionCapture())

    expect(result.current.editPrompt).toBe('区域1：移除具体数字')
    expect(result.current.pendingRegionCapture).toBeNull()
    expect(result.current.selectedContextImages.uploadedReferences).toEqual([
      expect.objectContaining({
        sourceType: 'region',
        previewUrl: previewImageUrl,
        regionComment: '移除具体数字',
      }),
    ])
    expect(createObjectUrl).not.toHaveBeenCalled()
  })
})
