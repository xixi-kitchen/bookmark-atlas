import type { NativePathChange } from './types';

export const NATIVE_CANVAS_PATHS_KEY = 'bookmark-atlas:native-canvas-paths:v1';

export async function loadCanvasPathChanges(): Promise<NativePathChange[]> {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) return [];
  const value = (await storage.get(NATIVE_CANVAS_PATHS_KEY))[NATIVE_CANVAS_PATHS_KEY];
  if (value === undefined) return [];
  if (!value || value.version !== 1 || !Array.isArray(value.changes) || value.changes.some((item: NativePathChange) => !item
    || ['bookmarkId', 'title', 'url', 'beforePath', 'afterPath'].some(key => typeof item[key as keyof NativePathChange] !== 'string'))) {
    throw new Error('invalid_canvas_associations');
  }
  return value.changes;
}

/** The background executor serializes these writes alongside its operation journal. */
export async function retainCanvasPathChanges(changes: NativePathChange[]): Promise<void> {
  if (!changes.length) return;
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) throw new Error('storage_unavailable');
  const saved = await loadCanvasPathChanges();
  // Repeated completion receipts remain idempotent. Keep moves and restores in order.
  for (const change of changes) {
    const last = saved.findLast(item => item.bookmarkId === change.bookmarkId && item.url === change.url);
    if (last?.beforePath === change.beforePath && last.afterPath === change.afterPath) continue;
    saved.push(change);
  }
  await storage.set({ [NATIVE_CANVAS_PATHS_KEY]: { version: 1, changes: saved } });
}
