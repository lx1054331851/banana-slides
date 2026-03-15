import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TemplateSelector, type TemplateSelection } from '@/components/shared/TemplateSelector';

const {
  mockListUserTemplates,
  mockListPresetTemplates,
  mockListStylePresets,
  mockShowToast,
} = vi.hoisted(() => ({
  mockListUserTemplates: vi.fn(async () => ({ data: { templates: [] } })),
  mockListPresetTemplates: vi.fn(async () => ({
    data: {
      templates: [
        {
          template_id: 'preset-1',
          name: '图片模版 1',
          template_image_url: '/files/preset-templates/preset-1/original.png',
          thumb_url: '/files/preset-templates/preset-1/thumb.png',
        },
      ],
    },
  })),
  mockListStylePresets: vi.fn(async () => ({
    data: {
      presets: [
        {
          id: 'style-1',
          name: 'JSON 模版 1',
          style_json: '{"theme":"alpha"}',
          preview_images: {
            cover_url: '/files/style-presets/style-1/cover.png',
            toc_url: '/files/style-presets/style-1/toc.png',
            detail_url: '/files/style-presets/style-1/detail.png',
            ending_url: '/files/style-presets/style-1/ending.png',
          },
        },
      ],
    },
  })),
  mockShowToast: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  getImageUrl: (path?: string) => path || '',
}));

vi.mock('@/api/endpoints', () => ({
  listUserTemplates: mockListUserTemplates,
  listPresetTemplates: mockListPresetTemplates,
  listStylePresets: mockListStylePresets,
}));

vi.mock('@/hooks/useT', () => ({
  useT: (translations: any) => {
    const dict = translations.zh;
    return (key: string) => key.split('.').reduce((acc: any, part: string) => acc?.[part], dict) || key;
  },
}));

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({
    show: mockShowToast,
    ToastContainer: () => null,
  }),
}));

vi.mock('@/components/shared/MaterialSelector', () => ({
  MaterialLibraryPanel: ({
    onSelectedIdsChange,
  }: {
    onSelectedIdsChange: (ids: Set<string>) => void;
  }) => {
    return (
      <div data-testid="mock-material-panel">
        <button
          type="button"
          data-testid="mock-material-select"
          onClick={() => onSelectedIdsChange(new Set(['m1']))}
        >
          选择素材
        </button>
      </div>
    );
  },
}));

describe('TemplateSelector', () => {
  const renderSelector = (overrideProps: Partial<React.ComponentProps<typeof TemplateSelector>> = {}) => {
    const onDraftSelectionChange = vi.fn();
    const defaultProps: React.ComponentProps<typeof TemplateSelector> = {
      projectId: 'project-1',
      activeTab: 'image',
      onActiveTabChange: vi.fn(),
      draftSelection: null,
      onDraftSelectionChange,
      appliedSelection: null,
      appliedStyleJson: '',
      onApplySelection: vi.fn(),
      isApplyingSelection: false,
    };

    const result = render(<TemplateSelector {...defaultProps} {...overrideProps} />);
    return {
      ...result,
      defaultProps,
      onDraftSelectionChange,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a single image template library section when user templates are empty', async () => {
    renderSelector();

    await waitFor(() => {
      expect(screen.getByTestId('template-card-preset-preset-1')).toBeInTheDocument();
    });

    expect(screen.getByText('图片模版库')).toBeInTheDocument();
    expect(screen.queryByText('我的图片模版')).not.toBeInTheDocument();
    expect(screen.queryByText('暂无图片模版')).not.toBeInTheDocument();
  });

  it('uses theme color for the active tab and keeps image previews uncropped', async () => {
    const { onDraftSelectionChange } = renderSelector();

    const imageTab = screen.getByTestId('template-selector-tab-image');
    expect(imageTab).toHaveClass('from-banana-500');
    expect(imageTab).toHaveClass('to-banana-600');

    const presetCard = await screen.findByTestId('template-card-preset-preset-1');
    const previewImage = screen.getByAltText('图片模版 1');
    expect(previewImage).toHaveClass('object-contain');

    fireEvent.click(presetCard);

    expect(onDraftSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining<Partial<TemplateSelection>>({
        kind: 'preset',
        id: 'preset-1',
      }),
    );
  });

  it('keeps the selector height stable and hides the large selected name in the sidebar', async () => {
    renderSelector({
      appliedSelection: { kind: 'preset', id: 'preset-1' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('template-card-preset-preset-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('template-selector-layout')).toHaveClass('h-[72vh]');

    const sidebar = screen.getByTestId('template-selector-sidebar');
    expect(sidebar).toHaveClass('overflow-y-auto');
    expect(within(sidebar).queryByText('图片模版 1')).not.toBeInTheDocument();
  });

  it('switches the large preview when clicking style preview thumbnails', async () => {
    renderSelector({
      activeTab: 'json',
      appliedSelection: { kind: 'style', id: 'style-1' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('template-card-style-style-1')).toBeInTheDocument();
    });

    const sidebar = screen.getByTestId('template-selector-sidebar');
    const heroPreview = within(sidebar).getByAltText('JSON 模版 1') as HTMLImageElement;
    expect(heroPreview.getAttribute('src')).toBe('/files/style-presets/style-1/cover.png');

    fireEvent.click(screen.getByTestId('template-style-preview-detail_url'));
    expect(heroPreview.getAttribute('src')).toBe('/files/style-presets/style-1/detail.png');

    fireEvent.click(screen.getByTestId('template-style-preview-ending_url'));
    expect(heroPreview.getAttribute('src')).toBe('/files/style-presets/style-1/ending.png');
  });

  it('unmounts the material panel after switching away from the material tab', async () => {
    const { rerender, defaultProps, onDraftSelectionChange } = renderSelector({
      activeTab: 'material',
    });

    expect(screen.getByTestId('mock-material-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mock-material-select'));
    expect(onDraftSelectionChange).not.toHaveBeenCalled();

    rerender(
      <TemplateSelector
        {...defaultProps}
        activeTab="image"
        onDraftSelectionChange={onDraftSelectionChange}
      />
    );

    expect(screen.queryByTestId('mock-material-panel')).not.toBeInTheDocument();
  });
});
