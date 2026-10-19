import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { CaptureIntent } from '../capture/captureQueue';
import type { StoredExcalidrawScene } from './sceneStorage';
import { createStoredScene } from './sceneStorage';
import { createBookmarkElement } from './bookmarkElements';
import { useCanvasCaptureInbox } from './useCanvasCaptureInbox';

const inbox = vi.hoisted(() => ({
  load: vi.fn(), ack: vi.fn(), subscribe: vi.fn(), lock: vi.fn(), stored: vi.fn(),
}));

vi.mock('../capture/captureQueue', async (original) => ({
  ...await original<typeof import('../capture/captureQueue')>(),
  loadPendingCaptures: inbox.load,
  ackCapture: inbox.ack,
  subscribePendingCaptures: inbox.subscribe,
  withCaptureConsumerLock: inbox.lock,
}));
vi.mock('./sceneStorage', async (original) => ({
  ...await original<typeof import('./sceneStorage')>(), loadStoredScene: inbox.stored,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const intent = (id = 'one'): CaptureIntent => ({ id, bookmarkId: `native-${id}`, title: id, url: `https://example.com/${id}`, folderPath: 'Other bookmarks / Bookmark Atlas', createdAt: 1_000 });
const node = (id = 'one') => ({ id: `native-${id}`, title: `Live ${id}`, url: `https://example.com/${id}`, parentId: 'atlas-folder' });

function fixture(pending = [intent()]) {
  let elements: readonly ExcalidrawElement[] = [];
  let durable: StoredExcalidrawScene | null = null;
  let allowed = true;
  let wake: (() => void) | undefined;
  const events: string[] = [];
  const state = { zoom: { value: 1 }, viewBackgroundColor: '#ffffff' } as AppState;
  const files: BinaryFiles = {};
  const get = vi.fn(async (id: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> => [node(id.replace('native-', ''))]);
  const getTree = vi.fn(async (): Promise<chrome.bookmarks.BookmarkTreeNode[]> => []);
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn() }, bookmarks: { get, getTree } });
  inbox.load.mockResolvedValue(pending);
  inbox.ack.mockImplementation(async (id: string) => { events.push(`ack:${id}`); });
  inbox.subscribe.mockImplementation((listener: () => void) => { wake = listener; return vi.fn(); });
  inbox.lock.mockImplementation(async (operation: () => Promise<unknown>) => operation());
  inbox.stored.mockImplementation(async () => { events.push('read-durable'); return durable; });
  const api = {
    getSceneElementsIncludingDeleted: vi.fn(() => elements),
    getAppState: vi.fn(() => state), getFiles: vi.fn(() => files),
    updateScene: vi.fn((change: { elements?: readonly ExcalidrawElement[] }) => {
      events.push('update');
      if (change.elements) elements = change.elements;
    }),
    scrollToContent: vi.fn(), setToast: vi.fn(),
  };
  const onSceneChanged = vi.fn(() => { events.push('on-change'); });
  const persist = vi.fn(async () => {
    events.push('persist');
    durable = createStoredScene(elements, state, files);
    return true;
  });
  const runSceneMutation = vi.fn(async (operation: () => Promise<unknown>) => operation());
  const canConsume = vi.fn(() => allowed);
  const ensureBaseline = vi.fn(async () => true);
  const props = {
    api, ready: true, blocked: false, presentation: 'compact' as const, onSceneChanged, persist, canConsume, ensureBaseline,
    runSceneMutation: <T,>(operation: () => Promise<T>) => runSceneMutation(operation) as Promise<T>,
  };
  return {
    props, api, get, getTree, events, persist, onSceneChanged, runSceneMutation, ensureBaseline,
    getElements: () => elements,
    setDurable: (scene: StoredExcalidrawScene | null) => { durable = scene; },
    setAllowed: (value: boolean) => { allowed = value; },
    wake: () => wake?.(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('canvas capture inbox persistence boundary', () => {
  it('does not consume or subscribe before initial canvas data is ready', async () => {
    const f = fixture();
    const hook = renderHook(({ ready }) => useCanvasCaptureInbox({ ...f.props, ready }), { initialProps: { ready: false } });
    await act(async () => {});
    expect(inbox.lock).not.toHaveBeenCalled();
    expect(inbox.load).not.toHaveBeenCalled();
    expect(inbox.subscribe).not.toHaveBeenCalled();
    hook.rerender({ ready: true });
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('one'));
  });

  it('does not read or acknowledge captures when a remote scene application blocks consumption', async () => {
    const f = fixture();
    f.setAllowed(false);
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(inbox.lock).toHaveBeenCalledTimes(1));
    expect(inbox.load).not.toHaveBeenCalled();
    expect(f.get).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
    expect(f.api.updateScene).not.toHaveBeenCalled();
  });

  it('rechecks the remote-application guard after awaiting the native bookmark read', async () => {
    const f = fixture();
    const read = deferred<chrome.bookmarks.BookmarkTreeNode[]>();
    f.get.mockReturnValueOnce(read.promise);
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(f.get).toHaveBeenCalledWith('native-one'));
    f.setAllowed(false);
    await act(async () => { read.resolve([node()]); });
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
  });

  it('requires an aligned shared baseline after acquiring the consumer lock', async () => {
    const f = fixture();
    f.ensureBaseline.mockResolvedValue(false);
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(f.api.setToast).toHaveBeenCalled());
    expect(inbox.lock).toHaveBeenCalledTimes(1);
    expect(f.ensureBaseline).toHaveBeenCalledTimes(1);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
  });

  it('refuses a stale baseline found again inside the serialized mutation boundary', async () => {
    const f = fixture();
    const remote = createBookmarkElement({ id: 'other-device', title: 'Remote', url: 'https://remote.test/' }, { x: 0, y: 0 });
    f.setDurable(createStoredScene([remote], f.api.getAppState(), {}));
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(f.api.setToast).toHaveBeenCalled());
    expect(f.runSceneMutation).toHaveBeenCalledTimes(1);
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
  });

  it('keeps the pending intent when persistence reports failure', async () => {
    const f = fixture();
    f.persist.mockResolvedValue(false);
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(f.api.setToast).toHaveBeenCalled());
    expect(f.onSceneChanged).toHaveBeenCalledTimes(1);
    expect(f.persist).toHaveBeenCalledTimes(1);
    expect(inbox.ack).not.toHaveBeenCalled();
  });

  it('does not acknowledge a successful save response until durable storage contains the target card', async () => {
    const f = fixture();
    f.persist.mockImplementation(async () => true);
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(f.api.setToast).toHaveBeenCalled());
    expect(f.api.updateScene).toHaveBeenCalledTimes(1);
    expect(inbox.stored).toHaveBeenCalledTimes(2);
    expect(f.getElements().map((item) => item.id)).toEqual(['capture-one']);
    expect(inbox.ack).not.toHaveBeenCalled();
  });

  it('saves through onSceneChanged and verifies durable storage before acknowledging success', async () => {
    const f = fixture();
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('one'));
    expect(f.events).toEqual(['read-durable', 'update', 'on-change', 'persist', 'read-durable', 'ack:one']);
    expect(f.onSceneChanged).toHaveBeenCalledWith(f.getElements(), f.api.getAppState(), f.api.getFiles());
    expect(f.api.scrollToContent).toHaveBeenCalledWith(expect.objectContaining({ id: 'capture-one' }), { animate: true, duration: 260 });
  });

  it('retains a transiently unreadable item without starving a later valid capture', async () => {
    const f = fixture([intent('bad'), intent('good')]);
    f.get.mockImplementation(async (id) => {
      if (id === 'native-bad') throw new Error('Transient bookmark failure');
      return [node('good')];
    });
    f.getTree.mockRejectedValueOnce(new Error('Transient tree failure'));
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('good'));
    expect(inbox.ack).not.toHaveBeenCalledWith('bad');
    expect(f.getElements().map((item) => item.id)).toEqual(['capture-good']);
  });

  it('cancels only the capture whose native bookmark is confirmed absent from a successful tree read', async () => {
    const f = fixture([intent('missing'), intent('good')]);
    f.get.mockImplementation(async (id) => {
      if (id === 'native-missing') throw new Error('Bookmark not found');
      return [node('good')];
    });
    f.getTree.mockResolvedValueOnce([{ id: '0', title: '', children: [node('good')] }]);
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('good'));
    expect(inbox.ack.mock.calls.map(([id]) => id)).toEqual(['missing', 'good']);
    expect(f.persist).toHaveBeenCalledTimes(1);
    expect(f.getElements().map((item) => item.id)).toEqual(['capture-good']);
  });

  it('does not enter the mutation transaction before the exclusive consumer lock callback runs', async () => {
    const f = fixture();
    let enter: (() => Promise<unknown>) | undefined;
    const acquired = deferred<unknown>();
    inbox.lock.mockImplementation((operation: () => Promise<unknown>) => {
      enter = operation;
      return acquired.promise;
    });
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(inbox.lock).toHaveBeenCalledTimes(1));
    expect(inbox.load).not.toHaveBeenCalled();
    expect(f.ensureBaseline).not.toHaveBeenCalled();
    expect(f.runSceneMutation).not.toHaveBeenCalled();
    await act(async () => { await enter!(); acquired.resolve(undefined); });
    expect(inbox.ack).toHaveBeenCalledWith('one');
    expect(f.runSceneMutation).toHaveBeenCalledTimes(1);
  });

  it('coalesces wake events while one consumer owns the lock instead of racing two drain loops', async () => {
    const f = fixture();
    const read = deferred<chrome.bookmarks.BookmarkTreeNode[]>();
    f.get.mockReturnValueOnce(read.promise);
    inbox.load.mockResolvedValueOnce([intent()]).mockResolvedValue([]);
    renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(f.get).toHaveBeenCalledTimes(1));
    act(() => { f.wake(); f.wake(); window.dispatchEvent(new Event('focus')); });
    expect(inbox.lock).toHaveBeenCalledTimes(1);
    await act(async () => { read.resolve([node()]); });
    await waitFor(() => expect(inbox.lock).toHaveBeenCalledTimes(2));
    expect(inbox.ack).toHaveBeenCalledTimes(1);
    expect(f.api.updateScene).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge after unmount while a durable save is still pending', async () => {
    const f = fixture();
    const save = deferred<boolean>();
    f.persist.mockReturnValueOnce(save.promise);
    const hook = renderHook(() => useCanvasCaptureInbox(f.props));
    await waitFor(() => expect(f.persist).toHaveBeenCalledTimes(1));
    hook.unmount();
    f.setDurable(createStoredScene(f.getElements(), f.api.getAppState(), {}));
    await act(async () => { save.resolve(true); });
    expect(inbox.ack).not.toHaveBeenCalled();
    expect(f.api.scrollToContent).not.toHaveBeenCalled();
  });
});
