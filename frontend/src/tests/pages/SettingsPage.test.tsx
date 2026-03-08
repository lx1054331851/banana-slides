import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SettingsPage } from '@/pages/Settings';

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
});
