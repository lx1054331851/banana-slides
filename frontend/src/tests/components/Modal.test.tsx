import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from '@/components/shared/Modal';

describe('Modal', () => {
  it('allows a dialog to override the content scroll behavior', async () => {
    render(
      <Modal
        isOpen
        onClose={() => undefined}
        title="测试弹窗"
        contentClassName="overflow-hidden"
      >
        <div>弹窗内容</div>
      </Modal>
    );

    const content = (await screen.findByText('弹窗内容')).parentElement;
    expect(content).toHaveClass('overflow-hidden');
  });
});
