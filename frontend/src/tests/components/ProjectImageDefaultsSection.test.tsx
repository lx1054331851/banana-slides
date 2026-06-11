import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProjectImageDefaultsSection } from '@/components/shared/ProjectImageDefaultsSection';

const baseProps = {
  providerProfiles: [
    {
      id: '147ai',
      channel: '147ai',
      label: '147AI',
      provider: 'openai',
      adapter: 'openai_image_compat',
      capabilities: ['image'],
      model_capabilities: {
        'gpt-image-2-high': {
          schema: 'gpt-image-2',
          request_mode: 'openai-images',
        },
      },
    },
  ] as any,
  selectedImageChannel: '147ai',
  availableImageChannels: [{ id: '147ai', label: '147AI', provider: 'openai' }] as any,
  selectedImageModel: 'gpt-image-2-high',
  selectableImageModels: [{ model: 'gpt-image-2-high', label: 'gpt-image-2-high' }],
  selectedImageResolution: '2K',
  visibleResolutionOptions: ['1K', '2K', '4K'],
  aspectRatio: '16:9',
  isAspectRatioCompatible: true,
  compatibilityMessage: '',
  gptImageSize: '2048x1152',
  gptImageBackground: 'auto',
  gptImageOutputFormat: 'png',
  gptImageOutputCompression: 100,
  gptImageQuality: 'auto',
  onChannelChange: vi.fn(),
  onModelChange: vi.fn(),
  onResolutionChange: vi.fn(),
  onGptImageSizeChange: vi.fn(),
  onGptImageBackgroundChange: vi.fn(),
  onGptImageOutputFormatChange: vi.fn(),
  onGptImageOutputCompressionChange: vi.fn(),
  onGptImageQualityChange: vi.fn(),
  onSave: vi.fn(),
  isSaving: false,
  saveLabel: '保存 AI 默认',
};

describe('ProjectImageDefaultsSection', () => {
  it('shows only the gpt-image-2 sizes compatible with the current page aspect ratio', () => {
    render(<ProjectImageDefaultsSection {...baseProps} />);

    expect(screen.getByText('1536x864')).toBeInTheDocument();
    expect(screen.getByText('2048x1152')).toBeInTheDocument();
    expect(screen.getByText('3840x2160')).toBeInTheDocument();
    expect(screen.queryByText('1024x1024')).not.toBeInTheDocument();
  });

  it('shows an incompatibility warning and disables saving when the page ratio is unsupported', () => {
    render(
      <ProjectImageDefaultsSection
        {...baseProps}
        aspectRatio="8:1"
        isAspectRatioCompatible={false}
        compatibilityMessage="当前页面比例 8:1 不受 gpt-image-2-high 支持，请先调整项目画面比例。"
      />,
    );

    expect(screen.getByText('当前页面比例 8:1 不受 gpt-image-2-high 支持，请先调整项目画面比例。')).toBeInTheDocument();
    expect(screen.queryByText('1536x864')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存 AI 默认' })).toBeDisabled();
  });
});
