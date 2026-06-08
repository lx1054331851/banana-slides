import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlideCard } from '@/components/preview/SlideCard'
import type { Page } from '@/types'

vi.mock('@/hooks/useT', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('@/components/shared', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

vi.mock('@/api/client', () => ({
  getPageImageUrl: () => '/mock-image.png',
}))

describe('SlideCard', () => {
  const basePage: Page = {
    id: 'page-1',
    page_id: 'page-1',
    order_index: 1,
    status: 'DRAFT',
    outline_content: { title: 'New slide', points: [] },
  }

  it('does not render the edit button for pages without images', () => {
    render(
      <SlideCard
        page={basePage}
        index={1}
        isSelected={false}
        onClick={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('slideCard.editPage')).not.toBeInTheDocument()
  })

  it('hides edit and delete actions while image generation is in progress', () => {
    render(
      <SlideCard
        page={{ ...basePage, status: 'GENERATING' }}
        index={1}
        isSelected={false}
        onClick={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('slideCard.editPage')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('slideCard.confirmDeleteTitle')).not.toBeInTheDocument()
  })

  it('uses the same light ring style as template cards', () => {
    const { container, rerender } = render(
      <SlideCard
        page={basePage}
        index={1}
        isSelected={false}
        onClick={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('ring-1')
    expect(card).toHaveClass('ring-gray-200')

    rerender(
      <SlideCard
        page={basePage}
        index={1}
        isSelected={true}
        onClick={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(card).toHaveClass('ring-2')
    expect(card).toHaveClass('ring-banana-300')
  })
})
