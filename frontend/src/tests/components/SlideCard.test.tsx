import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
  getImageUrl: (path: string) => path,
}))

describe('SlideCard', () => {
  const basePage: Page = {
    id: 'page-1',
    page_id: 'page-1',
    order_index: 1,
    status: 'DRAFT',
    outline_content: { title: 'New slide', points: [] },
  }

  it('renders edit button for pages without images', () => {
    const onEdit = vi.fn()

    render(
      <SlideCard
        page={basePage}
        index={1}
        isSelected={false}
        onClick={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByLabelText('slideCard.editPage'))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })
})