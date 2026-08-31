import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles, LibraryItems } from '@excalidraw/excalidraw/types';

export type StoredExcalidrawScene = {
  version: 2;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  libraryItems: LibraryItems;
  savedAt: number;
};

type LegacyStoredExcalidrawScene = Omit<StoredExcalidrawScene, 'version' | 'libraryItems'> & {
  version: 1;
};

const DATABASE_NAME = 'bookmark-atlas';
const DATABASE_VERSION = 1;
const STORE_NAME = 'excalidraw-scenes';
const SCENE_KEY = 'main';
const FALLBACK_KEY = 'bookmark-atlas:excalidraw-scene:v1';

const PERSISTED_APP_STATE_KEYS = [
  'zenModeEnabled',
  'gridModeEnabled',
  'objectsSnapModeEnabled',
  'theme',
  'name',
  'exportBackground',
  'exportEmbedScene',
  'exportWithDarkMode',
  'exportScale',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
  'currentItemRoundness',
  'viewBackgroundColor',
  'scrollX',
  'scrollY',
  'zoom',
  'openSidebar',
  'defaultSidebarDockedPreference',
  'gridSize',
  'gridStep',
] as const satisfies readonly (keyof AppState)[];

let writeQueue: Promise<void> = Promise.resolve();

export function createStoredScene(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
  libraryItems: LibraryItems = [],
): StoredExcalidrawScene {
  return {
    version: 2,
    elements,
    appState: pickPersistedAppState(appState),
    files,
    libraryItems,
    savedAt: Date.now(),
  };
}

export function pickPersistedAppState(appState: AppState): Partial<AppState> {
  const persisted: Partial<AppState> = {};
  const writable = persisted as Record<string, unknown>;

  for (const key of PERSISTED_APP_STATE_KEYS) {
    const value = appState[key];
    if (value !== undefined) writable[key] = value;
  }

  return persisted;
}

export async function loadStoredScene(): Promise<StoredExcalidrawScene | null> {
  try {
    const database = await openDatabase();
    const scene = await new Promise<StoredExcalidrawScene | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(SCENE_KEY);
      request.onsuccess = () => resolve(request.result as StoredExcalidrawScene | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return normalizeStoredScene(scene);
  } catch {
    return loadFallbackScene();
  }
}

export function saveStoredScene(scene: StoredExcalidrawScene): Promise<void> {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const database = await openDatabase();
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, 'readwrite');
          transaction.objectStore(STORE_NAME).put(scene, SCENE_KEY);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        database.close();
      } catch {
        await saveFallbackScene(scene);
      }
    });

  return writeQueue;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable.'));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('The canvas database is blocked.'));
  });
}

async function loadFallbackScene(): Promise<StoredExcalidrawScene | null> {
  try {
    if (globalThis.chrome?.storage?.local) {
      const result = await chrome.storage.local.get(FALLBACK_KEY);
      return normalizeStoredScene(result[FALLBACK_KEY]);
    }

    const raw = globalThis.localStorage?.getItem(FALLBACK_KEY);
    return normalizeStoredScene(raw ? JSON.parse(raw) : undefined);
  } catch {
    return null;
  }
}

async function saveFallbackScene(scene: StoredExcalidrawScene): Promise<void> {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [FALLBACK_KEY]: scene });
    return;
  }

  globalThis.localStorage?.setItem(FALLBACK_KEY, JSON.stringify(scene));
}

export function normalizeStoredScene(value: unknown): StoredExcalidrawScene | null {
  if (!value || typeof value !== 'object') return null;
  const scene = value as Partial<StoredExcalidrawScene | LegacyStoredExcalidrawScene>;
  if (
    (scene.version !== 1 && scene.version !== 2)
    || !Array.isArray(scene.elements)
    || !scene.appState
    || !scene.files
  ) return null;

  return {
    version: 2,
    elements: scene.elements,
    appState: scene.appState,
    files: scene.files,
    libraryItems: scene.version === 2 && Array.isArray(scene.libraryItems) ? scene.libraryItems : [],
    savedAt: typeof scene.savedAt === 'number' ? scene.savedAt : Date.now(),
  };
}
