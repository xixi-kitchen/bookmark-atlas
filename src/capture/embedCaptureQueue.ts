import { isCaptureId } from './captureQueue';

export const EMBED_CAPTURE_STORAGE_KEY = 'bookmark-atlas:capture-queue:v2';
export const EMBED_CAPTURE_MESSAGE_CHANNEL = 'bookmark-atlas:capture:v2';
export const MAX_PENDING_EMBED_CAPTURES = 100;
export const EMBED_CAPTURE_RECEIPT_TTL = 30 * 60_000;

export type EmbedCaptureTarget = { elementId: string; mode: 'create' | 'reuse' };
export type EmbedCaptureIntent = {
  id: string; kind: 'embed'; url: string; title: string; createdAt: number; saveBookmark: boolean;
  bookmarkId?: string; phase: 'preparing' | 'ready' | 'planned' | 'needs-review'; target?: EmbedCaptureTarget;
};
export type EmbedCaptureReceipt = { id: string; at: number; result: 'added' | 'existing' | 'cancelled'; targetId: string | null };
export type EmbedCaptureErrorCode = 'unsupported_page' | 'unavailable' | 'page_changed' | 'queue_full' | 'queue_invalid' | 'invalid_request' | 'request_ended' | 'failed' | 'bookmark_failed' | 'needs_review';
const ERROR_CODES: EmbedCaptureErrorCode[] = ['unsupported_page', 'unavailable', 'page_changed', 'queue_full', 'queue_invalid', 'invalid_request', 'request_ended', 'failed', 'bookmark_failed', 'needs_review'];
export class EmbedCaptureError extends Error {
  constructor(public readonly code: EmbedCaptureErrorCode, public readonly bookmarkSaved = false) {
    super(code);
    this.name = 'EmbedCaptureError';
  }
}

export function isEmbeddableCaptureUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 16_384) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && !url.username && !url.password && (url.protocol === 'https:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}

/** Standard URL parsing only: hash, parameter order/repeats and path remain significant. */
export function normalizeEmbedCaptureUrl(value: string): string { return new URL(value).href; }
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
export const isEmbedElementId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
export function isEmbedCaptureTarget(value: unknown): value is EmbedCaptureTarget {
  return isRecord(value) && hasOnly(value, ['elementId', 'mode']) && isEmbedElementId(value.elementId) && (value.mode === 'create' || value.mode === 'reuse');
}
export function isEmbedCaptureIntent(value: unknown): value is EmbedCaptureIntent {
  if (!isRecord(value) || !hasOnly(value, ['id', 'kind', 'url', 'title', 'createdAt', 'saveBookmark', 'bookmarkId', 'phase', 'target'])) return false;
  return isCaptureId(value.id) && value.kind === 'embed' && isEmbeddableCaptureUrl(value.url)
    && typeof value.title === 'string' && value.title.length <= 2_048 && isTime(value.createdAt)
    && typeof value.saveBookmark === 'boolean'
    && (value.bookmarkId === undefined || (value.saveBookmark && typeof value.bookmarkId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value.bookmarkId)))
    && ['preparing', 'ready', 'planned', 'needs-review'].includes(value.phase as string)
    && (value.target === undefined || isEmbedCaptureTarget(value.target))
    && (value.phase !== 'planned' || isEmbedCaptureTarget(value.target))
    && (!['preparing', 'ready'].includes(value.phase as string) || value.target === undefined);
}
export function isEmbedCaptureReceipt(value: unknown): value is EmbedCaptureReceipt {
  return isRecord(value) && hasOnly(value, ['id', 'at', 'result', 'targetId']) && isCaptureId(value.id) && isTime(value.at)
    && ['added', 'existing', 'cancelled'].includes(value.result as string)
    && (isEmbedElementId(value.targetId) || (value.result === 'cancelled' && value.targetId === null));
}
export type EmbedCaptureQueueRecord = { version: 2; intents: EmbedCaptureIntent[]; receipts: EmbedCaptureReceipt[] };
export function parseEmbedCaptureQueueRecord(value: unknown): EmbedCaptureQueueRecord {
  if (value === undefined) return { version: 2, intents: [], receipts: [] };
  if (!isRecord(value) || !hasOnly(value, ['version', 'intents', 'receipts']) || value.version !== 2
    || !Array.isArray(value.intents) || value.intents.length > MAX_PENDING_EMBED_CAPTURES || !value.intents.every(isEmbedCaptureIntent)
    || !Array.isArray(value.receipts) || value.receipts.length > MAX_PENDING_EMBED_CAPTURES || !value.receipts.every(isEmbedCaptureReceipt)
    || new Set([...value.intents, ...value.receipts].map((item) => item.id)).size !== value.intents.length + value.receipts.length) {
    // Preserve the damaged local value; callers must never overwrite it as an empty journal.
    throw new EmbedCaptureError('queue_invalid');
  }
  return { version: 2, intents: value.intents, receipts: value.receipts };
}

async function send(action: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new EmbedCaptureError('unavailable');
  let response: unknown;
  try { response = await chrome.runtime.sendMessage({ channel: EMBED_CAPTURE_MESSAGE_CHANNEL, action, ...payload }); }
  catch { throw new EmbedCaptureError('unavailable'); }
  if (!isRecord(response)) throw new EmbedCaptureError('failed');
  if (response.ok !== true) throw new EmbedCaptureError(ERROR_CODES.includes(response.error as EmbedCaptureErrorCode) ? response.error as EmbedCaptureErrorCode : 'failed', response.bookmarkSaved === true);
  return response;
}
const assertId = (id: string) => { if (!isCaptureId(id)) throw new EmbedCaptureError('invalid_request'); };
function readIntent(response: Record<string, unknown>): EmbedCaptureIntent {
  if (!isEmbedCaptureIntent(response.intent)) throw new EmbedCaptureError('failed');
  return response.intent;
}
export async function captureEmbedActiveTab(input: { id: string; tabId: number; expectedUrl: string; saveBookmark: boolean }): Promise<EmbedCaptureIntent> {
  assertId(input.id);
  if (!Number.isSafeInteger(input.tabId) || input.tabId < 0 || !isEmbeddableCaptureUrl(input.expectedUrl) || typeof input.saveBookmark !== 'boolean') throw new EmbedCaptureError('invalid_request');
  return readIntent(await send('capture', input));
}
export async function retryEmbedCapture(id: string): Promise<EmbedCaptureIntent> { assertId(id); return readIntent(await send('retry', { id })); }
export async function loadPendingEmbedCaptures(): Promise<EmbedCaptureIntent[]> {
  const response = await send('load');
  return parseEmbedCaptureQueueRecord({ version: 2, intents: response.intents, receipts: [] }).intents;
}
export async function getEmbedCaptureStatus(id: string): Promise<EmbedCaptureIntent | EmbedCaptureReceipt | null> {
  assertId(id);
  const { status } = await send('status', { id });
  if (status === null || isEmbedCaptureIntent(status) || isEmbedCaptureReceipt(status)) return status;
  throw new EmbedCaptureError('failed');
}
export async function planEmbedCapture(id: string, target: EmbedCaptureTarget): Promise<EmbedCaptureIntent> {
  assertId(id);
  if (!isEmbedCaptureTarget(target)) throw new EmbedCaptureError('invalid_request');
  return readIntent(await send('plan', { id, target }));
}
export async function markEmbedCaptureNeedsReview(id: string): Promise<void> { assertId(id); await send('mark-review', { id }); }
export async function ackEmbedCapture(id: string, result: EmbedCaptureReceipt['result'], targetId: string | null): Promise<void> {
  assertId(id);
  if (!['added', 'existing', 'cancelled'].includes(result) || !(isEmbedElementId(targetId) || (result === 'cancelled' && targetId === null))) throw new EmbedCaptureError('invalid_request');
  await send('ack', { id, result, targetId });
}
export async function cancelEmbedCapture(id: string): Promise<void> { assertId(id); await send('cancel', { id }); }
export async function openEmbedCaptureCanvas(id: string): Promise<void> { assertId(id); await send('open', { id }); }
export function subscribePendingEmbedCaptures(listener: () => void): () => void {
  const event = globalThis.chrome?.storage?.onChanged;
  if (!event) return () => {};
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && Object.hasOwn(changes, EMBED_CAPTURE_STORAGE_KEY)) listener();
  };
  event.addListener(onChange);
  return () => event.removeListener(onChange);
}
