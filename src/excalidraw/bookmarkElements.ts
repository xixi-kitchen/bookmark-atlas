import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type {
  ExcalidrawElement,
  ExcalidrawEmbeddableElement,
  ExcalidrawFrameElement,
} from '@excalidraw/excalidraw/element/types';
import type { BookmarkNode } from '../bookmarks/types';
import { t } from '../i18n';

export type BookmarkElementData = {
  kind: 'bookmark';
  bookmarkId: string;
  bookmarkKey: string;
  normalizedUrl: string;
  title: string;
  url: string;
  folderPath?: string;
};

export type BookmarkImportEntry = {
  node: BookmarkNode;
  folderPath: string;
};

export type BookmarkImportGroup = {
  id: string;
  title: string;
  path: string;
  depth: number;
  entries: BookmarkImportEntry[];
};

type Position = { x: number; y: number };

const CARD_WIDTH = 300;
const CARD_HEIGHT = 168;
const CARD_GAP = 32;
const FRAME_PADDING = 48;
const FRAME_TITLE_SPACE = 54;
const MAX_COLUMNS = 3;
const GROUP_GAP = 96;
const GROUP_ROW_WIDTH = 1_700;

export function createBookmarkElement(
  node: BookmarkNode,
  position: Position,
  options: { id?: string; frameId?: string | null; folderPath?: string } = {},
): ExcalidrawEmbeddableElement {
  if (!node.url) throw new Error('Only URL bookmarks can be added to the Excalidraw canvas.');

  const id = options.id;
  const [rectangle] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      id,
      x: position.x,
      y: position.y,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundColor: '#ffffff',
      strokeColor: '#1b1b1f',
      fillStyle: 'solid',
      strokeWidth: 2,
      roughness: 0,
      roundness: { type: 3 },
      link: bookmarkElementLink(node.id),
      customData: {
        bookmarkAtlas: {
          kind: 'bookmark',
          bookmarkId: node.id,
          bookmarkKey: createBookmarkKey(node, options.folderPath),
          normalizedUrl: normalizeBookmarkUrl(node.url),
          title: node.title,
          url: node.url,
          folderPath: options.folderPath,
        } satisfies BookmarkElementData,
      },
    },
  ], { regenerateIds: !id });

  return {
    ...rectangle,
    type: 'embeddable',
    frameId: options.frameId ?? null,
  } as ExcalidrawEmbeddableElement;
}

export function createDefaultBookmarkScene(roots: BookmarkNode[]): ExcalidrawElement[] {
  const groups = buildBookmarkGroups(roots).filter((group) => group.bookmarks.length > 0);
  const scene: ExcalidrawElement[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const group of groups) {
    const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(Math.sqrt(group.bookmarks.length))));
    const rows = Math.ceil(group.bookmarks.length / columns);
    const width = FRAME_PADDING * 2 + columns * CARD_WIDTH + Math.max(0, columns - 1) * CARD_GAP;
    const height = FRAME_PADDING * 2 + FRAME_TITLE_SPACE + rows * CARD_HEIGHT + Math.max(0, rows - 1) * CARD_GAP;

    if (cursorX > 0 && cursorX + width > GROUP_ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + GROUP_GAP;
      rowHeight = 0;
    }

    const frameId = stableElementId('frame', group.id);
    const cards = group.bookmarks.map(({ node, folderPath }, index) => createBookmarkElement(
      node,
      {
        x: cursorX + FRAME_PADDING + (index % columns) * (CARD_WIDTH + CARD_GAP),
        y: cursorY + FRAME_PADDING + FRAME_TITLE_SPACE + Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP),
      },
      {
        id: stableElementId('bookmark', node.id),
        frameId,
        folderPath,
      },
    ));

    scene.push(createBookmarkFrame(frameId, group.title, { x: cursorX, y: cursorY }, width, height), ...cards);
    cursorX += width + GROUP_GAP;
    rowHeight = Math.max(rowHeight, height);
  }

  return scene;
}

export function createBookmarkGroupScene(
  group: Pick<BookmarkImportGroup, 'id' | 'title' | 'entries'>,
  origin: Position,
): ExcalidrawElement[] {
  if (group.entries.length === 0) return [];

  const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(Math.sqrt(group.entries.length))));
  const rows = Math.ceil(group.entries.length / columns);
  const width = FRAME_PADDING * 2 + columns * CARD_WIDTH + Math.max(0, columns - 1) * CARD_GAP;
  const height = FRAME_PADDING * 2 + FRAME_TITLE_SPACE + rows * CARD_HEIGHT + Math.max(0, rows - 1) * CARD_GAP;
  const frameId = stableElementId('import-frame', `${group.id}-${Date.now()}-${Math.random()}`);
  const cards = group.entries.map(({ node, folderPath }, index) => createBookmarkElement(
    node,
    {
      x: origin.x + FRAME_PADDING + (index % columns) * (CARD_WIDTH + CARD_GAP),
      y: origin.y + FRAME_PADDING + FRAME_TITLE_SPACE + Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP),
    },
    { frameId, folderPath },
  ));

  return [createBookmarkFrame(frameId, group.title, origin, width, height), ...cards];
}

export function getBookmarkElementData(element: Pick<ExcalidrawElement, 'customData'>): BookmarkElementData | null {
  const data = element.customData?.bookmarkAtlas as Partial<BookmarkElementData> | undefined;
  if (data?.kind !== 'bookmark' || typeof data.bookmarkId !== 'string' || typeof data.url !== 'string') {
    return null;
  }

  const folderPath = typeof data.folderPath === 'string' ? data.folderPath : undefined;
  const title = typeof data.title === 'string' ? data.title : '';
  const normalizedUrl = typeof data.normalizedUrl === 'string' && data.normalizedUrl
    ? data.normalizedUrl
    : normalizeBookmarkUrl(data.url);

  return {
    kind: 'bookmark',
    bookmarkId: data.bookmarkId,
    bookmarkKey: typeof data.bookmarkKey === 'string' && data.bookmarkKey
      ? data.bookmarkKey
      : createBookmarkKey({ title, url: data.url }, folderPath),
    normalizedUrl,
    title,
    url: data.url,
    folderPath,
  };
}

export function flattenUrlBookmarks(nodes: BookmarkNode[], parents: string[] = []): Array<{ node: BookmarkNode; folderPath: string }> {
  return nodes.flatMap((node) => {
    if (node.url) return [{ node, folderPath: parents.join(' / ') }];
    const nextParents = node.title ? [...parents, node.title] : parents;
    return flattenUrlBookmarks(node.children ?? [], nextParents);
  });
}

export function buildBookmarkImportGroups(
  nodes: BookmarkNode[],
  parents: string[] = [],
  depth = 0,
): BookmarkImportGroup[] {
  const groups: BookmarkImportGroup[] = [];
  const loose = nodes.filter((node) => Boolean(node.url));

  if (loose.length > 0 && parents.length === 0) {
    const title = parents.at(-1) ?? t('topLevelBookmarks');
    groups.push({
      id: `loose:${parents.join('/') || 'root'}`,
      title,
      path: parents.join(' / '),
      depth,
      entries: loose.map((node) => ({ node, folderPath: parents.join(' / ') })),
    });
  }

  for (const folder of nodes.filter((node) => !node.url)) {
    const nextParents = folder.title ? [...parents, folder.title] : parents;
    const entries = flattenUrlBookmarks(folder.children ?? [], nextParents);
    if (entries.length > 0) {
      groups.push({
        id: folder.id,
        title: folder.title || t('unnamedFolder'),
        path: nextParents.join(' / '),
        depth,
        entries,
      });
    }
    groups.push(...buildBookmarkImportGroups(folder.children ?? [], nextParents, depth + 1));
  }

  return groups;
}

export function buildTopLevelBookmarkImportGroups(roots: BookmarkNode[]): BookmarkImportGroup[] {
  const groups: BookmarkImportGroup[] = [];
  const loose = roots.filter((node) => Boolean(node.url));
  if (loose.length > 0) {
    groups.push({
      id: 'top-level',
      title: t('topLevelBookmarks'),
      path: '',
      depth: 0,
      entries: loose.map((node) => ({ node, folderPath: '' })),
    });
  }

  for (const folder of roots.filter((node) => !node.url)) {
    const parents = folder.title ? [folder.title] : [];
    const entries = flattenUrlBookmarks(folder.children ?? [], parents);
    if (entries.length > 0) {
      groups.push({
        id: folder.id,
        title: folder.title || t('unnamedFolder'),
        path: parents.join(' / '),
        depth: 0,
        entries,
      });
    }
  }

  return groups;
}

export function isSafeEmbeddableUrl(link: string): boolean {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' || (
      url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function normalizeBookmarkUrl(link: string): string {
  try {
    const url = new URL(link.trim());
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    if (url.searchParams.size > 1) {
      const sorted = Array.from(url.searchParams.entries()).sort(([keyA, valueA], [keyB, valueB]) => (
        keyA.localeCompare(keyB) || valueA.localeCompare(valueB)
      ));
      url.search = '';
      for (const [key, value] of sorted) url.searchParams.append(key, value);
    }
    return url.toString();
  } catch {
    return link.trim();
  }
}

export function createBookmarkKey(
  node: Pick<BookmarkNode, 'title' | 'url'>,
  folderPath = '',
): string {
  return [
    normalizeBookmarkUrl(node.url ?? ''),
    normalizeBookmarkText(node.title),
    normalizeBookmarkText(folderPath),
  ].join('\n');
}

function normalizeBookmarkText(value = ''): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function createBookmarkFrame(
  id: string,
  title: string,
  position: Position,
  width: number,
  height: number,
): ExcalidrawFrameElement {
  const [rectangle] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      id,
      x: position.x,
      y: position.y,
      width,
      height,
      backgroundColor: 'transparent',
      strokeColor: '#868e96',
      strokeWidth: 1,
      strokeStyle: 'dashed',
      roughness: 0,
    },
  ], { regenerateIds: false });

  return {
    ...rectangle,
    type: 'frame',
    name: title || t('bookmark'),
  } as ExcalidrawFrameElement;
}

function buildBookmarkGroups(roots: BookmarkNode[]) {
  const looseBookmarks = roots.filter((node) => Boolean(node.url));
  const folders = roots.filter((node) => !node.url);

  return [
    ...(looseBookmarks.length > 0 ? [{
      id: 'top-level',
      title: t('topLevelBookmarks'),
      bookmarks: looseBookmarks.map((node) => ({ node, folderPath: '' })),
    }] : []),
    ...folders.map((folder) => ({
      id: folder.id,
      title: folder.title || t('unnamedFolder'),
      bookmarks: flattenUrlBookmarks(folder.children ?? [], folder.title ? [folder.title] : []),
    })),
  ];
}

function bookmarkElementLink(bookmarkId: string) {
  return `https://bookmark-atlas.invalid/bookmark/${encodeURIComponent(bookmarkId)}`;
}

function stableElementId(kind: string, value: string) {
  let hash = 2_166_136_261;
  for (const character of `${kind}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `atlas-${kind}-${(hash >>> 0).toString(36)}`;
}
