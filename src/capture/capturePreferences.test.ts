import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_OPEN_AFTER_SAVE_KEY, loadCaptureOpenAfterSave, saveCaptureOpenAfterSave } from './capturePreferences';

beforeEach(() => {
  vi.stubGlobal('chrome', { storage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    sync: { set: vi.fn() },
  } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('local capture navigation preference', () => {
  it('defaults to opening for absent or malformed values', async () => {
    expect(await loadCaptureOpenAfterSave()).toBe(true);
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(async () => ({ [CAPTURE_OPEN_AFTER_SAVE_KEY]: 'false' }) as never);
    expect(await loadCaptureOpenAfterSave()).toBe(true);
  });
  it('reads and stores only a boolean under an isolated local key', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(async () => ({ [CAPTURE_OPEN_AFTER_SAVE_KEY]: false }) as never);
    expect(await loadCaptureOpenAfterSave()).toBe(false);
    await saveCaptureOpenAfterSave(false);
    expect(chrome.storage.local.set).toHaveBeenCalledOnce();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [CAPTURE_OPEN_AFTER_SAVE_KEY]: false });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
  it('surfaces read and save failures so the popup cannot silently use stale navigation settings', async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('read'));
    await expect(loadCaptureOpenAfterSave()).rejects.toThrow('read');
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('write'));
    await expect(saveCaptureOpenAfterSave(false)).rejects.toThrow('write');
  });
});
