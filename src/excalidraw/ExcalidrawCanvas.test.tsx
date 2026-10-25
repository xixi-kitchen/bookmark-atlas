import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { CanvasSyncManifest } from './sceneSync';
import type { StoredExcalidrawScene } from './sceneStorage';
import { createSceneSyncFingerprint } from './sceneSync';
import { ExcalidrawCanvas } from './ExcalidrawCanvas';
import { createBookmarkElement, getBookmarkElementData } from './bookmarkElements';
import type { OrganizationItem, OrganizationPlan } from '../ai/plan';
import { isValidElement, type ReactElement } from 'react';
import { t } from '../i18n';
import { setLanguagePreference } from '../i18n/languagePreference';

type RenderEmbeddable = NonNullable<import('@excalidraw/excalidraw/types').ExcalidrawProps['renderEmbeddable']>;

const host = vi.hoisted(() => ({
  api: {
    getSceneElements: vi.fn(() => [] as readonly ExcalidrawElement[]),
    getSceneElementsIncludingDeleted: vi.fn(() => [] as readonly ExcalidrawElement[]),
    getAppState: vi.fn(() => ({ zoom: { value: 1 } }) as AppState),
    getFiles: vi.fn(() => ({})),
    updateLibrary: vi.fn(async () => []),
    updateScene: vi.fn(),
    addFiles: vi.fn(),
    scrollToContent: vi.fn(),
    setToast: vi.fn(),
  },
  loadLocal: vi.fn(),
  saveLocal: vi.fn(async () => undefined),
  saveRecovery: vi.fn(async () => undefined),
  loadCloud: vi.fn(),
  readManifest: vi.fn(),
  readDevice: vi.fn(),
  saveCloud: vi.fn(async () => ({ status: 'unavailable' })),
  initialData: null as Promise<unknown> | null,
  onChange: null as ((elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) => void) | null,
  renderEmbeddable: null as RenderEmbeddable | null,
}));

vi.mock('@excalidraw/excalidraw', async (importOriginal) => {
  const { useEffect } = await import('react');
  const original = await importOriginal<typeof import('@excalidraw/excalidraw')>();
  return {
    ...original,
    CaptureUpdateAction: { NEVER: 'never', IMMEDIATELY: 'immediately' },
    Excalidraw: (props: {
      initialData: Promise<unknown>;
      excalidrawAPI: (api: typeof host.api) => void;
      renderTopRightUI: () => unknown;
      onChange: typeof host.onChange;
      renderEmbeddable: RenderEmbeddable;
    }) => {
      host.initialData = props.initialData;
      host.onChange = props.onChange;
      host.renderEmbeddable = props.renderEmbeddable;
      // Excalidraw exposes its API before resolving asynchronous initialData.
      useEffect(() => props.excalidrawAPI(host.api), []);
      return props.renderTopRightUI();
    },
  };
});

// Exercise the canvas request/preview boundary without contacting a model service.
vi.mock('../ai/AIOrganizer', () => ({
  AIOrganizer: ({ items, onPlan }: { items: OrganizationItem[]; onPlan: (plan: OrganizationPlan) => void }) => (
    <div role="dialog" aria-label="Test AI organizer">
      <output data-testid="ai-request-items">{JSON.stringify(items)}</output>
      <button type="button" onClick={() => onPlan({ groups: [{ title: 'Suggested group', items: items.map(({ id }) => ({ id })) }] })}>Return model plan</button>
    </div>
  ),
}));

vi.mock('./sceneStorage', async (importOriginal) => ({
  ...await importOriginal<typeof import('./sceneStorage')>(),
  loadStoredScene: host.loadLocal,
  saveStoredScene: host.saveLocal,
  saveSceneRecoverySnapshot: host.saveRecovery,
}));

vi.mock('./sceneSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./sceneSync')>(),
  loadSceneFromSync: host.loadCloud,
  getCanvasSyncManifest: host.readManifest,
  getCanvasSyncDeviceId: host.readDevice,
  saveSceneToSync: host.saveCloud,
  subscribeToCanvasSync: vi.fn(() => () => undefined),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function scene(id: string, savedAt = 100): StoredExcalidrawScene {
  return {
    version: 2,
    elements: [{ id, type: 'rectangle', version: 1, versionNonce: 7, updated: savedAt, isDeleted: false } as ExcalidrawElement],
    appState: { viewBackgroundColor: '#ffffff' } as AppState,
    files: {},
    libraryItems: [],
    savedAt,
  };
}

function manifestFor(value: StoredExcalidrawScene, deviceId = 'this-device'): CanvasSyncManifest {
  return {
    version: 1,
    revision: 'current-cloud-revision',
    deviceId,
    contextId: 'previous-tab',
    fingerprint: createSceneSyncFingerprint(value),
    fingerprintVersion: 2,
    parentFingerprint: 'previous-base',
    updatedAt: value.savedAt,
    codec: 'plain-base64',
    chunkCount: 1,
    encodedLength: 10,
    elementCount: value.elements.length,
    excludedFileCount: 0,
  };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  host.initialData = null;
  host.onChange = null;
  host.renderEmbeddable = null;
  host.api.getSceneElements.mockReturnValue([]);
  host.api.getSceneElementsIncludingDeleted.mockReturnValue([]);
  host.api.getAppState.mockReturnValue({ zoom: { value: 1 } } as AppState);
  host.saveRecovery.mockReset().mockResolvedValue(undefined);
  host.loadLocal.mockReset();
  host.loadCloud.mockReset();
  host.readManifest.mockReset();
  host.readDevice.mockReset();
});

describe('canvas web embed integration', () => {
  beforeEach(async () => {
    await setLanguagePreference('en');
    host.loadLocal.mockResolvedValue(null);
    host.loadCloud.mockResolvedValue(null);
    host.readManifest.mockResolvedValue(null);
    host.readDevice.mockResolvedValue('this-device');
  });

  afterEach(async () => { await setLanguagePreference('auto'); });

  const element = {
    id: 'web-one', type: 'embeddable', link: 'https://example.com/page', isDeleted: false,
  } as Parameters<RenderEmbeddable>[0];
  const state = {
    zoom: { value: 1 }, scrollX: 0, scrollY: 0, selectedElementIds: {},
    activeEmbeddable: { element, state: 'active' },
  } as unknown as AppState;

  function webEmbed(appState = state, embedElement = element) {
    const result = host.renderEmbeddable!(embedElement, appState);
    expect(isValidElement(result)).toBe(true);
    return result as ReactElement<{ onExitInteraction: () => void; uiLanguage?: string }>;
  }

  it('keeps one exit callback across embed renders and parent updates, clearing only active interaction', async () => {
    const canvas = render(<ExcalidrawCanvas roots={[]} />);
    await act(async () => { await host.initialData; });
    const first = webEmbed();

    const movedState = { ...state, scrollX: 100, zoom: { value: 0.8 } } as AppState;
    expect(webEmbed(movedState).props.onExitInteraction)
      .toBe(first.props.onExitInteraction);
    expect(webEmbed(state, { ...element, id: 'web-two' }).props.onExitInteraction)
      .toBe(first.props.onExitInteraction);
    canvas.rerender(<ExcalidrawCanvas roots={[]} />);
    const afterParentUpdate = webEmbed();
    expect(afterParentUpdate.props.onExitInteraction).toBe(first.props.onExitInteraction);

    render(afterParentUpdate);
    host.api.updateScene.mockClear();
    fireEvent.click(screen.getByRole('button', { name: t('webEmbedExit') }));
    expect(host.api.updateScene).toHaveBeenCalledOnce();
    expect(host.api.updateScene).toHaveBeenCalledWith({
      appState: { activeEmbeddable: null }, captureUpdate: 'never',
    });
  });

  it('passes language changes through the same embed while retaining its iframe', async () => {
    const canvas = render(<ExcalidrawCanvas roots={[]} />);
    await act(async () => { await host.initialData; });
    const first = webEmbed();
    expect(first.props.uiLanguage).toBe('en');
    const embedded = render(first);
    const frame = embedded.container.querySelector('iframe');
    expect(frame).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Embedded web page actions' })).toBeInTheDocument();

    await act(async () => { await setLanguagePreference('zh-CN'); });
    canvas.rerender(<ExcalidrawCanvas roots={[]} />);
    const translated = webEmbed();
    expect(translated.props.uiLanguage).toBe('zh-CN');
    expect(translated.props.onExitInteraction).toBe(first.props.onExitInteraction);
    embedded.rerender(translated);
    expect(screen.getByRole('toolbar', { name: t('webEmbedToolbar') })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Embedded web page actions' })).not.toBeInTheDocument();
    expect(embedded.container.querySelector('iframe')).toBe(frame);
  });
});

describe('canvas startup sync', () => {
  it('waits for local state and device identity before judging an early cloud update', async () => {
    const saved = scene('saved-bookmark');
    const manifest = manifestFor(saved);
    saved.syncBaseFingerprint = manifest.fingerprint;
    const localRead = deferred<StoredExcalidrawScene>();
    const deviceRead = deferred<string>();
    host.loadLocal.mockReturnValue(localRead.promise);
    host.readDevice.mockReturnValue(deviceRead.promise);
    host.loadCloud.mockResolvedValue({ scene: saved, manifest });
    host.readManifest.mockResolvedValue(manifest);

    await act(async () => { render(<ExcalidrawCanvas roots={[]} />); });

    // The cloud check has arrived while startup still lacks both local inputs.
    expect(host.readManifest).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(host.api.updateScene).not.toHaveBeenCalled();

    await act(async () => {
      localRead.resolve(saved);
      deviceRead.resolve('this-device');
      await host.initialData;
    });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(host.api.updateScene).not.toHaveBeenCalled();
    expect(await host.initialData).toMatchObject({ elements: saved.elements });
  });

  it('preserves a genuine cross-device branch once startup inputs are available', async () => {
    const local = { ...scene('local-edit', 200), syncBaseFingerprint: 'shared-base' };
    const remote = scene('other-device-edit', 300);
    const manifest = { ...manifestFor(remote, 'other-device'), parentFingerprint: 'shared-base' };
    host.loadLocal.mockResolvedValue(local);
    host.readDevice.mockResolvedValue('this-device');
    host.loadCloud.mockResolvedValue({ scene: remote, manifest });
    host.readManifest.mockResolvedValue(manifest);

    await act(async () => { render(<ExcalidrawCanvas roots={[]} />); });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep local' })).toBeInTheDocument();
    expect(host.api.updateScene).not.toHaveBeenCalled();
    expect(await host.initialData).toMatchObject({ elements: local.elements });
  });

  it('still reports a divergent update that was queued before startup finished', async () => {
    const local = scene('already-synced-edit', 200);
    const initialManifest = manifestFor(local);
    local.syncBaseFingerprint = initialManifest.fingerprint;
    const remote = scene('divergent-device-edit', 300);
    const incomingManifest = {
      ...manifestFor(remote, 'other-device'),
      revision: 'newer-cloud-revision',
      parentFingerprint: 'older-shared-base',
    };
    const localRead = deferred<StoredExcalidrawScene>();
    const deviceRead = deferred<string>();
    host.loadLocal.mockReturnValue(localRead.promise);
    host.readDevice.mockReturnValue(deviceRead.promise);
    host.loadCloud.mockResolvedValueOnce({ scene: local, manifest: initialManifest })
      .mockResolvedValue({ scene: remote, manifest: incomingManifest });
    host.readManifest.mockResolvedValue(incomingManifest);

    await act(async () => { render(<ExcalidrawCanvas roots={[]} />); });

    expect(host.loadCloud).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await act(async () => {
      localRead.resolve(local);
      deviceRead.resolve('this-device');
      await host.initialData;
    });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(host.api.updateScene).not.toHaveBeenCalled();
    expect(await host.initialData).toMatchObject({ elements: local.elements });
  });
});

async function mountSelectedBookmarks() {
  let elements: readonly ExcalidrawElement[] = [
    createBookmarkElement({ id: 'first', type: 'bookmark', title: 'First bookmark', url: 'https://first.example/private?token=hidden#secret' }, { x: 10, y: 20 }, { id: 'first' }),
    createBookmarkElement({ id: 'second', type: 'bookmark', title: 'Second bookmark', url: 'https://second.example/path' }, { x: 600, y: 600 }, { id: 'second' }),
  ];
  const appState = {
    activeTool: { type: 'selection' }, selectedElementIds: { first: true, second: true },
    zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0,
    width: 1_000, height: 700, viewBackgroundColor: '#ffffff',
  } as unknown as AppState;
  const saved: StoredExcalidrawScene = {
    version: 2, elements, appState, files: {}, libraryItems: [], savedAt: 100,
  };
  saved.syncBaseFingerprint = createSceneSyncFingerprint(saved);
  host.loadLocal.mockResolvedValue(saved);
  host.loadCloud.mockResolvedValue(null);
  host.readManifest.mockResolvedValue(null);
  host.readDevice.mockResolvedValue('this-device');
  host.api.getSceneElements.mockImplementation(() => elements.filter((element) => !element.isDeleted));
  host.api.getSceneElementsIncludingDeleted.mockImplementation(() => elements);
  host.api.getAppState.mockReturnValue(appState);

  await act(async () => {
    render(<ExcalidrawCanvas roots={[]} />);
    await host.initialData;
  });
  act(() => host.onChange!(elements, appState, {}));
  host.api.updateScene.mockClear();
  host.saveRecovery.mockClear();
  return {
    getElements: () => elements,
    changeElements: (next: readonly ExcalidrawElement[]) => {
      elements = next;
      act(() => host.onChange!(elements, appState, {}));
    },
  };
}

describe('canvas bookmark commands and preview boundary', () => {
  it('applies a presentation change as one undoable scene update', async () => {
    const test = await mountSelectedBookmarks();
    fireEvent.click(screen.getByRole('button', { name: 'Icon' }));

    expect(host.api.updateScene).toHaveBeenCalledOnce();
    const update = host.api.updateScene.mock.calls[0]![0] as { elements: ExcalidrawElement[]; captureUpdate: string };
    expect(update.captureUpdate).toBe('immediately');
    expect(update.elements.map((element) => getBookmarkElementData(element)?.presentation)).toEqual(['icon', 'icon']);
    expect(update.elements.every((element, index) => element.version > test.getElements()[index]!.version)).toBe(true);
    expect(test.getElements().map((element) => getBookmarkElementData(element)?.presentation)).toEqual(['compact', 'compact']);
  });

  it('keeps layout preview and cancellation out of the scene and undo history', async () => {
    await mountSelectedBookmarks();
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }));
    expect(screen.getByRole('dialog', { name: 'Preview canvas changes' })).toBeInTheDocument();
    expect(host.api.updateScene).not.toHaveBeenCalled();
    expect(host.saveRecovery).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Preview canvas changes' })).not.toBeInTheDocument();
    expect(host.api.updateScene).not.toHaveBeenCalled();
    expect(host.saveRecovery).not.toHaveBeenCalled();
  });

  it('takes a recovery snapshot before applying layout in one undoable update', async () => {
    const test = await mountSelectedBookmarks();
    const recovery = deferred<undefined>();
    host.saveRecovery.mockReturnValueOnce(recovery.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(host.saveRecovery).toHaveBeenCalledOnce();
    expect(host.saveRecovery).toHaveBeenCalledWith(expect.objectContaining({ elements: test.getElements() }));
    expect(host.api.updateScene).not.toHaveBeenCalled();

    await act(async () => { recovery.resolve(undefined); await recovery.promise; });
    expect(host.api.updateScene).toHaveBeenCalledOnce();
    expect(host.api.updateScene).toHaveBeenCalledWith(expect.objectContaining({ captureUpdate: 'immediately' }));
    expect(screen.queryByRole('dialog', { name: 'Preview canvas changes' })).not.toBeInTheDocument();
  });

  it('does not overwrite a content update arriving while the recovery snapshot is pending', async () => {
    const test = await mountSelectedBookmarks();
    const recovery = deferred<undefined>();
    host.saveRecovery.mockReturnValueOnce(recovery.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const incoming = test.getElements().map((element, index) => index === 0
      ? { ...element, x: element.x + 90, version: element.version + 1, versionNonce: element.versionNonce + 1 }
      : element);
    test.changeElements(incoming);

    await act(async () => { recovery.resolve(undefined); await recovery.promise; });
    expect(host.saveRecovery).toHaveBeenCalledOnce();
    expect(host.api.updateScene).not.toHaveBeenCalled();
    expect(test.getElements()).toBe(incoming);
    expect(host.api.setToast).toHaveBeenCalledWith({ message: 'The canvas changed. Generate a fresh preview before applying.' });
    expect(screen.queryByRole('dialog', { name: 'Preview canvas changes' })).not.toBeInTheDocument();
  });

  it('rejects an AI plan returned after its captured canvas scope has changed', async () => {
    const test = await mountSelectedBookmarks();
    fireEvent.click(screen.getByRole('button', { name: 'AI organize' }));
    expect(screen.getByRole('dialog', { name: 'Test AI organizer' })).toBeInTheDocument();
    const requestItems = JSON.parse(screen.getByTestId('ai-request-items').textContent!);
    expect(requestItems).toEqual([
      { id: 'first', title: 'First bookmark', domain: 'first.example' },
      { id: 'second', title: 'Second bookmark', domain: 'second.example' },
    ]);
    expect(JSON.stringify(requestItems)).not.toContain('hidden');
    const incoming = test.getElements().map((element, index) => index === 0
      ? { ...element, version: element.version + 1, versionNonce: element.versionNonce + 1 }
      : element);
    test.changeElements(incoming);
    fireEvent.click(screen.getByRole('button', { name: 'Return model plan' }));

    expect(host.api.updateScene).not.toHaveBeenCalled();
    expect(host.saveRecovery).not.toHaveBeenCalled();
    expect(host.api.scrollToContent).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Test AI organizer' })).not.toBeInTheDocument();
    expect(host.api.setToast).toHaveBeenCalledWith({ message: 'The canvas changed. Generate a fresh preview before applying.' });
    expect(test.getElements()).toBe(incoming);
  });
});
