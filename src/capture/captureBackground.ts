import { recordCapturedBookmark } from '../bookmarks/organization/provenance';
import { createEmbedCaptureMessageHandler } from './embedCaptureBackground';
import { EMBED_CAPTURE_MESSAGE_CHANNEL, EMBED_CAPTURE_STORAGE_KEY } from './embedCaptureQueue';
import {
  CAPTURE_FOLDER_NAME,
  CAPTURE_MESSAGE_CHANNEL,
  CAPTURE_STORAGE_KEY,
  CaptureError,
  MAX_PENDING_CAPTURES,
  isCapturableUrl,
  isCaptureId,
  isCaptureIntent,
  normalizeCaptureUrl,
  parseCaptureQueueRecord,
  type CaptureAcknowledgement,
  type CaptureIntent,
} from './captureQueue';

type Bookmark = { id: string; parentId?: string; title: string; url?: string; children?: Bookmark[]; folderType?: string; unmodifiable?: string };
type Tab = { id?: number; windowId: number; url?: string; title?: string; active?: boolean; incognito?: boolean };
export type CaptureSender = { id?: string; url?: string; tab?: { id?: number } };

export type CaptureOriginInput = { bookmarkId: string; url: string; title: string; parentId: string; folderPath: string; created: boolean; organized: boolean; requestId?: string };

export type CaptureRuntime = {
  extensionId: string;
  getURL(path: string): string;
  getTab(id: number): Promise<Tab>;
  getBookmarkTree(): Promise<Bookmark[]>;
  createBookmark(input: { parentId: string; title: string; url?: string }): Promise<Bookmark>;
  readStorage(): Promise<unknown>;
  writeStorage(intents: CaptureIntent[], acknowledged: CaptureAcknowledgement[]): Promise<void>;
  createTab(input: { url: string; active: true }): Promise<unknown>;
  randomId(): string;
  now(): number;
  recordCapture?(input: CaptureOriginInput): Promise<void>;
};

export function surfaceForSender(sender: CaptureSender, runtime: CaptureRuntime): 'popup' | 'canvas' | null {
  if (sender.id !== runtime.extensionId || !sender.url) return null;
  try {
    const url = new URL(sender.url);
    const base = new URL(runtime.getURL(''));
    if (url.protocol !== base.protocol || url.host !== base.host) return null;
    if (url.href === runtime.getURL('popup.html')) return 'popup';
    if (url.pathname === new URL(runtime.getURL('newtab.html')).pathname) return 'canvas';
  } catch {
    return null;
  }
  return null;
}

function assertMessage(message: unknown, sender: CaptureSender, runtime: CaptureRuntime): { action: string; id?: string; tabId?: number; parentId?: string } {
  if (!message || typeof message !== 'object') throw new CaptureError('invalid_request');
  const input = message as Record<string, unknown>;
  const surface = surfaceForSender(sender, runtime);
  if (!surface || input.channel !== CAPTURE_MESSAGE_CHANNEL) throw new CaptureError('invalid_request');
  const action = input.action;
  if (action === 'capture' && surface === 'popup' && Number.isSafeInteger(input.tabId) && (input.tabId as number) >= 0
    && (input.parentId === undefined || isCaptureId(input.parentId))
    && Object.keys(input).every((key) => ['channel', 'action', 'tabId', 'parentId'].includes(key))) return { action, tabId: input.tabId as number, ...(typeof input.parentId === 'string' ? { parentId: input.parentId } : {}) };
  if (action === 'load' && Object.keys(input).every((key) => ['channel', 'action'].includes(key))) return { action };
  if ((action === 'ack' && surface === 'canvas' || action === 'open' && surface === 'popup') && isCaptureId(input.id)
    && Object.keys(input).every((key) => ['channel', 'action', 'id'].includes(key))) return { action, id: input.id };
  throw new CaptureError('invalid_request');
}

export async function ensureCaptureBookmark(runtime: CaptureRuntime, url: string, title: string, parentId?: string) {
  const tree = await runtime.getBookmarkTree();
  const roots = tree.flatMap((root) => root.children ?? []);
  const other = roots.find((node) => node.folderType === 'other') ?? roots.find((node) => node.id === '2');
  const find = (nodes: Bookmark[], path: string[], blocked = false): { folder: Bookmark; path: string[]; blocked: boolean } | undefined => {
    for (const node of nodes) {
      const nextPath = node.title ? [...path, node.title] : path;
      const readonly = blocked || Boolean(node.unmodifiable);
      if (node.id === parentId) return { folder: node, path: nextPath, blocked: readonly };
      const nested = find(node.children ?? [], nextPath, readonly);
      if (nested) return nested;
    }
    return undefined;
  };
  let folder: Bookmark;
  let path: string[];
  if (parentId !== undefined) {
    const found = find(tree, []);
    if (!found || found.blocked || found.folder.url || tree.some((root) => root.id === parentId)) throw new CaptureError('unavailable');
    folder = found.folder;
    path = found.path;
  } else {
    if (!other || other.url || other.unmodifiable) throw new CaptureError('unavailable');
    folder = other.children?.find((node) => !node.url && !node.unmodifiable && node.title === CAPTURE_FOLDER_NAME)
      ?? await runtime.createBookmark({ parentId: other.id, title: CAPTURE_FOLDER_NAME });
    path = [other.title, CAPTURE_FOLDER_NAME];
  }
  const normalized = normalizeCaptureUrl(url);
  const existing = folder.children?.find((node) => isCapturableUrl(node.url) && normalizeCaptureUrl(node.url) === normalized);
  const bookmark = existing ?? await runtime.createBookmark({ parentId: folder.id, title, url });
  const pendingFolder = other?.children?.some((node) => node.id === folder.id && node.title === CAPTURE_FOLDER_NAME)
    || (parentId === undefined);
  return { bookmark, folderPath: path.join(' / ').slice(0, 2_048), parentId: folder.id, created: !existing, organized: !pendingFolder };
}

export async function recordCaptureIntent(runtime: CaptureRuntime, intent: CaptureIntent): Promise<void> {
  if (!runtime.recordCapture || !intent.parentId || intent.bookmarkCreated === undefined) return;
  await runtime.recordCapture({ bookmarkId: intent.bookmarkId, url: intent.url, title: intent.title,
    parentId: intent.parentId, folderPath: intent.folderPath, created: intent.bookmarkCreated,
    organized: intent.organized === true, requestId: intent.id });
}

function indexNativeBookmarks(tree: Bookmark[]): Map<string, Bookmark> {
  const indexed = new Map<string, Bookmark>();
  const pending = [...tree];
  while (pending.length) {
    const node = pending.pop()!;
    indexed.set(node.id, node);
    pending.push(...(node.children ?? []));
  }
  return indexed;
}

function isCurrentCaptureIntent(intent: CaptureIntent, indexed: Map<string, Bookmark>): boolean {
  const node = indexed.get(intent.bookmarkId);
  return isCapturableUrl(node?.url) && normalizeCaptureUrl(node.url) === normalizeCaptureUrl(intent.url);
}

export type CaptureSerialOwner = <T>(action: () => Promise<T>) => Promise<T>;
export function createCaptureSerialOwner(): CaptureSerialOwner {
  let pending: Promise<unknown> = Promise.resolve();
  return <T>(action: () => Promise<T>) => {
    const operation = pending.then(action);
    pending = operation.catch(() => {});
    return operation;
  };
}

/** One service-worker owner serializes append and ack. Queue data survives worker restarts. */
export function createCaptureMessageHandler(runtime: CaptureRuntime, serialize = createCaptureSerialOwner()) {
  return (message: unknown, sender: CaptureSender): Promise<unknown> => {
    const operation = serialize(async () => {
      const request = assertMessage(message, sender, runtime);
      const record = parseCaptureQueueRecord(await runtime.readStorage());
      let intents = record.intents;
      const acknowledged = record.acknowledged.filter((item) => runtime.now() - item.at <= 30 * 60_000);
      if (request.action === 'load') {
        for (const intent of intents) await recordCaptureIntent(runtime, intent);
        return { ok: true, intents };
      }
      if (request.action === 'ack') {
        const item = intents.find((intent) => intent.id === request.id);
        if (item) await recordCaptureIntent(runtime, item);
        const remaining = intents.filter((item) => item.id !== request.id);
        if (remaining.length !== intents.length) await runtime.writeStorage(remaining, [
          ...acknowledged.filter((item) => item.id !== request.id), { id: request.id!, at: runtime.now() },
        ].slice(-MAX_PENDING_CAPTURES));
        return { ok: true };
      }
      if (request.action === 'open') {
        if (!intents.some((item) => item.id === request.id) && !acknowledged.some((item) => item.id === request.id)) throw new CaptureError('invalid_request');
        const canvasURL = `${runtime.getURL('newtab.html')}?capture=${encodeURIComponent(request.id!)}`;
        await runtime.createTab({ url: canvasURL, active: true });
        return { ok: true };
      }
      const tab = await runtime.getTab(request.tabId!);
      // Background rereads the tab, never trusts a URL supplied by the popup.
      if (tab.id !== request.tabId || !tab.active || tab.incognito || !isCapturableUrl(tab.url)) throw new CaptureError('unsupported_page');
      const existing = intents.find((item) => normalizeCaptureUrl(item.url) === normalizeCaptureUrl(tab.url!) && item.requestedParentId === request.parentId);
      if (existing) {
        // An explicitly repeated save must not reuse a bookmark deleted with its inbox.
        // Only a successful authoritative read can end the stale intent.
        const indexed = indexNativeBookmarks(await runtime.getBookmarkTree());
        if (isCurrentCaptureIntent(existing, indexed)) { await recordCaptureIntent(runtime, existing); return { ok: true, intent: existing }; }
        intents = intents.filter(item => item.id !== existing.id);
      }
      if (intents.length >= MAX_PENDING_CAPTURES) {
        // Deleted inboxes can leave a full queue behind. Reclaim only entries whose
        // missing or changed native identity is confirmed by a successful tree read.
        const indexed = indexNativeBookmarks(await runtime.getBookmarkTree());
        intents = intents.filter(intent => isCurrentCaptureIntent(intent, indexed));
        if (intents.length >= MAX_PENDING_CAPTURES) throw new CaptureError('queue_full');
      }
      const title = (tab.title?.trim() || new URL(tab.url).hostname).slice(0, 2_048);
      const result = await ensureCaptureBookmark(runtime, tab.url, title, request.parentId);
      const { bookmark, folderPath } = result;
      const intent: CaptureIntent = { id: runtime.randomId(), bookmarkId: bookmark.id, title: bookmark.title.slice(0, 2_048), url: bookmark.url ?? tab.url, folderPath, createdAt: runtime.now(),
        ...(request.parentId || runtime.recordCapture ? { parentId: result.parentId, bookmarkCreated: result.created, organized: result.organized } : {}),
        ...(request.parentId ? { requestedParentId: request.parentId } : {}) };
      if (!isCaptureIntent(intent)) throw new CaptureError('failed');
      // Only this key is written; canvas state and all other pending items are retained.
      try { await runtime.writeStorage([...intents, intent], acknowledged); }
      catch (failure) { await recordCaptureIntent(runtime, intent).catch(() => undefined); throw failure; }
      await recordCaptureIntent(runtime, intent);
      return { ok: true, intent };
    });
    return operation.catch((error) => ({ ok: false, error: error instanceof CaptureError ? error.code : 'failed' }));
  };
}

export function installCaptureMessageListener() {
  const runtime = {
    extensionId: chrome.runtime.id,
    getURL: (path) => chrome.runtime.getURL(path),
    getTab: (id) => chrome.tabs.get(id),
    getBookmarkTree: () => chrome.bookmarks.getTree(),
    createBookmark: (input) => chrome.bookmarks.create(input),
    readStorage: async () => (await chrome.storage.local.get(CAPTURE_STORAGE_KEY))[CAPTURE_STORAGE_KEY],
    writeStorage: (intents, acknowledged) => chrome.storage.local.set({ [CAPTURE_STORAGE_KEY]: { version: 1, intents, acknowledged } }),
    createTab: (input) => chrome.tabs.create(input),
    randomId: () => crypto.randomUUID(),
    now: () => Date.now(),
    recordCapture: recordCapturedBookmark,
  } satisfies CaptureRuntime;
  const serialize = createCaptureSerialOwner();
  const handle = createCaptureMessageHandler(runtime, serialize);
  const handleEmbed = createEmbedCaptureMessageHandler({
    ...runtime,
    readEmbedStorage: async () => (await chrome.storage.local.get(EMBED_CAPTURE_STORAGE_KEY))[EMBED_CAPTURE_STORAGE_KEY],
    writeEmbedStorage: (intents, receipts) => chrome.storage.local.set({ [EMBED_CAPTURE_STORAGE_KEY]: { version: 2, intents, receipts } }),
  }, serialize);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || ![CAPTURE_MESSAGE_CHANNEL, EMBED_CAPTURE_MESSAGE_CHANNEL].includes(message.channel)) return false;
    void (message.channel === EMBED_CAPTURE_MESSAGE_CHANNEL ? handleEmbed : handle)(message, sender).then(respond);
    return true;
  });
}
