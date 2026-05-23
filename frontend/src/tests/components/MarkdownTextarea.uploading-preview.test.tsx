import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MarkdownTextarea } from '@/components/shared/MarkdownTextarea'

const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL')
const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL')

const PreviewHarness = () => {
  const [value, setValue] = React.useState('![demo image](uploading:blob:preview-1)')

  return (
    <div>
      <button type="button" onClick={() => setValue('![已上传图片](/files/materials/uploaded-1.png)')}>
        resolve upload
      </button>
      <MarkdownTextarea
        value={value}
        onChange={setValue}
        onFiles={() => {}}
        showImagePreview
      />
      <output data-testid="markdown-value">{value}</output>
    </div>
  )
}

describe('MarkdownTextarea upload preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createObjectURLSpy.mockReturnValue('blob:preview-1')
    revokeObjectURLSpy.mockImplementation(() => {})
  })

  it('updates uploading preview chips immediately while the editor stays focused', async () => {
    render(<PreviewHarness />)

    const textbox = screen.getByRole('textbox')
    textbox.focus()

    expect(screen.getByTitle('Uploading...')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-value').textContent).toContain('uploading:blob:preview-1')

    fireEvent.click(screen.getByText('resolve upload'))

    await waitFor(() => {
      expect(screen.getByTestId('markdown-value').textContent).toContain('/files/materials/uploaded-1.png')
      expect(screen.getByTestId('markdown-value').textContent).not.toContain('uploading:blob:preview-1')
    })

    expect(screen.queryByText('上传中...')).not.toBeInTheDocument()
  })
})
