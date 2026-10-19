import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_CONSUMER_LOCK, CAPTURE_MESSAGE_CHANNEL, CAPTURE_STORAGE_KEY, ackCapture, captureActiveTab, isCapturableUrl, loadPendingCaptures, normalizeCaptureUrl, openCaptureCanvas, parseCaptureQueue, subscribePendingCaptures, withCaptureConsumerLock } from './captureQueue';

const intent = { id: 'request1', bookmarkId: 'bookmark1', title: 'Saved page', url: 'https://example.com/?a=1', folderPath: 'Other bookmarks / Bookmark Atlas', createdAt: 1_000 };
afterEach(() => vi.unstubAllGlobals());

describe('capture queue client', () => {
  it('accepts only safe HTTP/S page URLs and normalizes only for comparison', () => {
    expect(isCapturableUrl('https://example.com/video?v=1#test')).toBe(true);
    expect(isCapturableUrl('http://localhost:5173/')).toBe(true);
    expect(isCapturableUrl('chrome://newtab/')).toBe(false);
    expect(normalizeCaptureUrl('https://EXAMPLE.com:443/video/?b=2&a=1#foo')).toBe('https://example.com/video?a=1&b=2');
  });

  it('validates every durable queue item rather than silently dropping invalid pending work', () => {
    expect(parseCaptureQueue(undefined)).toEqual([]);
    expect(parseCaptureQueue({ version: 1, intents: [intent] })).toEqual([intent]);
    expect(() => parseCaptureQueue({ version: 1, intents: [intent, intent] })).toThrow('queue_invalid');
    expect(() => parseCaptureQueue({ version: 1, intents: [{ ...intent, url: 'javascript:alert(1)' }] })).toThrow('queue_invalid');
    expect(() => parseCaptureQueue({ version: 2, intents: [] })).toThrow('queue_invalid');
  });

  it('routes writes through the serialized background owner with exact scoped identifiers', async () => {
    const sendMessage = vi.fn(async (input) => input.action === 'capture' ? { ok: true, intent } : input.action === 'load' ? { ok: true, intents: [intent] } : { ok: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    expect(await captureActiveTab(7)).toEqual(intent);
    expect(await loadPendingCaptures()).toEqual([intent]);
    await ackCapture('request1');
    await openCaptureCanvas('request1');
    expect(sendMessage.mock.calls.map(([item]) => item)).toEqual([
      { channel: CAPTURE_MESSAGE_CHANNEL, action: 'capture', tabId: 7 },
      { channel: CAPTURE_MESSAGE_CHANNEL, action: 'load' },
      { channel: CAPTURE_MESSAGE_CHANNEL, action: 'ack', id: 'request1' },
      { channel: CAPTURE_MESSAGE_CHANNEL, action: 'open', id: 'request1' },
    ]);
    await expect(ackCapture('../invalid')).rejects.toThrow('invalid_request');
  });

  it('never forwards arbitrary background errors into page-facing error text', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn().mockRejectedValue(new Error('Private URL or secret')) } });
    await expect(loadPendingCaptures()).rejects.toThrow('unavailable');
  });

  it('subscribes only to this local key and ignores malformed updates without an empty-queue signal', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    vi.stubGlobal('chrome', { storage: { onChanged: { addListener, removeListener } } });
    const listener = vi.fn();
    const unsubscribe = subscribePendingCaptures(listener);
    const onChange = addListener.mock.calls[0]![0];
    onChange({ [CAPTURE_STORAGE_KEY]: { newValue: { version: 1, intents: [intent] } } }, 'sync');
    onChange({ unrelated: { newValue: true } }, 'local');
    onChange({ [CAPTURE_STORAGE_KEY]: { newValue: { invalid: true } } }, 'local');
    expect(listener).not.toHaveBeenCalled();
    onChange({ [CAPTURE_STORAGE_KEY]: { newValue: { version: 1, intents: [intent] } } }, 'local');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([intent]);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(onChange);
  });

  it('serializes canvas consumers with an extension-wide exclusive Web Lock', async () => {
    const request = vi.fn(async (_key, _options, action) => action());
    vi.stubGlobal('navigator', { locks: { request } });
    const action = vi.fn(async () => 'saved');
    expect(await withCaptureConsumerLock(action)).toBe('saved');
    expect(request).toHaveBeenCalledWith(CAPTURE_CONSUMER_LOCK, { mode: 'exclusive' }, action);
  });

  it('refuses unsafe unlocked fallback when Web Locks are not available', async () => {
    vi.stubGlobal('navigator', {});
    const action = vi.fn();
    await expect(withCaptureConsumerLock(action)).rejects.toThrow('consumer_lock_unavailable');
    expect(action).not.toHaveBeenCalled();
  });
});
