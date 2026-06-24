import { describe, expect, it } from 'vitest';
import { getPreviewOrder, humanizePreviewKey, normalizePreviewKey } from '@/components/style-library/types';

describe('style-library preview labels and ordering', () => {
  it('maps English page labels to Chinese labels', () => {
    expect(humanizePreviewKey('Case Showcase Page')).toBe('案例展示');
    expect(humanizePreviewKey('Closing Page')).toBe('结尾');
    expect(humanizePreviewKey('Cover Page')).toBe('封面');
    expect(humanizePreviewKey('Toc Page')).toBe('目录');
  });

  it('returns preview cards in default page order instead of alphabetical order', () => {
    expect(getPreviewOrder({
      closing_url: '/closing.webp',
      cover_url: '/cover.webp',
      case_showcase_url: '/case.webp',
      catalog_url: '/catalog.webp',
    })).toEqual([
      ['cover_url', '封面'],
      ['catalog_url', '目录'],
      ['case_showcase_url', '案例展示'],
      ['closing_url', '结尾'],
    ]);
  });

  it('normalizes dynamic page template preview keys', () => {
    expect(normalizePreviewKey('cover_page_url')).toBe('cover_page_url');
    expect(normalizePreviewKey('toc_page_url')).toBe('toc_page_url');
    expect(normalizePreviewKey('content_page_url')).toBe('content_page_url');
    expect(normalizePreviewKey('closing_page_url')).toBe('closing_page_url');
  });
});
