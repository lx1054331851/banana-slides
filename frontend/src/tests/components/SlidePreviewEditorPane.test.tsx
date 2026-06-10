import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlidePreviewEditorPane } from '@/pages/components/SlidePreviewEditorPane';

/**
 * Build the minimal props needed to render the editor pane in tests.
 */
const createProps = () => ({
  t: (key: string) => key,
  isEditorPaneHidden: false,
  isMobileView: false,
  useRenovationPreviewForm: true,
  shouldUseEditorVerticalSplit: false,
  editorVerticalSplitContainerRef: { current: null },
  resolvedEditorVerticalSplitRatio: 0.5,
  isResizingEditorVerticalSplit: false,
  editorCanvasContent: <div>canvas</div>,
  externalFieldTags: <div>tags</div>,
  pageAiMessages: [],
  selectedPageAiReferences: [],
  activePreviewReferenceId: null,
  editPrompt: '',
  pageAiTextareaRef: { current: null },
  pageAiSlashActions: [],
  editRunImageModel: 'gpt-image-2',
  editRunImageModelOptions: ['gpt-image-2'],
  isPageAiSubmitting: false,
  isRegionSelectionMode: false,
  pendingRegionCommentValue: '',
  pendingRegionPreviewUrl: null,
  pendingRegionEscStep: 0,
  historyVersionsCount: 0,
  onEditorVerticalSplitResizeStart: vi.fn(),
  onLinkedSplitResizeStart: vi.fn(),
  onOpenHistory: vi.fn(),
  onEditPromptChange: vi.fn(),
  onEditRunImageModelChange: vi.fn(),
  onPageAiSend: vi.fn(),
  onToggleRegionSelect: vi.fn(),
  onPendingRegionCommentChange: vi.fn(),
  onSubmitPendingRegionComment: vi.fn(),
  onCancelPendingRegionComment: vi.fn(),
  onPendingRegionEsc: vi.fn(),
  onToggleTemplate: vi.fn(),
  onToggleDescriptionImage: vi.fn(),
  onReferenceClick: vi.fn(),
  onRemoveReference: vi.fn(),
  onOpenMaterialSelector: vi.fn(),
  onUploadFiles: vi.fn(),
  onPageAiPaste: vi.fn(),
});

describe('SlidePreviewEditorPane', () => {
  it('keeps desktop renovation mode overflow visible so floating menus are not clipped', () => {
    render(<SlidePreviewEditorPane {...createProps()} />);

    const pane = screen.getByTestId('preview-editor-pane');
    expect(pane.className).toContain('overflow-visible');
    expect(pane.className).not.toContain('overflow-y-hidden');
  });
});
