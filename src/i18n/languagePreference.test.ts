import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('local interface language preference', () => {
  it('loads only local language settings and preserves the browser default for new users', async () => {
    const get = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', { storage: { local: { get } } });
    const language = await import('./languagePreference');
    await language.initializeLanguagePreference();
    expect(language.getLanguagePreference()).toBe('auto');
    expect(get).toHaveBeenCalledWith(language.LANGUAGE_PREFERENCE_KEY);
  });
  it('persists an explicit choice only locally, and rejects invalid language values', async () => {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', { storage: { local: { set } }, i18n: { getUILanguage: () => 'en-US' } });
    const language = await import('./languagePreference');
    await language.setLanguagePreference('zh-CN');
    expect(language.getLanguagePreference()).toBe('zh-CN');
    expect(set).toHaveBeenCalledWith({ [language.LANGUAGE_PREFERENCE_KEY]: 'zh-CN' });
    await expect(language.setLanguagePreference('bad' as 'en')).rejects.toThrow();
    expect(set).toHaveBeenCalledTimes(1);
  });
  it('does not allow a late startup read to override a newer user choice', async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(() => new Promise((resolve) => { finish = resolve; })), set: vi.fn(async () => undefined) } } });
    const language = await import('./languagePreference');
    const loading = language.initializeLanguagePreference();
    await language.setLanguagePreference('zh-CN');
    finish({ [language.LANGUAGE_PREFERENCE_KEY]: 'en' });
    await loading;
    expect(language.getLanguagePreference()).toBe('zh-CN');
  });
  it('serializes rapid saves and restores the last confirmed preference on failure', async () => {
    const set = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('private details'));
    vi.stubGlobal('chrome', { storage: { local: { set } } });
    const language = await import('./languagePreference');
    const first = language.setLanguagePreference('zh-CN');
    const second = language.setLanguagePreference('en');
    await first;
    await expect(second).rejects.toThrow('language_save_failed');
    expect(language.getLanguagePreference()).toBe('zh-CN');
  });
  it('listens only for valid local changes and removes its listeners when unused', async () => {
    let onChange!: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
    const addListener = vi.fn((callback) => { onChange = callback; }), removeListener = vi.fn();
    vi.stubGlobal('chrome', { storage: { onChanged: { addListener, removeListener } } });
    const language = await import('./languagePreference');
    const listener = vi.fn();
    const unsubscribe = language.subscribeLanguagePreference(listener);
    onChange({ [language.LANGUAGE_PREFERENCE_KEY]: { newValue: 'zh-CN' } }, 'sync');
    expect(listener).not.toHaveBeenCalled();
    onChange({ [language.LANGUAGE_PREFERENCE_KEY]: { newValue: 'zh-CN' } }, 'local');
    expect(language.getLanguagePreference()).toBe('zh-CN');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(onChange);
  });
  it('does not roll back to a late save after another page confirmed a newer preference', async () => {
    let onChange!: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
    let finish!: () => void;
    const set = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockRejectedValueOnce(new Error('storage failure'));
    vi.stubGlobal('chrome', { storage: { local: { set }, onChanged: { addListener: (callback: typeof onChange) => { onChange = callback; }, removeListener: vi.fn() } } });
    const language = await import('./languagePreference');
    const stop = language.subscribeLanguagePreference(vi.fn());
    const pending = language.setLanguagePreference('en');
    await Promise.resolve(); await Promise.resolve();
    onChange({ [language.LANGUAGE_PREFERENCE_KEY]: { newValue: 'zh-CN' } }, 'local');
    finish(); await pending;
    await expect(language.setLanguagePreference('auto')).rejects.toThrow('language_save_failed');
    expect(language.getLanguagePreference()).toBe('zh-CN');
    stop();
  });
});
