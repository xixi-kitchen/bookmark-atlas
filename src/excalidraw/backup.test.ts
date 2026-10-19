import { describe, expect, it, vi } from 'vitest';
import type { AppState } from '@excalidraw/excalidraw/types';
import { createStoredScene } from './sceneStorage';
import { createBookmarkAtlasBackup, parseBookmarkAtlasBackup } from './backup';

describe('Bookmark Atlas backup', () => {
  it('never exports locally saved AI credentials or API settings', () => {
    vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({
      'bookmarkAtlas.ai.credentials.local.v1': { baseUrl: 'https://private-model.test/v1', apiKey: 'test-only-backup-secret' },
      'bookmarkAtlas.ai.config.v1': { baseUrl: 'https://private-model.test/v1', model: 'private-model' },
    })) } } });
    try {
      const backup = JSON.stringify(createBookmarkAtlasBackup(createStoredScene([], {} as AppState, {})));
      expect(backup).not.toContain('test-only-backup-secret');
      expect(backup).not.toContain('private-model');
      expect(backup).not.toContain('credentials.local');
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('round-trips a complete scene including files, library, and preferences', () => {
    const libraryItems = [{ id: 'library-1', status: 'unpublished', created: 1, elements: [] }] as const;
    const scene = createStoredScene([], { viewBackgroundColor: '#fff' } as AppState, {}, libraryItems);
    const backup = createBookmarkAtlasBackup(scene);
    const restored = parseBookmarkAtlasBackup(JSON.stringify(backup));

    expect(restored.type).toBe('bookmark-atlas-backup');
    expect(restored.contents.excalidrawScene.libraryItems).toEqual(libraryItems);
    expect(restored.contents.preferences).toMatchObject({ cardSize: 'md', themeId: 'excalidraw' });
  });

  it('rejects unrelated JSON files', () => {
    expect(() => parseBookmarkAtlasBackup('{"hello":"world"}')).toThrow(/valid|format/i);
  });
});
