import type { BookmarkPresentation } from './bookmarkDisplay';

export const BOOKMARK_CLICK_DISTANCE = 6;
export const BOOKMARK_DOUBLE_CLICK_INTERVAL = 500;

export type BookmarkPoint = { x: number; y: number };
export type BookmarkBounds = BookmarkPoint & { width: number; height: number; angle?: number };
export type BookmarkPointer = {
  clientX: number;
  clientY: number;
  button: number;
  pointerId?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  detail?: number;
};
export type BookmarkClick = { elementId: string; timeStamp: number };

function localPoint(point: BookmarkPoint, bounds: BookmarkBounds): BookmarkPoint | null {
  const { x, y, width, height, angle = 0 } = bounds;
  if (![point.x, point.y, x, y, width, height, angle].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const dx = point.x - (x + width / 2);
  const dy = point.y - (y + height / 2);
  const local = {
    x: dx * Math.cos(angle) + dy * Math.sin(angle) + width / 2,
    y: -dx * Math.sin(angle) + dy * Math.cos(angle) + height / 2,
  };
  return local.x >= 0 && local.x <= width && local.y >= 0 && local.y <= height ? local : null;
}

export function isPointInsideBookmarkBounds(point: BookmarkPoint, bounds: BookmarkBounds): boolean {
  return !!localPoint(point, bounds);
}

/** Scene coordinates in; CSS border and padding match BookmarkCanvasCard's local layout. */
export function hitBookmarkIcon(
  point: BookmarkPoint,
  bounds: BookmarkBounds,
  presentation: BookmarkPresentation = 'detailed',
): boolean {
  const pointOnCard = localPoint(point, bounds);
  if (!pointOnCard) return false;
  const { x: localX, y: localY } = pointOnCard;
  const { width, height } = bounds;
  if (presentation === 'icon') {
    return Math.abs(localX - width / 2) <= 21 && Math.abs(localY - height / 2) <= 21;
  }

  const paddingAndBorder = presentation === 'compact' ? 15 : 19;
  const iconTop = presentation === 'compact' ? height / 2 - 18 : paddingAndBorder;
  return localX >= paddingAndBorder && localX <= paddingAndBorder + 36
    && localY >= iconTop && localY <= iconTop + 36;
}

/** Only a display label: never expose credentials, query parameters, or fragments. */
export function getBookmarkDisplayUrl(raw: string): string {
  const safe = getSafeBookmarkUrl(raw);
  if (!safe) return '';
  const url = new URL(safe);
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.host.replace(/^www\./, '')}${path}`;
}

/**
 * Custom embeddables live in a DOM sibling above Excalidraw's interactive canvas.
 * Pass favicon pointer-down to that canvas so native selection, pointer capture,
 * tools and dragging still own the gesture. Do not forward clicks or pointerup:
 * the real browser pointerup keeps navigation inside the original user gesture.
 */
export function forwardBookmarkPointerDown(target: Element, event: PointerEvent): boolean {
  const canvas = target.closest('.excalidraw')?.querySelector<HTMLCanvasElement>('canvas.excalidraw__canvas.interactive');
  if (!canvas || typeof PointerEvent === 'undefined') return false;
  canvas.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, composed: true,
    clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
    button: event.button, buttons: event.buttons, pointerId: event.pointerId, pointerType: event.pointerType,
    isPrimary: event.isPrimary, pressure: event.pressure, width: event.width, height: event.height,
    tiltX: event.tiltX, tiltY: event.tiltY, twist: event.twist,
    altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
    detail: event.detail,
  }));
  return true;
}

/** Client coordinates keep the six-pixel tolerance independent of canvas zoom. */
export function isBookmarkClickGesture(
  start: BookmarkPointer,
  end: BookmarkPointer,
  maximumDistance?: number,
): boolean {
  if (start.button !== 0 || end.button !== 0 || (start.detail ?? 0) > 1 || (end.detail ?? 0) > 1) return false;
  if ([start, end].some((event) => event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)) return false;
  if (start.pointerId !== undefined && end.pointerId !== undefined && start.pointerId !== end.pointerId) return false;
  const coordinates = [start.clientX, start.clientY, end.clientX, end.clientY];
  if (!coordinates.every(Number.isFinite)) return false;
  const distance = Math.hypot(end.clientX - start.clientX, end.clientY - start.clientY);
  if (maximumDistance !== undefined && (!Number.isFinite(maximumDistance) || maximumDistance < 0 || maximumDistance > BOOKMARK_CLICK_DISTANCE)) return false;
  return distance <= BOOKMARK_CLICK_DISTANCE;
}

/** Only ordinary absolute web URLs are accepted by the new direct-navigation entry point. */
export function getSafeBookmarkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

export function isRepeatedBookmarkClick(previous: BookmarkClick | null, current: BookmarkClick): boolean {
  if (!previous || previous.elementId !== current.elementId) return false;
  const elapsed = current.timeStamp - previous.timeStamp;
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= BOOKMARK_DOUBLE_CLICK_INTERVAL;
}
