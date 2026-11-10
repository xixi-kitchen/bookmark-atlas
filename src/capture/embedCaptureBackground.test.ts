import { describe, expect, it, vi } from 'vitest';
import { createCaptureMessageHandler, createCaptureSerialOwner } from './captureBackground';
import { CAPTURE_MESSAGE_CHANNEL } from './captureQueue';
import { createEmbedCaptureMessageHandler, type EmbedCaptureRuntime } from './embedCaptureBackground';
import { EMBED_CAPTURE_MESSAGE_CHANNEL, MAX_PENDING_EMBED_CAPTURES, parseEmbedCaptureQueueRecord, type EmbedCaptureIntent, type EmbedCaptureReceipt } from './embedCaptureQueue';

const popup = { id: 'atlas', url: 'chrome-extension://atlas/popup.html' };
const canvas = { id: 'atlas', url: 'chrome-extension://atlas/newtab.html?embedCapture=one' };
const msg = (action: string, payload = {}) => ({ channel: EMBED_CAPTURE_MESSAGE_CHANNEL, action, ...payload });
const url = 'https://example.com/current?b=2&a=1#current';
const capture = (id = 'one', saveBookmark = false) => msg('capture', { id, tabId: 5, expectedUrl: url, saveBookmark });
const makeIntent = (id = 'one', phase: EmbedCaptureIntent['phase'] = 'ready'): EmbedCaptureIntent => ({ id, kind: 'embed', url, title: 'Current page', createdAt: 1000, saveBookmark: false, phase, ...(phase === 'planned' || phase === 'needs-review' ? { target: { elementId: `element-${id}`, mode: 'create' } as const } : {}) });

function fixture(initial?: unknown) {
  let stored = initial;
  let v1: unknown;
  let seq = 0;
  const events: string[] = [];
  type Node = { id: string; parentId?: string; title: string; url?: string; children?: Node[] };
  const tree: Node[] = [{ id: '0', title: '', children: [{ id: '2', title: 'Other bookmarks', children: [] }] }];
  const find = (id: string, nodes = tree): Node | undefined => nodes.find((node) => node.id === id) ?? nodes.flatMap((node) => node.children ?? []).map((node) => find(id, [node])).find(Boolean);
  const tab = { id: 5, windowId: 1, active: true, incognito: false, title: 'Current page', url };
  const runtime: EmbedCaptureRuntime = {
    extensionId: 'atlas', getURL: (path) => `chrome-extension://atlas/${path}`,
    getTab: vi.fn(async () => ({ ...tab })),
    getBookmarkTree: vi.fn(async () => { events.push('bookmarks'); return structuredClone(tree); }),
    createBookmark: vi.fn(async (input) => { const node: Node = { ...input, id: `bookmark${++seq}`, ...(!input.url ? { children: [] } : {}) }; find(input.parentId)!.children!.push(node); return structuredClone(node); }),
    readStorage: vi.fn(async () => v1), writeStorage: vi.fn(async (intents, acknowledged) => { v1 = { version: 1, intents, acknowledged }; }),
    readEmbedStorage: vi.fn(async () => structuredClone(stored)),
    writeEmbedStorage: vi.fn(async (intents: EmbedCaptureIntent[], receipts: EmbedCaptureReceipt[]) => { events.push(intents[0]?.phase ?? 'terminal'); stored = structuredClone({ version: 2, intents, receipts }); }),
    createTab: vi.fn(async () => ({})), now: vi.fn(() => 10000), randomId: () => `legacy${++seq}`,
  };
  return { runtime, tab, tree, events, stored: () => stored, v1: () => v1, handle: createEmbedCaptureMessageHandler(runtime) };
}

describe('isolated durable embed request owner', () => {
  it('records preparation before bookmarks and keeps current raw URL when a normalized old bookmark exists', async () => {
    const f = fixture();
    f.tree[0]!.children![0]!.children!.push({ id: 'folder', title: 'Bookmark Atlas', children: [{ id: 'old', title: 'Old', url: 'https://example.com/current?a=1&b=2#old' }] });
    const result = await f.handle(capture('one', true), popup);
    expect(result).toMatchObject({ ok: true, intent: { id: 'one', phase: 'ready', bookmarkId: 'old', url, title: 'Current page', saveBookmark: true } });
    expect(f.events[0]).toBe('preparing');
    expect(f.events.indexOf('bookmarks')).toBeGreaterThan(0);
    expect(f.runtime.createBookmark).not.toHaveBeenCalled();
    expect(f.v1()).toBeUndefined();
  });
  it('does not even query bookmarks when disabled and keeps same-URL requests independent', async () => {
    const f = fixture();
    await f.handle(capture(), popup);
    expect(f.runtime.getBookmarkTree).not.toHaveBeenCalled();
    expect(f.runtime.createBookmark).not.toHaveBeenCalled();
    await f.handle(capture('two', true), popup);
    expect(parseEmbedCaptureQueueRecord(f.stored()).intents).toHaveLength(2);
    expect(f.runtime.createBookmark).toHaveBeenCalledTimes(2);
  });
  it('deduplicates only same matching request ID and rejects option or URL collisions', async () => {
    const f = fixture();
    const results = await Promise.all([f.handle(capture(), popup), f.handle(capture(), popup)]);
    expect(results[0]).toEqual(results[1]);
    expect(parseEmbedCaptureQueueRecord(f.stored()).intents).toHaveLength(1);
    expect(await f.handle(capture('one', true), popup)).toEqual({ ok: false, error: 'invalid_request', bookmarkSaved: false });
    f.tab.url = 'https://example.com/different';
    expect(await f.handle(msg('capture', { id: 'one', tabId: 5, expectedUrl: f.tab.url, saveBookmark: false }), popup)).toMatchObject({ ok: false, error: 'invalid_request' });
  });
  it('rejects stale preview before storing or creating bookmarks', async () => {
    const f = fixture(); f.tab.url += '-changed';
    expect(await f.handle(capture('one', true), popup)).toMatchObject({ ok: false, error: 'page_changed' });
    expect(f.runtime.writeEmbedStorage).not.toHaveBeenCalled();
    expect(f.runtime.getBookmarkTree).not.toHaveBeenCalled();
  });
  it.each([['inactive', { active: false }], ['incognito', { incognito: true }], ['http remote', { url: 'http://example.com/' }], ['credentials', { url: 'https://user:pass@example.com/' }]])('rejects unsupported source tab %s', async (_, changes) => {
    const f = fixture(); Object.assign(f.tab, changes);
    expect(await f.handle(capture('one', true), popup)).toMatchObject({ ok: false, error: 'unsupported_page' });
    expect(f.runtime.writeEmbedStorage).not.toHaveBeenCalled();
  });
  it.each([
    [canvas, capture()], [{ ...popup, id: 'other' }, capture()], [{ ...popup, url: popup.url + '?fake=1' }, capture()], [popup, { ...capture(), url: 'https://evil.example' }],
    [popup, msg('capture', { id: 'one', tabId: 5, expectedUrl: url })], [popup, msg('plan', { id: 'one', target: { elementId: 'object', mode: 'create' } })],
    [popup, msg('ack', { id: 'one', result: 'added', targetId: 'object' })], [canvas, msg('cancel', { id: 'one' })], [canvas, msg('retry', { id: 'one' })],
    [canvas, msg('plan', { id: 'one', target: { elementId: 'object', mode: 'create', extra: true } })],
  ])('rejects unauthorized surfaces and unknown message fields %#', async (sender, input) => {
    const f = fixture(); expect(await f.handle(input, sender)).toMatchObject({ ok: false, error: 'invalid_request' });
    expect(f.runtime.readEmbedStorage).not.toHaveBeenCalled();
  });
  it('preserves corrupt/full records without bookmark side effects', async () => {
    for (const initial of [{ version: 99, intents: [] }, { version: 2, intents: Array.from({ length: MAX_PENDING_EMBED_CAPTURES }, (_, i) => makeIntent(`item${i}`)), receipts: [] }]) {
      const f = fixture(initial);
      expect(await f.handle(capture('new', true), popup)).toMatchObject({ ok: false, error: initial.version === 99 ? 'queue_invalid' : 'queue_full' });
      expect(f.stored()).toEqual(initial);
      expect(f.runtime.getBookmarkTree).not.toHaveBeenCalled();
      expect(f.runtime.writeEmbedStorage).not.toHaveBeenCalled();
    }
  });
  it('does not run native side effects when preparing persistence fails', async () => {
    const f = fixture(); vi.mocked(f.runtime.writeEmbedStorage).mockRejectedValueOnce(new Error('disk'));
    expect(await f.handle(capture('one', true), popup)).toMatchObject({ ok: false, error: 'failed', bookmarkSaved: false });
    expect(f.runtime.getBookmarkTree).not.toHaveBeenCalled();
  });
  it('retains preparing and reports partial success if final write fails; restart retry recovers one bookmark', async () => {
    const f = fixture();
    const write = vi.mocked(f.runtime.writeEmbedStorage).getMockImplementation()!;
    vi.mocked(f.runtime.writeEmbedStorage).mockImplementationOnce(async (intents, receipts) => {
      await write(intents, receipts);
      vi.mocked(f.runtime.writeEmbedStorage).mockRejectedValueOnce(new Error('disk'));
    });
    expect(await f.handle(capture('one', true), popup)).toMatchObject({ ok: false, error: 'failed', bookmarkSaved: true });
    const saved = parseEmbedCaptureQueueRecord(f.stored());
    expect(saved.intents[0]!.phase).toBe('preparing');
    const recovered = fixture(saved); recovered.tree[0]!.children![0]!.children = structuredClone(f.tree[0]!.children![0]!.children);
    expect(await recovered.handle(msg('retry', { id: 'one' }), popup)).toMatchObject({ ok: true, intent: { phase: 'ready', bookmarkId: 'bookmark2' } });
    expect(recovered.runtime.createBookmark).not.toHaveBeenCalled();
  });
  it('reports bookmark failure and keeps the original preparing request for explicit retry', async () => {
    const f = fixture(); vi.mocked(f.runtime.getBookmarkTree).mockRejectedValueOnce(new Error('bookmarks denied'));
    expect(await f.handle(capture('one', true), popup)).toMatchObject({ ok: false, error: 'bookmark_failed' });
    expect(parseEmbedCaptureQueueRecord(f.stored()).intents[0]?.phase).toBe('preparing');
    expect(await f.handle(msg('retry', { id: 'one' }), popup)).toMatchObject({ ok: true, intent: { phase: 'ready' } });
  });
  it('lets the trusted popup end failed preparing requests before explicitly changing bookmark choice', async () => {
    const f = fixture();
    vi.mocked(f.runtime.getBookmarkTree).mockRejectedValueOnce(new Error('bookmarks denied'));
    expect(await f.handle(capture('one', true), popup)).toMatchObject({ ok: false, error: 'bookmark_failed' });
    expect(await f.handle(msg('cancel', { id: 'one' }), canvas)).toMatchObject({ ok: false, error: 'invalid_request' });
    expect(await f.handle(msg('cancel', { id: 'one' }), popup)).toEqual({ ok: true });
    expect(parseEmbedCaptureQueueRecord(f.stored())).toEqual({ version: 2, intents: [], receipts: [{ id: 'one', at: 10000, result: 'cancelled', targetId: null }] });
    expect(await f.handle(msg('retry', { id: 'one' }), popup)).toMatchObject({ ok: false, error: 'request_ended' });
    expect(await f.handle(capture('two', false), popup)).toMatchObject({ ok: true, intent: { id: 'two', phase: 'ready', saveBookmark: false } });
    expect(f.runtime.getBookmarkTree).toHaveBeenCalledTimes(1);
  });
  it('keeps successful native bookmark side effects when the popup cancels interrupted preparation', async () => {
    const f = fixture();
    const write = vi.mocked(f.runtime.writeEmbedStorage).getMockImplementation()!;
    vi.mocked(f.runtime.writeEmbedStorage).mockImplementationOnce(async (intents, receipts) => {
      await write(intents, receipts);
      vi.mocked(f.runtime.writeEmbedStorage).mockRejectedValueOnce(new Error('disk'));
    });
    expect(await f.handle(capture('one', true), popup)).toMatchObject({ ok: false, error: 'failed', bookmarkSaved: true });
    const nativeTree = structuredClone(f.tree);
    expect(nativeTree[0]!.children![0]!.children![0]!.children).toMatchObject([{ id: 'bookmark2', url }]);
    expect(await f.handle(msg('cancel', { id: 'one' }), popup)).toEqual({ ok: true });
    expect(f.tree).toEqual(nativeTree);
    expect(f.runtime.getBookmarkTree).toHaveBeenCalledTimes(1);
    expect(f.runtime.createBookmark).toHaveBeenCalledTimes(2);
    expect(parseEmbedCaptureQueueRecord(f.stored())).toMatchObject({ intents: [], receipts: [{ id: 'one', result: 'cancelled', targetId: null }] });
  });
  it.each(['ready', 'planned'] as const)('continues to reject popup cancellation of consumable %s requests', async (phase) => {
    const initial = { version: 2, intents: [makeIntent('one', phase)], receipts: [] };
    const f = fixture(initial);
    expect(await f.handle(msg('cancel', { id: 'one' }), popup)).toMatchObject({ ok: false, error: 'invalid_request' });
    expect(f.stored()).toEqual(initial);
    expect(f.runtime.writeEmbedStorage).not.toHaveBeenCalled();
  });
  it('journals a fixed canvas target, refuses retargeting and rejects premature acknowledgement', async () => {
    const f = fixture(); await f.handle(capture(), popup);
    expect(await f.handle(msg('ack', { id: 'one', result: 'added', targetId: 'element' }), canvas)).toMatchObject({ ok: false, error: 'invalid_request' });
    const target = { elementId: 'element', mode: 'reuse' };
    expect(await f.handle(msg('plan', { id: 'one', target }), canvas)).toMatchObject({ ok: true, intent: { phase: 'planned', target } });
    expect(await f.handle(msg('plan', { id: 'one', target: { ...target, elementId: 'other' } }), canvas)).toMatchObject({ ok: false, error: 'invalid_request' });
    expect(await f.handle(msg('ack', { id: 'one', result: 'existing', targetId: 'other' }), canvas)).toMatchObject({ ok: false, error: 'invalid_request' });
    await f.handle(msg('ack', { id: 'one', result: 'existing', targetId: 'element' }), canvas);
    expect(await f.handle(msg('status', { id: 'one' }), popup)).toMatchObject({ ok: true, status: { id: 'one', result: 'existing', targetId: 'element' } });
    expect(await f.handle(msg('retry', { id: 'one' }), popup)).toMatchObject({ ok: false, error: 'request_ended' });
  });
  it('records ready-stage element identity collision for explicit recovery without inventing a target', async () => {
    const f = fixture({ version: 2, intents: [makeIntent()], receipts: [] });
    expect(await f.handle(msg('mark-review', { id: 'one' }), canvas)).toEqual({ ok: true });
    expect(parseEmbedCaptureQueueRecord(f.stored()).intents).toEqual([{ ...makeIntent(), phase: 'needs-review' }]);
    expect(await f.handle(msg('retry', { id: 'one' }), popup)).toMatchObject({ ok: false, error: 'needs_review' });
  });
  it('retains uncertain targets indefinitely and only accepts explicit popup cancellation of needs-review', async () => {
    const f = fixture({ version: 2, intents: [makeIntent('one', 'planned')], receipts: [] });
    expect(await f.handle(msg('cancel', { id: 'one' }), popup)).toMatchObject({ ok: false, error: 'invalid_request' });
    await f.handle(msg('mark-review', { id: 'one' }), canvas);
    vi.mocked(f.runtime.now).mockReturnValue(10 ** 12);
    expect(await f.handle(msg('load'), canvas)).toMatchObject({ ok: true, intents: [{ id: 'one', phase: 'needs-review', target: { elementId: 'element-one' } }] });
    expect(await f.handle(msg('retry', { id: 'one' }), popup)).toMatchObject({ ok: false, error: 'needs_review' });
    await f.handle(msg('cancel', { id: 'one' }), popup);
    expect(parseEmbedCaptureQueueRecord(f.stored())).toMatchObject({ intents: [], receipts: [{ id: 'one', result: 'cancelled', targetId: null }] });
  });
  it('rejects unknown/expired retry IDs and opens only a pending or fresh receipt target on own canvas', async () => {
    const f = fixture({ version: 2, intents: [], receipts: [{ id: 'expired', at: 1, result: 'added', targetId: 'old' }] });
    vi.mocked(f.runtime.now).mockReturnValue(1_800_002);
    for (const id of ['expired', 'unknown']) {
      expect(await f.handle(msg('retry', { id }), popup)).toMatchObject({ ok: false, error: 'request_ended' });
      expect(await f.handle(msg('open', { id }), popup)).toMatchObject({ ok: false, error: 'request_ended' });
      expect(await f.handle(msg('status', { id }), popup)).toEqual({ ok: true, status: null });
    }
    await f.handle(capture(), popup);
    await f.handle(msg('open', { id: 'one' }), popup);
    expect(f.runtime.createTab).toHaveBeenCalledWith({ url: 'chrome-extension://atlas/newtab.html?embedCapture=one', active: true });
  });
  it('bounds terminal receipts to100 and thirty minutes without expiring pending evidence', async () => {
    const receipts: EmbedCaptureReceipt[] = Array.from({ length: 100 }, (_, i) => ({ id: `receipt${i}`, at: i + 1, result: 'added', targetId: `target${i}` }));
    const f = fixture({ version: 2, intents: [makeIntent('one', 'planned')], receipts });
    await f.handle(msg('ack', { id: 'one', result: 'added', targetId: 'element-one' }), canvas);
    expect(parseEmbedCaptureQueueRecord(f.stored()).receipts).toHaveLength(100);
    expect(parseEmbedCaptureQueueRecord(f.stored()).receipts[0]!.id).toBe('receipt1');
    expect(await f.handle(msg('ack', { id: 'one', result: 'added', targetId: 'element-one' }), canvas)).toMatchObject({ ok: true });
  });
  it('shares one serialization owner with v1 so bookmark read/create cannot race across protocols', async () => {
    const f = fixture(); const serialize = createCaptureSerialOwner();
    const v1 = createCaptureMessageHandler(f.runtime, serialize);
    const v2 = createEmbedCaptureMessageHandler(f.runtime, serialize);
    await Promise.all([v1({ channel: CAPTURE_MESSAGE_CHANNEL, action: 'capture', tabId: 5 }, popup), v2(capture('one', true), popup)]);
    expect(f.runtime.createBookmark).toHaveBeenCalledTimes(2);
    expect(f.v1()).toMatchObject({ version: 1, intents: [{ bookmarkId: 'bookmark2' }] });
    expect(f.stored()).toMatchObject({ version: 2, intents: [{ bookmarkId: 'bookmark2', kind: 'embed' }] });
  });
});
