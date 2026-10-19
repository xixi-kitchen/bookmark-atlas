import { getCommonBounds, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import {
  BOOKMARK_PRESENTATION_SIZES,
  normalizeBookmarkDescription,
  type BookmarkPresentation,
} from './bookmarkDisplay';
import { getBookmarkElementData } from './bookmarkElements';

const LAYOUT_GAP = 24;

export function getSelectedBookmarkIds(
  elements: readonly ExcalidrawElement[],
  selectedIds: Readonly<Record<string, boolean>>,
): string[] {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  return elements.filter((element) => {
    if (!isEditableBookmark(element, elementsById)) return false;
    if (selectedIds[element.id]) return true;
    let parentId = element.frameId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const frame = elementsById.get(parentId);
      if (!frame || !isFrame(frame)) return false;
      if (selectedIds[frame.id]) return true;
      parentId = frame.frameId;
    }
    return false;
  }).map((element) => element.id);
}

export function setBookmarkPresentation(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  presentation: BookmarkPresentation,
): ExcalidrawElement[] {
  const size = BOOKMARK_PRESENTATION_SIZES[presentation];
  return updateBookmarks(elements, ids, (element) => {
    const data = getBookmarkElementData(element)!;
    if ((data.presentation ?? 'detailed') === presentation) {
      return element;
    }
    return newElementWith(element, {
      width: size.width,
      height: size.height,
      x: element.x + (element.width - size.width) / 2,
      y: element.y + (element.height - size.height) / 2,
      customData: bookmarkCustomData(element, { presentation }),
    });
  });
}

export function setBookmarkDescription(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  description: string,
): ExcalidrawElement[] {
  const normalized = normalizeBookmarkDescription(description);
  return updateBookmarks(elements, ids, (element) => {
    const current = getBookmarkElementData(element)!.description ?? '';
    if (current === normalized) return element;
    return newElementWith(element, {
      customData: bookmarkCustomData(element, { description: normalized }),
    });
  });
}

/** Pure preview: move eligible bookmarks and fit explicitly selected, fully targeted frames. */
export function layoutBookmarkElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] {
  const selected = new Set(ids);
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const targets = elements.filter((element) => selected.has(element.id) && isEditableBookmark(element, elementsById));
  if (targets.length === 0) return elements as ExcalidrawElement[];
  const bookmarkIds = new Set(targets.map((element) => element.id));
  const childrenByFrame = new Map<string | null, ExcalidrawElement[]>();
  for (const element of elements) {
    if (element.isDeleted) continue;
    const parent = element.frameId ? elementsById.get(element.frameId) : undefined;
    const parentId = parent && isFrame(parent) ? parent.id : null;
    const children = childrenByFrame.get(parentId) ?? [];
    children.push(element);
    childrenByFrame.set(parentId, children);
  }

  const fullyTargeted = (frame: ExcalidrawElement): boolean => {
    if (!canEditElement(frame, elementsById)) return false;
    const children = childrenByFrame.get(frame.id) ?? [];
    return children.length > 0 && children.every((child) => bookmarkIds.has(child.id) || (isFrame(child) && fullyTargeted(child)));
  };

  // A framed region is transactional: if any descendant is unselected, locked,
  // or not a bookmark, leave its whole subtree untouched rather than risk clipping.
  const layoutFrame = (frame: ExcalidrawElement, ancestorSelected: boolean): ExcalidrawElement[] | null => {
    if (!fullyTargeted(frame)) return null;
    const children = childrenByFrame.get(frame.id)!;
    const childFrames = children.filter(isFrame);
    const shouldFit = ancestorSelected || selected.has(frame.id);
    const updates = new Map<string, ExcalidrawElement>();
    for (const child of childFrames) {
      const nested = layoutFrame(child, shouldFit);
      if (!nested) return null;
      for (const element of nested) updates.set(element.id, element);
    }
    const directBookmarks = children.filter((child) => bookmarkIds.has(child.id));
    const positioned = layoutBookmarkRegion(directBookmarks, boundsOf(frame), childFrames.map(boundsOf));
    if (!positioned) return null;
    for (const element of positioned) updates.set(element.id, element);

    const nextChildren = children.map((child) => updates.get(child.id) ?? child);
    if (nextChildren.some((child) => !containsBounds(boundsOf(frame), boundsOf(child)))) return null;
    if (shouldFit) {
      const [left, top, right, bottom] = getCommonBounds(nextChildren);
      const old = boundsOf(frame);
      // Shrink within the existing region so sibling frames never move or overlap.
      const x = Math.max(old.left, left - LAYOUT_GAP);
      const y = Math.max(old.top, top - LAYOUT_GAP);
      const geometry = { x, y, width: Math.min(old.right, right + LAYOUT_GAP) - x, height: Math.min(old.bottom, bottom + LAYOUT_GAP) - y };
      const unchanged = Object.entries(geometry).every(([key, value]) => Math.abs(frame[key as keyof typeof geometry] - value) < 1e-8);
      updates.set(frame.id, unchanged ? frame : newElementWith(frame, geometry));
    }
    return [...updates.values()];
  };

  const updates = new Map<string, ExcalidrawElement>();
  const roots = childrenByFrame.get(null) ?? [];
  const rootFrames = roots.filter(isFrame);
  for (const frame of rootFrames) {
    for (const element of layoutFrame(frame, false) ?? []) updates.set(element.id, element);
  }
  const unframed = layoutBookmarkRegion(roots.filter((element) => bookmarkIds.has(element.id)), null, rootFrames.map(boundsOf));
  for (const element of unframed ?? []) updates.set(element.id, element);

  let changed = false;
  const result = elements.map((element) => {
    const next = updates.get(element.id) ?? element;
    if (next !== element) changed = true;
    return next;
  });
  return changed ? result : elements as ExcalidrawElement[];
}

type Bounds = { left: number; top: number; right: number; bottom: number };

function boundsOf(element: ExcalidrawElement): Bounds {
  const [left, top, right, bottom] = getCommonBounds([element]);
  return { left, top, right, bottom };
}

function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return inner.left >= outer.left - 1e-8 && inner.top >= outer.top - 1e-8
    && inner.right <= outer.right + 1e-8 && inner.bottom <= outer.bottom + 1e-8;
}

function overlapsBounds(first: Bounds, second: Bounds): boolean {
  return first.left < second.right - 1e-8 && first.right > second.left + 1e-8
    && first.top < second.bottom - 1e-8 && first.bottom > second.top + 1e-8;
}

function layoutBookmarkRegion(
  targets: readonly ExcalidrawElement[],
  boundary: Bounds | null,
  obstacles: readonly Bounds[],
): ExcalidrawElement[] | null {
  if (targets.length === 0) return [];
  const bounds = targets.map(boundsOf);
  const left = Math.min(...bounds.map((bound) => bound.left));
  const top = Math.min(...bounds.map((bound) => bound.top));
  const width = Math.max(...bounds.map((bound) => bound.right - bound.left));
  const height = Math.max(...bounds.map((bound) => bound.bottom - bound.top));
  let best: Array<{ x: number; y: number }> | null = null;
  let bestDifference = Infinity;

  for (let columns = 1; columns <= targets.length; columns += 1) {
    const rows = Math.ceil(targets.length / columns);
    const gridWidth = columns * width + (columns - 1) * LAYOUT_GAP;
    const gridHeight = rows * height + (rows - 1) * LAYOUT_GAP;
    const difference = Math.abs(Math.log(gridWidth / gridHeight));
    if (difference >= bestDifference) continue;
    const positions = targets.map((element, index) => ({
      x: left + (index % columns) * (width + LAYOUT_GAP) + element.x - bounds[index]!.left,
      y: top + Math.floor(index / columns) * (height + LAYOUT_GAP) + element.y - bounds[index]!.top,
    }));
    const safe = positions.every((position, index) => {
      const previous = bounds[index]!;
      const element = targets[index]!;
      const next = { left: previous.left + position.x - element.x, top: previous.top + position.y - element.y, right: previous.right + position.x - element.x, bottom: previous.bottom + position.y - element.y };
      return (!boundary || containsBounds(boundary, next)) && !obstacles.some((obstacle) => overlapsBounds(next, obstacle));
    });
    if (safe) {
      best = positions;
      bestDifference = difference;
    }
  }
  if (!best) return null;
  return targets.map((element, index) => {
    const position = best[index]!;
    return Math.abs(element.x - position.x) < 1e-8 && Math.abs(element.y - position.y) < 1e-8
      ? element : newElementWith(element, position);
  });
}

function updateBookmarks(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  update: (element: ExcalidrawElement) => ExcalidrawElement,
): ExcalidrawElement[] {
  const selected = new Set(ids);
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  let changed = false;
  const result = elements.map((element) => {
    if (!selected.has(element.id) || !isEditableBookmark(element, elementsById)) return element;
    const next = update(element);
    if (next !== element) changed = true;
    return next;
  });
  return changed ? result : elements as ExcalidrawElement[];
}

function bookmarkCustomData(element: ExcalidrawElement, fields: Record<string, unknown>) {
  return {
    ...element.customData,
    bookmarkAtlas: {
      ...element.customData?.bookmarkAtlas,
      ...fields,
    },
  };
}

function isEditableBookmark(element: ExcalidrawElement, elementsById: ReadonlyMap<string, ExcalidrawElement>): boolean {
  return element.type === 'embeddable' && Boolean(getBookmarkElementData(element)) && canEditElement(element, elementsById);
}

function canEditElement(element: ExcalidrawElement, elementsById: ReadonlyMap<string, ExcalidrawElement>): boolean {
  if (element.isDeleted || element.locked) return false;
  let parentId = element.frameId;
  const visited = new Set<string>([element.id]);
  while (parentId) {
    if (visited.has(parentId)) return false;
    visited.add(parentId);
    const parent = elementsById.get(parentId);
    if (!parent) return true;
    if (parent.isDeleted || parent.locked) return false;
    parentId = parent.frameId;
  }
  return true;
}

function isFrame(element: ExcalidrawElement): boolean {
  return element.type === 'frame' || element.type === 'magicframe';
}
