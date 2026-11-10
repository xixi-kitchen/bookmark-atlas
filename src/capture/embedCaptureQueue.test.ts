import { afterEach, describe, expect, it, vi } from 'vitest';
import * as queue from './embedCaptureQueue';

const intent = { id: 'one', kind: 'embed', url: 'https://example.com/?b=2&a=1#hash', title: 'Page', createdAt: 1000, saveBookmark: false, phase: 'ready' } as const;
afterEach(() => vi.unstubAllGlobals());

describe('embed request client and strict record parser', () => {
  it('keeps hash, query order and repeats as webpage identity', () => {
    expect(queue.normalizeEmbedCaptureUrl(intent.url)).toBe(intent.url);
    expect(queue.normalizeEmbedCaptureUrl('https://example.com/#two')).not.toBe(queue.normalizeEmbedCaptureUrl('https://example.com/#one'));
  });
  it.each(['https://example.com/', 'http://localhost:3000/', 'http://127.0.0.1:8080/', 'http://[::1]:8080/'])('accepts existing trusted webpage protocol %s', (url) => {
    expect(queue.isEmbeddableCaptureUrl(url)).toBe(true);
  });
  it.each(['http://example.com/', 'https://user:pass@example.com/', 'file:///secret', 'javascript:alert(1)', 'chrome://settings', 'chrome-extension://atlas/newtab.html'])('rejects unsafe embed URL %s', (url) => {
    expect(queue.isEmbeddableCaptureUrl(url)).toBe(false);
  });
  it('rejects malformed journals rather than interpreting them as empty', () => {
    expect(queue.parseEmbedCaptureQueueRecord(undefined)).toEqual({ version: 2, intents: [], receipts: [] });
    for (const record of [null, { version: 1, intents: [] }, { version: 2, intents: [{ ...intent, extra: 'untrusted' }], receipts: [] }, { version: 2, intents: [{ ...intent, phase: 'planned' }], receipts: [] }, { version: 2, intents: [intent, intent], receipts: [] }, { version: 2, intents: [intent], receipts: [{ id: 'one', at: 1000, result: 'added', targetId: 'target' }] }]) {
      expect(() => queue.parseEmbedCaptureQueueRecord(record)).toThrowError(expect.objectContaining({ code: 'queue_invalid' }));
    }
  });
  it('sends independent v2 messages and returns validated partial errors', async () => {
    const sendMessage = vi.fn().mockResolvedValueOnce({ ok: true, intent }).mockResolvedValueOnce({ ok: false, error: 'failed', bookmarkSaved: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    expect(await queue.captureEmbedActiveTab({ id: 'one', tabId: 4, expectedUrl: intent.url, saveBookmark: false })).toEqual(intent);
    expect(sendMessage).toHaveBeenCalledWith({ channel: queue.EMBED_CAPTURE_MESSAGE_CHANNEL, action: 'capture', id: 'one', tabId: 4, expectedUrl: intent.url, saveBookmark: false });
    await expect(queue.retryEmbedCapture('one')).rejects.toMatchObject({ code: 'failed', bookmarkSaved: true });
  });
  it('validates all reply fields and unknown error codes without leaking backend details', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn().mockResolvedValueOnce({ ok: true, intent: { ...intent, phase: 'bogus' } }).mockResolvedValueOnce({ ok: false, error: 'private detail', bookmarkSaved: 'secret' }).mockResolvedValueOnce({ ok: true, status: { id: 'one', result: 'added' } }) } });
    await expect(queue.retryEmbedCapture('one')).rejects.toMatchObject({ code: 'failed' });
    await expect(queue.retryEmbedCapture('one')).rejects.toMatchObject({ code: 'failed', bookmarkSaved: false });
    await expect(queue.getEmbedCaptureStatus('one')).rejects.toMatchObject({ code: 'failed' });
  });
  it('rejects invalid client identifiers before sending and subscribes only to v2 local changes', async () => {
    let handler: (changes: Record<string, unknown>, area: string) => void = () => {};
    const sendMessage = vi.fn();
    const removeListener = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage }, storage: { onChanged: { addListener: (listener: typeof handler) => { handler = listener; }, removeListener } } });
    await expect(queue.retryEmbedCapture('../bad')).rejects.toMatchObject({ code: 'invalid_request' });
    expect(sendMessage).not.toHaveBeenCalled();
    const listener = vi.fn();
    const unsubscribe = queue.subscribePendingEmbedCaptures(listener);
    handler({ 'bookmark-atlas:capture-queue:v1': {} }, 'local');
    handler({ [queue.EMBED_CAPTURE_STORAGE_KEY]: {} }, 'sync');
    handler({ [queue.EMBED_CAPTURE_STORAGE_KEY]: {} }, 'local');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(handler);
  });
});
