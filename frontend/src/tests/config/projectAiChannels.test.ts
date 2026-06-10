import { describe, expect, it } from 'vitest';

import {
  formatImageModelDisplayName,
  getImageChannelOptions,
  getImageModelConfigMode,
  getImageModelDisplayLabel,
} from '@/config/projectAiChannels';

describe('projectAiChannels image model labels', () => {
  it('keeps gpt-image-2 quality suffix labels plain', () => {
    expect(formatImageModelDisplayName('gpt-image-2-low')).toBe('gpt-image-2-low');
    expect(formatImageModelDisplayName('gpt-image-2-medium')).toBe('gpt-image-2-medium');
    expect(formatImageModelDisplayName('gpt-image-2-high')).toBe('gpt-image-2-high');
  });

  it('keeps channel display labels plain', () => {
    const label = getImageModelDisplayLabel('147ai', 'gpt-image-2-high', [
      {
        id: '147ai',
        channel: '147ai',
        label: '147AI',
        provider: 'openai',
        adapter: 'openai_image_compat',
        capabilities: ['image'],
      },
    ] as any);

    expect(label).toBe('147AI -> gpt-image-2-high');
  });

  it('only exposes image channels from explicit provider profiles', () => {
    const channels = getImageChannelOptions([
      {
        id: '147ai',
        channel: '147ai',
        label: '147AI',
        provider: 'openai',
        capabilities: ['image'],
      },
      {
        id: 'text-only-profile',
        channel: 'text-only-profile',
        label: 'Text Only',
        provider: 'openai',
        capabilities: ['text'],
      },
    ] as any);

    expect(channels).toEqual([
      expect.objectContaining({
        id: '147ai',
        label: '147AI',
        source: 'profile:147ai',
      }),
    ]);
  });

  it('separates gpt-image-2 and gemini-compatible config modes on the same channel', () => {
    const profiles = [
      {
        id: '147ai',
        channel: '147ai',
        label: '147AI',
        provider: 'openai',
        adapter: 'openai_image_compat',
        capabilities: ['image'],
      },
    ] as any;

    expect(getImageModelConfigMode('147ai', 'gpt-image-2-high', profiles)).toBe('openai-images');
    expect(getImageModelConfigMode('147ai', 'gemini-3.1-flash-image-preview', profiles)).toBe('openai-compat-google-chat');
    expect(getImageModelConfigMode('147ai', 'gemini-2.5-flash-image', profiles)).toBe('openai-compat-google-chat');
  });
});
