import { useEffect } from 'react';
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { ackCapture, loadPendingCaptures, subscribePendingCaptures, withCaptureConsumerLock } from '../capture/captureQueue';
import type { BookmarkPresentation } from './bookmarkDisplay';
import { buildCapturedBookmarkChange } from './captureElements';
import { t } from '../i18n';
import { createStoredScene, loadStoredScene } from './sceneStorage';
import { createSceneSyncFingerprint } from './sceneSync';
import { isCapturableUrl } from '../capture/captureQueue';

type CaptureCanvasApi = {
  getSceneElementsIncludingDeleted: () => readonly ExcalidrawElement[];
  getAppState: () => AppState;
  getFiles: () => BinaryFiles;
  updateScene: (scene: { elements?: readonly ExcalidrawElement[]; appState?: Partial<AppState>; captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction] }) => void;
  scrollToContent: (element: ExcalidrawElement, options?: { animate?: boolean; duration?: number }) => void;
  setToast: (toast: { message: string }) => void;
};

/** A foreground canvas consumes durable intents; the service worker never replaces a scene. */
export function useCanvasCaptureInbox({ api, ready, blocked, presentation, onSceneChanged, persist, runSceneMutation, canConsume, ensureBaseline }: {
  api: CaptureCanvasApi | null;
  ready: boolean;
  blocked: boolean;
  presentation: BookmarkPresentation;
  onSceneChanged: (elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) => void;
  persist: () => Promise<boolean>;
  runSceneMutation: <T>(operation: () => Promise<T>) => Promise<T>;
  canConsume: () => boolean;
  ensureBaseline: () => Promise<boolean>;
}) {
  useEffect(() => {
    if (!api || !ready || blocked || !globalThis.chrome?.runtime?.sendMessage) return;
    let disposed = false;
    let running = false;
    let runAgain = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => !disposed && document.visibilityState === 'visible';
    const drain = async () => {
      if (!visible()) return;
      if (running) { runAgain = true; return; }
      running = true;
      let failed = false;
      try {
        await withCaptureConsumerLock(async () => {
          if (!visible() || !canConsume()) return;
          const intents = await loadPendingCaptures();
          for (const intent of intents) {
            if (!visible() || !canConsume()) return;
            try {
              if (!await ensureBaseline()) throw new Error('capture_baseline_pending');
              await runSceneMutation(async () => {
                if (!visible() || !canConsume()) return;
                let node: chrome.bookmarks.BookmarkTreeNode | undefined;
                try { [node] = await chrome.bookmarks.get(intent.bookmarkId); }
                catch {
                  // Confirm absence using a successful tree read before cancelling a
                  // deleted bookmark. Transient API failures retain the original intent.
                  const tree = await chrome.bookmarks.getTree();
                  const find = (nodes: chrome.bookmarks.BookmarkTreeNode[]): chrome.bookmarks.BookmarkTreeNode | undefined => {
                    for (const candidate of nodes) {
                      if (candidate.id === intent.bookmarkId) return candidate;
                      const found = find(candidate.children ?? []);
                      if (found) return found;
                    }
                  };
                  node = find(tree);
                }
                if (!visible() || !canConsume()) return;
                if (!node || !isCapturableUrl(node.url)) {
                  await ackCapture(intent.id);
                  if (!disposed) api.setToast({ message: t('captureBookmarkRemoved') });
                  return;
                }
                const stored = await loadStoredScene();
                if (!visible() || !canConsume()) return;
                if (stored && createSceneSyncFingerprint(stored) !== createSceneSyncFingerprint(
                  createStoredScene(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles(), stored.libraryItems),
                )) throw new Error('capture_baseline_changed');
                const result = buildCapturedBookmarkChange(api.getSceneElementsIncludingDeleted(), intent, node, presentation);
                if (result.changed) {
                  api.updateScene({ elements: result.elements, appState: { selectedElementIds: result.target ? { [result.target.id]: true } : {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
                }
                // updateScene is synchronous, but onChange can arrive after a React batch.
                // Explicitly feed the live API state through the same save/broadcast path.
                onSceneChanged(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
                if (result.target && !api.getSceneElementsIncludingDeleted().some((element) => element.id === result.target!.id)) {
                  throw new Error('capture_scene_not_ready');
                }
                if (!await persist()) throw new Error('capture_save_failed');
                if (disposed || !canConsume()) return;
                const durable = await loadStoredScene();
                if (disposed || !canConsume()) return;
                if (result.target && !durable?.elements.some((element) => element.id === result.target!.id)) {
                  throw new Error('capture_not_durable');
                }
                if (result.target && !api.getSceneElementsIncludingDeleted().some((element) => element.id === result.target!.id)) {
                  throw new Error('capture_changed_during_save');
                }
                // Do not lose an intent when persistence fails or a tab closes mid-save.
                await ackCapture(intent.id);
                if (disposed) return;
                if (result.target && !result.target.isDeleted) api.scrollToContent(result.target, { animate: true, duration: 260 });
                api.setToast({ message: t('captureCanvasAdded') });
              });
            } catch {
              // An invalid or temporarily unavailable item cannot starve later captures.
              failed = true;
            }
          }
          if (failed) throw new Error('capture_pending_items');
        });
      } catch {
        failed = true;
        if (!disposed) {
          api.setToast({ message: t('captureCanvasPending') });
          retryTimer = setTimeout(() => { void drain(); }, 5_000);
        }
      } finally {
        running = false;
        if (runAgain && !failed && !disposed) { runAgain = false; void drain(); }
      }
    };
    const wake = () => { if (retryTimer) clearTimeout(retryTimer); void drain(); };
    const stop = subscribePendingCaptures(wake);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    wake();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      stop();
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [api, ready, blocked, presentation, onSceneChanged, persist, runSceneMutation, canConsume, ensureBaseline]);
}
