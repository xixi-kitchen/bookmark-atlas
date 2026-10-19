import { getCommonBounds } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BookmarkNode } from '../bookmarks/types';
import type { CaptureIntent } from '../capture/captureQueue';
import { createBookmarkElement, getBookmarkElementData, normalizeBookmarkUrl } from './bookmarkElements';
import type { BookmarkPresentation } from './bookmarkDisplay';
import { getSafeBookmarkUrl } from './bookmarkNavigation';

/** Additive only: retries never rewrite an existing card or an unrelated drawing. */
export function buildCapturedBookmarkChange(
  elements: readonly ExcalidrawElement[],
  intent: CaptureIntent,
  node: BookmarkNode,
  presentation: BookmarkPresentation,
): { elements: readonly ExcalidrawElement[]; target: ExcalidrawElement | null; changed: boolean } {
  if (node.id !== intent.bookmarkId || !getSafeBookmarkUrl(node.url) || !/^[\w-]{1,100}$/.test(intent.id)) {
    throw new Error('invalid_capture');
  }
  const id = `capture-${intent.id}`;
  const original = elements.find((element) => element.id === id);
  if (original) {
    if (!getBookmarkElementData(original)) throw new Error('capture_id_collision');
    return { elements, target: original.isDeleted ? null : original, changed: false };
  }
  const existing = elements.find((element) => {
    if (element.isDeleted) return false;
    const data = getBookmarkElementData(element);
    return data?.bookmarkId === node.id && data.normalizedUrl === normalizeBookmarkUrl(node.url!);
  });
  if (existing) return { elements, target: existing, changed: false };
  const visible = elements.filter((element) => !element.isDeleted);
  const bounds = visible.length ? getCommonBounds(visible) : [0, 0, -64, 0];
  const target = createBookmarkElement(node, { x: bounds[2]! + 64, y: bounds[1]! }, {
    id, folderPath: intent.folderPath, presentation,
  });
  return { elements: [...elements, target], target, changed: true };
}
