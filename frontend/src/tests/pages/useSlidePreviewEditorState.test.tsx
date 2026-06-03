import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';

import { useSlidePreviewEditorState } from '@/pages/hooks/useSlidePreviewEditorState';
import type { Project } from '@/types';

const createProject = (): Project => ({
  project_id: 'project-1',
  id: 'project-1',
  idea_prompt: 'demo',
  scenario: 'data_report',
  creation_type: 'ppt_renovation',
  template_style_json: JSON.stringify({
    design_system_spec: {
      slide_templates: {
        cover: {
          page_type: '报告封面',
          title_style: 'bold',
        },
      },
    },
  }),
  status: 'DRAFT',
  pages: [
    {
      page_id: 'page-1',
      id: 'page-1',
      order_index: 0,
      outline_content: {
        title: '封面',
        page_type: '报告封面',
        points: [],
      },
      status: 'DRAFT',
    },
  ],
  created_at: '2026-06-03T00:00:00Z',
  updated_at: '2026-06-03T00:00:00Z',
});

describe('useSlidePreviewEditorState', () => {
  it('supports rerendering from loading state to project-loaded state', () => {
    const persistCurrentPageDraft = vi.fn();
    const scheduleTextAutoSave = vi.fn();
    const setStyleGuideManuallyEdited = vi.fn();
    const setEditStyleGuideBindings = vi.fn();

    const { result, rerender } = renderHook(({ currentProject }) => {
      const styleGuideTextareaRef = useRef(null);
      const descriptionTextareaRef = useRef(null);
      const editorJsonContainerRef = useRef<HTMLDivElement | null>(null);

      return useSlidePreviewEditorState({
        currentProject,
        selectedPage: currentProject?.pages[0],
        currentImageVersionId: 'version-1',
        editPageType: '',
        editStyleGuideBindings: {},
        styleGuideManuallyEdited: false,
        setStyleGuideManuallyEdited,
        setEditStyleGuideBindings,
        persistCurrentPageDraft,
        scheduleTextAutoSave,
        isMobileView: false,
        isEditorPaneCollapsed: false,
        renovationJsonViewMode: 'text',
        styleGuideTextareaRef,
        descriptionTextareaRef,
        editorJsonContainerRef,
      });
    }, {
      initialProps: {
        currentProject: null as Project | null,
      },
    });

    expect(result.current.pageTypeOptions).toContain('封面页');

    const project = createProject();
    rerender({ currentProject: project });

    expect(result.current.pageTypeOptions).toContain('报告封面');
    expect(result.current.useRenovationPreviewForm).toBe(true);
    expect(result.current.resolvedStyleGuideText).toContain('"page_type": "报告封面"');
  });

  it('writes both page-level and image-version style guide bindings', () => {
    const persistCurrentPageDraft = vi.fn();
    const scheduleTextAutoSave = vi.fn();
    const setStyleGuideManuallyEdited = vi.fn();
    let receivedUpdater: ((prev: Record<string, string>) => Record<string, string>) | undefined;
    const setEditStyleGuideBindings = vi.fn((updater) => {
      receivedUpdater = updater;
    });

    const project = createProject();

    const { result } = renderHook(() => {
      const styleGuideTextareaRef = useRef(null);
      const descriptionTextareaRef = useRef(null);
      const editorJsonContainerRef = useRef<HTMLDivElement | null>(null);

      return useSlidePreviewEditorState({
        currentProject: project,
        selectedPage: project.pages[0],
        currentImageVersionId: 'version-1',
        editPageType: '',
        editStyleGuideBindings: {},
        styleGuideManuallyEdited: false,
        setStyleGuideManuallyEdited,
        setEditStyleGuideBindings,
        persistCurrentPageDraft,
        scheduleTextAutoSave,
        isMobileView: false,
        isEditorPaneCollapsed: false,
        renovationJsonViewMode: 'text',
        styleGuideTextareaRef,
        descriptionTextareaRef,
        editorJsonContainerRef,
      });
    });

    act(() => {
      result.current.handleStyleGuideTextChange('{"accent":"gold"}');
    });

    expect(setStyleGuideManuallyEdited).toHaveBeenCalledWith(true);
    expect(receivedUpdater).toBeTypeOf('function');

    const nextBindings = receivedUpdater!({});
    expect(nextBindings).toEqual({
      __page_default__: '{"accent":"gold"}',
      'image_version:version-1': '{"accent":"gold"}',
    });
    expect(persistCurrentPageDraft).toHaveBeenCalledWith({
      styleGuideBindings: nextBindings,
      styleGuideManuallyEdited: true,
    });
    expect(scheduleTextAutoSave).toHaveBeenCalledWith({
      styleGuideBindings: nextBindings,
    });
  });
});
