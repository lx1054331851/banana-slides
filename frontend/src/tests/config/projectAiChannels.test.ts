import { describe, expect, it } from 'vitest';

import {
  formatImageModelDisplayName,
  getImageChannelOptions,
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
});
