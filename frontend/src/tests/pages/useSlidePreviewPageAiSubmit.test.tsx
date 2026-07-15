import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSlidePreviewPageAiSubmit } from '@/pages/hooks/useSlidePreviewPageAiSubmit';

describe('useSlidePreviewPageAiSubmit', () => {
  it('pins the selected image version when starting an edit', async () => {
    const executePageImageGeneration = vi.fn().mockResolvedValue(undefined);
    const runGenerateFlow = vi.fn(async (action: () => Promise<void>) => {
      await action();
      return true;
    });

    const { result } = renderHook(() => useSlidePreviewPageAiSubmit({
      currentProject: {
        id: 'project-1',
        pages: [{ id: 'page-1' }],
      } as any,
      selectedIndex: 0,
      t: (key) => key,
      buildPageAiPayload: () => ({
        promptText: '修改标题',
        inlineImageUrls: [],
        uploadedReferences: [],
        referenceMetas: [],
      }),
      selectedPageAiReferences: [],
      pageAiMessages: [],
      setPageAiMessages: vi.fn(),
      runGenerateFlow,
      executePageImageGeneration,
      editRunImageModel: 'image-model',
      currentImageVersionId: 'context-key-for-version-6',
      sourceImageVersionId: 'version-6',
      editPrompt: '修改标题',
      selectedContextImages: {
        useTemplate: false,
        descImageUrls: [],
        uploadedReferences: [],
      },
      bindPendingPageAiContext: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleSubmitCurrentPageGeneration();
    });

    expect(executePageImageGeneration).toHaveBeenCalledWith(expect.objectContaining({
      sourceImageVersionId: 'version-6',
    }));
  });
});
