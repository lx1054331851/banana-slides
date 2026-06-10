import { describe, expect, it } from 'vitest';

import {
  formatImageModelDisplayName,
  getImageChannelOptions,
  getImageModelDisplayLabel,
} from '@/config/projectAiChannels';

describe('projectAiChannels image model labels', () => {
  it('clarifies that gpt-image-2 quality suffixes are not resolution presets', () => {
    expect(formatImageModelDisplayName('gpt-image-2-low')).toContain('不等于低分辨率');
    expect(formatImageModelDisplayName('gpt-image-2-medium')).toContain('不等于 2K');
    expect(formatImageModelDisplayName('gpt-image-2-high')).toContain('不等于 4K');
  });

  it('includes the clarification in channel display labels', () => {
    const label = getImageModelDisplayLabel('147ai', 'gpt-image-2-high', [
      {
        id: '147ai',
        channel: '147ai',
        label: '147AI',
        provider: 'openai',
        capabilities: ['image'],
      },
    ] as any);

    expect(label).toBe('147AI -> gpt-image-2-high（高质量档，不等于 4K）');
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
});
