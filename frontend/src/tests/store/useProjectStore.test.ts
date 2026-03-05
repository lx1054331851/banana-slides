/**
 * Zustand Store 测试
 * 
 * 测试useProjectStore的核心状态管理功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProjectStore } from '@/store/useProjectStore'
import * as api from '@/api/endpoints'

// Mock API模块
vi.mock('@/api/endpoints', () => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  updatePage: vi.fn(),
  updatePageDescription: vi.fn(),
  updatePageOutline: vi.fn(),
  generateOutline: vi.fn(),
  generateDescriptions: vi.fn(),
  generateImages: vi.fn(),
  addPage: vi.fn(),
  getTaskStatus: vi.fn(),
  exportPPTX: vi.fn(),
  exportPDF: vi.fn(),
}))

describe('useProjectStore', () => {
  beforeEach(() => {
    // 重置store状态
    const { result } = renderHook(() => useProjectStore())
    act(() => {
      result.current.setCurrentProject(null)
      result.current.setError(null)
      result.current.setGlobalLoading(false)
    })
  })

  describe('初始状态', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useProjectStore())
      
      expect(result.current.currentProject).toBeNull()
      expect(result.current.isGlobalLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.activeTaskId).toBeNull()
    })
  })

  describe('基础Setters', () => {
    it('should set current project correctly', () => {
      const { result } = renderHook(() => useProjectStore())
      const mockProject = { 
        id: '123', 
        status: 'DRAFT',
        pages: [],
        created_at: new Date().toISOString()
      }
      
      act(() => {
        result.current.setCurrentProject(mockProject as any)
      })
      
      expect(result.current.currentProject).toEqual(mockProject)
    })

    it('should set global loading state', () => {
      const { result } = renderHook(() => useProjectStore())
      
      act(() => {
        result.current.setGlobalLoading(true)
      })
      
      expect(result.current.isGlobalLoading).toBe(true)
      
      act(() => {
        result.current.setGlobalLoading(false)
      })
      
      expect(result.current.isGlobalLoading).toBe(false)
    })

    it('should set error correctly', () => {
      const { result } = renderHook(() => useProjectStore())
      
      act(() => {
        result.current.setError('Test error')
      })
      
      expect(result.current.error).toBe('Test error')
      
      act(() => {
        result.current.setError(null)
      })
      
      expect(result.current.error).toBeNull()
    })
  })

  describe('本地页面更新', () => {
    it('should update page locally (optimistic update)', () => {
      const { result } = renderHook(() => useProjectStore())
      
      // 先设置项目
      const mockProject = {
        id: 'proj-123',
        status: 'DRAFT',
        pages: [
          { id: 'page-1', outline_content: { title: 'Page 1', points: [] } },
          { id: 'page-2', outline_content: { title: 'Page 2', points: [] } },
        ]
      }
      
      act(() => {
        result.current.setCurrentProject(mockProject as any)
      })
      
      // 更新页面
      act(() => {
        result.current.updatePageLocal('page-1', { 
          outline_content: { title: 'Updated Page 1', points: ['new point'] }
        })
      })
      
      // 验证乐观更新
      const updatedPage = result.current.currentProject?.pages.find(p => p.id === 'page-1')
      expect(updatedPage?.outline_content?.title).toBe('Updated Page 1')
    })
  })

  describe('插页操作', () => {
    it('should insert page at specific order index and sync project', async () => {
      const { result } = renderHook(() => useProjectStore())

      act(() => {
        result.current.setCurrentProject({
          id: 'proj-123',
          status: 'DRAFT',
          pages: [
            { id: 'page-1', order_index: 0, outline_content: { title: 'P1', points: [] } },
            { id: 'page-2', order_index: 1, outline_content: { title: 'P2', points: [] } },
            { id: 'page-3', order_index: 2, outline_content: { title: 'P3', points: [] } },
          ],
        } as any)
      })

      vi.mocked(api.addPage).mockResolvedValue({
        success: true,
        data: {
          id: 'page-new',
          page_id: 'page-new',
          order_index: 2,
          outline_content: { title: '新页面', points: [] },
        },
      } as any)
      vi.mocked(api.getProject).mockResolvedValue({
        success: true,
        data: {
          id: 'proj-123',
          project_id: 'proj-123',
          status: 'DRAFT',
          pages: [
            { id: 'page-1', page_id: 'page-1', order_index: 0, outline_content: { title: 'P1', points: [] } },
            { id: 'page-2', page_id: 'page-2', order_index: 1, outline_content: { title: 'P2', points: [] } },
            { id: 'page-new', page_id: 'page-new', order_index: 2, outline_content: { title: '新页面', points: [] } },
            { id: 'page-3', page_id: 'page-3', order_index: 3, outline_content: { title: 'P3', points: [] } },
          ],
        },
      } as any)

      let insertResult: { orderIndex: number } | null = null
      await act(async () => {
        insertResult = await result.current.insertPageAt(2)
      })

      expect(insertResult).toEqual({ orderIndex: 2 })
      expect(api.addPage).toHaveBeenCalledWith(
        'proj-123',
        expect.objectContaining({
          order_index: 2,
          outline_content: expect.objectContaining({ points: [] }),
        })
      )
      const callPayload = vi.mocked(api.addPage).mock.calls[0]?.[1] as any
      expect(['新页面', 'New Page']).toContain(callPayload?.outline_content?.title)
      expect(api.getProject).toHaveBeenCalledWith('proj-123')
    })
  })

  describe('清除状态', () => {
    it('should clear project by setting null', () => {
      const { result } = renderHook(() => useProjectStore())
      
      // 先设置项目
      act(() => {
        result.current.setCurrentProject({ id: '123', pages: [] } as any)
      })
      
      expect(result.current.currentProject).not.toBeNull()
      
      // 清除
      act(() => {
        result.current.setCurrentProject(null)
      })
      
      expect(result.current.currentProject).toBeNull()
    })
  })
})

