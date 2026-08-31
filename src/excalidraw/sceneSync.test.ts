import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { createStoredScene } from './sceneStorage';
import { loadSceneFromSync, saveSceneToSync } from './sceneSync';

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

    const result = await saveSceneToSync(scene);
    const loaded = await loadSceneFromSync();

    if (result.status === 'error') throw new Error(result.message);
    expect(result.status).toBe('synced');
    if (result.status === 'synced') expect(result.manifest.excludedFileCount).toBe(1);
    expect(Object.keys(values).filter((key) => key.includes(':chunk:')).every((key) => String(values[key]).length <= 7_000)).toBe(true);
    expect(loaded?.scene.elements).toHaveLength(1);
    expect(loaded?.scene.files).toEqual({});
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
});

function installStorageMock() {
  const values: Record<string, unknown> = {};
  const createArea = () => ({
    get: async (keys?: string | string[]) => {
      const requested = typeof keys === 'string' ? [keys] : keys ?? Object.keys(values);
      return Object.fromEntries(requested.filter((key) => key in values).map((key) => [key, values[key]]));
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
