import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TemplateSelector } from '@/components/shared/TemplateSelector';

const { mockListUserTemplates, mockListStylePresets } = vi.hoisted(() => ({
  mockListUserTemplates: vi.fn(async () => ({ data: { templates: [] } })),
  mockListStylePresets: vi.fn(async () => ({
    data: {
      presets: [
        { id: 's1', name: 'Style 1', style_json: '{"x":1}', preview_images: { cover_url: '/files/style-presets/s1/cover.png', toc_url: '', detail_url: '', ending_url: '' } },
        { id: 's2', name: 'Style 2', style_json: '{"x":2}', preview_images: { cover_url: '/files/style-presets/s2/cover.png', toc_url: '', detail_url: '', ending_url: '' } },
        { id: 's3', name: 'Style 3', style_json: '{"x":3}', preview_images: { cover_url: '/files/style-presets/s3/cover.png', toc_url: '', detail_url: '', ending_url: '' } },
        { id: 's4', name: 'Style 4', style_json: '{"x":4}', preview_images: { cover_url: '/files/style-presets/s4/cover.png', toc_url: '', detail_url: '', ending_url: '' } },
        { id: 's5', name: 'Style 5', style_json: '{"x":5}', preview_images: { cover_url: '/files/style-presets/s5/cover.png', toc_url: '', detail_url: '', ending_url: '' } },
      ],
    },
  })),
}));

vi.mock('@/api/endpoints', () => ({
  listUserTemplates: mockListUserTemplates,
  listStylePresets: mockListStylePresets,
  uploadUserTemplate: vi.fn(async () => ({ data: null })),
  deleteUserTemplate: vi.fn(async () => ({ data: {} })),
}));

describe('TemplateSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows 4 style presets by default and selects via more modal', async () => {
    const Wrapper = () => {
      const [selectedId, setSelectedId] = useState<string | null>(null);
      return (
        <>
          <TemplateSelector
            onSelect={() => {}}
            onSelectStylePreset={(preset) => setSelectedId(preset?.id || null)}
            selectedStylePresetId={selectedId}
          />
          <div data-testid="selected-style-id">{selectedId || ''}</div>
        </>
      );
    };

    render(<Wrapper />);

    await waitFor(() => {
      expect(screen.getByText('Style 1')).toBeInTheDocument();
      expect(screen.getByText('Style 4')).toBeInTheDocument();
    });

    expect(screen.queryByText('Style 5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /更多|More/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Style 5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Style 5/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('selected-style-id')).toHaveTextContent('s5');
    });
  });
});
