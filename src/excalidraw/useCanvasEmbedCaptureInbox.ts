import { useEffect, useRef } from 'react';
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { withCaptureConsumerLock } from '../capture/captureQueue';
import {
  ackEmbedCapture, getEmbedCaptureStatus, loadPendingEmbedCaptures, markEmbedCaptureNeedsReview,
  planEmbedCapture, subscribePendingEmbedCaptures,
} from '../capture/embedCaptureQueue';
import { buildCapturedWebEmbedChange } from './capturedWebEmbed';
import { getBookmarkElementData } from './bookmarkElements';
import type { CaptureCanvasApi } from './useCanvasCaptureInbox';
import { createStoredScene, loadStoredScene } from './sceneStorage';
import { createSceneSyncFingerprint } from './sceneSync';
import { t } from '../i18n';

/** Shares the bookmark inbox lock/save boundary, without reading native bookmarks. */
export function useCanvasEmbedCaptureInbox({ api, ready, blocked, onSceneChanged, persist, runSceneMutation, canConsume, ensureBaseline }: {
  api: CaptureCanvasApi | null;
  ready: boolean;
  blocked: boolean;
  onSceneChanged: (elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) => void;
  persist: () => Promise<boolean>;
  runSceneMutation: <T>(operation: () => Promise<T>) => Promise<T>;
  canConsume: () => boolean;
  ensureBaseline: () => Promise<boolean>;
}) {
  const revealedRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!api || !ready || blocked || !globalThis.chrome?.runtime?.sendMessage) return;
    let disposed = false;
    let running = false;
    let runAgain = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => !disposed && document.visibilityState === 'visible';
    const usable = () => visible() && canConsume();
    const fingerprint = () => createSceneSyncFingerprint(createStoredScene(
      api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles(),
    ));
    const checkBaseline = async () => {
      const stored = await loadStoredScene();
      if (stored && createSceneSyncFingerprint(stored) !== createSceneSyncFingerprint(createStoredScene(
        api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles(), stored.libraryItems,
      ))) throw new Error('embed_capture_baseline_changed');
      return stored;
    };
    // Opening the issued target page is the only authorization to change focus.
    const revealReceipt = async () => {
      const id = new URLSearchParams(window.location.search).get('embedCapture');
      if (!id || !/^[\w-]{1,100}$/.test(id) || revealedRequest.current === id || !usable()) return;
      const authorized = () => usable() && new URLSearchParams(window.location.search).get('embedCapture') === id;
      const status = await getEmbedCaptureStatus(id);
      if (!authorized() || !status || status.id !== id || !('result' in status) || status.result === 'cancelled' || !status.targetId) return;
      if (!await ensureBaseline() || !authorized()) return;
      await runSceneMutation(async () => {
        if (!authorized()) return;
        const durable = await checkBaseline();
        if (!authorized()) return;
        const target = api.getSceneElementsIncludingDeleted().find((element) => element.id === status.targetId);
        if (!target || target.isDeleted || target.type !== 'embeddable' || getBookmarkElementData(target)) return;
        if (!durable?.elements.some((element) => element.id === target.id && !element.isDeleted && element.type === 'embeddable' && element.link === target.link)) return;
        api.updateScene({ appState: { selectedElementIds: { [target.id]: true } }, captureUpdate: CaptureUpdateAction.NEVER });
        api.scrollToContent(target, { animate: true, duration: 260, fitToContent: true, maxZoom: 1, viewportZoomFactor: 0.8 });
        revealedRequest.current = id;
      });
    };
    const drain = async () => {
      if (!visible()) return;
      if (running) { runAgain = true; return; }
      running = true;
      let failed = false;
      try {
        await withCaptureConsumerLock(async () => {
          if (!usable()) return;
          const intents = await loadPendingEmbedCaptures();
          for (const intent of intents) {
            if (!usable()) return;
            if (intent.phase === 'preparing' || intent.phase === 'needs-review') continue;
            try {
              if (!await ensureBaseline()) throw new Error('embed_capture_baseline_pending');
              await runSceneMutation(async () => {
                if (!usable()) return;
                await checkBaseline();
                if (!usable()) return;
                const result = buildCapturedWebEmbedChange(api.getSceneElementsIncludingDeleted(), intent);
                if (result.outcome === 'needs-review' || !result.target) {
                  await markEmbedCaptureNeedsReview(intent.id);
                  if (!disposed) api.setToast({ message: t('captureEmbedNeedsReview') });
                  return;
                }
                if (intent.phase === 'ready') {
                  const beforePlan = fingerprint();
                  const planned = await planEmbedCapture(intent.id, {
                    elementId: result.target.id,
                    mode: result.changed || result.target.customData?.bookmarkAtlas?.requestId === intent.id ? 'create' : 'reuse',
                  });
                  if (!usable()) return;
                  if (planned.phase !== 'planned' || planned.target?.elementId !== result.target.id) throw new Error('embed_capture_plan_changed');
                  // A local undo/edit during the journal write must never be overwritten.
                  if (fingerprint() !== beforePlan) throw new Error('embed_capture_scene_changed');
                }
                if (result.changed) api.updateScene({ elements: result.elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
                onSceneChanged(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
                const targetId = result.target.id;
                const cancelled = result.outcome === 'cancelled';
                const matchesTarget = (element: ExcalidrawElement) => element.id === targetId
                  && element.isDeleted === cancelled && element.type === 'embeddable' && element.link === result.target!.link;
                if (!api.getSceneElementsIncludingDeleted().some(matchesTarget)) throw new Error('embed_capture_scene_not_ready');
                if (!await persist()) throw new Error('embed_capture_save_failed');
                if (!usable()) return;
                const durable = await loadStoredScene();
                if (!usable()) return;
                if (!durable?.elements.some(matchesTarget) || !api.getSceneElementsIncludingDeleted().some(matchesTarget)) throw new Error('embed_capture_not_durable');
                await ackEmbedCapture(intent.id, result.outcome, targetId);
                if (!disposed) api.setToast({ message: t(cancelled ? 'captureEmbedCancelled' : result.outcome === 'existing' ? 'captureEmbedCanvasExisting' : 'captureEmbedCanvasAdded') });
              });
            } catch {
              // Keep the request/journal for an explicit retry; one bad item cannot starve later ones.
              failed = true;
            }
          }
          if (usable()) await revealReceipt();
          if (failed) throw new Error('embed_capture_pending_items');
        });
      } catch {
        failed = true;
        if (!disposed) {
          api.setToast({ message: t('captureEmbedCanvasPending') });
          retryTimer = setTimeout(() => { void drain(); }, 5_000);
        }
      } finally {
        running = false;
        if (runAgain && !failed && !disposed) { runAgain = false; void drain(); }
      }
    };
    const wake = () => { if (retryTimer) clearTimeout(retryTimer); void drain(); };
    const stop = subscribePendingEmbedCaptures(wake);
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
  }, [api, ready, blocked, onSceneChanged, persist, runSceneMutation, canConsume, ensureBaseline]);
}
