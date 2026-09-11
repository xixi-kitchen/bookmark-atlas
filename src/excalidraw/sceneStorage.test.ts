import { describe, expect, it } from 'vitest';
import type { AppState } from '@excalidraw/excalidraw/types';
import {
  createStoredScene,
  loadSceneRecoverySnapshot,
  mergeSyncedAppState,
  normalizeStoredScene,
  pickPersistedAppState,
  pickSyncedAppState,
  saveSceneRecoverySnapshot,
} from './sceneStorage';

describe('Excalidraw scene storage', () => {
  it('keeps viewport and drawing preferences while dropping transient UI state', () => {
    const persisted = pickPersistedAppState({
      scrollX: 125,
      scrollY: -44,
      zoom: { value: 0.75 },
      viewBackgroundColor: '#ffffff',
      currentItemStrokeColor: '#1e1e1e',
      selectedElementIds: { selected: true },
      width: 1440,
      height: 900,
    } as unknown as AppState);

    expect(persisted).toMatchObject({
      scrollX: 125,
      scrollY: -44,
      zoom: { value: 0.75 },
      viewBackgroundColor: '#ffffff',
      currentItemStrokeColor: '#1e1e1e',
    });
    expect(persisted).not.toHaveProperty('selectedElementIds');
    expect(persisted).not.toHaveProperty('width');
    expect(persisted).not.toHaveProperty('height');
  });

  it('stores library items with the scene and migrates legacy scenes safely', () => {
    const libraryItems = [{ id: 'library-1', status: 'unpublished', created: 1, elements: [] }] as const;
    const scene = createStoredScene([], {} as AppState, {}, libraryItems);

    expect(scene.version).toBe(2);
    expect(scene.libraryItems).toEqual(libraryItems);
    expect(normalizeStoredScene({ ...scene, version: 1, libraryItems: undefined })).toMatchObject({
      version: 2,
      libraryItems: [],
    });
  });

  it('keeps viewport state local while syncing document-level canvas settings', () => {
    const local = {
      scrollX: 125,
      scrollY: -44,
      zoom: { value: 0.75 },
      openSidebar: { name: 'library' },
      currentItemStrokeColor: '#111111',
      viewBackgroundColor: '#ffffff',
      name: 'Local name',
    } as unknown as AppState;
    const remote = {
      scrollX: 900,
      zoom: { value: 0.2 },
      viewBackgroundColor: '#f7f7f3',
      name: 'Remote name',
    } as unknown as AppState;

    expect(pickSyncedAppState(local)).toEqual({
      name: 'Local name',
      viewBackgroundColor: '#ffffff',
    });
    expect(mergeSyncedAppState(remote, local)).toMatchObject({
      scrollX: 125,
      scrollY: -44,
      zoom: { value: 0.75 },
      openSidebar: { name: 'library' },
      currentItemStrokeColor: '#111111',
      viewBackgroundColor: '#f7f7f3',
      name: 'Remote name',
    });
  });

  it('keeps one local recovery snapshot before an automatic replacement', async () => {
    const scene = createStoredScene([], { viewBackgroundColor: '#fff' } as AppState, {});

    await saveSceneRecoverySnapshot(scene);

    expect(await loadSceneRecoverySnapshot()).toMatchObject({
      savedAt: scene.savedAt,
      appState: { viewBackgroundColor: '#fff' },
    });
  });
});
