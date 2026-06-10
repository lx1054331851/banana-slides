import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlidePreviewFloatingMenu } from '@/pages/components/SlidePreviewFloatingMenu';

/**
 * Build a stable anchor element for floating menu positioning tests.
 */
const createAnchorRef = () => {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  Object.defineProperty(anchor, 'getBoundingClientRect', {
    value: () => ({
      top: 64,
      left: 240,
      right: 320,
      bottom: 104,
      width: 80,
      height: 40,
      x: 240,
      y: 64,
      toJSON: () => ({}),
    }),
  });

  const ref = { current: anchor as HTMLButtonElement | null };
  return { ref, anchor };
};

describe('SlidePreviewFloatingMenu', () => {
  it('renders as a fixed overlay portal instead of an in-flow absolute layer', () => {
    const { ref } = createAnchorRef();

    render(
      <SlidePreviewFloatingMenu
        anchorRef={ref}
        isOpen={true}
        onClose={vi.fn()}
        ariaLabel="模型菜单"
      >
        <div>菜单内容</div>
      </SlidePreviewFloatingMenu>
    );

    const menu = screen.getByRole('menu', { name: '模型菜单' });
    expect(menu.className).toContain('fixed');
    expect(menu.className).toContain('z-[80]');
  });

  it('shows long menu text without truncate styling', () => {
    const { ref } = createAnchorRef();

    render(
      <SlidePreviewFloatingMenu
        anchorRef={ref}
        isOpen={true}
        onClose={vi.fn()}
        ariaLabel="模型菜单"
      >
        <button type="button" className="menu-item-label">
          VIVIAI -&gt; gemini-3.1-flash-image-preview-very-long-model-name
        </button>
      </SlidePreviewFloatingMenu>
    );

    const label = screen.getByText('VIVIAI -> gemini-3.1-flash-image-preview-very-long-model-name');
    expect(label.className).not.toContain('truncate');
  });

  it('uses adaptive width instead of a fixed inline width', () => {
    const { ref } = createAnchorRef();

    render(
      <SlidePreviewFloatingMenu
        anchorRef={ref}
        isOpen={true}
        onClose={vi.fn()}
        ariaLabel="模型菜单"
      >
        <div>菜单内容</div>
      </SlidePreviewFloatingMenu>
    );

    const menu = screen.getByRole('menu', { name: '模型菜单' });
    expect(menu.style.minWidth).toBe('80px');
    expect(menu.style.width).toBe('');
    expect(menu.style.maxWidth).toBe('min(480px, calc(100vw - 24px))');
  });

  it('closes when clicking outside the menu and anchor', () => {
    const { ref } = createAnchorRef();
    const onClose = vi.fn();

    render(
      <>
        <div data-testid="outside">outside</div>
        <SlidePreviewFloatingMenu
          anchorRef={ref}
          isOpen={true}
          onClose={onClose}
          ariaLabel="模型菜单"
        >
          <div>菜单内容</div>
        </SlidePreviewFloatingMenu>
      </>
    );

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
