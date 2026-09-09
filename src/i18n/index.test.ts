import { afterEach, describe, expect, it } from 'vitest';
import enMessages from '../../public/_locales/en/messages.json';
import zhMessages from '../../public/_locales/zh_CN/messages.json';
import { getExcalidrawLanguage, getUiLanguage, t, type MessageKey } from '.';

const originalChrome = globalThis.chrome;

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: originalChrome });
  window.history.replaceState({}, '', '/');
});

describe('Bookmark Atlas i18n', () => {
  it('uses deterministic English fallbacks outside Chrome', () => {
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: undefined });
    expect(t('newChromeBookmark')).toBe('New browser bookmark');
    expect(t('bookmarksCount', '3')).toBe('3 bookmarks');
    expect(getUiLanguage()).toBe('en');
    expect(getExcalidrawLanguage()).toBe('en');
  });

  it('uses Simplified Chinese when Chrome UI language is Chinese', () => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: { i18n: { getMessage: () => '', getUILanguage: () => 'zh-CN' } },
    });
    expect(t('newChromeBookmark')).toBe('新建浏览器书签');
    expect(t('bookmarksCount', '3')).toBe('3 个书签');
    expect(getExcalidrawLanguage()).toBe('zh-CN');
  });

  it('supports a deterministic screenshot-only locale override', () => {
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: undefined });
    window.history.replaceState({}, '', '/?store-screenshot&lang=zh-CN');
    expect(t('searchEngines')).toBe('搜索引擎');
    expect(getUiLanguage()).toBe('zh-CN');
  });

  it('ships every runtime message in both Chrome locale bundles', () => {
    const runtimeKeys = new Set<MessageKey>(Object.keys(enMessages) as MessageKey[]);
    expect(Object.keys(enMessages).length).toBeGreaterThan(250);
    expect(Object.keys(zhMessages)).toEqual(Object.keys(enMessages));
    expect(runtimeKeys.has('syncConflictTitle')).toBe(true);
    expect(enMessages.appName.message).toBe('Bookmark Atlas – Excalidraw New Tab');
    expect(zhMessages.appName.message).toBe('Bookmark Atlas – Excalidraw 书签画布');
  });
});
