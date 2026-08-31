import { describe, expect, it } from 'vitest';
import type { AppState } from '@excalidraw/excalidraw/types';
import { createStoredScene } from './sceneStorage';
import { createBookmarkAtlasBackup, parseBookmarkAtlasBackup } from './backup';

describe('Bookmark Atlas backup', () => {
  it('round-trips a complete scene including files, library, and preferences', () => {
    const libraryItems = [{ id: 'library-1', status: 'unpublished', created: 1, elements: [] }] as const;
    const scene = createStoredScene([], { viewBackgroundColor: '#fff' } as AppState, {}, libraryItems);
    const backup = createBookmarkAtlasBackup(scene);
    const restored = parseBookmarkAtlasBackup(JSON.stringify(backup));

    expect(restored.type).toBe('bookmark-atlas-backup');
    expect(restored.contents.excalidrawScene.libraryItems).toEqual(libraryItems);
    expect(restored.contents.preferences).toMatchObject({ cardSize: 'md', themeId: 'swiss' });
  });

  it('rejects unrelated JSON files', () => {
    expect(() => parseBookmarkAtlasBackup('{"hello":"world"}')).toThrow(/有效|格式/);
  });
});
