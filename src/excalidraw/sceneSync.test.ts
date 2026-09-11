import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { createStoredScene } from './sceneStorage';
import {
  createSceneSyncFingerprint,
  getCanvasSyncManifest,
  loadSceneFromSync,
  mergeSyncedSceneWithLocalFiles,
  saveSceneToSync,
  SYNC_MANIFEST_KEY,
} from './sceneSync';

const originalChrome = globalThis.chrome;

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', { value: originalChrome, configurable: true });
  vi.unstubAllGlobals();
});

describe('Excalidraw Chrome Sync storage', () => {
  it('compresses and chunks a lightweight scene while excluding binary files', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const values = installStorageMock();
    const scene = createStoredScene(
      [{ id: 'shape-1', version: 1, isDeleted: false, type: 'rectangle' } as ExcalidrawElement],
      { viewBackgroundColor: '#fff' } as AppState,
      { file1: { id: 'file1', dataURL: 'data:image/png;base64,abc', mimeType: 'image/png', created: 1 } } as unknown as BinaryFiles,
    );

    const result = await saveSceneToSync(scene, {
      contextId: 'tab-a',
      parentFingerprint: 'previous-cloud',
    });
    const loaded = await loadSceneFromSync();

    if (result.status === 'error') throw new Error(result.message);
    expect(result.status).toBe('synced');
    if (result.status === 'synced') {
      expect(result.manifest.contextId).toBe('tab-a');
      expect(result.manifest.parentFingerprint).toBe('previous-cloud');
      expect(result.manifest.fingerprintVersion).toBe(2);
      expect(typeof result.manifest.fingerprint).toBe('string');
      expect(result.manifest.excludedFileCount).toBe(1);
    }
    expect(Object.keys(values).filter((key) => key.includes(':chunk:')).every((key) => String(values[key]).length <= 7_000)).toBe(true);
    expect(loaded?.scene.elements).toHaveLength(1);
    expect(loaded?.manifest.contextId).toBe('tab-a');
    expect(loaded?.scene.files).toEqual({});
  });

  it('excludes viewport state from sync and preserves the receiving tab viewport', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    installStorageMock();
    const remote = createStoredScene(
      [],
      {
        scrollX: 900,
        scrollY: 800,
        zoom: { value: 0.2 },
        openSidebar: { name: 'library' },
        viewBackgroundColor: '#f7f7f3',
      } as unknown as AppState,
      {},
    );
    const local = createStoredScene(
      [],
      {
        scrollX: 10,
        scrollY: 20,
        zoom: { value: 1 },
        viewBackgroundColor: '#ffffff',
      } as unknown as AppState,
      {},
    );

    const result = await saveSceneToSync(remote);
    if (result.status !== 'synced') throw new Error(`Expected sync, got ${result.status}`);
    const loaded = await loadSceneFromSync();
    expect(loaded?.scene.appState).toEqual({ viewBackgroundColor: '#f7f7f3' });
    expect(mergeSyncedSceneWithLocalFiles(loaded!.scene, local).appState).toMatchObject({
      scrollX: 10,
      scrollY: 20,
      zoom: { value: 1 },
      viewBackgroundColor: '#f7f7f3',
    });
  });

  it('fingerprints actual divergent element revisions while ignoring viewport-only changes', () => {
    const first = createStoredScene(
      [{ id: 'shape', version: 2, versionNonce: 101, updated: 10, isDeleted: false, type: 'rectangle', x: 10 } as ExcalidrawElement],
      { scrollX: 10, viewBackgroundColor: '#fff' } as AppState,
      {},
    );
    const sameContentDifferentViewport = createStoredScene(
      first.elements,
      { scrollX: 900, viewBackgroundColor: '#fff' } as AppState,
      {},
    );
    const divergent = createStoredScene(
      [{ ...first.elements[0], versionNonce: 202, x: 50 } as ExcalidrawElement],
      { scrollX: 10, viewBackgroundColor: '#fff' } as AppState,
      {},
    );

    expect(createSceneSyncFingerprint(first)).toBe(createSceneSyncFingerprint(sameContentDifferentViewport));
    expect(createSceneSyncFingerprint(first)).not.toBe(createSceneSyncFingerprint(divergent));
  });

  it('keeps the last cloud version when a compressed scene exceeds the safe quota', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    installStorageMock();
    const randomText = deterministicNoise(180_000);
    const scene = createStoredScene(
      [{ id: 'huge', version: 1, isDeleted: false, type: 'text', text: randomText } as unknown as ExcalidrawElement],
      {} as AppState,
      {},
    );

    const result = await saveSceneToSync(scene);

    if (result.status === 'error') throw new Error(result.message);
    expect(result.status).toBe('too-large');
  });

  it('loads the manifest supplied by the storage change event instead of re-reading the latest manifest', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const values = installStorageMock();
    const scene = createStoredScene(
      [{ id: 'event-scene', version: 1, isDeleted: false, type: 'rectangle' } as ExcalidrawElement],
      {} as AppState,
      {},
    );
    const result = await saveSceneToSync(scene, { contextId: 'event-tab' });
    if (result.status !== 'synced') throw new Error(`Expected sync, got ${result.status}`);

    values[SYNC_MANIFEST_KEY] = { ...result.manifest, revision: 'newer-unreadable-revision', encodedLength: 1 };
    const loaded = await loadSceneFromSync({ manifest: result.manifest, revision: result.manifest.revision });

    expect(loaded?.manifest.revision).toBe(result.manifest.revision);
    expect(loaded?.scene.elements[0]?.id).toBe('event-scene');
  });

  it('retries when a sync event arrives before every chunk is readable', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const values = installStorageMock();
    const scene = createStoredScene(
      [{ id: 'retry-scene', version: 1, isDeleted: false, type: 'rectangle' } as ExcalidrawElement],
      {} as AppState,
      {},
    );
    const result = await saveSceneToSync(scene);
    if (result.status !== 'synced') throw new Error(`Expected sync, got ${result.status}`);

    installStorageMock(values, { omitFirstChunkRead: true });
    const loaded = await loadSceneFromSync({
      manifest: result.manifest,
      retries: 1,
      retryDelayMs: 0,
    });

    expect(loaded?.scene.elements[0]?.id).toBe('retry-scene');
  });

  it('rejects stale manifest metadata paired with chunks from a newer scene', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    installStorageMock();
    const first = createStoredScene(
      [{ id: 'scene-a', version: 1, versionNonce: 101, updated: 1, isDeleted: false, type: 'rectangle' } as ExcalidrawElement],
      { viewBackgroundColor: '#fff' } as AppState,
      {},
    );
    const second = createStoredScene(
      [{ id: 'scene-b', version: 1, versionNonce: 202, updated: 2, isDeleted: false, type: 'rectangle' } as ExcalidrawElement],
      { viewBackgroundColor: '#fff' } as AppState,
      {},
    );
    const firstResult = await saveSceneToSync(first);
    const secondResult = await saveSceneToSync(second);
    if (firstResult.status !== 'synced' || secondResult.status !== 'synced') {
      throw new Error('Expected both scenes to sync.');
    }

    const stale = await loadSceneFromSync({
      manifest: firstResult.manifest,
      revision: firstResult.manifest.revision,
    });

    expect(stale).toBeNull();
  });

  it('accepts legacy v1 manifests that do not include newer optional metadata', async () => {
    const values = installStorageMock();
    const scene = createStoredScene(
      [{ id: 'legacy-scene', version: 1, isDeleted: false, type: 'rectangle' } as ExcalidrawElement],
      {} as AppState,
      {},
    );
    const encoded = Buffer.from(JSON.stringify({
      version: 2,
      elements: scene.elements,
      appState: scene.appState,
      libraryItems: scene.libraryItems,
      savedAt: scene.savedAt,
    })).toString('base64');
    const legacyManifest = {
      version: 1,
      revision: 'legacy-revision',
      updatedAt: scene.savedAt,
      deviceId: 'legacy-device',
      codec: 'plain-base64',
      chunkCount: 1,
      encodedLength: encoded.length,
    };
    values[SYNC_MANIFEST_KEY] = legacyManifest;
    values['bookmark-atlas:canvas-sync:v1:chunk:0'] = encoded;

    const manifest = await getCanvasSyncManifest();
    const loaded = await loadSceneFromSync({ revision: 'legacy-revision' });

    expect(manifest).toMatchObject({
      revision: 'legacy-revision',
      elementCount: 0,
      excludedFileCount: 0,
    });
    expect(loaded?.scene.elements[0]?.id).toBe('legacy-scene');
  });
});

function installStorageMock(
  existingValues: Record<string, unknown> = {},
  options: { omitFirstChunkRead?: boolean } = {},
) {
  const values = existingValues;
  let omittedChunkRead = false;
  const createArea = () => ({
    get: async (keys?: string | string[]) => {
      const requested = typeof keys === 'string' ? [keys] : keys ?? Object.keys(values);
      const entries = requested
        .filter((key) => key in values)
        .filter((key) => {
          if (!options.omitFirstChunkRead || omittedChunkRead || !key.includes(':chunk:')) return true;
          omittedChunkRead = true;
          return false;
        })
        .map((key) => [key, values[key]]);
      return Object.fromEntries(entries);
    },
    set: async (next: Record<string, unknown>) => { Object.assign(values, next); },
    remove: async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
    },
  });
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { storage: { sync: createArea(), local: createArea() } },
  });
  return values;
}

function deterministicNoise(length: number) {
  let state = 0x12345678;
  let output = '';
  for (let index = 0; index < length; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    output += String.fromCharCode(33 + (state % 90));
  }
  return output;
}
