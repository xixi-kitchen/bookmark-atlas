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
    expect(element.width).toBe(300);
    expect(getBookmarkElementData(element)).toMatchObject({
      kind: 'bookmark',
      bookmarkId: 'bookmark-1',
      title: 'OpenAI',
      url: 'https://openai.com',
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
});
