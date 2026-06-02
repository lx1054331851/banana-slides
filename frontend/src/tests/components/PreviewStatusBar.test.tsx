import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewStatusBar } from '@/pages/components/PreviewStatusBar';

const baseProps = {
  selectedIndex: 0,
  totalPages: 32,
  isCurrentPageDirty: false,
  textStatusLabel: '文本已保存',
  isSelectedPageGenerating: false,
  generationStatusDetail: '正在渲染',
  selectedPageHasImage: false,
  imageStatusLabel: '尚未生成图片',
  imageResolutionLabel: null,
  t: (key: string) => key,
  onPrevPage: vi.fn(),
  onNextPage: vi.fn(),
};

describe('PreviewStatusBar', () => {
  it('keeps the current page image status when other pages are generating', () => {
    render(
      <PreviewStatusBar
        {...baseProps}
        isSelectedPageGenerating={false}
      />
    );

    expect(screen.getByText('尚未生成图片')).toBeInTheDocument();
    expect(screen.queryByText('进行中 3 张')).not.toBeInTheDocument();
  });

  it('shows current page generation status when the selected page is generating', () => {
    render(
      <PreviewStatusBar
        {...baseProps}
        isSelectedPageGenerating={true}
      />
    );

    expect(screen.getByText('正在渲染')).toBeInTheDocument();
  });

  it('shows selected image resolution when available', () => {
    render(
      <PreviewStatusBar
        {...baseProps}
        selectedPageHasImage={true}
        imageStatusLabel="图片已生成"
        imageResolutionLabel="分辨率 1080 × 1920"
      />
    );

    expect(screen.getByText('分辨率 1080 × 1920')).toBeInTheDocument();
  });
});
