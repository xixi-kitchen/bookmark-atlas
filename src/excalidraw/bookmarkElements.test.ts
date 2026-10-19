import { describe, expect, it } from 'vitest';
import type { BookmarkNode } from '../bookmarks/types';
import {
  buildBookmarkImportGroups,
  createBookmarkGroupScene,
  createBookmarkElement,
  createDefaultBookmarkScene,
  getBookmarkElementData,
  isSafeEmbeddableUrl,
} from './bookmarkElements';

const roots: BookmarkNode[] = [
  {
    id: 'folder-1',
    title: '工作',
    type: 'folder',
    children: [
      { id: 'bookmark-1', title: 'OpenAI', url: 'https://openai.com', type: 'bookmark' },
      {
        id: 'folder-2',
        title: '设计',
        type: 'folder',
        children: [
          { id: 'bookmark-2', title: 'Excalidraw', url: 'https://excalidraw.com', type: 'bookmark' },
        ],
      },
    ],
  },
];

describe('Excalidraw bookmark elements', () => {
  it('creates a custom embeddable linked to the Chrome bookmark id', () => {
    const element = createBookmarkElement(roots[0]!.children![0]!, { x: 20, y: 40 });

    expect(element.type).toBe('embeddable');
    expect(element.width).toBe(220);
    expect(element.height).toBe(88);
    expect(getBookmarkElementData(element)).toMatchObject({
      kind: 'bookmark',
      bookmarkId: 'bookmark-1',
      bookmarkKey: 'https://openai.com/\nopenai\n',
      normalizedUrl: 'https://openai.com/',
      title: 'OpenAI',
      url: 'https://openai.com',
      presentation: 'compact',
    });
  });

  it('builds an initial frame containing every nested URL bookmark', () => {
    const scene = createDefaultBookmarkScene(roots);
    const bookmarks = scene.map(getBookmarkElementData).filter(Boolean);
    const frames = scene.filter((element) => element.type === 'frame');

    expect(frames).toHaveLength(1);
    expect(bookmarks.map((bookmark) => bookmark!.bookmarkId)).toEqual(['bookmark-1', 'bookmark-2']);
    expect(bookmarks[1]?.folderPath).toBe('工作 / 设计');
  });

  it('allows web embeds but rejects unsafe or unsupported protocols', () => {
    expect(isSafeEmbeddableUrl('https://example.com/embed')).toBe(true);
    expect(isSafeEmbeddableUrl('http://localhost:3000')).toBe(true);
    expect(isSafeEmbeddableUrl('http://example.com/embed')).toBe(false);
    expect(isSafeEmbeddableUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeEmbeddableUrl('file:///tmp/private')).toBe(false);
  });

  it('supports importing a whole folder group into a frame', () => {
    const groups = buildBookmarkImportGroups(roots);
    const scene = createBookmarkGroupScene(groups[0]!, { x: 100, y: 200 });
    const bookmarks = scene.map(getBookmarkElementData).filter(Boolean);

    expect(groups.map((group) => group.title)).toEqual(['工作', '设计']);
    expect(scene[0]?.type).toBe('frame');
    expect(bookmarks.map((bookmark) => bookmark!.bookmarkId)).toEqual(['bookmark-1', 'bookmark-2']);
    expect(bookmarks.every((bookmark) => bookmark!.folderPath?.startsWith('工作'))).toBe(true);
  });

  it('preserves historical data and geometry without assigning a new presentation', () => {
    const element = createBookmarkElement(roots[0]!.children![0]!, { x: 20, y: 40 }, { presentation: 'detailed' });
    const { presentation: _presentation, ...historicalData } = element.customData!.bookmarkAtlas;
    const historical = { ...element, customData: { bookmarkAtlas: historicalData } };
    const serialized = JSON.stringify(historical);

    expect(getBookmarkElementData(historical)?.presentation).toBeUndefined();
    expect(getBookmarkElementData(historical)?.description).toBeUndefined();
    expect(historical).toMatchObject({ x: 20, y: 40, width: 300, height: 168 });
    expect(JSON.stringify(historical)).toBe(serialized);
  });

  it('retains supported presentation and Unicode descriptions when parsing', () => {
    const element = createBookmarkElement(roots[0]!.children![0]!, { x: 0, y: 0 });
    element.customData!.bookmarkAtlas = {
      ...element.customData!.bookmarkAtlas,
      presentation: 'icon',
      description: '😀'.repeat(141),
    };
    expect(getBookmarkElementData(element)).toMatchObject({ presentation: 'icon', description: '😀'.repeat(140) });

    element.customData!.bookmarkAtlas.presentation = 'unknown';
    element.customData!.bookmarkAtlas.description = 123;
    expect(getBookmarkElementData(element)?.presentation).toBeUndefined();
    expect(getBookmarkElementData(element)?.description).toBeUndefined();
  });

  it.each(['icon', 'compact', 'detailed'] as const)('fits imported %s cards in their content-sized frame', (presentation) => {
    const group = buildBookmarkImportGroups(roots)[0]!;
    const scene = createBookmarkGroupScene(group, { x: 100, y: 200 }, { presentation });
    const frame = scene[0]!;
    const cards = scene.slice(1);

    for (const card of cards) {
      expect(getBookmarkElementData(card)?.presentation).toBe(presentation);
      expect(card.x).toBeGreaterThanOrEqual(frame.x + 48);
      expect(card.y).toBeGreaterThanOrEqual(frame.y + 48 + 54);
      expect(card.x + card.width).toBeLessThanOrEqual(frame.x + frame.width - 48);
      expect(card.y + card.height).toBeLessThanOrEqual(frame.y + frame.height - 48);
    }
    expect(Math.max(...cards.map((card) => card.x + card.width))).toBe(frame.x + frame.width - 48);
    expect(Math.max(...cards.map((card) => card.y + card.height))).toBe(frame.y + frame.height - 48);
  });

  it('uses compact geometry in the default scene and accepts a new-bookmark presentation override', () => {
    const compact = createDefaultBookmarkScene(roots);
    const detailed = createDefaultBookmarkScene(roots, { presentation: 'detailed' });
    expect(compact.slice(1).every((element) => element.width === 220 && element.height === 88)).toBe(true);
    expect(detailed.slice(1).every((element) => element.width === 300 && element.height === 168)).toBe(true);
    expect(compact[0]!.height).toBeLessThan(detailed[0]!.height);
  });

});
