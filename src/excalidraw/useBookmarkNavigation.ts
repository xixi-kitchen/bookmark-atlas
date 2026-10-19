import { useCallback, useEffect, useRef } from 'react';
import { CaptureUpdateAction, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, ExcalidrawImperativeAPI, PointerDownState } from '@excalidraw/excalidraw/types';
import { getBookmarkElementData } from './bookmarkElements';
import {
  getSafeBookmarkUrl,
  hitBookmarkIcon,
  isBookmarkClickGesture,
  isRepeatedBookmarkClick,
  isPointInsideBookmarkBounds,
  type BookmarkClick,
  type BookmarkPoint,
  type BookmarkPointer,
} from './bookmarkNavigation';

export type BookmarkNavigationApi = Pick<ExcalidrawImperativeAPI, 'getAppState'>
  & { getSceneElements: () => readonly ExcalidrawElement[] }
  & Partial<Pick<ExcalidrawImperativeAPI, 'onPointerDown' | 'onPointerUp'>>
  & { updateScene?: (scene: { appState: Partial<AppState>; captureUpdate: typeof CaptureUpdateAction.NEVER }) => void };

type Gesture = { elementId: string; start: BookmarkPointer; maximumDistance: number };

function unavailable(appState: AppState, allowTransientSelection = false): boolean {
  return appState.activeTool?.type !== 'selection' || appState.viewModeEnabled
    || !!((!allowTransientSelection && appState.selectionElement) || appState.resizingElement || appState.isResizing || appState.isRotating
      || appState.editingTextElement || appState.editingLinearElement || appState.croppingElementId
      || appState.newElement || appState.openDialog || appState.contextMenu
      || (appState.activeEmbeddable?.state === 'active' && !getBookmarkElementData(appState.activeEmbeddable.element)));
}

function pointerStateUnavailable(state: PointerDownState): boolean {
  return !!(state.resize.isResizing || state.resize.handleType || state.boxSelection.hasOccurred
    || state.withCmdOrCtrl || state.hit.hasBeenDuplicated);
}

function editableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, button, a, iframe, [contenteditable="true"], [role="textbox"]');
}

/** Locked ancestors also protect their children. Clip checks use each ancestor's rotated local bounds. */
function navigableElement(element: ExcalidrawElement, elements: readonly ExcalidrawElement[], appState: AppState, point?: BookmarkPoint): boolean {
  if (element.isDeleted || element.locked || !getBookmarkElementData(element)) return false;
  const visited = new Set([element.id]);
  let frameId = element.frameId;
  while (frameId) {
    if (visited.has(frameId)) return false;
    visited.add(frameId);
    const frame = elements.find((candidate) => candidate.id === frameId);
    if (!frame) break;
    if (frame.isDeleted || frame.locked) return false;
    if (point && appState.frameRendering?.enabled && appState.frameRendering.clip && !isPointInsideBookmarkBounds(point, frame)) return false;
    frameId = frame.frameId;
  }
  return true;
}

export function useBookmarkNavigation(
  api: BookmarkNavigationApi | null,
  resolveURL: (element: ExcalidrawElement) => string | null | undefined,
  enabled = true,
) {
  const previousClick = useRef<BookmarkClick | null>(null);
  const resolveRef = useRef(resolveURL);
  resolveRef.current = resolveURL;

  const navigate = useCallback((element: ExcalidrawElement, allowTransientSelection = false): boolean => {
    if (!api || !enabled || unavailable(api.getAppState(), allowTransientSelection)) return false;
    const elements = api.getSceneElements();
    // Re-read the live element: an incoming update may delete or lock the original object.
    const live = elements.find((candidate) => candidate.id === element.id);
    if (!live || !navigableElement(live, elements, api.getAppState())) return false;
    const url = getSafeBookmarkUrl(resolveRef.current(live));
    const click = { elementId: live.id, timeStamp: performance.now() };
    if (!url || isRepeatedBookmarkClick(previousClick.current, click)) return false;
    previousClick.current = click;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }, [api, enabled]);
  const openBookmark = useCallback((element: ExcalidrawElement) => navigate(element), [navigate]);

  useEffect(() => {
    if (!api || !enabled || !api.onPointerDown || !api.onPointerUp) return;
    let gesture: Gesture | null = null;
    let holdingSpace = false;
    const pointers = new Set<number>();
    const cancel = () => { gesture = null; };
    const pointerDown = (event: PointerEvent) => {
      pointers.add(event.pointerId);
      if (pointers.size > 1) cancel();
      const active = api.getAppState().activeEmbeddable;
      // These cards have no iframe interaction mode. Excalidraw otherwise marks
      // the center active after pointerup and then refuses to drag it next time.
      if (event.target instanceof Element && event.target.closest('.excalidraw')
        && active && getBookmarkElementData(active.element)) {
        api.updateScene?.({ appState: { activeEmbeddable: null }, captureUpdate: CaptureUpdateAction.NEVER });
      }
    };
    const pointerEnd = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    const pointerCancel = (event: PointerEvent) => { pointerEnd(event); cancel(); };
    const pointerMove = (event: PointerEvent) => {
      if (!gesture) return;
      if (gesture.start.pointerId !== event.pointerId) return;
      gesture.maximumDistance = Math.max(gesture.maximumDistance, Math.hypot(event.clientX - gesture.start.clientX, event.clientY - gesture.start.clientY));
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) cancel();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') holdingSpace = true;
      if (holdingSpace || ['Alt', 'Control', 'Meta', 'Shift', 'Escape'].includes(event.key)) cancel();
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') holdingSpace = false;
    };
    const blur = () => { cancel(); pointers.clear(); holdingSpace = false; };

    const unsubscribeDown = api.onPointerDown((tool, state, event) => {
      cancel();
      const appState = api.getAppState();
      // Excalidraw creates a temporary selectionElement on every selection-tool down,
      // and clears it in the same batched update that emits pointerup. The public
      // boxSelection flag, not that transient appState object, identifies real box drags.
      if (holdingSpace || pointers.size > 1 || tool.type !== 'selection' || unavailable(appState, true)
        || pointerStateUnavailable(state) || editableTarget(event.target) || !isBookmarkClickGesture(event, event)) return;
      const hit = state.hit.element;
      if (!hit) return; // Never search through an overlaid drawing to find a hidden bookmark.
      const elements = api.getSceneElements();
      const element = elements.find((candidate) => candidate.id === hit.id);
      const point = viewportCoordsToSceneCoords(event, appState);
      if (!element || !navigableElement(element, elements, appState, point)) return;
      const data = getBookmarkElementData(element)!;
      if (!hitBookmarkIcon(point, element, data.presentation)) return;
      // React events are transient; retain scalar values rather than the event object.
      gesture = {
        elementId: element.id,
        maximumDistance: 0,
        start: {
          clientX: event.clientX, clientY: event.clientY, button: event.button, pointerId: event.pointerId,
          altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, detail: event.detail,
        },
      };
    });
    const unsubscribeUp = api.onPointerUp((tool, state, event) => {
      const candidate = gesture;
      cancel();
      const appState = api.getAppState();
      if (!candidate || holdingSpace || pointers.size > 1 || tool.type !== 'selection' || unavailable(appState, true)
        || pointerStateUnavailable(state) || state.hit.element?.id !== candidate.elementId
        || !isBookmarkClickGesture(candidate.start, event, candidate.maximumDistance)) return;
      const elements = api.getSceneElements();
      const element = elements.find((current) => current.id === candidate.elementId);
      const point = viewportCoordsToSceneCoords(event, appState);
      if (!element || !navigableElement(element, elements, appState, point)
        || !hitBookmarkIcon(point, element, getBookmarkElementData(element)!.presentation)) return;
      navigate(element, true);
    });

    document.addEventListener('pointerdown', pointerDown, { passive: true, capture: true });
    document.addEventListener('pointerup', pointerEnd, { passive: true, capture: true });
    document.addEventListener('pointercancel', pointerCancel, { passive: true, capture: true });
    document.addEventListener('pointermove', pointerMove, { passive: true });
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', blur);
    return () => {
      unsubscribeDown();
      unsubscribeUp();
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerEnd, true);
      document.removeEventListener('pointercancel', pointerCancel, true);
      document.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('blur', blur);
      cancel();
    };
  }, [api, enabled, navigate]);

  return { openBookmark };
}
