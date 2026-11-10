// Navigation is a device-local UI choice, intentionally separate from shared preferences and backups.
export const CAPTURE_OPEN_AFTER_SAVE_KEY = 'bookmark-atlas:capture-open-after-save:v1';

export async function loadCaptureOpenAfterSave(): Promise<boolean> {
  const values = await chrome.storage.local.get(CAPTURE_OPEN_AFTER_SAVE_KEY);
  const saved = values[CAPTURE_OPEN_AFTER_SAVE_KEY];
  return typeof saved === 'boolean' ? saved : true;
}

export async function saveCaptureOpenAfterSave(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [CAPTURE_OPEN_AFTER_SAVE_KEY]: value });
}

export type CaptureMode = 'bookmark' | 'embed';
export interface CaptureOptions { mode: CaptureMode; saveBookmark: boolean }
export const CAPTURE_OPTIONS_KEY = 'bookmark-atlas:capture-options:v1';

export async function loadCaptureOptions(): Promise<CaptureOptions> {
  const values = await chrome.storage.local.get(CAPTURE_OPTIONS_KEY);
  const value = values[CAPTURE_OPTIONS_KEY];
  const options = value && typeof value === 'object' ? value as Partial<CaptureOptions> : {};
  return { mode: options.mode === 'embed' ? 'embed' : 'bookmark', saveBookmark: typeof options.saveBookmark === 'boolean' ? options.saveBookmark : true };
}

export async function saveCaptureOptions(options: CaptureOptions): Promise<void> {
  await chrome.storage.local.set({ [CAPTURE_OPTIONS_KEY]: { mode: options.mode, saveBookmark: options.saveBookmark } });
}
