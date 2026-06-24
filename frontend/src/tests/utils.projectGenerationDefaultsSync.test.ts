import { describe, expect, it } from 'vitest';

import { shouldSyncProjectGenerationDefaults } from '@/pages/SlidePreview.utils';

describe('shouldSyncProjectGenerationDefaults', () => {
  it('keeps syncing when the project changes', () => {
    expect(shouldSyncProjectGenerationDefaults(true, true)).toBe(true);
    expect(shouldSyncProjectGenerationDefaults(true, false)).toBe(true);
  });

  it('keeps syncing same-project updates when there is no unsaved local draft', () => {
    expect(shouldSyncProjectGenerationDefaults(false, false)).toBe(true);
  });

  it('skips same-project sync when image defaults have unsaved local changes', () => {
    expect(shouldSyncProjectGenerationDefaults(false, true)).toBe(false);
  });
});
