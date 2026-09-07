import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_ENGINES } from '../../src/search';
import { listenForPreferenceSyncChanges, usePreferencesStore } from '../../src/store/preferencesStore';

const KEY = 'bookmark-atlas:preferences:v1';

describe('preferences store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    usePreferencesStore.setState({
      viewMode: 'canvas',
      cardSize: 'md',
      themeId: 'swiss',
      activeEngineId: 'baidu',
      engines: DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine })),
      hydrated: false,
    });
  });

  it('hydrates saved partial preferences over safe defaults', async () => {
    localStorage.setItem(KEY, JSON.stringify({ viewMode: 'grid', themeId: 'pixel' }));
    await usePreferencesStore.getState().hydrate();

    expect(usePreferencesStore.getState()).toMatchObject({ viewMode: 'grid', themeId: 'pixel', cardSize: 'md', hydrated: true });
    expect(usePreferencesStore.getState().engines).toHaveLength(4);
  });

  it('falls back to the first enabled engine and persists the change', async () => {
    const engines = usePreferencesStore.getState().engines.map((engine) =>
      engine.id === 'baidu' ? { ...engine, enabled: false } : engine,
    );
    usePreferencesStore.getState().setEngines(engines);
    await vi.runAllTimersAsync();

    expect(usePreferencesStore.getState().activeEngineId).toBe('chrome-default');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ activeEngineId: 'chrome-default' });
  });

  it('migrates the removed list view to the grid view', async () => {
    localStorage.setItem(KEY, JSON.stringify({ viewMode: 'list' }));
    await usePreferencesStore.getState().hydrate();

    expect(usePreferencesStore.getState().viewMode).toBe('grid');
  });

  it('adds Chrome default search and removes arbitrary custom suggestion access during migration', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      activeEngineId: 'custom',
      engines: [{
        id: 'custom', name: 'Custom', queryUrlTemplate: 'https://example.com?q={query}',
        suggestionUrlTemplate: 'https://example.com/suggest?q={query}', enabled: true,
      }],
    }));

    await usePreferencesStore.getState().hydrate();

    expect(usePreferencesStore.getState().engines[0]).toMatchObject({ id: 'chrome-default', kind: 'chrome-default' });
    expect(usePreferencesStore.getState().engines.find((engine) => engine.id === 'custom')).not.toHaveProperty('suggestionUrlTemplate');
  });

  it('applies preference changes from another tab or synced device without reloading', async () => {
    const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();
    const previousChrome = globalThis.chrome;
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        ...previousChrome,
        storage: {
          sync: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => undefined),
          },
          onChanged: {
            addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => listeners.add(listener),
            removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => listeners.delete(listener),
          },
        },
      },
    });

    try {
      await usePreferencesStore.getState().hydrate();
      const stop = listenForPreferenceSyncChanges();
      listeners.forEach((listener) => listener({
        [KEY]: { newValue: { viewMode: 'grid', cardSize: 'lg', themeId: 'pixel' } },
      }, 'sync'));

      expect(usePreferencesStore.getState()).toMatchObject({
        viewMode: 'grid',
        cardSize: 'lg',
        themeId: 'pixel',
        hydrated: true,
      });
      stop();
    } finally {
      Object.defineProperty(globalThis, 'chrome', { configurable: true, value: previousChrome });
    }
  });

  it('merges a remote preference update with a pending local field change', async () => {
    const values: Record<string, unknown> = {};
    const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();
    const previousChrome = globalThis.chrome;
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        ...previousChrome,
        storage: {
          sync: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async (next: Record<string, unknown>) => { Object.assign(values, next); }),
          },
          onChanged: {
            addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => listeners.add(listener),
            removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => listeners.delete(listener),
          },
        },
      },
    });

    try {
      await usePreferencesStore.getState().hydrate();
      const stop = listenForPreferenceSyncChanges();
      usePreferencesStore.getState().setCardSize('lg');
      listeners.forEach((listener) => listener({
        [KEY]: { newValue: { cardSize: 'md', themeId: 'pixel' } },
      }, 'sync'));

      expect(usePreferencesStore.getState()).toMatchObject({ cardSize: 'lg', themeId: 'pixel' });
      await vi.runAllTimersAsync();
      expect(values[KEY]).toMatchObject({ cardSize: 'lg', themeId: 'pixel' });
      stop();
    } finally {
      Object.defineProperty(globalThis, 'chrome', { configurable: true, value: previousChrome });
    }
  });
});
