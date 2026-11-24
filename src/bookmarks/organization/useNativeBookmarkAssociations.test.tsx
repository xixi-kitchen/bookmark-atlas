import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@excalidraw/excalidraw/types';
import { createBookmarkElement, getBookmarkElementData } from '../../excalidraw/bookmarkElements';
import { useNativeBookmarkAssociations } from './useNativeBookmarkAssociations';
import type { CaptureCanvasApi } from '../../excalidraw/useCanvasCaptureInbox';

vi.mock('../../capture/captureQueue', () => ({ withCaptureConsumerLock: async (action: () => Promise<unknown>) => action() }));
vi.mock('./canvasChanges', async importOriginal => {
  const original = await importOriginal<typeof import('./canvasChanges')>();
  return { ...original, loadCanvasPathChanges: async () => [{ bookmarkId: 'a', title: 'Article', url: 'https://example.com/', beforePath: 'Inbox', afterPath: 'Work' }] };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('native association save lifecycle', () => {
  function setup(baseline: boolean) {
    const card = createBookmarkElement({ id: 'a', title: 'Article', url: 'https://example.com/' }, { x: 0, y: 0 }, { folderPath: 'Inbox' });
    let elements = [card];
    const getElements = () => elements;
    const api = {
      getSceneElementsIncludingDeleted: getElements, getAppState: () => ({} as AppState), getFiles: () => ({}),
      updateScene: vi.fn(({ elements: updated }) => { elements = updated; }),
    } as unknown as CaptureCanvasApi;
    vi.stubGlobal('chrome', { storage: { local: {}, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } });
    const onChanged = vi.fn();
    const persist = vi.fn(async () => {
      expect(onChanged).toHaveBeenCalledWith(elements, {}, {});
      expect(getBookmarkElementData(elements[0]!)?.folderPath).toBe('Work');
      return true;
    });
    const args = { api, ready: true, blocked: false, canConsume: () => true, ensureBaseline: async () => baseline,
      runSceneMutation: async <T,>(action: () => Promise<T>) => action(), persist, onChanged };
    renderHook(() => useNativeBookmarkAssociations(args));
    return { persist, api };
  }
  it('feeds live updated elements into the normal save path before persistence', async () => {
    const { persist } = setup(true);
    await waitFor(() => expect(persist).toHaveBeenCalledOnce());
  });
  it('waits when another canvas revision is not yet adopted', async () => {
    const { api } = setup(false);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(api.updateScene).not.toHaveBeenCalled();
  });
});
