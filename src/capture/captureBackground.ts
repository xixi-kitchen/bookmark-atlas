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
type Sender = { id?: string; url?: string; tab?: { id?: number } };

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
};

function surfaceForSender(sender: Sender, runtime: CaptureRuntime): 'popup' | 'canvas' | null {
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

function assertMessage(message: unknown, sender: Sender, runtime: CaptureRuntime): { action: string; id?: string; tabId?: number } {
  if (!message || typeof message !== 'object') throw new CaptureError('invalid_request');
  const input = message as Record<string, unknown>;
  const surface = surfaceForSender(sender, runtime);
  if (!surface || input.channel !== CAPTURE_MESSAGE_CHANNEL) throw new CaptureError('invalid_request');
  const action = input.action;
  if (action === 'capture' && surface === 'popup' && Number.isSafeInteger(input.tabId) && (input.tabId as number) >= 0
    && Object.keys(input).every((key) => ['channel', 'action', 'tabId'].includes(key))) return { action, tabId: input.tabId as number };
  if (action === 'load' && Object.keys(input).every((key) => ['channel', 'action'].includes(key))) return { action };
  if ((action === 'ack' && surface === 'canvas' || action === 'open' && surface === 'popup') && isCaptureId(input.id)
    && Object.keys(input).every((key) => ['channel', 'action', 'id'].includes(key))) return { action, id: input.id };
  throw new CaptureError('invalid_request');
}

async function ensureCaptureBookmark(runtime: CaptureRuntime, url: string, title: string) {
  const tree = await runtime.getBookmarkTree();
  const roots = tree.flatMap((root) => root.children ?? []);
  const other = roots.find((node) => node.folderType === 'other') ?? roots.find((node) => node.id === '2');
  if (!other || other.url || other.unmodifiable) throw new CaptureError('unavailable');
  const folder = other.children?.find((node) => !node.url && !node.unmodifiable && node.title === CAPTURE_FOLDER_NAME)
    ?? await runtime.createBookmark({ parentId: other.id, title: CAPTURE_FOLDER_NAME });
  const normalized = normalizeCaptureUrl(url);
  const bookmark = folder.children?.find((node) => isCapturableUrl(node.url) && normalizeCaptureUrl(node.url) === normalized)
    ?? await runtime.createBookmark({ parentId: folder.id, title, url });
  return { bookmark, folderPath: `${other.title} / ${CAPTURE_FOLDER_NAME}`.slice(0, 2_048) };
}

/** One service-worker owner serializes append and ack. Queue data survives worker restarts. */
export function createCaptureMessageHandler(runtime: CaptureRuntime) {
  let pending: Promise<unknown> = Promise.resolve();
  return (message: unknown, sender: Sender): Promise<unknown> => {
    const operation = pending.then(async () => {
      const request = assertMessage(message, sender, runtime);
      const record = parseCaptureQueueRecord(await runtime.readStorage());
      const intents = record.intents;
      const acknowledged = record.acknowledged.filter((item) => runtime.now() - item.at <= 30 * 60_000);
      if (request.action === 'load') return { ok: true, intents };
      if (request.action === 'ack') {
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
      const existing = intents.find((item) => normalizeCaptureUrl(item.url) === normalizeCaptureUrl(tab.url!));
      if (existing) return { ok: true, intent: existing };
      if (intents.length >= MAX_PENDING_CAPTURES) throw new CaptureError('queue_full');
      const title = (tab.title?.trim() || new URL(tab.url).hostname).slice(0, 2_048);
      const { bookmark, folderPath } = await ensureCaptureBookmark(runtime, tab.url, title);
      const intent: CaptureIntent = { id: runtime.randomId(), bookmarkId: bookmark.id, title: bookmark.title.slice(0, 2_048), url: bookmark.url ?? tab.url, folderPath, createdAt: runtime.now() };
      if (!isCaptureIntent(intent)) throw new CaptureError('failed');
      // Only this key is written; canvas state and all other pending items are retained.
      await runtime.writeStorage([...intents, intent], acknowledged);
      return { ok: true, intent };
    });
    pending = operation.catch(() => {});
    return operation.catch((error) => ({ ok: false, error: error instanceof CaptureError ? error.code : 'failed' }));
  };
}

export function installCaptureMessageListener() {
  const handle = createCaptureMessageHandler({
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
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || message.channel !== CAPTURE_MESSAGE_CHANNEL) return false;
    void handle(message, sender).then(respond);
    return true;
  });
}
