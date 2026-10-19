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
