import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BookmarkNode } from '../bookmarks/types';
import {
  createBookmarkKey,
  getBookmarkElementData,
  normalizeBookmarkUrl,
  type BookmarkElementData,
  type BookmarkImportEntry,
} from './bookmarkElements';

type BookmarkMatch = BookmarkImportEntry & { normalizedUrl: string; key: string };

export type BookmarkReconciliationIndex = {
  byId: Map<string, BookmarkMatch>;
  byNormalizedUrl: Map<string, BookmarkMatch[]>;
};

export type BookmarkResolution =
  | { status: 'matched'; entry: BookmarkImportEntry }
  | { status: 'missing' }
  | { status: 'ambiguous'; candidates: BookmarkImportEntry[] };

export type SceneBookmarkMigration = {
  elements: ExcalidrawElement[];
  changed: boolean;
  matched: number;
  missing: number;
  ambiguous: number;
};

export function createBookmarkReconciliationIndex(entries: BookmarkImportEntry[]): BookmarkReconciliationIndex {
  const byId = new Map<string, BookmarkMatch>();
  const byNormalizedUrl = new Map<string, BookmarkMatch[]>();

  for (const entry of entries) {
    if (!entry.node.url) continue;
    const match = toMatch(entry);
    byId.set(entry.node.id, match);
    const bucket = byNormalizedUrl.get(match.normalizedUrl) ?? [];
    bucket.push(match);
    byNormalizedUrl.set(match.normalizedUrl, bucket);
  }

  return { byId, byNormalizedUrl };
}

export function resolveBookmarkElementData(
  data: BookmarkElementData,
  index: BookmarkReconciliationIndex,
): BookmarkResolution {
  const storedKey = createBookmarkKey(data, data.folderPath);
  const currentById = index.byId.get(data.bookmarkId);
  if (
    currentById
    && currentById.normalizedUrl === data.normalizedUrl
    && currentById.key === storedKey
  ) {
    return { status: 'matched', entry: currentById };
  }

  const candidates = index.byNormalizedUrl.get(data.normalizedUrl) ?? [];
  if (candidates.length === 0) return { status: 'missing' };
  if (candidates.length === 1) return { status: 'matched', entry: candidates[0]! };

  const keyMatches = candidates.filter((candidate) => candidate.key === storedKey);
  if (keyMatches.length === 1) return { status: 'matched', entry: keyMatches[0]! };

  return { status: 'ambiguous', candidates };
}

export function migrateBookmarkElementsForCurrentTree(
  elements: readonly ExcalidrawElement[],
  index: BookmarkReconciliationIndex,
): SceneBookmarkMigration {
  let changed = false;
  let matched = 0;
  let missing = 0;
  let ambiguous = 0;

  const migrated = elements.map((element) => {
    const data = getBookmarkElementData(element);
    if (!data) return element;

    const resolution = resolveBookmarkElementData(data, index);
    if (resolution.status === 'missing') {
      missing += 1;
      const next = withBookmarkData(element, data);
      changed ||= next !== element;
      return next;
    }
    if (resolution.status === 'ambiguous') {
      ambiguous += 1;
      const next = withBookmarkData(element, data);
      changed ||= next !== element;
      return next;
    }

    matched += 1;
    const nextData = createData(resolution.entry.node, resolution.entry.folderPath, data.bookmarkId);
    const next = withBookmarkData(element, nextData);
    changed ||= next !== element;
    return next;
  });

  return { elements: migrated, changed, matched, missing, ambiguous };
}

export function isBookmarkEntryAlreadyImported(
  entry: BookmarkImportEntry,
  existingData: Iterable<BookmarkElementData>,
  index?: BookmarkReconciliationIndex,
): boolean {
  const entryKey = createBookmarkKey(entry.node, entry.folderPath);
  for (const data of existingData) {
    if (index) {
      const resolution = resolveBookmarkElementData(data, index);
      if (resolution.status === 'matched' && resolution.entry.node.id === entry.node.id) return true;
    }
    if (data.bookmarkKey === entryKey) return true;
    if (!data.bookmarkKey && createBookmarkKey(data, data.folderPath) === entryKey) return true;
  }
  return false;
}

function toMatch(entry: BookmarkImportEntry): BookmarkMatch {
  return {
    ...entry,
    normalizedUrl: normalizeBookmarkUrl(entry.node.url ?? ''),
    key: createBookmarkKey(entry.node, entry.folderPath),
  };
}

function createData(node: BookmarkNode, folderPath: string, sourceBookmarkId: string): BookmarkElementData {
  return {
    kind: 'bookmark',
    // Chrome only guarantees IDs inside one profile. Keep the source hint stable
    // in the synced scene and resolve it to the current profile at runtime.
    bookmarkId: sourceBookmarkId,
    bookmarkKey: createBookmarkKey(node, folderPath),
    normalizedUrl: normalizeBookmarkUrl(node.url ?? ''),
    title: node.title,
    url: node.url ?? '',
    folderPath,
  };
}

function withBookmarkData(element: ExcalidrawElement, data: BookmarkElementData): ExcalidrawElement {
  const previous = element.customData?.bookmarkAtlas as Partial<BookmarkElementData> | undefined;
  const customData = {
    ...(element.customData ?? {}),
    bookmarkAtlas: data,
  };

  if (
    previous
    && previous.bookmarkId === data.bookmarkId
    && previous.bookmarkKey === data.bookmarkKey
    && previous.normalizedUrl === data.normalizedUrl
    && previous.title === data.title
    && previous.url === data.url
    && previous.folderPath === data.folderPath
  ) {
    return element;
  }

  return {
    ...element,
    customData,
    version: element.version + 1,
    versionNonce: nextVersionNonce(element.versionNonce),
    updated: Date.now(),
  } as ExcalidrawElement;
}

function nextVersionNonce(value: number) {
  return value === 2_147_483_647 ? 1 : value + 1;
}
