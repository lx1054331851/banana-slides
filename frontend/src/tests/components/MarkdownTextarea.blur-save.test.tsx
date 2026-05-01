import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarkdownTextarea } from '@/components/shared/MarkdownTextarea';

describe('MarkdownTextarea blur save handoff', () => {
  it('passes the current editor text to onBlur before React state catches up', () => {
    const onBlur = vi.fn();
    render(
      <MarkdownTextarea
        value=""
        onChange={() => {}}
        onBlur={onBlur}
      />
    );

    const editor = screen.getByRole('textbox');
    editor.textContent = '第一次保存';

    fireEvent.blur(editor);

    expect(onBlur).toHaveBeenCalledWith('第一次保存');
  });
});
