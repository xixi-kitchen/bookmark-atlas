import { act, cleanup, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, ExcalidrawImperativeAPI, PointerDownState } from '@excalidraw/excalidraw/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBookmarkNavigation, type BookmarkNavigationApi } from './useBookmarkNavigation';

vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { NEVER: 'NEVER' },
  convertToExcalidrawElements: vi.fn(),
  viewportCoordsToSceneCoords: ({ clientX, clientY }: { clientX: number; clientY: number }, state: AppState) => ({
    x: (clientX - (state.offsetLeft ?? 0)) / state.zoom.value - (state.scrollX ?? 0),
    y: (clientY - (state.offsetTop ?? 0)) / state.zoom.value - (state.scrollY ?? 0),
  }),
}));

type DownCallback = Parameters<ExcalidrawImperativeAPI['onPointerDown']>[0];
type UpCallback = Parameters<ExcalidrawImperativeAPI['onPointerUp']>[0];

function bookmark(overrides: Partial<ExcalidrawElement> = {}): ExcalidrawElement {
  return {
    id: 'bookmark', type: 'embeddable', x: 0, y: 0, width: 220, height: 88, angle: 0,
    isDeleted: false, locked: false, frameId: null,
    customData: { bookmarkAtlas: { kind: 'bookmark', bookmarkId: 'native', title: 'Example', url: 'https://example.com/', presentation: 'compact' } },
    ...overrides,
  } as ExcalidrawElement;
}

function state(hit: ExcalidrawElement | null): PointerDownState {
  return {
    hit: { element: hit, allHitElements: hit ? [hit] : [], wasAddedToSelection: false, hasBeenDuplicated: false, hasHitCommonBoundingBoxOfSelectedElements: false },
    resize: { isResizing: false, handleType: null }, drag: { hasOccurred: false }, boxSelection: { hasOccurred: false }, withCmdOrCtrl: false,
  } as unknown as PointerDownState;
}

function event(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return { clientX: 30, clientY: 44, button: 0, pointerId: 1, detail: 1, target: document.createElement('canvas'), ...overrides } as PointerEvent;
}

function documentPointer(type: string, overrides: Partial<PointerEvent> = {}) {
  const value = event(overrides);
  const native = new MouseEvent(type, { bubbles: true, clientX: value.clientX, clientY: value.clientY, button: value.button });
  Object.defineProperty(native, 'pointerId', { value: value.pointerId });
  document.dispatchEvent(native);
}

function setup(initial = bookmark()) {
  let down!: DownCallback;
  let up!: UpCallback;
  let elements: ExcalidrawElement[] = [initial];
  let appState = {
    activeTool: { type: 'selection' }, zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetTop: 0, offsetLeft: 0,
    frameRendering: { enabled: true, clip: true },
  } as AppState;
  const unsubscribeDown = vi.fn();
  const unsubscribeUp = vi.fn();
  const api: BookmarkNavigationApi = {
    updateScene: vi.fn(),
    getSceneElements: () => elements as ReturnType<BookmarkNavigationApi['getSceneElements']>,
    getAppState: () => appState,
    onPointerDown: (callback) => { down = callback; return unsubscribeDown; },
    onPointerUp: (callback) => { up = callback; return unsubscribeUp; },
  };
  const resolve = vi.fn((element: ExcalidrawElement) => element.customData?.bookmarkAtlas?.url as string);
  const hook = renderHook(({ enabled }) => useBookmarkNavigation(api, resolve, enabled), { initialProps: { enabled: true } });
  const pointerState = state(initial);
  return {
    ...hook, api, resolve, pointerState, unsubscribeDown, unsubscribeUp,
    setElements: (next: ExcalidrawElement[]) => { elements = next; },
    setAppState: (next: Partial<AppState>) => { appState = { ...appState, ...next }; },
    down: (input = event()) => act(() => down(appState.activeTool, pointerState, input as unknown as ReactPointerEvent<HTMLElement>)),
    up: (input = event()) => act(() => up(appState.activeTool, pointerState, input)),
  };
}

beforeEach(() => { vi.spyOn(window, 'open').mockImplementation(() => null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('useBookmarkNavigation', () => {
  it('opens a favicon click synchronously in a new isolated tab, without changing the canvas', () => {
    const test = setup();
    test.down();
    test.up();
    expect(window.open).toHaveBeenCalledOnce();
    expect(window.open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    expect(test.resolve).toHaveBeenCalledOnce();
  });

  it('opens an actual favicon hit inside a selected group common bounding box', () => {
    const test = setup();
    test.pointerState.hit.hasHitCommonBoundingBoxOfSelectedElements = true;
    test.down();
    test.up();
    expect(window.open).toHaveBeenCalledOnce();
  });

  it('clears only a custom bookmark active mode before a DOM or canvas gesture, without recording history', () => {
    const test = setup();
    test.setAppState({ activeEmbeddable: { element: bookmark() as NonNullable<AppState['activeEmbeddable']>['element'], state: 'active' } });
    const root = document.createElement('div');
    root.className = 'excalidraw';
    const canvas = document.createElement('canvas');
    root.append(canvas);
    document.body.append(root);
    canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(test.api.updateScene).toHaveBeenCalledWith({ appState: { activeEmbeddable: null }, captureUpdate: 'NEVER' });
    vi.mocked(test.api.updateScene!).mockClear();
    test.setAppState({ activeEmbeddable: { element: { ...bookmark(), customData: undefined } as NonNullable<AppState['activeEmbeddable']>['element'], state: 'active' } });
    canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(test.api.updateScene).not.toHaveBeenCalled();
    root.remove();
  });

  it.each([0.2, 1, 2])('converts viewport coordinates at zoom %s', (zoom) => {
    const test = setup();
    test.setAppState({ zoom: { value: zoom } as AppState['zoom'], offsetLeft: 50, offsetTop: 60, scrollX: 10, scrollY: 20 });
    const input = event({ clientX: (30 + 10) * zoom + 50, clientY: (44 + 20) * zoom + 60 });
    test.down(input);
    test.up(input);
    expect(window.open).toHaveBeenCalledOnce();
  });

  it('supports the keyboard entry and suppresses another same-target open within 500ms', () => {
    const test = setup();
    expect(test.result.current.openBookmark(bookmark())).toBe(true);
    test.down();
    test.up();
    expect(window.open).toHaveBeenCalledOnce();
  });

  it('allows reopening a custom bookmark after native center-click activation and the double-click interval', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const test = setup();
    test.down();
    test.up();
    test.setAppState({ activeEmbeddable: { element: bookmark() as NonNullable<AppState['activeEmbeddable']>['element'], state: 'active' } });
    clock.mockReturnValue(1600);
    test.down();
    test.up();
    expect(window.open).toHaveBeenCalledTimes(2);
  });

  it('ignores Excalidraw transient selection objects during pointer callbacks, but still blocks keyboard activation while selecting', () => {
    const test = setup();
    test.setAppState({ selectionElement: { ...bookmark(), type: 'selection' } as AppState['selectionElement'] });
    expect(test.result.current.openBookmark(bookmark())).toBe(false);
    test.down();
    test.up();
    expect(window.open).toHaveBeenCalledOnce();
  });

  it('still rejects a real box selection when its temporary selection object is present', () => {
    const test = setup();
    test.setAppState({ selectionElement: { ...bookmark(), type: 'selection' } as AppState['selectionElement'] });
    test.down();
    test.pointerState.boxSelection.hasOccurred = true;
    test.up();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does not navigate titles, hidden elements beneath a drawing, or a different pointerup target', () => {
    const test = setup();
    test.down(event({ clientX: 100 }));
    test.up(event({ clientX: 100 }));
    test.pointerState.hit.element = { ...bookmark(), id: 'cover', type: 'rectangle', customData: undefined } as ExcalidrawElement;
    test.down();
    test.up();
    test.pointerState.hit.element = bookmark();
    test.down();
    test.pointerState.hit.element = null;
    test.up();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('rejects a drag, including when it returns to the starting position', () => {
    const test = setup();
    test.down();
    documentPointer('pointermove', { clientX: 90 });
    documentPointer('pointermove');
    test.up();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('allows sub-threshold pointer jitter even when native Excalidraw marks its move as dragging', () => {
    const test = setup();
    test.down();
    documentPointer('pointermove', { clientX: 34 });
    test.pointerState.drag.hasOccurred = true;
    test.up(event({ clientX: 34 }));
    expect(window.open).toHaveBeenCalledOnce();
  });

  it.each(['freedraw', 'hand', 'text'] as const)('preserves the %s tool', (type) => {
    const test = setup();
    test.setAppState({ activeTool: { type } as AppState['activeTool'] });
    test.down();
    test.up();
    expect(window.open).not.toHaveBeenCalled();
  });

  it.each([{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { button: 1 }, { button: 2 }])('preserves selection modifiers and non-left pointer %s', (overrides) => {
    const test = setup();
    test.down(event(overrides));
    test.up(event(overrides));
    expect(window.open).not.toHaveBeenCalled();
  });

  it('cancels on space, blur, pointer cancellation and a second finger', () => {
    const test = setup();
    test.down();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    test.up();
    test.down();
    window.dispatchEvent(new Event('blur'));
    test.up();
    test.down();
    documentPointer('pointercancel');
    test.up();
    documentPointer('pointerdown');
    test.down();
    documentPointer('pointerdown', { pointerId: 2 });
    documentPointer('pointerup', { pointerId: 2 });
    test.up();
    expect(window.open).not.toHaveBeenCalled();
  });

  it.each([
    { resizingElement: bookmark() }, { editingTextElement: bookmark() },
    { activeEmbeddable: { element: { ...bookmark(), customData: undefined }, state: 'active' } }, { croppingElementId: 'other' },
  ] as Partial<AppState>[])('does not interrupt native editing or iframe interaction %s', (blocked) => {
    const test = setup();
    test.setAppState(blocked);
    test.down();
    test.up();
    expect(test.result.current.openBookmark(bookmark())).toBe(false);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('protects locked/deleted live cards and ancestor frames, including a lock arriving between down/up', () => {
    const test = setup();
    const card = bookmark({ frameId: 'frame' });
    const frame = { ...bookmark({ id: 'frame', locked: true, width: 500, height: 500 }), customData: undefined, type: 'frame' } as ExcalidrawElement;
    test.setElements([card, frame]);
    test.down();
    test.up();
    test.setElements([bookmark()]);
    test.down();
    test.setElements([bookmark({ isDeleted: true })]);
    test.up();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('respects ancestor clipping but permits normal overflow when frame clipping is off', () => {
    const test = setup();
    const frame = { ...bookmark({ id: 'frame', width: 10, height: 10 }), customData: undefined, type: 'frame' } as ExcalidrawElement;
    test.setElements([bookmark({ frameId: 'frame' }), frame]);
    test.down();
    test.up();
    expect(window.open).not.toHaveBeenCalled();
    test.setAppState({ frameRendering: { enabled: true, clip: false } as AppState['frameRendering'] });
    test.down();
    test.up();
    expect(window.open).toHaveBeenCalledOnce();
  });

  it('uses a fresh resolved URL and refuses unsafe schemes', () => {
    const test = setup();
    test.resolve.mockReturnValue('javascript:alert(1)');
    test.down();
    test.up();
    expect(window.open).not.toHaveBeenCalled();
    test.resolve.mockReturnValue('https://fresh.example/new');
    test.down();
    test.up();
    expect(window.open).toHaveBeenCalledWith('https://fresh.example/new', '_blank', 'noopener,noreferrer');
  });

  it('does not arm from form elements, resize handles, or a native box selection', () => {
    const test = setup();
    test.down(event({ target: document.createElement('input') }));
    test.up();
    test.pointerState.resize.isResizing = true;
    test.down();
    test.up();
    test.pointerState.resize.isResizing = false;
    test.pointerState.boxSelection.hasOccurred = true;
    test.down();
    test.up();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('unsubscribes both public handlers and disables explicit navigation when disabled', () => {
    const test = setup();
    test.down();
    test.rerender({ enabled: false });
    expect(test.unsubscribeDown).toHaveBeenCalledOnce();
    expect(test.unsubscribeUp).toHaveBeenCalledOnce();
    expect(test.result.current.openBookmark(bookmark())).toBe(false);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('supports mocks without optional pointer subscriptions', () => {
    const test = setup();
    const minimal = { getAppState: test.api.getAppState, getSceneElements: test.api.getSceneElements };
    const hook = renderHook(() => useBookmarkNavigation(minimal, () => 'https://example.com'));
    expect(hook.result.current.openBookmark(bookmark())).toBe(true);
  });
});
