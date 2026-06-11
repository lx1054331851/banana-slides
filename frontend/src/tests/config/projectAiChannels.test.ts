import { describe, expect, it } from 'vitest';

import {
  formatImageModelDisplayName,
  getGptImageSizeOptionsForAspectRatio,
  getImageChannelOptions,
  getNormalizedImageModel,
  getImageModelConfigMode,
  getImageModelDisplayLabel,
  getSupportedAspectRatiosForChannelModel,
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
        model_capabilities: {
          'gpt-image-2-high': {
            request_mode: 'openai-images',
          },
          'gemini-3.1-flash-image-preview': {
            request_mode: 'openai-compat-google-chat',
          },
          'gemini-2.5-flash-image': {
            request_mode: 'openai-compat-google-chat',
          },
        },
      },
    ] as any;

    expect(getImageModelConfigMode('147ai', 'gpt-image-2-high', profiles)).toBe('openai-images');
    expect(getImageModelConfigMode('147ai', 'gemini-3.1-flash-image-preview', profiles)).toBe('openai-compat-google-chat');
    expect(getImageModelConfigMode('147ai', 'gemini-2.5-flash-image', profiles)).toBe('openai-compat-google-chat');
  });

  it('prefers explicit model capabilities over fallback prefix heuristics', () => {
    const profiles = [
      {
        id: 'custom-openai',
        channel: 'custom-openai',
        label: 'Custom OpenAI',
        provider: 'openai',
        adapter: 'openai_image_compat',
        capabilities: ['image'],
        model_capabilities: {
          'gemini-3.1-flash-image-preview': {
            request_mode: 'openai-images',
          },
        },
      },
    ] as any;

    expect(getImageModelConfigMode('custom-openai', 'gemini-3.1-flash-image-preview', profiles)).toBe('openai-images');
  });

  it('returns only the base aspect ratios for gpt-image-2 models', () => {
    const profiles = [
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
    ] as any;

    expect(getSupportedAspectRatiosForChannelModel('147ai', 'gpt-image-2-high', profiles)).toEqual([
      '16:9',
      '21:9',
      '4:3',
      '3:2',
      '5:4',
      '1:1',
      '4:5',
      '2:3',
      '3:4',
      '9:16',
    ]);
  });

  it('exposes extra panorama ratios only for gemini-3.1 flash image models', () => {
    const profiles = [
      {
        id: '147ai',
        channel: '147ai',
        label: '147AI',
        provider: 'openai',
        adapter: 'openai_image_compat',
        capabilities: ['image'],
        model_capabilities: {
          'gemini-3.1-flash-image-preview': {
            schema: 'gemini-image',
            request_mode: 'openai-compat-google-chat',
          },
        },
      },
    ] as any;

    expect(getSupportedAspectRatiosForChannelModel('147ai', 'gemini-3.1-flash-image-preview', profiles)).toEqual([
      '8:1',
      '4:1',
      '16:9',
      '21:9',
      '4:3',
      '3:2',
      '5:4',
      '1:1',
      '1:4',
      '1:8',
      '4:5',
      '2:3',
      '3:4',
      '9:16',
    ]);
  });

  it('maps gpt-image-2 real size options by page aspect ratio', () => {
    expect(getGptImageSizeOptionsForAspectRatio('16:9').map((item) => item.value)).toEqual([
      '1536x864',
      '2048x1152',
      '3840x2160',
    ]);
    expect(getGptImageSizeOptionsForAspectRatio('8:1')).toEqual([]);
  });

  it('normalizes third-party gpt-image-2 variants into family plus locked params', () => {
    const profiles = [
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
    ] as any;

    expect(getNormalizedImageModel('147ai', 'gpt-image-2-high', profiles)).toEqual({
      modelFamily: 'gpt-image-2',
      providerModelId: 'gpt-image-2-high',
      schema: 'gpt-image-2',
      lockedParams: {
        gptImageQuality: 'high',
      },
      displayLabel: 'gpt-image-2（质量：高）',
      variantLabel: '渠道变体：gpt-image-2-high',
    });
  });
});
