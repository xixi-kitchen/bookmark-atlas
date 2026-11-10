import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { EmbedCaptureIntent, EmbedCaptureReceipt } from '../capture/embedCaptureQueue';
import { createStoredScene, type StoredExcalidrawScene } from './sceneStorage';
import { buildCapturedWebEmbedChange } from './capturedWebEmbed';
import { useCanvasEmbedCaptureInbox } from './useCanvasEmbedCaptureInbox';

const inbox = vi.hoisted(() => ({ load: vi.fn(), plan: vi.fn(), ack: vi.fn(), review: vi.fn(), status: vi.fn(), subscribe: vi.fn(), lock: vi.fn(), stored: vi.fn() }));
vi.mock('../capture/embedCaptureQueue', async (original) => ({
  ...await original<typeof import('../capture/embedCaptureQueue')>(),
  loadPendingEmbedCaptures: inbox.load, planEmbedCapture: inbox.plan, ackEmbedCapture: inbox.ack,
  markEmbedCaptureNeedsReview: inbox.review, getEmbedCaptureStatus: inbox.status, subscribePendingEmbedCaptures: inbox.subscribe,
}));
vi.mock('../capture/captureQueue', async (original) => ({ ...await original<typeof import('../capture/captureQueue')>(), withCaptureConsumerLock: inbox.lock }));
vi.mock('./sceneStorage', async (original) => ({ ...await original<typeof import('./sceneStorage')>(), loadStoredScene: inbox.stored }));

const intent = (id = 'one', overrides: Partial<EmbedCaptureIntent> = {}): EmbedCaptureIntent => ({
  id, kind: 'embed', url: `https://example.com/${id}#hash`, title: id, createdAt: 1, saveBookmark: false, phase: 'ready', ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(requests = [intent()]) {
  let pending = requests;
  let elements: readonly ExcalidrawElement[] = [];
  let durable: StoredExcalidrawScene | null = null;
  let allowed = true;
  let state = { zoom: { value: 1 }, selectedElementIds: { old: true }, scrollX: 44, scrollY: 55, viewBackgroundColor: '#ffffff' } as unknown as AppState;
  const files: BinaryFiles = {};
  const receipts = new Map<string, EmbedCaptureReceipt>();
  const events: string[] = [];
  const wakes = new Set<() => void>();
  const stop = vi.fn();
  let lockTail = Promise.resolve<unknown>(undefined);
  inbox.lock.mockImplementation((operation: () => Promise<unknown>) => {
    const next = lockTail.then(operation);
    lockTail = next.catch(() => {});
    return next;
  });
  inbox.load.mockImplementation(async () => pending);
  inbox.plan.mockImplementation(async (id: string, target: EmbedCaptureIntent['target']) => {
    events.push(`plan:${id}`);
    const planned = { ...pending.find((item) => item.id === id)!, phase: 'planned' as const, target };
    pending = pending.map((item) => item.id === id ? planned : item);
    return planned;
  });
  inbox.review.mockImplementation(async (id: string) => {
    events.push(`review:${id}`);
    pending = pending.map((item) => item.id === id ? { ...item, phase: 'needs-review' as const } : item);
  });
  inbox.ack.mockImplementation(async (id: string, result: EmbedCaptureReceipt['result'], targetId: string | null) => {
    events.push(`ack:${id}`);
    receipts.set(id, { id, at: 1, result, targetId });
    pending = pending.filter((item) => item.id !== id);
  });
  inbox.status.mockImplementation(async (id: string) => pending.find((item) => item.id === id) ?? receipts.get(id) ?? null);
  inbox.subscribe.mockImplementation((wake: () => void) => { wakes.add(wake); return () => { wakes.delete(wake); stop(); }; });
  inbox.stored.mockImplementation(async () => { events.push('read-durable'); return durable; });
  const bookmarks = { get: vi.fn(), getTree: vi.fn(), create: vi.fn() };
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn() }, bookmarks });
  const api = {
    getSceneElementsIncludingDeleted: vi.fn(() => elements), getAppState: vi.fn(() => state), getFiles: vi.fn(() => files),
    updateScene: vi.fn((change: { elements?: readonly ExcalidrawElement[]; appState?: Partial<AppState> }) => {
      events.push('update');
      if (change.elements) elements = change.elements;
      if (change.appState) state = { ...state, ...change.appState };
    }), scrollToContent: vi.fn(), setToast: vi.fn(),
  };
  const onSceneChanged = vi.fn(() => { events.push('on-change'); });
  const persist = vi.fn(async () => { events.push('persist'); durable = createStoredScene(elements, state, files); return true; });
  const runSceneMutation = vi.fn(async (operation: () => Promise<unknown>) => operation());
  const canConsume = vi.fn(() => allowed);
  const ensureBaseline = vi.fn(async () => true);
  const props = { api, ready: true, blocked: false, onSceneChanged, persist, canConsume, ensureBaseline,
    runSceneMutation: <T,>(operation: () => Promise<T>) => runSceneMutation(operation) as Promise<T> };
  return {
    props, api, persist, onSceneChanged, runSceneMutation, ensureBaseline, events, bookmarks, receipts, stop,
    getElements: () => elements, getPending: () => pending,
    setElements: (value: readonly ExcalidrawElement[]) => { elements = value; },
    setDurable: (value: StoredExcalidrawScene | null) => { durable = value; },
    saveDurable: () => { durable = createStoredScene(elements, state, files); },
    setAllowed: (value: boolean) => { allowed = value; }, wake: () => { for (const wake of wakes) wake(); },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  window.history.replaceState({}, '', '/');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('canvas web embed inbox', () => {
  it.each([{ ready: false }, { blocked: true }])('waits until the canvas is usable: %j', async (override) => {
    const f = fixture();
    renderHook(() => useCanvasEmbedCaptureInbox({ ...f.props, ...override }));
    await act(async () => {});
    expect(inbox.lock).not.toHaveBeenCalled();
    expect(inbox.subscribe).not.toHaveBeenCalled();
  });
  it('waits for foreground visibility and the remote scene guard', async () => {
    const f = fixture(); f.setAllowed(false);
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.lock).toHaveBeenCalled());
    expect(inbox.load).not.toHaveBeenCalled();
    expect(f.api.updateScene).not.toHaveBeenCalled();
  });
  it('requires baseline alignment and rechecks durable scene inside mutation boundary', async () => {
    const f = fixture(); f.ensureBaseline.mockResolvedValue(false);
    const hook = renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.api.setToast).toHaveBeenCalled());
    expect(inbox.plan).not.toHaveBeenCalled();
    hook.unmount(); f.ensureBaseline.mockResolvedValue(true);
    f.setDurable(createStoredScene([buildCapturedWebEmbedChange([], intent('remote')).target!], f.api.getAppState(), {}));
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.runSceneMutation).toHaveBeenCalled());
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
  });
  it('journals target before mutation, then saves and rereads durability before acknowledgment', async () => {
    const f = fixture();
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('one', 'added', 'embed-capture-one'));
    expect(f.events).toEqual(['read-durable', 'plan:one', 'update', 'on-change', 'persist', 'read-durable', 'ack:one']);
    expect(f.bookmarks.get).not.toHaveBeenCalled();
    expect(f.bookmarks.getTree).not.toHaveBeenCalled();
    expect(f.bookmarks.create).not.toHaveBeenCalled();
    expect(f.api.updateScene.mock.calls[0]![0].appState).toBeUndefined();
    expect(f.api.getAppState()).toMatchObject({ selectedElementIds: { old: true }, scrollX: 44, scrollY: 55 });
    expect(f.api.scrollToContent).not.toHaveBeenCalled();
  });
  it('does not apply a proposal when writing its plan fails', async () => {
    const f = fixture(); inbox.plan.mockRejectedValue(new Error('storage failed'));
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.api.setToast).toHaveBeenCalled());
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
  });
  it('retains the journal on a failed IDB save then acknowledges the same live target on retry', async () => {
    const f = fixture(); f.persist.mockResolvedValueOnce(false);
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.persist).toHaveBeenCalledTimes(1));
    expect(inbox.ack).not.toHaveBeenCalled();
    expect(f.getPending()[0]).toMatchObject({ phase: 'planned', target: { elementId: 'embed-capture-one', mode: 'create' } });
    await act(async () => f.wake());
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('one', 'added', 'embed-capture-one'));
    expect(f.getElements()).toHaveLength(1);
    expect(f.api.updateScene).toHaveBeenCalledTimes(1);
  });
  it('does not ack a save response lacking the target in durable storage', async () => {
    const f = fixture(); f.persist.mockResolvedValue(true);
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.stored).toHaveBeenCalledTimes(2));
    expect(inbox.ack).not.toHaveBeenCalled();
  });
  it('marks a missing target from a previous planned run needs-review without recreation', async () => {
    const f = fixture([intent('one', { phase: 'planned', target: { elementId: 'missing', mode: 'create' } })]);
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.review).toHaveBeenCalledWith('one'));
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
    expect(f.getPending()[0]!.phase).toBe('needs-review');
  });
  it('skips preparing and needs-review records without starving another ready record', async () => {
    const f = fixture([intent('preparing', { phase: 'preparing' }), intent('review', { phase: 'needs-review' }), intent('good')]);
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('good', 'added', 'embed-capture-good'));
    expect(f.getPending().map((item) => item.id)).toEqual(['preparing', 'review']);
    expect(inbox.review).not.toHaveBeenCalled();
  });
  it('retains malformed requests while processing valid later records', async () => {
    const f = fixture([intent('invalid', { url: 'javascript:bad()' }), intent('good')]);
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('good', 'added', 'embed-capture-good'));
    expect(f.getPending().map((item) => item.id)).toEqual(['invalid']);
  });
  it('cancels an undone create target after ack failure without recreating it', async () => {
    const f = fixture(); inbox.ack.mockRejectedValueOnce(new Error('ack failure'));
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledTimes(1));
    f.setElements(f.getElements().map((element) => ({ ...element, isDeleted: true }))); f.saveDurable();
    await act(async () => f.wake());
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('one', 'cancelled', 'embed-capture-one'));
    expect(f.api.updateScene).toHaveBeenCalledTimes(1);
    expect(f.getElements()[0]!.isDeleted).toBe(true);
  });
  it('does not resurrect a reused object removed after ack failure', async () => {
    const f = fixture();
    const reused = { ...buildCapturedWebEmbedChange([], intent()).target!, id: 'manual' };
    f.setElements([reused]); f.saveDurable();
    inbox.ack.mockRejectedValueOnce(new Error('ack failure'));
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.ack).toHaveBeenCalledWith('one', 'existing', 'manual'));
    f.setElements([]); f.saveDurable();
    await act(async () => f.wake());
    await waitFor(() => expect(inbox.review).toHaveBeenCalledWith('one'));
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(f.getElements()).toEqual([]);
  });
  it('rechecks ownership after the plan write before applying its proposed insertion', async () => {
    const f = fixture();
    const plan = inbox.plan.getMockImplementation()!;
    inbox.plan.mockImplementation(async (...args: unknown[]) => { const result = await plan(...args); f.setAllowed(false); return result; });
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.plan).toHaveBeenCalled());
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
  });
  it('serializes two consumers through the same existing lock and adds only once', async () => {
    const f = fixture(); const pause = deferred<boolean>(); f.ensureBaseline.mockReturnValueOnce(pause.promise);
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.lock).toHaveBeenCalledTimes(2));
    expect(inbox.load).toHaveBeenCalledTimes(1);
    await act(async () => pause.resolve(true));
    await waitFor(() => expect(inbox.load).toHaveBeenCalledTimes(2));
    expect(inbox.ack).toHaveBeenCalledTimes(1);
    expect(f.api.updateScene).toHaveBeenCalledTimes(1);
  });
  it('does not ack or reveal after unmount during persistence and cleans subscriptions', async () => {
    window.history.replaceState({}, '', '/?embedCapture=one');
    const f = fixture(); const save = deferred<boolean>(); f.persist.mockReturnValueOnce(save.promise);
    const hook = renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.persist).toHaveBeenCalled());
    hook.unmount(); f.saveDurable();
    await act(async () => save.resolve(true));
    expect(inbox.ack).not.toHaveBeenCalled();
    expect(f.api.scrollToContent).not.toHaveBeenCalled();
    expect(f.stop).toHaveBeenCalledTimes(1);
  });
  it('reveals only the explicit target receipt, even after another page already consumed it', async () => {
    window.history.replaceState({}, '', '/?embedCapture=one');
    const f = fixture([]); const target = buildCapturedWebEmbedChange([], intent()).target!;
    f.setElements([target]); f.saveDurable();
    f.receipts.set('one', { id: 'one', at: 1, result: 'added', targetId: target.id });
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.api.scrollToContent).toHaveBeenCalledWith(target, { animate: true, duration: 260, fitToContent: true, maxZoom: 1, viewportZoomFactor: 0.8 }));
    expect(f.api.getAppState().selectedElementIds).toEqual({ [target.id]: true });
    act(() => f.wake()); await act(async () => {});
    expect(f.api.scrollToContent).toHaveBeenCalledTimes(1);
    expect(inbox.ack).not.toHaveBeenCalled();
  });
  it('does not reveal after the current page stops targeting the requested capture during status lookup', async () => {
    window.history.replaceState({}, '', '/?embedCapture=one');
    const f = fixture([]); const target = buildCapturedWebEmbedChange([], intent()).target!;
    f.setElements([target]); f.saveDurable();
    const status = deferred<EmbedCaptureReceipt>(); inbox.status.mockReturnValueOnce(status.promise);
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.status).toHaveBeenCalledWith('one'));
    window.history.replaceState({}, '', '/?embedCapture=other');
    await act(async () => status.resolve({ id: 'one', at: 1, result: 'added', targetId: target.id }));
    expect(f.api.scrollToContent).not.toHaveBeenCalled();
    expect(f.api.updateScene).not.toHaveBeenCalled();
  });
  it('preserves local edits made while the target plan is being persisted', async () => {
    const f = fixture(); const plan = inbox.plan.getMockImplementation()!;
    const local = buildCapturedWebEmbedChange([], intent('local')).target!;
    inbox.plan.mockImplementation(async (...args: unknown[]) => { const result = await plan(...args); f.setElements([local]); return result; });
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.api.setToast).toHaveBeenCalled());
    expect(f.getElements()).toEqual([local]);
    expect(f.api.updateScene).not.toHaveBeenCalled();
    expect(inbox.ack).not.toHaveBeenCalled();
  });
  it('refuses acknowledgment when the target is undone during a successful durable save', async () => {
    const f = fixture();
    f.persist.mockImplementation(async () => {
      f.saveDurable();
      f.setElements(f.getElements().map((element) => ({ ...element, isDeleted: true })));
      return true;
    });
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.api.setToast).toHaveBeenCalled());
    expect(inbox.ack).not.toHaveBeenCalled();
    expect(f.getPending()[0]!.phase).toBe('planned');
  });
  it('reveals a request consumed here only on its intentional target page', async () => {
    window.history.replaceState({}, '', '/?embedCapture=one');
    const f = fixture(); renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(f.api.scrollToContent).toHaveBeenCalledTimes(1));
    expect(f.api.getAppState().selectedElementIds).toEqual({ 'embed-capture-one': true });
  });
  it.each(['deleted', 'absent', 'cancelled'] as const)('never reveals a %s receipt target', async (scenario) => {
    window.history.replaceState({}, '', '/?embedCapture=one');
    const f = fixture([]); const target = buildCapturedWebEmbedChange([], intent()).target!;
    f.setElements(scenario === 'absent' ? [] : [{ ...target, isDeleted: scenario === 'deleted' }]); f.saveDurable();
    f.receipts.set('one', { id: 'one', at: 1, result: scenario === 'cancelled' ? 'cancelled' : 'added', targetId: target.id });
    renderHook(() => useCanvasEmbedCaptureInbox(f.props));
    await waitFor(() => expect(inbox.status).toHaveBeenCalled());
    expect(f.api.scrollToContent).not.toHaveBeenCalled();
    expect(f.api.updateScene).not.toHaveBeenCalled();
  });
});
