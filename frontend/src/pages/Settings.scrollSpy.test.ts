import { describe, expect, it } from 'vitest';
import { getActiveSettingsSectionId } from './Settings.scrollSpy';

describe('getActiveSettingsSectionId', () => {
  it('activates a tall section when the viewport anchor is inside it', () => {
    const activeId = getActiveSettingsSectionId(
      [
        { id: 'openai-oauth', top: -260, bottom: 80 },
        { id: 'model-config', top: 120, bottom: 1800 },
        { id: 'performance-config', top: 1840, bottom: 2100 },
      ],
      900,
    );

    expect(activeId).toBe('model-config');
  });
});
