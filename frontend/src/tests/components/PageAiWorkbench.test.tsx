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
  onInputChange: vi.fn(),
  onModelChange: vi.fn(),
  onSend: vi.fn(),
  onToggleRegionSelect: vi.fn(),
  onToggleTemplate: vi.fn(),
  onToggleDescriptionImage: vi.fn(),
  onReferenceClick: vi.fn(),
  onRemoveReference: vi.fn(),
  onOpenMaterialSelector: vi.fn(),
  onUploadFiles: vi.fn(),
}

describe('PageAiWorkbench', () => {
  it('keeps generate button available even when input is empty', () => {
    render(<PageAiWorkbench {...baseProps} />)

    const sendButton = screen.getByTestId('page-ai-send')
    expect(sendButton).toBeEnabled()
    expect(screen.getByText('生成图片')).toBeInTheDocument()
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
})
