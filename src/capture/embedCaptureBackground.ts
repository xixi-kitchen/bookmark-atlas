import { createCaptureSerialOwner, ensureCaptureBookmark, surfaceForSender, type CaptureRuntime, type CaptureSender, type CaptureSerialOwner } from './captureBackground';
import { isCaptureId } from './captureQueue';
import {
  EMBED_CAPTURE_MESSAGE_CHANNEL, EMBED_CAPTURE_RECEIPT_TTL, MAX_PENDING_EMBED_CAPTURES,
  EmbedCaptureError, isEmbeddableCaptureUrl, isEmbedCaptureTarget, isEmbedElementId, normalizeEmbedCaptureUrl, parseEmbedCaptureQueueRecord,
  type EmbedCaptureIntent, type EmbedCaptureReceipt, type EmbedCaptureTarget,
} from './embedCaptureQueue';

export type EmbedCaptureRuntime = CaptureRuntime & {
  readEmbedStorage(): Promise<unknown>;
  writeEmbedStorage(intents: EmbedCaptureIntent[], receipts: EmbedCaptureReceipt[]): Promise<void>;
};
type Request = { action: 'capture'; id: string; tabId: number; expectedUrl: string; saveBookmark: boolean }
  | { action: 'load' }
  | { action: 'plan'; id: string; target: EmbedCaptureTarget }
  | { action: 'ack'; id: string; result: EmbedCaptureReceipt['result']; targetId: string | null }
  | { action: 'retry' | 'status' | 'open' | 'cancel' | 'mark-review'; id: string };
function assertMessage(message: unknown, sender: CaptureSender, runtime: EmbedCaptureRuntime): Request {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new EmbedCaptureError('invalid_request');
  const input = message as Record<string, unknown>;
  const surface = surfaceForSender(sender, runtime);
  if (!surface || input.channel !== EMBED_CAPTURE_MESSAGE_CHANNEL) throw new EmbedCaptureError('invalid_request');
  const only = (...keys: string[]) => Object.keys(input).every((key) => ['channel', 'action', ...keys].includes(key));
  const action = input.action;
  if (action === 'load' && only()) return { action };
  if (action === 'capture' && surface === 'popup' && isCaptureId(input.id) && Number.isSafeInteger(input.tabId) && (input.tabId as number) >= 0
    && isEmbeddableCaptureUrl(input.expectedUrl) && typeof input.saveBookmark === 'boolean' && only('id', 'tabId', 'expectedUrl', 'saveBookmark')) {
    return { action, id: input.id, tabId: input.tabId as number, expectedUrl: input.expectedUrl, saveBookmark: input.saveBookmark };
  }
  if (!isCaptureId(input.id)) throw new EmbedCaptureError('invalid_request');
  if (action === 'plan' && surface === 'canvas' && isEmbedCaptureTarget(input.target) && only('id', 'target')) return { action, id: input.id, target: input.target };
  if (action === 'ack' && surface === 'canvas' && ['added', 'existing', 'cancelled'].includes(input.result as string)
    && (isEmbedElementId(input.targetId) || (input.result === 'cancelled' && input.targetId === null)) && only('id', 'result', 'targetId')) {
    return { action, id: input.id, result: input.result as EmbedCaptureReceipt['result'], targetId: input.targetId as string | null };
  }
  if (only('id') && (action === 'status' || (surface === 'popup' && ['retry', 'open', 'cancel'].includes(action as string)) || (surface === 'canvas' && action === 'mark-review'))) return { action, id: input.id } as Request;
  throw new EmbedCaptureError('invalid_request');
}

/** v2 journal is separate from v1; installation supplies one serial owner for both protocols. */
export function createEmbedCaptureMessageHandler(runtime: EmbedCaptureRuntime, serialize: CaptureSerialOwner = createCaptureSerialOwner()) {
  return (message: unknown, sender: CaptureSender): Promise<unknown> => serialize(async () => {
    const request = assertMessage(message, sender, runtime);
    const record = parseEmbedCaptureQueueRecord(await runtime.readEmbedStorage());
    let intents = record.intents;
    const receipts = record.receipts.filter((item) => runtime.now() - item.at <= EMBED_CAPTURE_RECEIPT_TTL);
    const persist = () => runtime.writeEmbedStorage(intents, receipts);
    const replace = (intent: EmbedCaptureIntent) => { intents = intents.map((item) => item.id === intent.id ? intent : item); };
    const finish = async (id: string, result: EmbedCaptureReceipt['result'], targetId: string | null) => {
      intents = intents.filter((item) => item.id !== id);
      receipts.push({ id, at: runtime.now(), result, targetId });
      receipts.splice(0, Math.max(0, receipts.length - MAX_PENDING_EMBED_CAPTURES));
      await persist();
    };
    const prepare = async (intent: EmbedCaptureIntent) => {
      if (intent.phase === 'needs-review') throw new EmbedCaptureError('needs_review', Boolean(intent.bookmarkId));
      if (intent.phase !== 'preparing') return intent;
      let bookmarkId = intent.bookmarkId;
      if (intent.saveBookmark && !bookmarkId) {
        try { bookmarkId = (await ensureCaptureBookmark(runtime, intent.url, intent.title)).bookmark.id; }
        catch { throw new EmbedCaptureError('bookmark_failed'); }
      }
      const ready: EmbedCaptureIntent = { ...intent, phase: 'ready', ...(bookmarkId ? { bookmarkId } : {}) };
      replace(ready);
      try { await persist(); }
      catch { throw new EmbedCaptureError('failed', Boolean(bookmarkId)); }
      return ready;
    };
    if (request.action === 'load') return { ok: true, intents };
    const existing = intents.find((item) => item.id === request.id);
    const receipt = receipts.find((item) => item.id === request.id);
    if (request.action === 'status') return { ok: true, status: existing ?? receipt ?? null };
    if (request.action === 'capture') {
      const tab = await runtime.getTab(request.tabId);
      if (tab.id !== request.tabId || !tab.active || tab.incognito || !isEmbeddableCaptureUrl(tab.url)) throw new EmbedCaptureError('unsupported_page');
      if (normalizeEmbedCaptureUrl(tab.url) !== normalizeEmbedCaptureUrl(request.expectedUrl)) throw new EmbedCaptureError('page_changed');
      if (receipt) throw new EmbedCaptureError('request_ended');
      if (existing) {
        if (normalizeEmbedCaptureUrl(existing.url) !== normalizeEmbedCaptureUrl(tab.url) || existing.saveBookmark !== request.saveBookmark) throw new EmbedCaptureError('invalid_request');
        return { ok: true, intent: await prepare(existing) };
      }
      if (intents.length >= MAX_PENDING_EMBED_CAPTURES) throw new EmbedCaptureError('queue_full');
      const intent: EmbedCaptureIntent = { id: request.id, kind: 'embed', url: tab.url, title: (tab.title?.trim() || new URL(tab.url).hostname).slice(0, 2_048), createdAt: runtime.now(), saveBookmark: request.saveBookmark, phase: 'preparing' };
      intents = [...intents, intent];
      // Never perform bookmark side effects before this request is durable and non-consumable.
      await persist();
      return { ok: true, intent: await prepare(intent) };
    }
    if (request.action === 'open') {
      if (!existing && !receipt) throw new EmbedCaptureError('request_ended');
      await runtime.createTab({ url: `${runtime.getURL('newtab.html')}?embedCapture=${encodeURIComponent(request.id)}`, active: true });
      return { ok: true };
    }
    if (!existing) {
      // A lost response to a successful ack can be retried without inventing another request.
      if (request.action === 'ack' && receipt && receipt.result === request.result && receipt.targetId === request.targetId) return { ok: true };
      if (request.action === 'cancel' && receipt?.result === 'cancelled') return { ok: true };
      throw new EmbedCaptureError('request_ended');
    }
    if (request.action === 'retry') return { ok: true, intent: await prepare(existing) };
    if (request.action === 'cancel') {
      // Approved spec §5.2 permits abandoning failed preparation to change bookmark choice.
      // This only ends the journal request; native bookmark side effects are independent.
      if (existing.phase !== 'preparing' && existing.phase !== 'needs-review') throw new EmbedCaptureError('invalid_request');
      await finish(existing.id, 'cancelled', null);
      return { ok: true };
    }
    if (request.action === 'plan') {
      if (existing.phase === 'needs-review') throw new EmbedCaptureError('needs_review');
      if (existing.phase !== 'ready' && existing.phase !== 'planned') throw new EmbedCaptureError('invalid_request');
      if (existing.target && (existing.target.elementId !== request.target.elementId || existing.target.mode !== request.target.mode)) throw new EmbedCaptureError('invalid_request');
      const planned: EmbedCaptureIntent = { ...existing, phase: 'planned', target: request.target };
      replace(planned); await persist();
      return { ok: true, intent: planned };
    }
    if (request.action === 'mark-review') {
      if (!['ready', 'planned', 'needs-review'].includes(existing.phase)) throw new EmbedCaptureError('invalid_request');
      replace({ ...existing, phase: 'needs-review' }); await persist();
      return { ok: true };
    }
    if (request.action !== 'ack') throw new EmbedCaptureError('invalid_request');
    if (existing.phase !== 'planned' || existing.target?.elementId !== request.targetId) throw new EmbedCaptureError('invalid_request');
    await finish(existing.id, request.result, request.targetId);
    return { ok: true };
  }).catch((error) => ({ ok: false, error: error instanceof EmbedCaptureError ? error.code : 'failed', bookmarkSaved: error instanceof EmbedCaptureError && error.bookmarkSaved }));
}
