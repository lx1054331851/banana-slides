import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextStyleSelector } from '@/components/shared/TextStyleSelector';

vi.mock('@/api/endpoints', () => ({
  listStyleTemplates: vi.fn(async () => ({ data: { templates: [] } })),
  createStyleTemplate: vi.fn(async () => ({ data: {} })),
  deleteStyleTemplate: vi.fn(async () => ({ data: {} })),
  extractStyleFromImage: vi.fn(async () => ({ data: { style_description: '' } })),
}));

describe('TextStyleSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render direct-apply style preset selector', async () => {
    render(
      <TextStyleSelector
        value=""
        onChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /高级|Advanced/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(1);
    });
    expect(screen.queryByText(/风格预设（直接应用）|Style presets \\(apply\\)/i)).not.toBeInTheDocument();
  });
});
