import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { createBookmarkKey, getBookmarkElementData, normalizeBookmarkUrl } from '../../excalidraw/bookmarkElements';
import type { NativePathChange } from './types';

export { NATIVE_CANVAS_PATHS_KEY, loadCanvasPathChanges, retainCanvasPathChanges } from './canvasChangeStorage';

export function applyCanvasPathChanges(elements: readonly ExcalidrawElement[], changes: readonly NativePathChange[]): ExcalidrawElement[] {
  const mappingIds = new Map<string, Set<string>>();
  const identity = (url: string, title: string, path: string) => JSON.stringify([normalizeBookmarkUrl(url), title, path]);
  for (const change of changes) {
    const key = identity(change.url, change.title, change.beforePath);
    const ids = mappingIds.get(key) ?? new Set<string>();
    ids.add(change.bookmarkId);
    mappingIds.set(key, ids);
  }
  return elements.map(element => {
    const original = getBookmarkElementData(element);
    if (!original || element.isDeleted) return element;
    let data = original;
    for (const change of changes) {
      if ((data.bookmarkId !== change.bookmarkId
          && (change.beforeIdentityUnique !== true || mappingIds.get(identity(change.url, change.title, change.beforePath))?.size !== 1)) || data.folderPath !== change.beforePath
        || data.normalizedUrl !== normalizeBookmarkUrl(change.url) || data.title !== change.title) continue;
      data = { ...data, folderPath: change.afterPath, bookmarkKey: createBookmarkKey(data, change.afterPath) };
    }
    if (data.folderPath === original.folderPath && data.bookmarkKey === original.bookmarkKey) return element;
    return {
      ...element, customData: { ...element.customData, bookmarkAtlas: data }, version: element.version + 1,
      versionNonce: (element.versionNonce + 1) % 0x7fffffff, updated: Date.now()
    } as ExcalidrawElement;
  });
}
