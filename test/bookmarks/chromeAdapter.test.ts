import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChromeBookmarkAdapter } from '../../src/bookmarks/adapter';
import { createDemoBookmarkTree } from '../../src/bookmarks/demoData';

function chromeApi() {
  const tree = createDemoBookmarkTree();
  return {
    getTree: (callback: (nodes: typeof tree) => void) => callback(tree),
    create: vi.fn(),
    update: vi.fn(),
    move: vi.fn(),
    remove: vi.fn((_: string, callback: () => void) => callback()),
    removeTree: vi.fn((_: string, callback: () => void) => callback()),
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

describe('createChromeBookmarkAdapter', () => {
  it('uses remove for bookmarks and removeTree for folders', async () => {
    const api = chromeApi();
    const adapter = createChromeBookmarkAdapter(api);

    await adapter.removeTree('11');
    await adapter.removeTree('10');

    expect(api.remove).toHaveBeenCalledWith('11', expect.any(Function));
    expect(api.removeTree).toHaveBeenCalledWith('10', expect.any(Function));
  });

  it('propagates chrome.runtime.lastError from callbacks', async () => {
    const api = chromeApi();
    Object.defineProperty(globalThis, 'chrome', {
      value: { runtime: { lastError: { message: 'profile is locked' } } },
      configurable: true,
    });
    const adapter = createChromeBookmarkAdapter(api);

    await expect(adapter.getTree()).rejects.toThrow('profile is locked');
  });

  it('passes the exact parent and index to Chrome when reordering', async () => {
    const api = chromeApi();
    api.move.mockImplementation((id, destination, callback) => callback({
      id,
      parentId: destination.parentId,
      index: destination.index,
      title: 'Chrome Extensions Docs',
      url: 'https://developer.chrome.com/docs/extensions',
    }));
    const adapter = createChromeBookmarkAdapter(api);

    await adapter.move('100', { parentId: '10', index: 1 });

    expect(api.move).toHaveBeenCalledWith('100', { parentId: '10', index: 1 }, expect.any(Function));
  });
});
