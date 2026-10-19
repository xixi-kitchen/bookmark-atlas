export type CaptureIntent = {
  id: string;
  bookmarkId: string;
  title: string;
  url: string;
  folderPath: string;
  createdAt: number;
};

export const CAPTURE_STORAGE_KEY = 'bookmark-atlas:capture-queue:v1';
export const CAPTURE_MESSAGE_CHANNEL = 'bookmark-atlas:capture:v1';
export const CAPTURE_CONSUMER_LOCK = 'bookmark-atlas:capture-consumer:v1';
export const MAX_PENDING_CAPTURES = 100;
export const CAPTURE_FOLDER_NAME = 'Bookmark Atlas';
export type CaptureAcknowledgement = { id: string; at: number };

export type CaptureErrorCode = 'unsupported_page' | 'unavailable' | 'queue_full' | 'queue_invalid' | 'invalid_request' | 'failed' | 'consumer_lock_unavailable';

export class CaptureError extends Error {
  constructor(public readonly code: CaptureErrorCode) {
    super(code);
    this.name = 'CaptureError';
  }
}

export function isCapturableUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 16_384 || !value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function normalizeCaptureUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  const params = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  if (params.length > 1) {
    url.search = '';
    params.forEach(([key, value]) => url.searchParams.append(key, value));
  }
  return url.toString();
}

export function isCaptureId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

export function isCaptureIntent(value: unknown): value is CaptureIntent {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return isCaptureId(item.id) && typeof item.bookmarkId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(item.bookmarkId)
    && typeof item.title === 'string' && item.title.length <= 2_048 && isCapturableUrl(item.url)
    && typeof item.folderPath === 'string' && item.folderPath.length <= 2_048
    && typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt > 0;
}

export function parseCaptureQueue(value: unknown): CaptureIntent[] {
  return parseCaptureQueueRecord(value).intents;
}

export function parseCaptureQueueRecord(value: unknown): { version: 1; intents: CaptureIntent[]; acknowledged: CaptureAcknowledgement[] } {
  if (value === undefined) return { version: 1, intents: [], acknowledged: [] };
  if (!value || typeof value !== 'object') throw new CaptureError('queue_invalid');
  const stored = value as Record<string, unknown>;
  if (stored.version !== 1 || !Array.isArray(stored.intents) || stored.intents.length > MAX_PENDING_CAPTURES
    || !stored.intents.every(isCaptureIntent) || new Set(stored.intents.map((item) => item.id)).size !== stored.intents.length) {
    // Never overwrite a damaged queue. The original local record remains recoverable.
    throw new CaptureError('queue_invalid');
  }
  const acknowledged = stored.acknowledged ?? [];
  if (!Array.isArray(acknowledged) || acknowledged.length > MAX_PENDING_CAPTURES || !acknowledged.every((item) => (
    item && isCaptureId(item.id) && typeof item.at === 'number' && Number.isFinite(item.at) && item.at > 0
  ))) throw new CaptureError('queue_invalid');
  return { version: 1, intents: stored.intents, acknowledged };
}

type CaptureResponse = { ok: true; intents?: CaptureIntent[]; intent?: CaptureIntent } | { ok: false; error: CaptureErrorCode };

async function sendCaptureMessage(action: string, payload: Record<string, unknown> = {}): Promise<Extract<CaptureResponse, { ok: true }>> {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new CaptureError('unavailable');
  let response: CaptureResponse;
  try {
    response = await chrome.runtime.sendMessage({ channel: CAPTURE_MESSAGE_CHANNEL, action, ...payload });
  } catch {
    throw new CaptureError('unavailable');
  }
  if (!response || typeof response !== 'object') throw new CaptureError('failed');
  if (!response.ok) {
    const allowed: CaptureErrorCode[] = ['unsupported_page', 'unavailable', 'queue_full', 'queue_invalid', 'invalid_request', 'failed', 'consumer_lock_unavailable'];
    throw new CaptureError(allowed.includes(response.error) ? response.error : 'failed');
  }
  return response;
}

export async function loadPendingCaptures(): Promise<CaptureIntent[]> {
  const response = await sendCaptureMessage('load');
  return parseCaptureQueue({ version: 1, intents: response.intents });
}

export async function captureActiveTab(tabId: number): Promise<CaptureIntent> {
  const response = await sendCaptureMessage('capture', { tabId });
  if (!isCaptureIntent(response.intent)) throw new CaptureError('failed');
  return response.intent;
}

export async function openCaptureCanvas(id: string): Promise<void> {
  if (!isCaptureId(id)) throw new CaptureError('invalid_request');
  await sendCaptureMessage('open', { id });
}

export async function ackCapture(id: string): Promise<void> {
  if (!isCaptureId(id)) throw new CaptureError('invalid_request');
  await sendCaptureMessage('ack', { id });
}

export function subscribePendingCaptures(listener: (intents: CaptureIntent[]) => void): () => void {
  const event = globalThis.chrome?.storage?.onChanged;
  if (!event) return () => {};
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !Object.hasOwn(changes, CAPTURE_STORAGE_KEY)) return;
    try {
      listener(parseCaptureQueue(changes[CAPTURE_STORAGE_KEY]?.newValue));
    } catch {
      // A malformed record is not an empty queue and must not acknowledge work.
    }
  };
  event.addListener(onChange);
  return () => event.removeListener(onChange);
}

export async function withCaptureConsumerLock<T>(action: () => Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks?.request) throw new CaptureError('consumer_lock_unavailable');
  return navigator.locks.request(CAPTURE_CONSUMER_LOCK, { mode: 'exclusive' }, action);
}
