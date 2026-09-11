import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  CaptureUpdateAction,
  Excalidraw,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawEmbeddableElement } from '@excalidraw/excalidraw/element/types';
import type { ImportedDataState } from '@excalidraw/excalidraw/data/types';
import type { AppState, BinaryFileData, BinaryFiles, LibraryItems } from '@excalidraw/excalidraw/types';
import {
  BookmarkPlus,
  Check,
  Cloud,
  CloudAlert,
  CloudOff,
  Database,
  DatabaseBackup,
  Download,
  FolderInput,
  Maximize2,
  RefreshCw,
  Search,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { BookmarkNode } from '../bookmarks/types';
import { BookmarkFavicon } from '../components/BookmarkFavicon';
import { getExcalidrawLanguage, t } from '../i18n';
import {
  buildBookmarkImportGroups,
  buildTopLevelBookmarkImportGroups,
  createBookmarkElement,
  createBookmarkGroupScene,
  flattenUrlBookmarks,
  getBookmarkElementData,
  isSafeEmbeddableUrl,
  type BookmarkElementData,
  type BookmarkImportEntry,
  type BookmarkImportGroup,
} from './bookmarkElements';
import {
  createBookmarkReconciliationIndex,
  isBookmarkEntryAlreadyImported,
  resolveBookmarkElementData,
  type BookmarkReconciliationIndex,
} from './bookmarkReconciliation';
import {
  backupFileName,
  createBookmarkAtlasBackup,
  parseBookmarkAtlasBackup,
  restoreBookmarkAtlasBackup,
  type BookmarkAtlasBackup,
} from './backup';
import {
  createStoredScene,
  loadStoredScene,
  saveSceneRecoverySnapshot,
  saveStoredScene,
  type StoredExcalidrawScene,
} from './sceneStorage';
import {
  createSceneSyncFingerprint,
  getCanvasSyncManifest,
  getCanvasSyncDeviceId,
  loadSceneFromSync,
  mergeSyncedSceneWithLocalFiles,
  saveSceneToSync,
  subscribeToCanvasSync,
  type CanvasSyncManifest,
} from './sceneSync';
import {
  assessAppliedIncomingSceneSync,
  assessSyncCompletion,
  createCanvasContextId,
  decideIncomingScene,
  getLiveSyncedAppState,
  isOwnSyncManifest,
  LOCAL_SCENE_CHANNEL,
  normalizeLocalSceneSignal,
  SYNC_POLL_INTERVAL_MS,
  type LocalSceneSignal,
} from './realtimeSceneSync';
import { shouldUseNativeExcalidrawEmbed, WebEmbed } from './WebEmbed';

type Props = {
  roots: BookmarkNode[];
};

type SaveStatus = 'saved' | 'saving' | 'error';
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'too-large' | 'error' | 'unavailable';
type PendingRemoteScene = {
  scene: StoredExcalidrawScene;
  manifest?: CanvasSyncManifest;
  source: 'local-tab' | 'chrome-sync';
};
type ExcalidrawOnChange = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) => void;
type ExcalidrawRenderEmbeddable = (
  element: ExcalidrawEmbeddableElement,
  appState: AppState,
) => ReactNode;
type ExcalidrawOnLinkOpen = (
  element: ExcalidrawElement,
  event: CustomEvent<{ nativeEvent: MouseEvent }>,
) => void;

type CanvasApi = {
  getSceneElements: () => readonly ExcalidrawElement[];
  getSceneElementsIncludingDeleted: () => readonly ExcalidrawElement[];
  getAppState: () => AppState;
  getFiles: () => BinaryFiles;
  updateLibrary: (options: {
    libraryItems: LibraryItems;
    merge?: boolean;
    prompt?: boolean;
    openLibraryMenu?: boolean;
  }) => Promise<LibraryItems>;
  updateScene: (scene: {
    elements?: readonly ExcalidrawElement[];
    appState?: Partial<AppState>;
    captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction];
  }) => void;
  addFiles: (files: BinaryFileData[]) => void;
  scrollToContent: (
    target: ExcalidrawElement | readonly ExcalidrawElement[],
    options?: {
      animate?: boolean;
      duration?: number;
      fitToContent?: boolean;
      maxZoom?: number;
      viewportZoomFactor?: number;
    },
  ) => void;
  setToast: (toast: { message: string }) => void;
};

type HostedExcalidrawProps = {
  initialData: Promise<ImportedDataState>;
  excalidrawAPI: (api: CanvasApi) => void;
  onChange: ExcalidrawOnChange;
  onLibraryChange: (libraryItems: LibraryItems) => void | Promise<void>;
  onLinkOpen: ExcalidrawOnLinkOpen;
  validateEmbeddable: (link: string) => boolean;
  renderEmbeddable: ExcalidrawRenderEmbeddable;
  renderTopRightUI: () => ReactNode;
  langCode: string;
  name: string;
  autoFocus: boolean;
};

const HostedExcalidraw = Excalidraw as unknown as ComponentType<HostedExcalidrawProps>;

const SAVE_DELAY_MS = 350;
const SYNC_DELAY_MS = 4_500;

export function ExcalidrawCanvas({ roots }: Props) {
  const [api, setApi] = useState<CanvasApi | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncManifest, setLastSyncManifest] = useState<CanvasSyncManifest | null>(null);
  const [remoteUpdate, setRemoteUpdate] = useState<PendingRemoteScene | null>(null);
  const remoteUpdateRef = useRef<PendingRemoteScene | null>(null);
  const readyToPersistRef = useRef(false);
  const latestSceneRef = useRef<StoredExcalidrawScene | null>(null);
  const libraryItemsRef = useRef<LibraryItems>([]);
  const latestFingerprintRef = useRef('');
  const lastSyncedFingerprintRef = useRef('');
  const lastWrittenSyncRevisionRef = useRef('');
  const lastAppliedSyncRevisionRef = useRef('');
  const lastBroadcastFingerprintRef = useRef('');
  const contextIdRef = useRef(createCanvasContextId());
  const deviceIdRef = useRef('');
  const localContextIdsRef = useRef<Set<string>>(new Set([contextIdRef.current]));
  const hasLocalChangesRef = useRef(false);
  const applyingIncomingRef = useRef(false);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const localBroadcastRef = useRef<BroadcastChannel | null>(null);

  const bookmarkEntries = useMemo(() => flattenUrlBookmarks(roots), [roots]);
  const importGroups = useMemo(() => buildBookmarkImportGroups(roots), [roots]);
  const topLevelImportGroups = useMemo(() => buildTopLevelBookmarkImportGroups(roots), [roots]);
  const bookmarkIndex = useMemo(() => createBookmarkReconciliationIndex(bookmarkEntries), [bookmarkEntries]);
  const importedBookmarks = useMemo<BookmarkElementData[]>(
    () => api?.getSceneElements().map(getBookmarkElementData).filter((data): data is BookmarkElementData => Boolean(data)) ?? [],
    [api, sceneRevision],
  );

  const [initialData] = useState<Promise<ImportedDataState>>(() => prepareInitialData().then(({
    data,
    stored,
    syncManifest,
    observedSyncManifest,
    pendingRemote,
    deviceId,
  }) => {
    deviceIdRef.current = deviceId;
    if (stored) {
      latestSceneRef.current = stored;
      libraryItemsRef.current = stored.libraryItems;
      latestFingerprintRef.current = sceneFingerprint(stored);
      lastBroadcastFingerprintRef.current = sceneSyncFingerprint(stored);
    }
    if (observedSyncManifest && stored) {
      const observedFingerprint = getManifestFingerprint(observedSyncManifest, stored);
      lastSyncedFingerprintRef.current = pendingRemote
        ? stored.syncBaseFingerprint ?? ''
        : stored.syncBaseFingerprint || observedFingerprint;
      if (!pendingRemote && (syncManifest || observedFingerprint === lastSyncedFingerprintRef.current)) {
        lastAppliedSyncRevisionRef.current = observedSyncManifest.revision;
      }
      setLastSyncManifest(observedSyncManifest);
    }
    if (syncManifest && stored) {
      setSyncStatus('synced');
    }
    if (pendingRemote) {
      remoteUpdateRef.current = pendingRemote;
      setRemoteUpdate(pendingRemote);
    }
    hasLocalChangesRef.current = Boolean(
      stored
      && sceneSyncFingerprint(stored) !== lastSyncedFingerprintRef.current,
    );
    readyToPersistRef.current = true;
    return data;
  }));

  const persistLatest = useCallback(async () => {
    const scene = latestSceneRef.current;
    if (!scene) return;
    setSaveStatus('saving');
    try {
      await saveStoredScene(scene);
      const fingerprint = sceneSyncFingerprint(scene);
      if (fingerprint !== lastBroadcastFingerprintRef.current) {
        lastBroadcastFingerprintRef.current = fingerprint;
        localBroadcastRef.current?.postMessage({
          type: 'scene-saved',
          contextId: contextIdRef.current,
          savedAt: scene.savedAt,
          fingerprint,
        } satisfies LocalSceneSignal);
      }
      if (mountedRef.current) setSaveStatus('saved');
    } catch {
      if (mountedRef.current) setSaveStatus('error');
    }
  }, []);

  const syncLatest = useCallback(async () => {
    const scene = latestSceneRef.current;
    if (!scene) return;
    const fingerprint = sceneSyncFingerprint(scene);
    const pending = remoteUpdateRef.current;
    if (pending && fingerprint === getPendingFingerprint(pending)) {
      remoteUpdateRef.current = null;
      setRemoteUpdate(null);
      if (pending.manifest) {
        lastAppliedSyncRevisionRef.current = pending.manifest.revision;
        lastSyncedFingerprintRef.current = fingerprint;
        setLastSyncManifest(pending.manifest);
        const acknowledged = { ...scene, syncBaseFingerprint: fingerprint };
        latestSceneRef.current = acknowledged;
        await saveStoredScene(acknowledged);
      }
    }
    if (fingerprint && fingerprint === lastSyncedFingerprintRef.current) {
      hasLocalChangesRef.current = false;
      if (!remoteUpdateRef.current) setSyncStatus('synced');
      return;
    }
    if (remoteUpdateRef.current) return;
    if (syncInFlightRef.current) return syncInFlightRef.current;

    let shouldSyncAgain = false;
    const parentFingerprint = lastSyncedFingerprintRef.current;
    const operation = (async () => {
      setSyncStatus('syncing');
      const result = await saveSceneToSync(scene, {
        contextId: contextIdRef.current,
        fingerprint,
        parentFingerprint,
      });
      if (!mountedRef.current) return;

      if (result.status === 'synced') {
        lastSyncedFingerprintRef.current = fingerprint;
        lastWrittenSyncRevisionRef.current = result.manifest.revision;
        lastAppliedSyncRevisionRef.current = result.manifest.revision;
        setLastSyncManifest(result.manifest);
        const currentFingerprint = latestSceneRef.current
          ? sceneSyncFingerprint(latestSceneRef.current)
          : '';
        if (latestSceneRef.current) {
          const rebased = {
            ...latestSceneRef.current,
            syncBaseFingerprint: fingerprint,
          };
          latestSceneRef.current = rebased;
          await saveStoredScene(rebased);
        }
        const completion = assessSyncCompletion(fingerprint, currentFingerprint);
        hasLocalChangesRef.current = completion.hasNewerLocalChanges;
        shouldSyncAgain = completion.hasNewerLocalChanges;
        if (completion.syncedCurrentScene && !remoteUpdateRef.current) {
          setSyncStatus('synced');
        } else {
          setSyncStatus('idle');
        }
      } else if (result.status === 'too-large') {
        setSyncStatus('too-large');
      } else if (result.status === 'unavailable') {
        setSyncStatus('unavailable');
      } else {
        setSyncStatus('error');
      }
    })().finally(() => {
      syncInFlightRef.current = null;
      if (shouldSyncAgain && !remoteUpdateRef.current) void syncLatest();
    });
    syncInFlightRef.current = operation;
    return operation;
  }, []);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => void syncLatest(), SYNC_DELAY_MS);
  }, [syncLatest]);

  const handleChange = useCallback<ExcalidrawOnChange>((elements, appState, files) => {
    if (!readyToPersistRef.current || applyingIncomingRef.current) return;
    const current = latestSceneRef.current;
    const next = createStoredScene(elements, appState, files, libraryItemsRef.current);
    const contentChanged = !current
      || sceneSyncFingerprint(next) !== sceneSyncFingerprint(current);
    const scene = {
      ...next,
      savedAt: contentChanged ? next.savedAt : current.savedAt,
      syncBaseFingerprint: current?.syncBaseFingerprint || lastSyncedFingerprintRef.current || undefined,
    };
    const fingerprint = sceneFingerprint(scene);
    if (fingerprint === latestFingerprintRef.current) return;

    latestFingerprintRef.current = fingerprint;
    latestSceneRef.current = scene;
    if (contentChanged) {
      hasLocalChangesRef.current = true;
    }
    setSaveStatus('saving');

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persistLatest(), SAVE_DELAY_MS);
    if (contentChanged) scheduleSync();
  }, [persistLatest, scheduleSync]);

  const handleLibraryChange = useCallback((libraryItems: LibraryItems) => {
    libraryItemsRef.current = libraryItems;
    if (!readyToPersistRef.current || applyingIncomingRef.current) return;

    const current = latestSceneRef.current;
    const next = current
      ? { ...current, libraryItems, savedAt: Date.now() }
      : api
        ? createStoredScene(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles(), libraryItems)
        : null;
    if (!next) return;

    const scene = {
      ...next,
      syncBaseFingerprint: current?.syncBaseFingerprint || lastSyncedFingerprintRef.current || undefined,
    };
    const fingerprint = sceneFingerprint(scene);
    if (fingerprint === latestFingerprintRef.current) return;
    latestFingerprintRef.current = fingerprint;
    latestSceneRef.current = scene;
    hasLocalChangesRef.current = true;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persistLatest(), SAVE_DELAY_MS);
    scheduleSync();
  }, [api, persistLatest, scheduleSync]);

  const applyPendingScene = useCallback(async (pending: PendingRemoteScene) => {
    if (!api || !mountedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    const current = latestSceneRef.current;
    const incoming = mergeSyncedSceneWithLocalFiles(pending.scene, current);
    const incomingFingerprint = getPendingFingerprint(pending, incoming);
    const appliedSync = assessAppliedIncomingSceneSync(
      pending.source,
      incomingFingerprint,
      lastSyncedFingerprintRef.current,
      false,
    );
    const storedIncoming = {
      ...incoming,
      syncBaseFingerprint: pending.manifest
        ? incomingFingerprint
        : incoming.syncBaseFingerprint || lastSyncedFingerprintRef.current || undefined,
    };

    applyingIncomingRef.current = true;
    try {
      if (current && sceneSyncFingerprint(current) !== incomingFingerprint) {
        await saveSceneRecoverySnapshot(current).catch(() => undefined);
      }
      const files = Object.values(incoming.files);
      if (files.length > 0) api.addFiles(files);
      await api.updateLibrary({
        libraryItems: incoming.libraryItems,
        merge: false,
        prompt: false,
        openLibraryMenu: false,
      });
      api.updateScene({
        elements: incoming.elements,
        appState: getLiveSyncedAppState(incoming.appState),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      await saveStoredScene(storedIncoming);

      latestSceneRef.current = storedIncoming;
      latestFingerprintRef.current = sceneFingerprint(storedIncoming);
      lastBroadcastFingerprintRef.current = incomingFingerprint;
      libraryItemsRef.current = storedIncoming.libraryItems;
      hasLocalChangesRef.current = appliedSync.hasUnsyncedCloudChanges;
      remoteUpdateRef.current = null;
      setRemoteUpdate(null);
      setSaveStatus('saved');

      if (pending.manifest) {
        lastAppliedSyncRevisionRef.current = pending.manifest.revision;
        lastSyncedFingerprintRef.current = incomingFingerprint;
        setLastSyncManifest(pending.manifest);
        setSyncStatus('synced');
      } else {
        setSyncStatus('idle');
      }

      api.setToast({
        message: pending.source === 'local-tab'
          ? t('remoteAppliedLocalTab')
          : t('remoteAppliedOtherDevice'),
      });
      setSceneRevision((revision) => revision + 1);
      if (appliedSync.shouldScheduleSync) scheduleSync();
    } catch {
      remoteUpdateRef.current = pending;
      setRemoteUpdate(pending);
      setSaveStatus('error');
      setSyncStatus('error');
      api.setToast({ message: t('applyRemoteFailed') });
    } finally {
      window.setTimeout(() => { applyingIncomingRef.current = false; }, 0);
    }
  }, [api, scheduleSync]);

  const queueOrApplyIncomingScene = useCallback(async (pending: PendingRemoteScene, force = false) => {
    const current = latestSceneRef.current;
    const currentFingerprint = current ? sceneSyncFingerprint(current) : '';
    const incomingFingerprint = getPendingFingerprint(pending);
    const sameDevice = pending.source === 'local-tab'
      || Boolean(deviceIdRef.current && pending.manifest?.deviceId === deviceIdRef.current)
      || Boolean(pending.manifest?.contextId && localContextIdsRef.current.has(pending.manifest.contextId));
    const decision = force
      ? 'apply'
      : decideIncomingScene({
          sameDevice,
          baseFingerprint: lastSyncedFingerprintRef.current,
          currentFingerprint,
          incomingFingerprint,
          incomingParentFingerprint: pending.manifest?.parentFingerprint,
          currentUpdatedAt: current?.savedAt ?? 0,
          incomingUpdatedAt: pending.manifest?.updatedAt ?? pending.scene.savedAt,
        });

    if (decision === 'ack') {
      remoteUpdateRef.current = null;
      setRemoteUpdate(null);
      if (pending.manifest) {
        lastAppliedSyncRevisionRef.current = pending.manifest.revision;
        lastSyncedFingerprintRef.current = incomingFingerprint;
        hasLocalChangesRef.current = false;
        setLastSyncManifest(pending.manifest);
        setSyncStatus('synced');
        if (current) {
          const acknowledged = { ...current, syncBaseFingerprint: incomingFingerprint };
          latestSceneRef.current = acknowledged;
          await saveStoredScene(acknowledged);
        }
      }
      return;
    }
    if (decision === 'keep-local') {
      remoteUpdateRef.current = null;
      setRemoteUpdate(null);
      if (pending.manifest) {
        lastAppliedSyncRevisionRef.current = pending.manifest.revision;
        setLastSyncManifest(pending.manifest);
        if (sameDevice || !lastSyncedFingerprintRef.current) {
          lastSyncedFingerprintRef.current = incomingFingerprint;
        }
      }
      if (current) {
        const rebased = {
          ...current,
          syncBaseFingerprint: lastSyncedFingerprintRef.current || undefined,
        };
        latestSceneRef.current = rebased;
        await saveStoredScene(rebased);
        hasLocalChangesRef.current = sceneSyncFingerprint(rebased) !== lastSyncedFingerprintRef.current;
      }
      setSyncStatus(hasLocalChangesRef.current ? 'idle' : 'synced');
      if (hasLocalChangesRef.current) scheduleSync();
      return;
    }
    if (decision === 'conflict') {
      remoteUpdateRef.current = pending;
      setRemoteUpdate(pending);
      setSyncStatus('idle');
      return;
    }
    await applyPendingScene(pending);
  }, [applyPendingScene, scheduleSync]);

  const consumeSyncManifest = useCallback(async (manifest: CanvasSyncManifest) => {
    let candidate = manifest;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latestBeforeLoad = await getCanvasSyncManifest();
      if (latestBeforeLoad) candidate = latestBeforeLoad;

      const current = latestSceneRef.current;
      const knownFingerprint = candidate.fingerprintVersion === 2
        ? candidate.fingerprint ?? ''
        : '';
      if (current && knownFingerprint && sceneSyncFingerprint(current) === knownFingerprint) {
        remoteUpdateRef.current = null;
        setRemoteUpdate(null);
        lastAppliedSyncRevisionRef.current = candidate.revision;
        lastSyncedFingerprintRef.current = knownFingerprint;
        hasLocalChangesRef.current = false;
        setLastSyncManifest(candidate);
        setSyncStatus('synced');
        if (current.syncBaseFingerprint !== knownFingerprint) {
          const acknowledged = { ...current, syncBaseFingerprint: knownFingerprint };
          latestSceneRef.current = acknowledged;
          await saveStoredScene(acknowledged);
        }
        return;
      }

      if (
        isOwnSyncManifest(candidate, contextIdRef.current, lastWrittenSyncRevisionRef.current)
        || candidate.revision === lastAppliedSyncRevisionRef.current
      ) return;

      const loaded = await loadSceneFromSync({
        manifest: candidate,
        revision: candidate.revision,
        retries: 2,
      });
      if (!mountedRef.current) return;
      if (!loaded) {
        const latestAfterFailure = await getCanvasSyncManifest();
        if (latestAfterFailure && latestAfterFailure.revision !== candidate.revision) {
          candidate = latestAfterFailure;
          continue;
        }
        return;
      }

      const latestAfterLoad = await getCanvasSyncManifest();
      if (latestAfterLoad && latestAfterLoad.revision !== candidate.revision) {
        candidate = latestAfterLoad;
        continue;
      }

      await queueOrApplyIncomingScene({
        scene: loaded.scene,
        manifest: loaded.manifest,
        source: 'chrome-sync',
      });
      return;
    }
  }, [queueOrApplyIncomingScene]);

  const checkLatestSync = useCallback(async () => {
    const manifest = await getCanvasSyncManifest();
    if (!manifest) return;
    await consumeSyncManifest(manifest);
  }, [consumeSyncManifest]);

  const acceptRemoteUpdate = useCallback(() => {
    const pending = remoteUpdateRef.current;
    if (pending) void queueOrApplyIncomingScene(pending, true);
  }, [queueOrApplyIncomingScene]);

  const keepLocalUpdate = useCallback(() => {
    const current = latestSceneRef.current;
    const pending = remoteUpdateRef.current;
    remoteUpdateRef.current = null;
    setRemoteUpdate(null);
    if (!current) return;
    if (pending?.manifest) {
      const incomingFingerprint = getPendingFingerprint(pending);
      lastAppliedSyncRevisionRef.current = pending.manifest.revision;
      lastSyncedFingerprintRef.current = incomingFingerprint;
      setLastSyncManifest(pending.manifest);
    }
    hasLocalChangesRef.current = true;
    latestSceneRef.current = {
      ...current,
      savedAt: Date.now(),
      syncBaseFingerprint: lastSyncedFingerprintRef.current || undefined,
    };
    lastBroadcastFingerprintRef.current = '';
    setSyncStatus('idle');
    void persistLatest();
    scheduleSync();
    api?.setToast({ message: t('keepLocalToast') });
  }, [api, persistLatest, scheduleSync]);

  useEffect(() => {
    mountedRef.current = true;
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        void persistLatest();
        void syncLatest();
      }
    };
    const flushOnPageHide = () => {
      void persistLatest();
      void syncLatest();
    };

    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushOnPageHide);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushOnPageHide);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      void persistLatest();
      void syncLatest();
    };
  }, [persistLatest, syncLatest]);

  useEffect(() => {
    const unsubscribe = subscribeToCanvasSync((manifest) => {
      void consumeSyncManifest(manifest);
    });
    return () => {
      unsubscribe();
    };
  }, [consumeSyncManifest]);

  useEffect(() => {
    if (typeof BroadcastChannel !== 'function') return;
    const channel = new BroadcastChannel(LOCAL_SCENE_CHANNEL);
    localBroadcastRef.current = channel;
    channel.onmessage = (event) => {
      const signal = normalizeLocalSceneSignal(event.data);
      if (!signal || signal.contextId === contextIdRef.current) return;
      localContextIdsRef.current.add(signal.contextId);
      if (signal.savedAt < (latestSceneRef.current?.savedAt ?? 0)) return;
      void loadStoredScene().then((scene) => {
        if (!scene || scene.savedAt < signal.savedAt) return;
        return queueOrApplyIncomingScene({ scene, source: 'local-tab' });
      });
    };
    return () => {
      localBroadcastRef.current = null;
      channel.close();
    };
  }, [queueOrApplyIncomingScene]);

  useEffect(() => {
    if (!api) return;
    const handleFocus = () => void checkLatestSync();
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void checkLatestSync();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkLatestSync();
    }, SYNC_POLL_INTERVAL_MS);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisible);
    void checkLatestSync();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [api, checkLatestSync]);

  useEffect(() => {
    if (api && latestSceneRef.current && hasLocalChangesRef.current) scheduleSync();
  }, [api, lastSyncManifest, scheduleSync]);

  const renderEmbeddable = useCallback<ExcalidrawRenderEmbeddable>((element, appState) => {
    const stored = getBookmarkElementData(element);
    if (!stored) {
      if (!element.link) return null;
      if (shouldUseNativeExcalidrawEmbed(element.link)) return null;
      const active = appState.activeEmbeddable?.element.id === element.id
        && appState.activeEmbeddable.state === 'active';
      return (
        <WebEmbed
          elementId={element.id}
          url={element.link}
          active={active}
          onExitInteraction={() => api?.updateScene({
            appState: { activeEmbeddable: null },
            captureUpdate: CaptureUpdateAction.NEVER,
          })}
        />
      );
    }

    const resolution = resolveBookmarkElementData(stored, bookmarkIndex);
    const current = resolution.status === 'matched' ? resolution.entry : null;
    return (
      <BookmarkEmbed
        title={current?.node.title ?? stored.title}
        url={current?.node.url ?? stored.url}
        folderPath={current?.folderPath ?? stored.folderPath}
        matchStatus={resolution.status}
      />
    );
  }, [api, bookmarkIndex]);

  const handleLinkOpen = useCallback<ExcalidrawOnLinkOpen>((element, event) => {
    const stored = getBookmarkElementData(element);
    if (!stored) return;

    event.preventDefault();
    const resolution = resolveBookmarkElementData(stored, bookmarkIndex);
    const target = resolution.status === 'matched' ? resolution.entry.node.url : stored.url;
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  }, [bookmarkIndex]);

  const addBookmark = useCallback((node: BookmarkNode, folderPath: string) => {
    if (!api || !node.url) return;

    const existing = api.getSceneElements().find((element) => {
      const data = getBookmarkElementData(element);
      return data ? isBookmarkEntryAlreadyImported({ node, folderPath }, [data], bookmarkIndex) : false;
    });
    if (existing) {
      api.updateScene({
        appState: { selectedElementIds: { [existing.id]: true } },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.scrollToContent(existing, { animate: true, duration: 260 });
      api.setToast({ message: t('bookmarkAlreadyOnCanvas') });
      return;
    }

    const appState = api.getAppState();
    const center = viewportCoordsToSceneCoords({
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    }, appState);
    const element = createBookmarkElement(node, {
      x: center.x - 150,
      y: center.y - 84,
    }, { folderPath });

    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), element],
      appState: { selectedElementIds: { [element.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent(element, { animate: true, duration: 260 });
    api.setToast({ message: t('bookmarkAdded', node.title || t('unnamedBookmark')) });
    setSceneRevision((revision) => revision + 1);
  }, [api, bookmarkIndex]);

  const importBookmarkGroups = useCallback((groups: BookmarkImportGroup[]) => {
    if (!api) return;

    const pendingGroups = groups.map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => !isBookmarkEntryAlreadyImported(entry, importedBookmarks, bookmarkIndex)),
    })).filter((group) => group.entries.length > 0);

    if (pendingGroups.length === 0) {
      api.setToast({ message: t('selectedBookmarksAlreadyImported') });
      return;
    }

    const center = getViewportSceneCenter(api);
    const additions: ExcalidrawElement[] = [];
    let cursorX = center.x - Math.min(700, pendingGroups.length * 280);
    let cursorY = center.y - 260;
    let rowHeight = 0;

    for (const group of pendingGroups) {
      const groupScene = createBookmarkGroupScene(group, { x: cursorX, y: cursorY });
      const frame = groupScene[0];
      if (!frame) continue;
      additions.push(...groupScene);
      cursorX += frame.width + 96;
      rowHeight = Math.max(rowHeight, frame.height);
      if (cursorX - center.x > 1_500) {
        cursorX = center.x - 700;
        cursorY += rowHeight + 96;
        rowHeight = 0;
      }
    }

    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...additions],
      appState: { selectedElementIds: {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent(additions, {
      animate: true,
      duration: 360,
      fitToContent: true,
      maxZoom: 0.9,
      viewportZoomFactor: 0.82,
    });
    const importedCount = pendingGroups.reduce((total, group) => total + group.entries.length, 0);
    api.setToast({ message: t('importedBookmarks', String(importedCount)) });
    setSceneRevision((revision) => revision + 1);
  }, [api, bookmarkIndex, importedBookmarks]);

  const zoomBy = useCallback((factor: number) => {
    if (!api) return;
    const current = api.getAppState().zoom.value;
    const value = Math.min(3, Math.max(0.1, current * factor));
    api.updateScene({
      appState: { zoom: { value: value as AppState['zoom']['value'] } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api]);

  const fitElements = useCallback((bookmarkOnly = false) => {
    if (!api) return;
    const elements = bookmarkOnly
      ? api.getSceneElements().filter((element) => Boolean(getBookmarkElementData(element)))
      : api.getSceneElements();
    if (elements.length === 0) {
      api.setToast({ message: bookmarkOnly ? t('noBookmarkCardsOnCanvas') : t('canvasEmpty') });
      return;
    }
    api.scrollToContent(elements, {
      animate: true,
      duration: 320,
      fitToContent: true,
      maxZoom: 1,
      viewportZoomFactor: 0.86,
    });
  }, [api]);

  const getLiveScene = useCallback(() => {
    if (!api) return latestSceneRef.current;
    return {
      ...createStoredScene(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      libraryItemsRef.current,
      ),
      syncBaseFingerprint: latestSceneRef.current?.syncBaseFingerprint
        || lastSyncedFingerprintRef.current
        || undefined,
    };
  }, [api]);

  const exportBackup = useCallback(async () => {
    const scene = getLiveScene();
    if (!scene) throw new Error(t('canvasNotReady'));
    latestSceneRef.current = scene;
    latestFingerprintRef.current = sceneFingerprint(scene);
    await saveStoredScene(scene);

    const backup = createBookmarkAtlasBackup(scene);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupFileName();
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, [getLiveScene]);

  const restoreBackup = useCallback(async (backup: BookmarkAtlasBackup) => {
    await restoreBookmarkAtlasBackup(backup);
    window.location.reload();
  }, []);

  return (
    <section className="excalidraw-canvas" aria-label={t('excalidrawCanvasLabel')}>
      <HostedExcalidraw
        initialData={initialData}
        excalidrawAPI={setApi}
        onChange={handleChange}
        onLibraryChange={handleLibraryChange}
        onLinkOpen={handleLinkOpen}
        validateEmbeddable={isSafeEmbeddableUrl}
        renderEmbeddable={renderEmbeddable}
        renderTopRightUI={() => (
          <div className="atlas-excalidraw-actions">
            <span
              className={`atlas-save-state is-${saveStatus}`}
              role="status"
              aria-label={t('saveStatusLocalCanvas', saveStatusLabel(saveStatus))}
              title={saveStatusTitle(saveStatus)}
            >
              {saveStatus === 'saving' ? <Database size={14} /> : saveStatus === 'error' ? <X size={14} /> : <Check size={14} />}
              <span className="visually-hidden">{saveStatusLabel(saveStatus)}</span>
            </span>
            <button
              type="button"
              className={`atlas-sync-state is-${remoteUpdate ? 'remote' : syncStatus}`}
              onClick={remoteUpdate ? () => document.getElementById('atlas-sync-conflict')?.focus() : undefined}
              aria-disabled={!remoteUpdate}
              tabIndex={remoteUpdate ? 0 : -1}
              aria-label={remoteUpdate ? t('remoteCanvasAvailable') : t('syncStatusCloudCanvas', syncStatusLabel(syncStatus, lastSyncManifest))}
              title={syncStatusTitle(syncStatus, lastSyncManifest, Boolean(remoteUpdate))}
            >
              <SyncStatusIcon status={syncStatus} remote={Boolean(remoteUpdate)} />
              <span className="visually-hidden">
                {remoteUpdate ? t('remoteUpdatePending') : syncStatusLabel(syncStatus, lastSyncManifest)}
              </span>
            </button>
            <div className="atlas-zoom-tools" role="group" aria-label={t('canvasZoom')}>
              <button type="button" onClick={() => zoomBy(0.8)} aria-label={t('zoomOutCanvas')}><ZoomOut size={15} /></button>
              <button type="button" onClick={() => zoomBy(1.25)} aria-label={t('zoomInCanvas')}><ZoomIn size={15} /></button>
              <button type="button" onClick={() => fitElements(false)} aria-label={t('fitAllElements')} title={t('fitAllElementsTitle')}><Maximize2 size={15} /></button>
              <button type="button" onClick={() => fitElements(true)} aria-label={t('focusAllBookmarks')} title={t('focusAllBookmarksTitle')}><BookmarkPlus size={15} /></button>
            </div>
            <button type="button" className="atlas-excalidraw-button is-icon" onClick={() => setPickerOpen(true)} aria-label={t('importBookmarks')} title={t('importChromeBookmarks')}>
              <FolderInput size={16} />
            </button>
            <button type="button" className="atlas-excalidraw-button is-secondary is-icon" onClick={() => setBackupOpen(true)} aria-label={t('fullBackup')} title={t('backupTitle')}>
              <DatabaseBackup size={16} />
            </button>
          </div>
        )}
        langCode={getExcalidrawLanguage()}
        name="Bookmark Atlas"
        autoFocus
      />

      {remoteUpdate && (
        <section
          id="atlas-sync-conflict"
          className="atlas-sync-conflict"
          role="alertdialog"
          aria-labelledby="atlas-sync-conflict-title"
          tabIndex={-1}
        >
          <RefreshCw size={18} aria-hidden="true" />
          <div>
            <strong id="atlas-sync-conflict-title">{t('syncConflictTitle')}</strong>
            <span>{t('syncConflictBody')}</span>
          </div>
          <div className="atlas-sync-conflict__actions">
            <button type="button" className="secondary-button" onClick={keepLocalUpdate}>{t('keepLocal')}</button>
            <button type="button" className="atlas-excalidraw-button" onClick={acceptRemoteUpdate}>{t('useIncomingUpdate')}</button>
          </div>
        </section>
      )}

      {pickerOpen && (
        <BookmarkPicker
          entries={bookmarkEntries}
          groups={importGroups}
          allGroups={topLevelImportGroups}
          importedBookmarks={importedBookmarks}
          bookmarkIndex={bookmarkIndex}
          onAdd={addBookmark}
          onImportGroups={importBookmarkGroups}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {backupOpen && (
        <BackupPanel
          scene={getLiveScene()}
          onExport={exportBackup}
          onRestore={restoreBackup}
          onClose={() => setBackupOpen(false)}
        />
      )}
    </section>
  );
}

function BackupPanel({
  scene,
  onExport,
  onRestore,
  onClose,
}: {
  scene: StoredExcalidrawScene | null;
  onExport: () => Promise<void>;
  onRestore: (backup: BookmarkAtlasBackup) => Promise<void>;
  onClose: () => void;
}) {
  const [pendingBackup, setPendingBackup] = useState<BookmarkAtlasBackup | null>(null);
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const [error, setError] = useState('');

  const runExport = async () => {
    setError('');
    setBusy('export');
    try {
      await onExport();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('exportFailed'));
    } finally {
      setBusy(null);
    }
  };

  const readBackup = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      setPendingBackup(parseBookmarkAtlasBackup(await file.text()));
    } catch (cause) {
      setPendingBackup(null);
      setError(cause instanceof Error ? cause.message : t('backupReadFailed'));
    }
  };

  const runRestore = async () => {
    if (!pendingBackup) return;
    setError('');
    setBusy('restore');
    try {
      await onRestore(pendingBackup);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('restoreFailed'));
      setBusy(null);
    }
  };

  const restoreScene = pendingBackup?.contents.excalidrawScene;

  return (
    <div className="atlas-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="atlas-bookmark-picker atlas-backup-panel" role="dialog" aria-modal="true" aria-labelledby="atlas-backup-title">
        <header>
          <div>
            <h2 id="atlas-backup-title">{t('fullBackup')}</h2>
            <p>{t('backupPanelDescription')}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
        </header>

        <div className="atlas-backup-grid">
          <article>
            <span className="atlas-backup-icon"><Download size={20} /></span>
            <div>
              <h3>{t('exportBackupTitle')}</h3>
              <p>{scene ? t('backupStats', [
                String(scene.elements.filter((element) => !element.isDeleted).length),
                String(Object.keys(scene.files).length),
                String(scene.libraryItems.length),
              ]) : t('readingCanvas')}</p>
            </div>
            <button type="button" className="atlas-excalidraw-button" disabled={!scene || busy !== null} onClick={() => void runExport()}>
              <Download size={15} /> {busy === 'export' ? t('downloadingBackup') : t('downloadBackup')}
            </button>
          </article>

          <article>
            <span className="atlas-backup-icon"><Upload size={20} /></span>
            <div>
              <h3>{t('restoreBackupTitle')}</h3>
              <p>{t('restoreBackupDescription')}</p>
            </div>
            <label className="atlas-backup-file">
              <Upload size={15} /> {t('chooseBackupFile')}
              <input type="file" accept="application/json,.json" disabled={busy !== null} onChange={(event) => void readBackup(event.target.files?.[0])} />
            </label>
          </article>
        </div>

        {pendingBackup && restoreScene && (
          <div className="atlas-backup-confirm">
            <div>
              <strong>{t('backupVerified')}</strong>
              <span>{t('backupVerifiedStats', [
                new Date(pendingBackup.createdAt).toLocaleString(),
                String(restoreScene.elements.filter((element) => !element.isDeleted).length),
                String(restoreScene.libraryItems.length),
              ])}</span>
            </div>
            <button type="button" className="atlas-excalidraw-button" disabled={busy !== null} onClick={() => void runRestore()}>
              {busy === 'restore' ? t('restoringBackup') : t('confirmRestore')}
            </button>
          </div>
        )}
        {error && <p className="atlas-backup-error" role="alert">{error}</p>}
        <footer>{t('backupChromeBookmarksNote')}</footer>
      </section>
    </div>
  );
}

function BookmarkEmbed({
  title,
  url,
  folderPath,
  matchStatus,
}: {
  title: string;
  url: string;
  folderPath?: string;
  matchStatus: 'matched' | 'missing' | 'ambiguous';
}) {
  const unresolved = matchStatus !== 'matched';
  const statusLabel = matchStatus === 'matched'
    ? t('bookmarkMatchMatched')
    : matchStatus === 'ambiguous'
      ? t('bookmarkMatchAmbiguous')
      : t('bookmarkMatchMissing');

  return (
    <div className={`atlas-bookmark-embed ${unresolved ? 'is-missing' : ''}`}>
      <BookmarkFavicon title={title} url={url} size={42} className="atlas-bookmark-embed__favicon" />
      <div className="atlas-bookmark-embed__copy">
        <strong>{title || t('unnamedBookmark')}</strong>
        <span>{hostname(url) || url}</span>
        {folderPath && <small>{folderPath}</small>}
      </div>
      <div className="atlas-bookmark-embed__footer">
        <span>{statusLabel}</span>
        <span>{t('openWithLinkButton')}</span>
      </div>
    </div>
  );
}

function BookmarkPicker({
  entries,
  groups,
  allGroups,
  importedBookmarks,
  bookmarkIndex,
  onAdd,
  onImportGroups,
  onClose,
}: {
  entries: BookmarkImportEntry[];
  groups: BookmarkImportGroup[];
  allGroups: BookmarkImportGroup[];
  importedBookmarks: BookmarkElementData[];
  bookmarkIndex: BookmarkReconciliationIndex;
  onAdd: (node: BookmarkNode, folderPath: string) => void;
  onImportGroups: (groups: BookmarkImportGroup[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id ?? 'all');
  const activeGroup = groups.find((group) => group.id === activeGroupId);
  const sourceEntries = activeGroup?.entries ?? entries;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return sourceEntries;
    return sourceEntries.filter(({ node, folderPath }) => (
      `${node.title} ${node.url ?? ''} ${folderPath}`.toLocaleLowerCase().includes(normalized)
    ));
  }, [sourceEntries, query]);
  const visible = filtered.slice(0, 200);
  const importedCount = entries.filter((entry) => isBookmarkEntryAlreadyImported(entry, importedBookmarks, bookmarkIndex)).length;
  const remainingTotal = entries.filter((entry) => !isBookmarkEntryAlreadyImported(entry, importedBookmarks, bookmarkIndex)).length;
  const remainingInGroup = sourceEntries.filter((entry) => !isBookmarkEntryAlreadyImported(entry, importedBookmarks, bookmarkIndex)).length;

  return (
    <div className="atlas-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="atlas-bookmark-picker atlas-bookmark-picker--import" role="dialog" aria-modal="true" aria-labelledby="atlas-picker-title">
        <header>
          <div>
            <h2 id="atlas-picker-title">{t('importChromeBookmarks')}</h2>
            <p>{t('importPickerDescription')}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
        </header>
        <div className="atlas-import-summary">
          <div>
            <strong>{entries.length}</strong>
            <span>{t('chromeBookmarks')}</span>
          </div>
          <div>
            <strong>{importedCount}</strong>
            <span>{t('alreadyOnCanvas')}</span>
          </div>
          <button type="button" className="atlas-import-all" disabled={remainingTotal === 0} onClick={() => onImportGroups(allGroups)}>
            <FolderInput size={16} /> {remainingTotal === 0 ? t('allImported') : t('importRemaining', String(remainingTotal))}
          </button>
        </div>
        <div className="atlas-import-layout">
          <aside className="atlas-import-groups" aria-label={t('bookmarkFolderGroups')}>
            <button type="button" className={!activeGroup ? 'is-active' : ''} onClick={() => setActiveGroupId('all')}>
              <span>{t('allBookmarks')}</span><small>{entries.length}</small>
            </button>
            {groups.map((group) => (
              <button
                type="button"
                key={group.id}
                className={activeGroup?.id === group.id ? 'is-active' : ''}
                style={{ '--import-depth': group.depth } as CSSProperties}
                onClick={() => setActiveGroupId(group.id)}
              >
                <span>{group.title}</span><small>{group.entries.length}</small>
              </button>
            ))}
          </aside>
          <div className="atlas-import-content">
            <div className="atlas-import-content__header">
              <div>
                <strong>{activeGroup?.title ?? t('allBookmarks')}</strong>
                <small>{activeGroup?.path || t('allChromeBookmarks')}</small>
              </div>
              {activeGroup && (
                <button type="button" className="secondary-button" disabled={remainingInGroup === 0} onClick={() => onImportGroups([activeGroup])}>
                  <FolderInput size={15} /> {remainingInGroup === 0 ? t('importGroupDone') : t('importGroupRemaining', String(remainingInGroup))}
                </button>
              )}
            </div>
            <label className="atlas-bookmark-picker__search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('bookmarkPickerSearchPlaceholder')} autoFocus />
            </label>
            <div className="atlas-bookmark-picker__list">
              {visible.map(({ node, folderPath }) => {
                const imported = isBookmarkEntryAlreadyImported({ node, folderPath }, importedBookmarks, bookmarkIndex);
                return (
                  <button type="button" key={node.id} className={`atlas-bookmark-picker__item ${imported ? 'is-imported' : ''}`} disabled={imported} onClick={() => onAdd(node, folderPath)}>
                    <BookmarkFavicon node={node} size={30} />
                    <span>
                      <strong>{node.title || t('unnamedBookmark')}</strong>
                      <small>{folderPath || hostname(node.url) || node.url}</small>
                    </span>
                    {imported ? <Check size={17} /> : <BookmarkPlus size={17} />}
                  </button>
                );
              })}
              {visible.length === 0 && <div className="atlas-bookmark-picker__empty">{t('noMatchingBookmarks')}</div>}
            </div>
          </div>
        </div>
        {filtered.length > visible.length && <footer>{t('visibleLimitNotice', String(visible.length))}</footer>}
      </section>
    </div>
  );
}

async function prepareInitialData(): Promise<{
  data: ImportedDataState;
  stored: StoredExcalidrawScene | null;
  syncManifest: CanvasSyncManifest | null;
  observedSyncManifest: CanvasSyncManifest | null;
  pendingRemote: PendingRemoteScene | null;
  deviceId: string;
}> {
  const [local, synced, deviceId] = await Promise.all([
    loadStoredScene(),
    loadSceneFromSync(),
    getCanvasSyncDeviceId(),
  ]);
  const cloudFingerprint = synced ? getManifestFingerprint(synced.manifest, synced.scene) : '';
  const localFingerprint = local ? sceneSyncFingerprint(local) : '';
  const initialDecision = local && synced
    ? decideIncomingScene({
        sameDevice: synced.manifest.deviceId === deviceId,
        baseFingerprint: local.syncBaseFingerprint ?? '',
        currentFingerprint: localFingerprint,
        incomingFingerprint: cloudFingerprint,
        incomingParentFingerprint: synced.manifest.parentFingerprint,
        currentUpdatedAt: local.savedAt,
        incomingUpdatedAt: synced.manifest.updatedAt,
      })
    : local
      ? 'keep-local'
      : synced
        ? 'apply'
        : 'ack';
  const useSynced = Boolean(synced && (initialDecision === 'ack' || initialDecision === 'apply'));
  if (useSynced && local && localFingerprint !== cloudFingerprint) {
    await saveSceneRecoverySnapshot(local).catch(() => undefined);
  }
  const selected = useSynced && synced
    ? mergeSyncedSceneWithLocalFiles(synced.scene, local)
    : local;
  const baseFingerprint = synced
    ? (initialDecision === 'conflict' ? local?.syncBaseFingerprint ?? '' : cloudFingerprint)
    : '';
  const stored = selected
    ? { ...selected, syncBaseFingerprint: baseFingerprint || undefined }
    : null;
  if (stored && initialDecision !== 'conflict' && (
    useSynced
    || stored.syncBaseFingerprint !== selected?.syncBaseFingerprint
  )) {
    await saveStoredScene(stored);
  }

  if (stored) {
    const contentMatchesCloud = Boolean(synced && sceneSyncFingerprint(stored) === cloudFingerprint);
    return {
      stored,
      syncManifest: contentMatchesCloud ? synced?.manifest ?? null : null,
      observedSyncManifest: synced?.manifest ?? null,
      pendingRemote: initialDecision === 'conflict' && synced
        ? { scene: synced.scene, manifest: synced.manifest, source: 'chrome-sync' }
        : null,
      deviceId,
      data: {
        elements: stored.elements,
        appState: stored.appState,
        files: stored.files,
        libraryItems: stored.libraryItems,
        scrollToContent: false,
      },
    };
  }

  return {
    stored: null,
    syncManifest: null,
    observedSyncManifest: synced?.manifest ?? null,
    pendingRemote: null,
    deviceId,
    data: {
      elements: [],
      appState: {
        viewBackgroundColor: '#f7f7f3',
        gridModeEnabled: false,
      },
      files: {},
      libraryItems: [],
      scrollToContent: true,
    },
  };
}

function SyncStatusIcon({ status, remote }: { status: SyncStatus; remote: boolean }) {
  if (remote) return <RefreshCw size={14} />;
  if (status === 'too-large' || status === 'error') return <CloudAlert size={14} />;
  if (status === 'unavailable') return <CloudOff size={14} />;
  return <Cloud size={14} className={status === 'syncing' ? 'is-pulsing' : ''} />;
}

function saveStatusLabel(status: SaveStatus) {
  if (status === 'saving') return t('saveStatusSaving');
  if (status === 'error') return t('saveStatusError');
  return t('saveStatusSaved');
}

function saveStatusTitle(status: SaveStatus) {
  if (status === 'saving') return t('saveTitleSaving');
  if (status === 'error') return t('saveTitleError');
  return t('saveTitleSaved');
}

function syncStatusLabel(status: SyncStatus, manifest: CanvasSyncManifest | null) {
  if (status === 'syncing') return t('syncStatusSyncing');
  if (status === 'too-large') return t('syncStatusTooLarge');
  if (status === 'error') return t('syncStatusError');
  if (status === 'unavailable') return t('syncStatusUnavailable');
  if (status === 'synced' && manifest?.excludedFileCount) return t('syncStatusLight');
  if (status === 'synced') return t('syncStatusSynced');
  return t('syncStatusIdle');
}

function syncStatusTitle(
  status: SyncStatus,
  manifest: CanvasSyncManifest | null,
  remote: boolean,
) {
  if (remote) return t('syncTitleRemote');
  if (status === 'too-large') return t('syncTitleTooLarge');
  if (status === 'error') return t('syncTitleError');
  if (status === 'unavailable') return t('syncTitleUnavailable');
  if (manifest?.excludedFileCount) return t('syncTitleLight', String(manifest.excludedFileCount));
  return t('syncTitleSynced');
}

function getViewportSceneCenter(api: CanvasApi) {
  const appState = api.getAppState();
  return viewportCoordsToSceneCoords({
    clientX: appState.offsetLeft + appState.width / 2,
    clientY: appState.offsetTop + appState.height / 2,
  }, appState);
}

function hostname(url?: string) {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function createSceneForPersistence(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) {
  return createStoredScene(elements, appState, files);
}

function sceneFingerprint(scene: StoredExcalidrawScene) {
  return JSON.stringify({
    elements: scene.elements.map((element) => [element.id, element.version, element.isDeleted]),
    appState: scene.appState,
    files: Object.values(scene.files).map((file) => [file.id, file.created, file.lastRetrieved]),
    libraryItems: scene.libraryItems.map((item) => [
      item.id,
      item.status,
      item.name,
      item.created,
      item.elements.map((element) => [element.id, element.version]),
    ]),
  });
}

export function sceneSyncFingerprint(scene: StoredExcalidrawScene) {
  return createSceneSyncFingerprint(scene);
}

function getManifestFingerprint(manifest: CanvasSyncManifest, scene: StoredExcalidrawScene) {
  return manifest.fingerprintVersion === 2 && manifest.fingerprint
    ? manifest.fingerprint
    : sceneSyncFingerprint(scene);
}

function getPendingFingerprint(pending: PendingRemoteScene, scene = pending.scene) {
  return pending.manifest
    ? getManifestFingerprint(pending.manifest, scene)
    : sceneSyncFingerprint(scene);
}
