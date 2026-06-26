import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PageAiWorkbench } from '@/components/shared/PageAiWorkbench'

const baseProps = {
  title: '页面级 AI',
  subtitle: 'subtitle',
  emptyTitle: 'empty',
  emptyDescription: 'empty description',
  inputPlaceholder: '输入指令',
  inputHint: 'Enter 生成，Shift+Enter 换行',
  sendLabel: '生成图片',
  sendTooltip: '生成当前页',
  referencesTitle: 'references',
  referencesEmpty: 'references empty',
  descriptionSourcesTitle: 'sources',
  templateLabel: 'template',
  materialLabel: 'material',
  uploadLabel: 'upload',
  loadingLabel: 'loading',
  regionSelectLabel: 'region',
  regionSelectActiveLabel: 'region active',
  modelLabel: 'model',
  modelHint: 'hint',
  messages: [],
  references: [],
  descriptionImageOptions: [],
  hasTemplateReference: false,
  activeReferenceId: null,
  inputValue: '',
  modelValue: 'gpt-image-1',
  modelOptions: ['gpt-image-1'],
  isSubmitting: false,
  isRegionSelectionActive: false,
  pendingRegionCommentValue: '',
  pendingRegionPreviewUrl: null,
  pendingRegionEscStep: 0,
  onInputChange: vi.fn(),
  onModelChange: vi.fn(),
  onSend: vi.fn(),
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
}

describe('PageAiWorkbench', () => {
  it('disables generate button when input is empty', () => {
    render(<PageAiWorkbench {...baseProps} />)

    const sendButton = screen.getByTestId('page-ai-send')
    expect(sendButton).toBeDisabled()
    expect(screen.getByText('生成图片')).toBeInTheDocument()
  })

  it('enables generate button when input has content', () => {
    render(<PageAiWorkbench {...baseProps} inputValue="把标题放大一些" />)

    const sendButton = screen.getByTestId('page-ai-send')
    expect(sendButton).toBeEnabled()
  })

  it('shows model picker control by default', () => {
    render(<PageAiWorkbench {...baseProps} />)

    expect(screen.getByLabelText('model')).toBeInTheDocument()
  })

  it('opens the model picker without crashing', () => {
    render(<PageAiWorkbench {...baseProps} />)

    fireEvent.click(screen.getByLabelText('model'))

    expect(screen.getByText('gpt-image-1')).toBeInTheDocument()
  })

  it('does not submit on Enter', () => {
    const onSend = vi.fn()
    render(<PageAiWorkbench {...baseProps} onSend={onSend} />)

    fireEvent.keyDown(screen.getByTestId('page-ai-input'), {
      key: 'Enter',
      code: 'Enter',
    })

    expect(onSend).toHaveBeenCalledTimes(0)
  })

  it('does not render pending region composer in the workbench shell', () => {
    render(
      <PageAiWorkbench
        {...baseProps}
        pendingRegionPreviewUrl="blob:test"
        pendingRegionCommentValue="把按钮再突出一点"
      />
    )

    expect(screen.queryByLabelText('发送评论')).not.toBeInTheDocument()
    expect(screen.queryByText('取消')).not.toBeInTheDocument()
  })

  it('opens lightbox when an uploaded reference thumbnail is clicked', async () => {
    render(
      <PageAiWorkbench
        {...baseProps}
        references={[
          {
            id: 'upload-1',
            sourceType: 'upload',
            label: '一个空白图',
            previewUrl: 'https://example.com/upload-1.png',
          },
        ]}
      />
    )

    fireEvent.click(screen.getByRole('img', { name: '一个空白图' }))

    expect(await screen.findByRole('dialog', { name: '一个空白图' })).toBeInTheDocument()
  })
})
