import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StyleLibrary } from '@/pages/StyleLibrary';

const {
  mockNavigate,
  mockCreateStyleTemplate,
  mockListStyleTemplates,
  mockListStylePresets,
  mockListPresetTemplates,
  mockDeleteStyleTemplate,
  mockDeleteStylePreset,
  mockListStylePresetTasks,
  mockStartStylePresetGeneration,
  mockRegenerateStylePresetPreviewImage,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateStyleTemplate: vi.fn(async () => ({ data: null })),
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
  mockListPresetTemplates: vi.fn(async () => ({
    data: { templates: [] },
  })),
  mockDeleteStyleTemplate: vi.fn(async () => ({ data: {} })),
  mockDeleteStylePreset: vi.fn(async () => ({ data: {} })),
  mockListStylePresetTasks: vi.fn(async () => ({ data: { tasks: [] } })),
  mockStartStylePresetGeneration: vi.fn(async () => ({ data: { task_id: 'task-1', status: 'PENDING', progress: { stage: 'json_generating', total: 5, completed: 0, failed: 0 } } })),
  mockRegenerateStylePresetPreviewImage: vi.fn(async () => ({ data: { task_id: 'task-2', status: 'PENDING', progress: { stage: 'single_preview_generating', total: 1, completed: 0, failed: 0 } } })),
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
  listPresetTemplates: mockListPresetTemplates,
  createStyleTemplate: mockCreateStyleTemplate,
  uploadPresetTemplate: vi.fn(async () => ({ data: null })),
  deleteStyleTemplate: mockDeleteStyleTemplate,
  deleteStylePreset: mockDeleteStylePreset,
  deletePresetTemplate: vi.fn(async () => ({ data: {} })),
  listStylePresetTasks: mockListStylePresetTasks,
  startStylePresetGeneration: mockStartStylePresetGeneration,
  regenerateStylePresetPreviewImage: mockRegenerateStylePresetPreviewImage,
  getStoredOutputLanguage: vi.fn(async () => 'zh'),
}));

describe('StyleLibrary page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.pushState({}, '', '/style-library');
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

  it('reads tab from query string on first render', async () => {
    window.history.pushState({}, '', '/style-library?tab=templates');

    render(<StyleLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('style-library-templates-panel')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('style-library-presets-panel')).not.toBeInTheDocument();
  });

  it('opens preset JSON drawer only when clicking "View JSON"', async () => {
    render(<StyleLibrary />);

    expect(screen.queryByTestId('style-library-preset-json-drawer')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByTestId('preset-s1-view-json'));

    await waitFor(() => {
      expect(screen.getByTestId('style-library-preset-json-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('style-library-preset-json-drawer')).toHaveTextContent('"preset": 1');
    });
  });

  it('clicking preset row selects item but does not open JSON drawer', async () => {
    render(<StyleLibrary />);

    const row = await screen.findByTestId('preset-row-s1');
    fireEvent.click(within(row).getAllByRole('button', { name: /Preset 1/i })[0]);

    expect(screen.queryByTestId('style-library-preset-json-drawer')).not.toBeInTheDocument();
  });

  it('opens template JSON drawer only when clicking "View"', async () => {
    render(<StyleLibrary />);

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    expect(screen.queryByTestId('style-library-template-json-drawer')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByTestId('template-t1-view-json'));

    await waitFor(() => {
      expect(screen.getByTestId('style-library-template-json-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('style-library-template-json-drawer')).toHaveTextContent('{"template":1}');
    });
  });

  it('clicking template row selects item but does not open JSON drawer', async () => {
    render(<StyleLibrary />);

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    const row = await screen.findByTestId('template-row-t2');
    fireEvent.click(within(row).getByRole('button', { name: /Template 2/i }));

    expect(screen.queryByTestId('style-library-template-json-drawer')).not.toBeInTheDocument();
  });

  it('opens template create drawer only from the new button', async () => {
    render(<StyleLibrary />);

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    expect(screen.queryByTestId('style-library-create-template-drawer')).not.toBeInTheDocument();

    const row = await screen.findByTestId('template-row-t1');
    fireEvent.click(within(row).getByRole('button', { name: /Template 1/i }));
    expect(screen.queryByTestId('style-library-create-template-drawer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('style-library-open-template-create'));

    await waitFor(() => {
      expect(screen.getByTestId('style-library-create-template-drawer')).toBeInTheDocument();
    });
  });

  it('saves template from create drawer and closes it', async () => {
    render(<StyleLibrary />);

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    fireEvent.click(await screen.findByTestId('style-library-open-template-create'));

    await waitFor(() => {
      expect(screen.getByTestId('style-library-create-template-drawer')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('style-library-create-template-name'), {
      target: { value: 'New Template' },
    });
    fireEvent.change(screen.getByTestId('style-library-create-template-json'), {
      target: { value: '{"hero":{"title":"Demo"}}' },
    });
    fireEvent.click(screen.getByTestId('style-library-create-template-submit'));

    await waitFor(() => {
      expect(mockCreateStyleTemplate).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateStyleTemplate).toHaveBeenCalledWith({
      name: 'New Template',
      template_json: '{\n  "hero": {\n    "title": "Demo"\n  }\n}',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('style-library-create-template-drawer')).not.toBeInTheDocument();
    });
  });

  it('closes template JSON drawer with close button and Escape', async () => {
    render(<StyleLibrary />);

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    fireEvent.click(await screen.findByTestId('template-t1-view-json'));
    await waitFor(() => {
      expect(screen.getByTestId('style-library-template-json-drawer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('style-library-template-json-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('style-library-template-json-drawer')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('template-t1-view-json'));
    await waitFor(() => {
      expect(screen.getByTestId('style-library-template-json-drawer')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('style-library-template-json-drawer')).not.toBeInTheDocument();
    });
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

  it('closes template JSON drawer after deleting the selected template', async () => {
    render(<StyleLibrary />);

    fireEvent.click(screen.getByTestId('style-library-tab-templates'));
    fireEvent.click(await screen.findByTestId('template-t1-view-json'));
    await waitFor(() => {
      expect(screen.getByTestId('style-library-template-json-drawer')).toBeInTheDocument();
    });

    const row = screen.getByTestId('template-row-t1');
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
      expect(mockDeleteStyleTemplate).toHaveBeenCalledWith('t1');
      expect(screen.queryByTestId('style-library-template-json-drawer')).not.toBeInTheDocument();
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

  it('formats preset JSON viewer into multi-line pretty JSON', async () => {
    render(<StyleLibrary />);
    fireEvent.click(await screen.findByTestId('preset-s1-view-json'));

    await waitFor(() => {
      const viewer = screen.getByTestId('style-library-preset-json-drawer');
      expect(viewer).toHaveTextContent('{');
      expect(viewer).toHaveTextContent('"preset": 1');
      expect(viewer.textContent).toContain(String.fromCharCode(10));
    });
  });

  it('allows dismissing failed preset task cards', async () => {
    mockListStylePresetTasks.mockResolvedValueOnce(({
      data: {
        tasks: [
          {
            task_id: 'failed-task-1',
            task_type: 'STYLE_PRESET_GENERATE',
            status: 'FAILED',
            error_message: '1 preview image(s) failed to generate',
            progress: {
              stage: 'failed',
              preset_name: 'Preset 1',
              template_json: '{"template":1}',
              preview_images: {
                cover_url: '',
                toc_url: '',
                detail_url: '',
                ending_url: '',
              },
            },
          },
        ],
      },
    }) as any);

    render(<StyleLibrary />);

    const dismiss = await screen.findByTestId('style-preset-task-failed-task-1-dismiss');
    fireEvent.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByTestId('style-preset-task-failed-task-1')).not.toBeInTheDocument();
    });
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
