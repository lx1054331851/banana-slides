import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'

import { useSlidePreviewPageAiContext } from '@/pages/hooks/useSlidePreviewPageAiContext'
import type { Project } from '@/types'

const createProject = (): Project => ({
  project_id: 'project-1',
  id: 'project-1',
  idea_prompt: 'demo',
  scenario: 'ppt',
  creation_type: 'ppt_renovation',
  template_style_json: '',
  status: 'DRAFT',
  pages: [
    {
      page_id: 'page-1',
      id: 'page-1',
      order_index: 0,
      outline_content: {
        title: '封面',
        page_type: '封面页',
        points: [],
      },
      status: 'DRAFT',
    },
  ],
  created_at: '2026-06-10T00:00:00Z',
  updated_at: '2026-06-10T00:00:00Z',
})

describe('useSlidePreviewPageAiContext', () => {
  it('preserves user-selected page ai model when default model changes for the same page', () => {
    const project = createProject()

    const { result, rerender } = renderHook(({ defaultModel }) => {
      const [editPrompt, setEditPrompt] = useState('')
      const [pageAiMessages, setPageAiMessages] = useState([])
      const [editRunImageModel, setEditRunImageModel] = useState(defaultModel)
      const [selectedContextImages, setSelectedContextImages] = useState({
        useTemplate: false,
        descImageUrls: [] as string[],
        uploadedReferences: [],
      })

      const hookValue = useSlidePreviewPageAiContext({
        currentProject: project,
        selectedIndex: 0,
        currentImageVersionId: null,
        defaultModel,
        editPrompt,
        setEditPrompt,
        pageAiMessages,
        setPageAiMessages,
        editRunImageModel,
        setEditRunImageModel,
        selectedContextImages,
        setSelectedContextImages,
      })

      return {
        ...hookValue,
        editRunImageModel,
        setEditRunImageModel,
      }
    }, {
      initialProps: {
        defaultModel: 'gs88::gpt-image-2',
      },
    })

    act(() => {
      result.current.setEditRunImageModel('azure-openai::gpt-image-2')
    })

    rerender({
      defaultModel: 'gs88::gpt-image-2-high',
    })

    expect(result.current.editRunImageModel).toBe('azure-openai::gpt-image-2')
  })

  it('does not immediately reset the selected model on same-page rerender', () => {
    const project = createProject()

    const { result, rerender } = renderHook(({ projectVersion }) => {
      const [editPrompt, setEditPrompt] = useState('')
      const [pageAiMessages, setPageAiMessages] = useState([])
      const [editRunImageModel, setEditRunImageModel] = useState('gs88::gpt-image-2-high')
      const [selectedContextImages, setSelectedContextImages] = useState({
        useTemplate: false,
        descImageUrls: [] as string[],
        uploadedReferences: [],
      })

      const currentProject = {
        ...project,
        updated_at: projectVersion,
      }

      useSlidePreviewPageAiContext({
        currentProject,
        selectedIndex: 0,
        currentImageVersionId: null,
        defaultModel: 'gs88::gpt-image-2-high',
        editPrompt,
        setEditPrompt,
        pageAiMessages,
        setPageAiMessages,
        editRunImageModel,
        setEditRunImageModel,
        selectedContextImages,
        setSelectedContextImages,
      })

      return {
        editRunImageModel,
        setEditRunImageModel,
      }
    }, {
      initialProps: {
        projectVersion: '2026-06-10T00:00:00Z',
      },
    })

    act(() => {
      result.current.setEditRunImageModel('azure-sweden::gpt-image-2')
    })

    rerender({
      projectVersion: '2026-06-10T00:00:01Z',
    })

    expect(result.current.editRunImageModel).toBe('azure-sweden::gpt-image-2')
  })

  it('restores the stored page ai model for the same page context', async () => {
    const project = createProject()
    window.localStorage.setItem(
      `banana-page-ai-models:${project.id}`,
      JSON.stringify({
        'page-1:__page_default__': 'azure-sweden::gpt-image-2',
      }),
    )

    const { result } = renderHook(() => {
      const [editPrompt, setEditPrompt] = useState('')
      const [pageAiMessages, setPageAiMessages] = useState([])
      const [editRunImageModel, setEditRunImageModel] = useState('gs88::gpt-image-2-high')
      const [selectedContextImages, setSelectedContextImages] = useState({
        useTemplate: false,
        descImageUrls: [] as string[],
        uploadedReferences: [],
      })

      useSlidePreviewPageAiContext({
        currentProject: project,
        selectedIndex: 0,
        currentImageVersionId: null,
        defaultModel: 'gs88::gpt-image-2-high',
        editPrompt,
        setEditPrompt,
        pageAiMessages,
        setPageAiMessages,
        editRunImageModel,
        setEditRunImageModel,
        selectedContextImages,
        setSelectedContextImages,
      })

      return {
        editRunImageModel,
      }
    })

    await waitFor(() => {
      expect(result.current.editRunImageModel).toBe('azure-sweden::gpt-image-2')
    })
  })
})
