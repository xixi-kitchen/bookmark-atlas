import { describe, expect, it } from 'vitest';
import {
  BOOKMARK_PRESENTATION_SIZES,
  DEFAULT_BOOKMARK_PRESENTATION,
  MAX_BOOKMARK_DESCRIPTION_LENGTH,
  getBookmarkGridColumns,
  isBookmarkPresentation,
  normalizeBookmarkDescription,
} from './bookmarkDisplay';

describe('bookmark presentation defaults', () => {
  it('provides the approved three templates and compact default', () => {
    expect(BOOKMARK_PRESENTATION_SIZES).toEqual({ icon: { width: 72, height: 72 }, compact: { width: 220, height: 88 }, detailed: { width: 300, height: 168 } });
    expect(DEFAULT_BOOKMARK_PRESENTATION).toBe('compact');
    expect(MAX_BOOKMARK_DESCRIPTION_LENGTH).toBe(140);
    expect(['icon', 'compact', 'detailed'].every(isBookmarkPresentation)).toBe(true);
    expect([null, undefined, 'default', 3, {}].some(isBookmarkPresentation)).toBe(false);
  });

  it('does not split surrogate pairs or change short ordinary text', () => {
    expect(normalizeBookmarkDescription('Hello\n世界 <tag>')).toBe('Hello\n世界 <tag>');
    expect(normalizeBookmarkDescription('😀'.repeat(141))).toBe('😀'.repeat(140));
  });

  it('accounts for card proportions and produces a deterministic near-square grid', () => {
    expect(getBookmarkGridColumns(16, 72, 72, 24)).toBe(4);
    const count = 55;
    const width = 220;
    const height = 88;
    const columns = getBookmarkGridColumns(count, width, height, 24);
    const rows = Math.ceil(count / columns);
    const aspect = (columns * width + (columns - 1) * 24) / (rows * height + (rows - 1) * 24);
    expect(aspect).toBeGreaterThan(0.8);
    expect(aspect).toBeLessThan(1.2);
    expect(getBookmarkGridColumns(count, width, height, 24)).toBe(columns);
  });
});
