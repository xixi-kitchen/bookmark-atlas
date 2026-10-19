export type LanguagePreference = 'auto' | 'en' | 'zh-CN';
export const LANGUAGE_PREFERENCE_KEY = 'bookmark-atlas:ui-language:v1';

let preference: LanguagePreference = 'auto';
let confirmedPreference: LanguagePreference = 'auto';
let revision = 0;
let externalRevision = 0;
let initialization: Promise<void> | undefined;
let writes: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
let stopStorageListener: (() => void) | undefined;

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || value === 'en' || value === 'zh-CN';
}

export function getLanguagePreference() { return preference; }

function publish(value: LanguagePreference) {
  if (preference === value) return;
  preference = value;
  for (const listener of listeners) listener();
}

export function initializeLanguagePreference(): Promise<void> {
  if (initialization) return initialization;
  const startingRevision = revision;
  initialization = (async () => {
    try {
      const local = globalThis.chrome?.storage?.local;
      const value = local ? (await local.get(LANGUAGE_PREFERENCE_KEY))[LANGUAGE_PREFERENCE_KEY]
        : globalThis.localStorage?.getItem(LANGUAGE_PREFERENCE_KEY);
      if (revision !== startingRevision) return;
      confirmedPreference = isLanguagePreference(value) ? value : 'auto';
      publish(confirmedPreference);
    } catch { /* Keep browser language if local settings cannot be read. */ }
  })();
  return initialization;
}

export function setLanguagePreference(value: LanguagePreference): Promise<void> {
  if (!isLanguagePreference(value)) return Promise.reject(new Error('invalid_language'));
  const currentRevision = ++revision;
  const operation = writes.catch(() => undefined).then(async () => {
    const externalRevisionAtWrite = externalRevision;
    try {
      const local = globalThis.chrome?.storage?.local;
      if (local) await local.set({ [LANGUAGE_PREFERENCE_KEY]: value });
      else {
        if (!globalThis.localStorage) throw new Error('storage_unavailable');
        localStorage.setItem(LANGUAGE_PREFERENCE_KEY, value);
      }
      if (externalRevision === externalRevisionAtWrite) confirmedPreference = value;
      if (revision === currentRevision) publish(value);
    } catch {
      if (revision === currentRevision) publish(confirmedPreference);
      throw new Error('language_save_failed');
    }
  });
  writes = operation;
  return operation;
}

export function subscribeLanguagePreference(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopStorageListener) {
    const changed = (value: unknown) => {
      revision += 1;
      externalRevision += 1;
      confirmedPreference = isLanguagePreference(value) ? value : 'auto';
      publish(confirmedPreference);
    };
    const event = globalThis.chrome?.storage?.onChanged;
    const onChromeChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && Object.hasOwn(changes, LANGUAGE_PREFERENCE_KEY)) changed(changes[LANGUAGE_PREFERENCE_KEY]?.newValue);
    };
    const onWindowStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_PREFERENCE_KEY || event.key === null) changed(event.newValue);
    };
    event?.addListener(onChromeChange);
    if (typeof window !== 'undefined') window.addEventListener('storage', onWindowStorage);
    stopStorageListener = () => {
      event?.removeListener(onChromeChange);
      if (typeof window !== 'undefined') window.removeEventListener('storage', onWindowStorage);
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { stopStorageListener?.(); stopStorageListener = undefined; }
  };
}
