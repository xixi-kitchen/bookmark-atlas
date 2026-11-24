import { useEffect } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import { withCaptureConsumerLock } from '../../capture/captureQueue';
import type { CaptureCanvasApi } from '../../excalidraw/useCanvasCaptureInbox';
import { applyCanvasPathChanges, loadCanvasPathChanges, NATIVE_CANVAS_PATHS_KEY } from './canvasChanges';

/** Repair current cards through the canvas' shared mutation and persistence path. */
export function useNativeBookmarkAssociations({ api, ready, blocked, canConsume, ensureBaseline, runSceneMutation, persist, onChanged }: {
  api: CaptureCanvasApi | null;
  ready: boolean;
  blocked: boolean;
  canConsume: () => boolean;
  ensureBaseline: () => Promise<boolean>;
  runSceneMutation: <T>(operation: () => Promise<T>) => Promise<T>;
  persist: () => Promise<boolean>;
  onChanged: (elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) => void;
}) {
  useEffect(() => {
    if (!api || !ready || blocked || !globalThis.chrome?.storage?.local) return;
    let disposed = false;
    let running = false;
    let again = false;
    const repair = async () => {
      if (disposed || !canConsume()) return;
      if (running) { again = true; return; }
      running = true;
      try {
        await withCaptureConsumerLock(async () => {
          await runSceneMutation(async () => {
            if (disposed || !canConsume() || !await ensureBaseline() || disposed || !canConsume()) return;
            const changes = await loadCanvasPathChanges();
            if (disposed || !canConsume() || !changes.length) return;
            const current = api.getSceneElementsIncludingDeleted();
            const next = applyCanvasPathChanges(current, changes);
            if (next.every((element, index) => element === current[index])) return;
            api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER });
            onChanged(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
            await persist();
          });
        });
      } catch {
        // The durable association records stay available for the next visible attempt.
      } finally {
        running = false;
        if (again && !disposed) { again = false; void repair(); }
      }
    };
    const onStorage = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && NATIVE_CANVAS_PATHS_KEY in changes) void repair();
    };
    const visible = () => { if (document.visibilityState === 'visible') void repair(); };
    chrome.storage.onChanged?.addListener(onStorage);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    void repair();
    return () => {
      disposed = true;
      chrome.storage.onChanged?.removeListener(onStorage);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [api, ready, blocked, canConsume, ensureBaseline, runSceneMutation, persist, onChanged]);
}
