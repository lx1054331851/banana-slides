import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StyleLibrary } from '@/pages/StyleLibrary';

const { mockNavigate, mockListStyleTemplates, mockListStylePresets } = vi.hoisted(() => ({
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
  deleteStylePreset: vi.fn(async () => ({ data: {} })),
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

  it('shows selected JSON in right panel for both tabs', async () => {
    render(<StyleLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('style-library-json-viewer')).toHaveTextContent('{"preset":1}');
    });

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    const tplRow = screen.getByTestId('template-row-t2');
    fireEvent.click(within(tplRow).getByRole('button', { name: /Template 2/i }));

    expect(screen.getByTestId('style-library-json-viewer')).toHaveTextContent('{"template":2}');
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
