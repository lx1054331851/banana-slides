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
  generatingImageCount: 0,
  selectedPageHasImage: false,
  imageStatusLabel: '尚未生成图片',
  t: (key: string) => key,
  onPrevPage: vi.fn(),
  onNextPage: vi.fn(),
};

describe('PreviewStatusBar', () => {
  it('shows global rendering count even when the selected page is not generating', () => {
    render(
      <PreviewStatusBar
        {...baseProps}
        generatingImageCount={3}
        isSelectedPageGenerating={false}
      />
    );

    expect(screen.getByText('进行中 3 张')).toBeInTheDocument();
    expect(screen.queryByText('尚未生成图片')).not.toBeInTheDocument();
  });

  it('shows a single rendering image count', () => {
    render(
      <PreviewStatusBar
        {...baseProps}
        generatingImageCount={1}
        isSelectedPageGenerating={true}
      />
    );

    expect(screen.getByText('进行中 1 张')).toBeInTheDocument();
  });
});
