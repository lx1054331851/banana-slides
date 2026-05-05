import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlidePreviewSidebarShell } from '@/pages/components/SlidePreviewSidebarShell';

const baseProps = {
  t: (key: string, options?: Record<string, unknown>) => {
    if (key === 'preview.pageCount') return `共 ${options?.count} 页`;
    return key;
  },
  currentPageCount: 32,
  generatingImageCount: 0,
  isMobileView: false,
  isResizingSidebar: false,
  isSidebarCollapsed: false,
  isSidebarCompact: false,
  sidebarWidthPx: 320,
  sidebarDefaultWidth: 320,
  setSidebarWidthPxExpanded: vi.fn(),
  setIsSidebarCollapsed: vi.fn(),
  handleSidebarResizeStart: vi.fn(),
  sidebarViewMode: 'list' as const,
  setSidebarViewMode: vi.fn(),
  sidebarGridThumbMinPx: 140,
  sidebarGridThumbMaxPx: 320,
  sidebarGridThumbMaxWidthPx: 180,
};

describe('SlidePreviewSidebarShell', () => {
  it('shows global generating image count beside the page count', () => {
    render(
      <SlidePreviewSidebarShell {...baseProps} generatingImageCount={5}>
        <div />
      </SlidePreviewSidebarShell>
    );

    expect(screen.getByText('共 32 页')).toBeInTheDocument();
    expect(screen.getByText('生成中 5 张')).toBeInTheDocument();
  });

  it('hides global generating image count when no images are generating', () => {
    render(
      <SlidePreviewSidebarShell {...baseProps}>
        <div />
      </SlidePreviewSidebarShell>
    );

    expect(screen.getByText('共 32 页')).toBeInTheDocument();
    expect(screen.queryByText(/生成中/)).not.toBeInTheDocument();
  });
});
