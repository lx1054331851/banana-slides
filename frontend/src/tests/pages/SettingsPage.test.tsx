import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { SettingsPage } from '@/pages/SettingsPage';
import { formDataFromSettings } from '@/pages/Settings.config';

const {
  mockNavigate,
  mockGetSettings,
  mockGetProviderProfiles,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGetSettings: vi.fn(async () => ({
    data: {
      ai_provider_format: 'gemini',
      image_resolution: '2K',
      max_description_workers: 5,
      max_image_workers: 8,
      output_language: 'zh',
      description_generation_mode: 'parallel',
      enable_text_reasoning: false,
      text_thinking_budget: 1024,
      enable_image_reasoning: false,
      image_thinking_budget: 1024,
      lazyllm_api_keys: {},
    },
  })),
  mockGetProviderProfiles: vi.fn(async () => ({
    data: { profiles: [] },
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
  OUTPUT_LANGUAGE_OPTIONS: [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'auto', label: 'Auto' },
  ],
  getSettings: mockGetSettings,
  getProviderProfiles: mockGetProviderProfiles,
  updateSettings: vi.fn(async () => ({ data: {} })),
  resetSettings: vi.fn(async () => ({ data: {} })),
  testBaiduOcr: vi.fn(async () => ({ data: {} })),
  testTextModel: vi.fn(async () => ({ data: {} })),
  testCaptionModel: vi.fn(async () => ({ data: {} })),
  testBaiduInpaint: vi.fn(async () => ({ data: {} })),
  testImageModel: vi.fn(async () => ({ data: {} })),
  testMineruPdf: vi.fn(async () => ({ data: {} })),
  testMozjpeg: vi.fn(async () => ({ data: {} })),
  testOxipng: vi.fn(async () => ({ data: {} })),
  testPngquant: vi.fn(async () => ({ data: {} })),
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('loads settings once on initial render', async () => {
    render(<SettingsPage />);

    await screen.findByText(/系统设置|Settings/i);
    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledTimes(1);
      expect(mockGetProviderProfiles).toHaveBeenCalledTimes(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetSettings).toHaveBeenCalledTimes(1);
    expect(mockGetProviderProfiles).toHaveBeenCalledTimes(1);
  });

  it('renders modular navigation and default section', async () => {
    render(<SettingsPage />);

    expect(await screen.findByRole('button', { name: /默认 API 配置|Default API Configuration/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /模型配置|Model Configuration/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /服务测试|Service Test/i })).toBeInTheDocument();
    expect(screen.getByTestId('global-api-config-section')).toBeInTheDocument();
  });

  it('does not infer image model source from the image model name', () => {
    const formData = formDataFromSettings({
      ai_provider_format: 'gemini',
      image_model: 'gpt-image-2-high',
      image_model_source: '',
      image_resolution: '2K',
      max_description_workers: 5,
      max_image_workers: 8,
      output_language: 'zh',
      description_generation_mode: 'parallel',
      enable_text_reasoning: false,
      text_thinking_budget: 1024,
      enable_image_reasoning: false,
      image_thinking_budget: 1024,
      lazyllm_api_keys: {},
    } as any);

    expect(formData.image_model_source).toBe('');
  });

  it('renders different image config panels for gpt-image-2 and gemini image models', async () => {
    mockGetProviderProfiles.mockResolvedValueOnce({
      data: {
        profiles: [
          {
            id: '147ai',
            channel: '147ai',
            label: '147AI',
            provider: 'openai',
            adapter: 'openai_image_compat',
            capabilities: ['image'],
            models: ['gpt-image-2-high', 'gemini-3.1-flash-image-preview'],
            supported_resolutions: {
              'gpt-image-2-high': ['1K', '2K', '4K'],
              'gemini-3.1-flash-image-preview': ['0.5K', '1K', '2K', '4K'],
            },
            model_capabilities: {
              'gpt-image-2-high': {
                schema: 'gpt-image-2',
                request_mode: 'openai-images',
              },
              'gemini-3.1-flash-image-preview': {
                schema: 'gemini-image',
                request_mode: 'openai-compat-google-chat',
              },
            },
          },
        ],
      },
    });
    mockGetSettings.mockResolvedValueOnce({
      data: {
        ai_provider_format: 'gemini',
        image_model: 'gpt-image-2-high',
        image_model_source: 'profile:147ai',
        image_resolution: '2K',
        max_description_workers: 5,
        max_image_workers: 8,
        output_language: 'zh',
        description_generation_mode: 'parallel',
        enable_text_reasoning: false,
        text_thinking_budget: 1024,
        enable_image_reasoning: false,
        image_thinking_budget: 1024,
        lazyllm_api_keys: {},
      },
    });

    render(<SettingsPage />);

    expect(await screen.findByText(/背景模式|Background/)).toBeInTheDocument();
    expect(screen.getByText('渠道变体：gpt-image-2-high')).toBeInTheDocument();
    expect(screen.getByText('质量档位由渠道模型 gpt-image-2-high 固定为高。')).toBeInTheDocument();
    expect(screen.getByText(/背景模式|Background/)).toBeInTheDocument();
    expect(screen.getByText(/输出格式|Output Format/)).toBeInTheDocument();
    expect(screen.getAllByText(/质量档位|Quality/).length).toBeGreaterThan(0);

    mockGetProviderProfiles.mockResolvedValueOnce({
      data: {
        profiles: [
          {
            id: '147ai',
            channel: '147ai',
            label: '147AI',
            provider: 'openai',
            adapter: 'openai_image_compat',
            capabilities: ['image'],
            models: ['gpt-image-2-high', 'gemini-3.1-flash-image-preview'],
            supported_resolutions: {
              'gpt-image-2-high': ['1K', '2K', '4K'],
              'gemini-3.1-flash-image-preview': ['0.5K', '1K', '2K', '4K'],
            },
            model_capabilities: {
              'gpt-image-2-high': {
                schema: 'gpt-image-2',
                request_mode: 'openai-images',
              },
              'gemini-3.1-flash-image-preview': {
                schema: 'gemini-image',
                request_mode: 'openai-compat-google-chat',
              },
            },
          },
        ],
      },
    });
    mockGetSettings.mockResolvedValueOnce({
      data: {
        ai_provider_format: 'gemini',
        image_model: 'gemini-3.1-flash-image-preview',
        image_model_source: 'profile:147ai',
        image_resolution: '2K',
        max_description_workers: 5,
        max_image_workers: 8,
        output_language: 'zh',
        description_generation_mode: 'parallel',
        enable_text_reasoning: false,
        text_thinking_budget: 1024,
        enable_image_reasoning: false,
        image_thinking_budget: 1024,
        lazyllm_api_keys: {},
      },
    });

    cleanup();
    render(<SettingsPage />);

    expect(screen.queryByText(/背景模式|Background/)).not.toBeInTheDocument();
    expect(screen.queryByText(/输出格式|Output Format/)).not.toBeInTheDocument();
  });
});
