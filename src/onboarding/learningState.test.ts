import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEARNING_PROGRESS_STORAGE_KEY, advanceLearning, beginAIConfiguration, pauseLearning, readLearningProgress,
  resumeLearning, startLearning, subscribeLearningProgress,
} from './learningState';

describe('durable learning progress', () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal('chrome', undefined); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('starts chapters at real tasks and ignores irrelevant, out-of-order and absent-course events', async () => {
    expect(await advanceLearning({ type: 'bookmark-added' })).toBeNull();
    expect(await startLearning('basics')).toMatchObject({ chapter: 'basics', step: 'import', status: 'active', completed: [] });
    await advanceLearning({ type: 'layout-applied' });
    await advanceLearning({ type: 'capture-saved' });
    expect((await readLearningProgress())?.step).toBe('import');
    expect((await advanceLearning({ type: 'bookmark-added', count: 3 }))?.step).toBe('open');
    expect((await advanceLearning({ type: 'bookmark-added' }))?.step).toBe('open');
  });

  it('earns basics in order and needs a real multi-selection and layout application', async () => {
    await startLearning('basics');
    for (const type of ['bookmark-added', 'bookmark-opened', 'bookmark-moved'] as const) await advanceLearning({ type });
    await advanceLearning({ type: 'bookmarks-selected', count: 1 });
    expect((await readLearningProgress())?.step).toBe('select');
    await advanceLearning({ type: 'bookmarks-selected', count: 2 });
    await advanceLearning({ type: 'presentation-changed' });
    await advanceLearning({ type: 'layout-previewed' });
    expect((await readLearningProgress())?.status).toBe('active');
    expect(await advanceLearning({ type: 'layout-applied' })).toEqual({
      chapter: 'basics', step: 'basics-done', status: 'completed',
      completed: ['import', 'open', 'move', 'select', 'presentation', 'layout', 'layout-apply'], completedChapters: ['basics'],
    });
  });

  it('pauses without completing and resumes durable progress', async () => {
    await startLearning('basics');
    await pauseLearning();
    await advanceLearning({ type: 'bookmark-added' });
    expect(await readLearningProgress()).toMatchObject({ status: 'paused', step: 'import', completedChapters: [] });
    await resumeLearning();
    expect((await advanceLearning({ type: 'bookmark-added' }))?.step).toBe('open');
  });

  it('only capture success earns capture and replay preserves all completed chapters', async () => {
    await startLearning('capture');
    await advanceLearning({ type: 'bookmark-added' });
    expect((await readLearningProgress())?.status).toBe('active');
    await advanceLearning({ type: 'capture-saved' });
    expect(await resumeLearning()).toMatchObject({ status: 'completed', completedChapters: ['capture'] });
    expect(await startLearning('ai')).toMatchObject({ step: 'ai-start', completed: [], completedChapters: ['capture'] });
    expect(await startLearning('capture')).toMatchObject({ status: 'active', step: 'capture', completedChapters: ['capture'] });
  });

  it('requires settings success, preview and application for the new AI path', async () => {
    await startLearning('ai');
    await advanceLearning({ type: 'ai-applied' });
    expect((await readLearningProgress())?.step).toBe('ai-start');
    expect((await advanceLearning({ type: 'ai-settings-saved' }))?.step).toBe('ai-request');
    expect((await advanceLearning({ type: 'ai-previewed' }))?.step).toBe('ai-preview');
    expect(await advanceLearning({ type: 'ai-applied' })).toMatchObject({ step: 'ai-done', status: 'completed', completedChapters: ['ai'] });
  });

  it('enters AI configuration without earning tasks and only earns settings after a successful save', async () => {
    await startLearning('capture');
    await advanceLearning({ type: 'capture-saved' });
    await startLearning('ai');
    expect(await beginAIConfiguration()).toEqual({
      chapter: 'ai', step: 'ai-settings', completed: [], completedChapters: ['capture'], status: 'active',
    });
    expect(await readLearningProgress()).toMatchObject({ step: 'ai-settings', completed: [] });
    expect(await advanceLearning({ type: 'ai-settings-saved' })).toMatchObject({
      step: 'ai-request', completed: ['ai-settings'], completedChapters: ['capture'], status: 'active',
    });
  });

  it('accepts a real preview after configuration is opened without saving existing valid settings', async () => {
    await startLearning('ai');
    await beginAIConfiguration();
    expect(await advanceLearning({ type: 'ai-previewed' })).toEqual({
      chapter: 'ai', step: 'ai-preview', completed: [], completedChapters: [], status: 'active',
    });
    expect(await readLearningProgress()).toMatchObject({ step: 'ai-preview', completed: [] });
    expect(await advanceLearning({ type: 'ai-applied' })).toEqual({
      chapter: 'ai', step: 'ai-done', completed: ['ai-preview'], completedChapters: ['ai'], status: 'completed',
    });
    expect(await readLearningProgress()).toMatchObject({ step: 'ai-done', completed: ['ai-preview'] });
  });

  it('does not earn configuration or AI completion from opening settings without real preview success', async () => {
    await startLearning('ai');
    await beginAIConfiguration();
    await advanceLearning({ type: 'ai-applied' });
    await advanceLearning({ type: 'ai-previewed', demo: true } as never);
    await advanceLearning({ type: 'presentation-changed' });
    expect(await readLearningProgress()).toEqual({
      chapter: 'ai', step: 'ai-settings', completed: [], completedChapters: [], status: 'active',
    });
  });

  it('keeps absent, other, paused and already advanced courses unchanged when opening AI configuration', async () => {
    expect(await beginAIConfiguration()).toBeNull();
    const basics = await startLearning('basics');
    expect(await beginAIConfiguration()).toEqual(basics);
    await startLearning('ai');
    const paused = await pauseLearning();
    expect(await beginAIConfiguration()).toEqual(paused);
    await resumeLearning();
    await advanceLearning({ type: 'ai-settings-saved' });
    const requested = await readLearningProgress();
    expect(await beginAIConfiguration()).toEqual(requested);
    await advanceLearning({ type: 'ai-previewed' });
    const completed = await advanceLearning({ type: 'ai-applied' });
    expect(await beginAIConfiguration()).toEqual(completed);
  });

  it('accepts actual AI preview with existing configuration and stored ai-settings step', async () => {
    await startLearning('ai');
    expect((await advanceLearning({ type: 'ai-previewed' }))?.step).toBe('ai-preview');
    localStorage.setItem(LEARNING_PROGRESS_STORAGE_KEY, JSON.stringify({ chapter: 'ai', step: 'ai-settings', completed: [], completedChapters: [], status: 'active' }));
    expect((await advanceLearning({ type: 'ai-settings-saved' }))?.step).toBe('ai-request');
  });

  it.each([
    'bad json', 'null', '[]', '{"chapter":"basics","step":"ai-start","completed":[],"completedChapters":[],"status":"active"}',
    '{"chapter":"capture","step":"capture","completed":[],"completedChapters":[],"status":"completed"}',
    '{"chapter":"basics","step":"import","completed":["ai-done"],"completedChapters":[],"status":"active"}',
  ])('treats malformed progress as absent: %s', async (raw) => {
    localStorage.setItem(LEARNING_PROGRESS_STORAGE_KEY, raw);
    expect(await readLearningProgress()).toBeNull();
  });

  it('serializes delayed writes so consecutive real events cannot overwrite earned progress', async () => {
    const memory = new Map<string, unknown>();
    vi.stubGlobal('chrome', { storage: { local: {
      get: async (key: string) => ({ [key]: structuredClone(memory.get(key)) }),
      set: async (items: Record<string, unknown>) => { await new Promise((resolve) => setTimeout(resolve, 2)); Object.entries(items).forEach(([key, value]) => memory.set(key, structuredClone(value))); },
    } } });
    await startLearning('basics');
    await Promise.all([advanceLearning({ type: 'bookmark-added' }), advanceLearning({ type: 'bookmark-opened' })]);
    expect(await readLearningProgress()).toMatchObject({ step: 'move', completed: ['import', 'open'] });
  });

  it('uses an origin lock for cross-document mutations when available', async () => {
    const requests: string[] = [];
    vi.stubGlobal('navigator', { locks: { request: async (name: string, run: () => Promise<unknown>) => { requests.push(name); return run(); } } });
    await startLearning('capture');
    await advanceLearning({ type: 'capture-saved' });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toBe(requests[1]);
    expect((await readLearningProgress())?.status).toBe('completed');
  });

  it('retains earned chapters across competing document module instances under Web Locks', async () => {
    let lockQueue: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', { locks: { request: (_name: string, run: () => Promise<unknown>) => {
      const result = lockQueue.then(run, run); lockQueue = result.catch(() => undefined); return result;
    } } });
    vi.resetModules();
    const anotherDocument = await import('./learningState');
    await startLearning('capture');
    await Promise.all([advanceLearning({ type: 'capture-saved' }), anotherDocument.startLearning('ai')]);
    expect(await readLearningProgress()).toMatchObject({ chapter: 'ai', status: 'active', completedChapters: ['capture'] });
  });

  it('does not downgrade completed chapters when pause is called', async () => {
    await startLearning('capture');
    await advanceLearning({ type: 'capture-saved' });
    expect(await pauseLearning()).toMatchObject({ status: 'completed', completedChapters: ['capture'] });
  });

  it('rejects impossible future, reordered and incomplete completed task lists', async () => {
    const invalid = [
      { chapter: 'basics', step: 'import', completed: ['open'], completedChapters: [], status: 'active' },
      { chapter: 'basics', step: 'move', completed: ['open', 'import'], completedChapters: [], status: 'active' },
      { chapter: 'basics', step: 'basics-done', completed: [], completedChapters: ['basics'], status: 'completed' },
    ];
    for (const state of invalid) {
      localStorage.setItem(LEARNING_PROGRESS_STORAGE_KEY, JSON.stringify(state));
      expect(await readLearningProgress()).toBeNull();
    }
  });

  it('does not consume demo, private payloads or bogus counts through the direct mutation API', async () => {
    await startLearning('ai');
    await advanceLearning({ type: 'ai-previewed', demo: true } as never);
    await advanceLearning({ type: 'ai-settings-saved', apiKey: 'secret' } as never);
    await advanceLearning({ type: 'ai-previewed', count: 0 });
    expect(await readLearningProgress()).toMatchObject({ step: 'ai-start', completed: [], completedChapters: [] });
  });

  it('surfaces failed writes, does not notify fabricated completion and recovers its queue', async () => {
    await startLearning('capture');
    const listener = vi.fn();
    const unsubscribe = subscribeLearningProgress(listener);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(advanceLearning({ type: 'capture-saved' })).rejects.toThrow('quota');
    expect((await readLearningProgress())?.status).toBe('active');
    expect(listener).not.toHaveBeenCalled();
    spy.mockRestore();
    await advanceLearning({ type: 'capture-saved' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('surfaces inaccessible storage rather than inventing an empty or saved course', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    await expect(readLearningProgress()).rejects.toThrow('blocked');
    await expect(startLearning('basics')).rejects.toThrow('blocked');
  });

  it('notifies same document with Chrome storage and other local documents, then unsubscribes', async () => {
    const handlers = new Set<(changes: Record<string, unknown>, area: string) => void>();
    const memory = new Map<string, unknown>();
    vi.stubGlobal('chrome', { storage: { local: {
      get: async (key: string) => ({ [key]: memory.get(key) }),
      set: async (items: Record<string, unknown>) => { Object.entries(items).forEach(([key, value]) => memory.set(key, value)); },
    }, onChanged: { addListener: (handler: typeof handlers extends Set<infer H> ? H : never) => handlers.add(handler), removeListener: (handler: typeof handlers extends Set<infer H> ? H : never) => handlers.delete(handler) } } });
    const listener = vi.fn(); const unsubscribe = subscribeLearningProgress(listener);
    await startLearning('capture');
    handlers.forEach((handler) => handler({ unrelated: {} }, 'local'));
    handlers.forEach((handler) => handler({ [LEARNING_PROGRESS_STORAGE_KEY]: {} }, 'sync'));
    handlers.forEach((handler) => handler({ [LEARNING_PROGRESS_STORAGE_KEY]: {} }, 'local'));
    window.dispatchEvent(new StorageEvent('storage', { key: LEARNING_PROGRESS_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: LEARNING_PROGRESS_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(3);
    expect(handlers.size).toBe(0);
  });
});
