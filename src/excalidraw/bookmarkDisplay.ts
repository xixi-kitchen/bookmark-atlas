export type BookmarkPresentation = 'icon' | 'compact' | 'detailed';

export const BOOKMARK_PRESENTATION_SIZES = {
  icon: { width: 72, height: 72 },
  compact: { width: 220, height: 88 },
  detailed: { width: 300, height: 168 },
} as const;

export const DEFAULT_BOOKMARK_PRESENTATION: BookmarkPresentation = 'compact';
export const MAX_BOOKMARK_DESCRIPTION_LENGTH = 140;

export function isBookmarkPresentation(value: unknown): value is BookmarkPresentation {
  return value === 'icon' || value === 'compact' || value === 'detailed';
}

export function normalizeBookmarkDescription(description: string): string {
  return Array.from(description).slice(0, MAX_BOOKMARK_DESCRIPTION_LENGTH).join('');
}

/** Choose columns from actual card dimensions rather than making a square of cells. */
export function getBookmarkGridColumns(count: number, width: number, height: number, gap: number): number {
  let columns = 1;
  let bestDifference = Infinity;
  for (let candidate = 1; candidate <= count; candidate += 1) {
    const rows = Math.ceil(count / candidate);
    const gridWidth = candidate * width + (candidate - 1) * gap;
    const gridHeight = rows * height + (rows - 1) * gap;
    const difference = Math.abs(Math.log(gridWidth / gridHeight));
    if (difference < bestDifference) {
      columns = candidate;
      bestDifference = difference;
    }
  }
  return columns;
}
