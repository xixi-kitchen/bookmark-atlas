import { create } from 'zustand';
import { DEFAULT_SEARCH_ENGINES, type SearchEngine } from '../search';
import { THEMES, type ThemeId } from '../themes';
import type { CardSize, ViewMode } from '../types/ui';

export type PersistedPreferences = {
  viewMode: ViewMode;
  cardSize: CardSize;
  themeId: ThemeId;
  activeEngineId: string;
  engines: SearchEngine[];
};

type PreferencesState = PersistedPreferences & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setViewMode: (viewMode: ViewMode) => void;
  setCardSize: (cardSize: CardSize) => void;
  setThemeId: (themeId: ThemeId) => void;
  setActiveEngineId: (activeEngineId: string) => void;
  setEngines: (engines: SearchEngine[]) => void;
  restorePreferences: (preferences: Partial<PersistedPreferences>) => Promise<void>;
};

const KEY = 'bookmark-atlas:preferences:v1';

const defaults: PersistedPreferences = {
  viewMode: 'canvas',
  cardSize: 'md',
  themeId: 'swiss',
  activeEngineId: 'chrome-default',
  engines: DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine })),
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;

async function readPreferences(): Promise<Partial<PersistedPreferences>> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const result = await chrome.storage.sync.get(KEY);
    return (result[KEY] as Partial<PersistedPreferences> | undefined) ?? {};
  }
  const raw = globalThis.localStorage?.getItem(KEY);
  return raw ? (JSON.parse(raw) as Partial<PersistedPreferences>) : {};
}

async function persist(value: PersistedPreferences) {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    await chrome.storage.sync.set({ [KEY]: value });
  } else {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
  }
}

function sanitizePreferences(saved: Partial<PersistedPreferences>): PersistedPreferences {
  const viewMode = saved.viewMode === 'canvas' ? 'canvas' : 'grid';
  const cardSize = saved.cardSize === 'sm' || saved.cardSize === 'lg' ? saved.cardSize : 'md';
  const themeId = saved.themeId && saved.themeId in THEMES ? saved.themeId : defaults.themeId;
  const savedEngines = Array.isArray(saved.engines) ? saved.engines : [];
  const defaultIds = new Set(DEFAULT_SEARCH_ENGINES.map((engine) => engine.id));
  const engines = [
    ...DEFAULT_SEARCH_ENGINES.map((defaultEngine) => {
      const savedEngine = savedEngines.find((engine) => engine.id === defaultEngine.id);
      return {
        ...defaultEngine,
        ...savedEngine,
        kind: defaultEngine.kind,
        suggestionUrlTemplate: defaultEngine.suggestionUrlTemplate,
        suggestionEncoding: defaultEngine.suggestionEncoding,
      };
    }),
    ...savedEngines.filter((engine) => !defaultIds.has(engine.id)).map(stripCustomSuggestionAccess),
  ];
  const activeEngineId = engines.some((engine) => engine.id === saved.activeEngineId && engine.enabled)
    ? saved.activeEngineId!
    : (engines.find((engine) => engine.enabled)?.id ?? '');

  return { viewMode, cardSize, themeId, activeEngineId, engines };
}

function stripCustomSuggestionAccess(engine: SearchEngine): SearchEngine {
  const { suggestionUrlTemplate: _suggestionUrlTemplate, suggestionEncoding: _suggestionEncoding, ...safeEngine } = engine;
  return safeEngine;
}

export function getPreferencesSnapshot(): PersistedPreferences {
  const { viewMode, cardSize, themeId, activeEngineId, engines } = usePreferencesStore.getState();
  return {
    viewMode,
    cardSize,
    themeId,
    activeEngineId,
    engines: engines.map((engine) => ({ ...engine })),
  };
}

function scheduleSave(state: PreferencesState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { viewMode, cardSize, themeId, activeEngineId, engines } = state;
    void persist({ viewMode, cardSize, themeId, activeEngineId, engines });
  }, 280);
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...defaults,
  hydrated: false,
  hydrate: async () => {
    try {
      const saved = await readPreferences();
      set({ ...sanitizePreferences(saved), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setViewMode: (viewMode) => {
    set({ viewMode });
    scheduleSave({ ...get(), viewMode });
  },
  setCardSize: (cardSize) => {
    set({ cardSize });
    scheduleSave({ ...get(), cardSize });
  },
  setThemeId: (themeId) => {
    set({ themeId });
    scheduleSave({ ...get(), themeId });
  },
  setActiveEngineId: (activeEngineId) => {
    set({ activeEngineId });
    scheduleSave({ ...get(), activeEngineId });
  },
  setEngines: (engines) => {
    const activeEngineId = engines.some((engine) => engine.id === get().activeEngineId && engine.enabled)
      ? get().activeEngineId
      : (engines.find((engine) => engine.enabled)?.id ?? '');
    set({ engines, activeEngineId });
    scheduleSave({ ...get(), engines, activeEngineId });
  },
  restorePreferences: async (preferences) => {
    const restored = sanitizePreferences(preferences);
    set({ ...restored, hydrated: true });
    await persist(restored);
  },
}));
