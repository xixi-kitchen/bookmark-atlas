import { describe, expect, it, vi } from 'vitest';
import { createCaptureMessageHandler, type CaptureRuntime } from './captureBackground';
import { CAPTURE_MESSAGE_CHANNEL, MAX_PENDING_CAPTURES, parseCaptureQueue, type CaptureAcknowledgement, type CaptureIntent } from './captureQueue';

const popup = { id: 'atlas', url: 'chrome-extension://atlas/popup.html' };
const canvas = { id: 'atlas', url: 'chrome-extension://atlas/newtab.html?capture=example' };
const message = (action: string, payload = {}) => ({ channel: CAPTURE_MESSAGE_CHANNEL, action, ...payload });
const makeIntent = (id: string): CaptureIntent => ({ id, bookmarkId: id, title: id, url: `https://example.com/${id}`, folderPath: 'Other bookmarks / Bookmark Atlas', createdAt: 1_000 });

function fixture(initial?: unknown) {
  let stored = initial;
  let sequence = 0;
  type Node = { id: string; parentId?: string; title: string; url?: string; folderType?: string; children?: Node[] };
  const tree: Node[] = [{ id: '0', title: '', children: [
    { id: '1', title: 'Bookmarks bar', children: [] },
    { id: '2', title: 'Other bookmarks', children: [] },
  ] }];
  const tabs = new Map([
    [5, { id: 5, windowId: 1, active: true, title: 'Current page', url: 'https://example.com/current?b=2&a=1#anchor' }],
    [6, { id: 6, windowId: 1, active: true, title: 'Second page', url: 'https://example.com/second' }],
  ]);
  const findNode = (id: string, nodes = tree): Node | undefined => nodes.find((node) => node.id === id)
    ?? nodes.map((node) => findNode(id, node.children ?? [])).find(Boolean);
  const runtime: CaptureRuntime = {
    extensionId: 'atlas', getURL: (path) => `chrome-extension://atlas/${path}`,
    getTab: vi.fn(async (id) => tabs.get(id)!),
    getBookmarkTree: vi.fn(async () => structuredClone(tree)),
    createBookmark: vi.fn(async (input) => {
      const node: Node = { ...input, id: `bookmark${++sequence}`, ...(!input.url ? { children: [] } : {}) };
      findNode(input.parentId)!.children!.push(node);
      return structuredClone(node);
    }),
    readStorage: vi.fn(async () => structuredClone(stored)),
    writeStorage: vi.fn(async (intents: CaptureIntent[], acknowledged: CaptureAcknowledgement[]) => { stored = structuredClone({ version: 1, intents, acknowledged }); }),
    createTab: vi.fn(async () => ({})),
    randomId: () => `request${++sequence}`, now: () => 10_000,
  };
  return { runtime, tree, tabs, stored: () => stored, handle: createCaptureMessageHandler(runtime) };
}

describe('capture background owner', () => {
  it('creates only its own folder and preserves the exact captured URL including parameters and hash', async () => {
    const f = fixture();
    const result = await f.handle(message('capture', { tabId: 5 }), popup) as { ok: boolean; intent: CaptureIntent };
    expect(result.ok).toBe(true);
    expect(result.intent).toMatchObject({ url: 'https://example.com/current?b=2&a=1#anchor', title: 'Current page', folderPath: 'Other bookmarks / Bookmark Atlas' });
    expect(f.runtime.createBookmark).toHaveBeenNthCalledWith(1, { parentId: '2', title: 'Bookmark Atlas' });
    expect(f.runtime.createBookmark).toHaveBeenNthCalledWith(2, { parentId: 'bookmark1', title: 'Current page', url: result.intent.url });
    expect(f.tree[0]!.children![0]!.children).toEqual([]);
  });

  it('reuses an existing native folder and same normalized URL, without moving bookmarks elsewhere', async () => {
    const f = fixture();
    f.tree[0]!.children![1]!.children!.push({ id: 'atlas-folder', title: 'Bookmark Atlas', children: [
      { id: 'existing', title: 'Saved title', url: 'https://example.com/current?a=1&b=2#saved' },
    ] });
    const result = await f.handle(message('capture', { tabId: 5 }), popup) as { intent: CaptureIntent };
    expect(result.intent.bookmarkId).toBe('existing');
    expect(result.intent.url).toContain('#saved');
    expect(f.runtime.createBookmark).not.toHaveBeenCalled();
  });

  it('serializes simultaneous repeated clicks and returns the same pending intent', async () => {
    const f = fixture();
    const results = await Promise.all(Array.from({ length: 8 }, () => f.handle(message('capture', { tabId: 5 }), popup)));
    expect(new Set(results.map((result: any) => result.intent.id)).size).toBe(1);
    expect(parseCaptureQueue(f.stored())).toHaveLength(1);
    expect(f.runtime.createBookmark).toHaveBeenCalledTimes(2);
  });

  it('serializes append and ack without losing the newly appended intent', async () => {
    const f = fixture({ version: 1, intents: [makeIntent('first')] });
    const [appended] = await Promise.all([
      f.handle(message('capture', { tabId: 6 }), popup), f.handle(message('ack', { id: 'first' }), canvas),
    ]) as [{ intent: CaptureIntent }, unknown];
    expect(parseCaptureQueue(f.stored()).map((item) => item.id)).toEqual([appended.intent.id]);
    await f.handle(message('ack', { id: 'first' }), canvas);
    expect(parseCaptureQueue(f.stored())).toHaveLength(1);
  });

  it('retains the queue if a durable acknowledgement write fails', async () => {
    const f = fixture({ version: 1, intents: [makeIntent('first'), makeIntent('second')] });
    vi.mocked(f.runtime.writeStorage).mockRejectedValueOnce(new Error('private storage failure'));
    expect(await f.handle(message('ack', { id: 'first' }), canvas)).toEqual({ ok: false, error: 'failed' });
    expect(parseCaptureQueue(f.stored())).toHaveLength(2);
    expect(await f.handle(message('ack', { id: 'first' }), canvas)).toEqual({ ok: true });
    expect(parseCaptureQueue(f.stored()).map((item) => item.id)).toEqual(['second']);
  });

  it('does not mutate or drop a damaged queue, allowing recovery of the original record', async () => {
    const malformed = { version: 1, intents: [makeIntent('valid'), { broken: true }] };
    const f = fixture(malformed);
    expect(await f.handle(message('capture', { tabId: 5 }), popup)).toEqual({ ok: false, error: 'queue_invalid' });
    expect(f.stored()).toEqual(malformed);
    expect(f.runtime.createBookmark).not.toHaveBeenCalled();
    expect(f.runtime.writeStorage).not.toHaveBeenCalled();
  });

  it('keeps a browser bookmark after queue write failure and reuses it on retry', async () => {
    const f = fixture();
    vi.mocked(f.runtime.writeStorage).mockRejectedValueOnce(new Error('private failure'));
    expect(await f.handle(message('capture', { tabId: 5 }), popup)).toEqual({ ok: false, error: 'failed' });
    expect(f.runtime.createBookmark).toHaveBeenCalledTimes(2);
    expect((await f.handle(message('capture', { tabId: 5 }), popup) as any).ok).toBe(true);
    expect(f.runtime.createBookmark).toHaveBeenCalledTimes(2);
    expect(parseCaptureQueue(f.stored())).toHaveLength(1);
  });

  it('loads persistent intents after the service-worker owner restarts', async () => {
    const f = fixture();
    await f.handle(message('capture', { tabId: 5 }), popup);
    const restarted = createCaptureMessageHandler(f.runtime);
    expect(await restarted(message('load'), canvas)).toEqual({ ok: true, intents: parseCaptureQueue(f.stored()) });
  });

  it('refuses captures when full without creating any native bookmark', async () => {
    const f = fixture({ version: 1, intents: Array.from({ length: MAX_PENDING_CAPTURES }, (_, i) => makeIntent(`item${i}`)) });
    expect(await f.handle(message('capture', { tabId: 5 }), popup)).toEqual({ ok: false, error: 'queue_full' });
    expect(f.runtime.createBookmark).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: 'another-extension', url: popup.url }, message('capture', { tabId: 5 })],
    [{ id: 'atlas', url: 'https://example.com/popup.html' }, message('capture', { tabId: 5 })],
    [{ id: 'atlas', url: 'chrome-extension://another/newtab.html' }, message('load')],
    [canvas, message('capture', { tabId: 5 })],
    [popup, message('ack', { id: 'first' })],
    [popup, message('capture', { tabId: 5, url: 'https://attacker.example' })],
    [popup, message('capture', { tabId: -1 })],
    [canvas, message('ack', { id: '../anything' })],
  ])('rejects invalid sender or message schema %#', async (sender, input) => {
    const f = fixture();
    expect(await f.handle(input, sender)).toEqual({ ok: false, error: 'invalid_request' });
    expect(f.runtime.readStorage).not.toHaveBeenCalled();
  });

  it.each(['chrome://settings/', 'chrome-extension://atlas/newtab.html', 'javascript:alert(1)', 'data:text/html,hello', 'file:///private/file', 'https://user:secret@example.com/'])('blocks unsafe current-page URL %s', async (url) => {
    const f = fixture();
    f.tabs.get(5)!.url = url;
    expect(await f.handle(message('capture', { tabId: 5 }), popup)).toEqual({ ok: false, error: 'unsupported_page' });
    expect(f.runtime.createBookmark).not.toHaveBeenCalled();
  });

  it('rereads the active tab URL rather than accepting arbitrary caller content', async () => {
    const f = fixture();
    f.tabs.get(5)!.active = false;
    expect(await f.handle(message('capture', { tabId: 5 }), popup)).toEqual({ ok: false, error: 'unsupported_page' });
  });

  it('opens only a real pending or recently acknowledged capture in a new canvas tab', async () => {
    const f = fixture({ version: 1, intents: [makeIntent('first')] });
    expect(await f.handle(message('open', { id: 'not-known' }), popup)).toEqual({ ok: false, error: 'invalid_request' });
    await f.handle(message('ack', { id: 'first' }), canvas);
    expect(await f.handle(message('open', { id: 'first' }), popup)).toEqual({ ok: true });
    expect(f.runtime.createTab).toHaveBeenCalledWith({ url: 'chrome-extension://atlas/newtab.html?capture=first', active: true });
    expect(parseCaptureQueue(f.stored())).toEqual([]);
  });
});
