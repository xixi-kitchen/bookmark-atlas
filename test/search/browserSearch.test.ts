import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateBrowserSearchResult, searchLocalBrowserContent } from '../../src/search/browserSearch';

const originalChrome = globalThis.chrome;

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', { value: originalChrome, configurable: true });
});

describe('unified browser search', () => {
  it('searches tabs, bookmarks, and history while deduplicating URLs by priority', async () => {
    installChrome({
      tabs: {
        query: vi.fn(async () => [{ id: 7, windowId: 2, active: true, title: 'Example', url: 'https://example.com/' }]),
      },
      bookmarks: {
        search: vi.fn(async () => [
          { id: 'same', title: 'Example bookmark', url: 'https://example.com/' },
          { id: 'docs', title: 'Example docs', url: 'https://docs.example.com/' },
        ]),
      },
      history: {
        search: vi.fn(async () => [
          { title: 'Docs history', url: 'https://docs.example.com/' },
          { title: 'Example guide', url: 'https://guide.example.com/' },
        ]),
      },
    });

    const result = await searchLocalBrowserContent('example');

    expect(result.tabs.map((item) => item.title)).toEqual(['Example']);
    expect(result.bookmarks.map((item) => item.title)).toEqual(['Example docs']);
    expect(result.history.map((item) => item.title)).toEqual(['Example guide']);
  });

  it('activates an existing tab and focuses its window', async () => {
    const updateTab = vi.fn(async () => ({}));
    const updateWindow = vi.fn(async () => ({}));
    installChrome({ tabs: { update: updateTab }, windows: { update: updateWindow } });

    const activated = await activateBrowserSearchResult({
      id: 'tab:7', kind: 'tab', title: 'Example', url: 'https://example.com', subtitle: 'example.com', tabId: 7, windowId: 2,
    });

    expect(activated).toBe(true);
    expect(updateTab).toHaveBeenCalledWith(7, { active: true });
    expect(updateWindow).toHaveBeenCalledWith(2, { focused: true });
  });
});

function installChrome(value: Record<string, unknown>) {
  Object.defineProperty(globalThis, 'chrome', { value, configurable: true });
}
