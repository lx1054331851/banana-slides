import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StyleLibrary } from '@/pages/StyleLibrary';

const { mockNavigate, mockListStyleTemplates, mockListStylePresets, mockDeleteStylePreset } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockListStyleTemplates: vi.fn(async () => ({
    data: {
      templates: [
        { id: 't1', name: 'Template 1', template_json: '{"template":1}' },
        { id: 't2', name: 'Template 2', template_json: '{"template":2}' },
      ],
    },
  })),
  mockListStylePresets: vi.fn(async () => ({
    data: {
      presets: [
        {
          id: 's1',
          name: 'Preset 1',
          style_json: '{"preset":1}',
          preview_images: {
            cover_url: '/files/style-presets/s1/cover.webp',
            toc_url: '/files/style-presets/s1/toc.webp',
            detail_url: '/files/style-presets/s1/detail.webp',
            ending_url: '/files/style-presets/s1/ending.webp',
          },
        },
      ],
    },
  })),
  mockDeleteStylePreset: vi.fn(async () => ({ data: {} })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/api/endpoints', () => ({
  listStyleTemplates: mockListStyleTemplates,
  listStylePresets: mockListStylePresets,
  createStyleTemplate: vi.fn(async () => ({ data: null })),
  deleteStyleTemplate: vi.fn(async () => ({ data: {} })),
  deleteStylePreset: mockDeleteStylePreset,
}));

describe('StyleLibrary page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders nav with back and home buttons', async () => {
    window.history.pushState({}, '', '/from-history');

    render(<StyleLibrary />);

    const backBtn = await screen.findByTestId('style-library-nav-back');
    const homeBtn = screen.getByTestId('style-library-nav-home');

    fireEvent.click(backBtn);
    fireEvent.click(homeBtn);

    expect(mockNavigate).toHaveBeenCalledWith(-1);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('switches between templates and presets tabs', async () => {
    render(<StyleLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('style-library-presets-panel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    expect(screen.getByTestId('style-library-templates-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('style-library-presets-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('style-library-tab-presets'));
    expect(screen.getByTestId('style-library-presets-panel')).toBeInTheDocument();
  });

  it('opens preset JSON drawer only when clicking "View JSON"', async () => {
    render(<StyleLibrary />);

    expect(screen.queryByTestId('style-library-preset-json-drawer')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByTestId('preset-s1-view-json'));

    await waitFor(() => {
      expect(screen.getByTestId('style-library-preset-json-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('style-library-preset-json-drawer')).toHaveTextContent('{"preset":1}');
    });
  });

  it('clicking preset row selects item but does not open JSON drawer', async () => {
    render(<StyleLibrary />);

    const row = await screen.findByTestId('preset-row-s1');
    fireEvent.click(within(row).getAllByRole('button', { name: /Preset 1/i })[0]);

    expect(screen.queryByTestId('style-library-preset-json-drawer')).not.toBeInTheDocument();
  });

  it('keeps template right-panel JSON viewer behavior unchanged', async () => {
    render(<StyleLibrary />);

    expect(screen.queryByTestId('style-library-json-viewer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    await waitFor(() => {
      expect(screen.getByTestId('style-library-json-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('style-library-json-viewer')).toHaveTextContent('{"template":1}');
    });

    const tplRow = screen.getByTestId('template-row-t2');
    fireEvent.click(within(tplRow).getByRole('button', { name: /Template 2/i }));

    expect(screen.getByTestId('style-library-json-viewer')).toHaveTextContent('{"template":2}');
  });

  it('closes preset JSON drawer with close button and Escape', async () => {
    render(<StyleLibrary />);

    fireEvent.click(await screen.findByTestId('preset-s1-view-json'));
    await waitFor(() => {
      expect(screen.getByTestId('style-library-preset-json-drawer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('style-library-preset-json-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('style-library-preset-json-drawer')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('preset-s1-view-json'));
    await waitFor(() => {
      expect(screen.getByTestId('style-library-preset-json-drawer')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('style-library-preset-json-drawer')).not.toBeInTheDocument();
    });
  });

  it('closes preset JSON drawer after deleting the selected preset', async () => {
    render(<StyleLibrary />);

    fireEvent.click(await screen.findByTestId('preset-s1-view-json'));
    await waitFor(() => {
      expect(screen.getByTestId('style-library-preset-json-drawer')).toBeInTheDocument();
    });

    const row = screen.getByTestId('preset-row-s1');
    fireEvent.click(within(row).getByRole('button', { name: /Delete|删除/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('dialog').length).toBeGreaterThan(1);
    });
    const confirmDialog = screen.getAllByRole('dialog').find((dialog) => (
      within(dialog).queryByRole('button', { name: /Cancel|取消/i }) &&
      within(dialog).queryByRole('button', { name: /Delete|删除/i })
    ));
    expect(confirmDialog).toBeTruthy();
    fireEvent.click(within(confirmDialog as HTMLElement).getByRole('button', { name: /Delete|删除/i }));

    await waitFor(() => {
      expect(mockDeleteStylePreset).toHaveBeenCalledWith('s1');
      expect(screen.queryByTestId('style-library-preset-json-drawer')).not.toBeInTheDocument();
    });
  });

  it('renders preset row with four preview slots', async () => {
    render(<StyleLibrary />);

    const row = await screen.findByTestId('preset-row-s1');
    expect(within(row).getByTestId('preset-s1-preview-cover_url')).toBeInTheDocument();
    expect(within(row).getByTestId('preset-s1-preview-toc_url')).toBeInTheDocument();
    expect(within(row).getByTestId('preset-s1-preview-detail_url')).toBeInTheDocument();
    expect(within(row).getByTestId('preset-s1-preview-ending_url')).toBeInTheDocument();
  });

  it('opens lightbox with correct initial index when preview clicked', async () => {
    render(<StyleLibrary />);

    const detailPreview = await screen.findByTestId('preset-s1-preview-detail_url');
    fireEvent.click(detailPreview);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('3/4')).toBeInTheDocument();
    });
  });
});
