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
import type { AppState, BinaryFiles, LibraryItems } from '@excalidraw/excalidraw/types';
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
import {
  buildBookmarkImportGroups,
  buildTopLevelBookmarkImportGroups,
  createBookmarkElement,
  createBookmarkGroupScene,
  flattenUrlBookmarks,
  getBookmarkElementData,
  isSafeEmbeddableUrl,
  type BookmarkImportEntry,
  type BookmarkImportGroup,
} from './bookmarkElements';
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
  saveStoredScene,
  type StoredExcalidrawScene,
} from './sceneStorage';
import {
  getCanvasSyncDeviceId,
  loadSceneFromSync,
  mergeSyncedSceneWithLocalFiles,
  saveSceneToSync,
  subscribeToCanvasSync,
  type CanvasSyncManifest,
} from './sceneSync';
import { shouldUseNativeExcalidrawEmbed, WebEmbed } from './WebEmbed';

type Props = {
  roots: BookmarkNode[];
};

type SaveStatus = 'saved' | 'saving' | 'error';
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'too-large' | 'error' | 'unavailable';
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
  const [remoteUpdate, setRemoteUpdate] = useState<CanvasSyncManifest | null>(null);
  const remoteUpdateRef = useRef<CanvasSyncManifest | null>(null);
  const readyToPersistRef = useRef(false);
  const latestSceneRef = useRef<StoredExcalidrawScene | null>(null);
  const libraryItemsRef = useRef<LibraryItems>([]);
  const latestFingerprintRef = useRef('');
  const lastSyncedFingerprintRef = useRef('');
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef('');
  const mountedRef = useRef(true);

  const bookmarkEntries = useMemo(() => flattenUrlBookmarks(roots), [roots]);
  const importGroups = useMemo(() => buildBookmarkImportGroups(roots), [roots]);
  const topLevelImportGroups = useMemo(() => buildTopLevelBookmarkImportGroups(roots), [roots]);
  const bookmarkLookup = useMemo(
    () => new Map(bookmarkEntries.map((entry) => [entry.node.id, entry])),
    [bookmarkEntries],
  );
  const importedBookmarkIds = useMemo(() => new Set(
    api?.getSceneElements().map(getBookmarkElementData).filter(Boolean).map((data) => data!.bookmarkId) ?? [],
  ), [api, sceneRevision]);

  const [initialData] = useState<Promise<ImportedDataState>>(() => prepareInitialData().then(({ data, stored, syncManifest }) => {
    if (stored) {
      latestSceneRef.current = stored;
      libraryItemsRef.current = stored.libraryItems;
      latestFingerprintRef.current = sceneFingerprint(stored);
    }
    if (syncManifest) {
      lastSyncedFingerprintRef.current = latestFingerprintRef.current;
      setLastSyncManifest(syncManifest);
      setSyncStatus('synced');
    }
    readyToPersistRef.current = true;
    return data;
  }));

  const persistLatest = useCallback(async () => {
    const scene = latestSceneRef.current;
    if (!scene) return;
    if (remoteUpdateRef.current) return;

    setSaveStatus('saving');
    try {
      await saveStoredScene(scene);
      if (mountedRef.current) setSaveStatus('saved');
    } catch {
      if (mountedRef.current) setSaveStatus('error');
    }
  }, []);

  const syncLatest = useCallback(async () => {
    const scene = latestSceneRef.current;
    if (!scene) return;
    const fingerprint = latestFingerprintRef.current;
    if (fingerprint && fingerprint === lastSyncedFingerprintRef.current) return;
    if (syncInFlightRef.current) return syncInFlightRef.current;

    const operation = (async () => {
      setSyncStatus('syncing');
      const result = await saveSceneToSync(scene);
      if (!mountedRef.current) return;

      if (result.status === 'synced') {
        lastSyncedFingerprintRef.current = fingerprint;
        setLastSyncManifest(result.manifest);
        remoteUpdateRef.current = null;
        setRemoteUpdate(null);
        setSyncStatus('synced');
      } else if (result.status === 'too-large') {
        setSyncStatus('too-large');
      } else if (result.status === 'unavailable') {
        setSyncStatus('unavailable');
      } else {
        setSyncStatus('error');
      }
    })().finally(() => { syncInFlightRef.current = null; });
    syncInFlightRef.current = operation;
    return operation;
  }, []);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => void syncLatest(), SYNC_DELAY_MS);
  }, [syncLatest]);

  const handleChange = useCallback<ExcalidrawOnChange>((elements, appState, files) => {
    if (!readyToPersistRef.current) return;
    const scene = createStoredScene(elements, appState, files, libraryItemsRef.current);
    const fingerprint = sceneFingerprint(scene);
    if (fingerprint === latestFingerprintRef.current) return;

    latestFingerprintRef.current = fingerprint;
    latestSceneRef.current = scene;
    remoteUpdateRef.current = null;
    setRemoteUpdate(null);
    setSaveStatus('saving');

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persistLatest(), SAVE_DELAY_MS);
    scheduleSync();
  }, [persistLatest, scheduleSync]);

  const handleLibraryChange = useCallback((libraryItems: LibraryItems) => {
    libraryItemsRef.current = libraryItems;
    if (!readyToPersistRef.current) return;

    const current = latestSceneRef.current;
    const scene = current
      ? { ...current, libraryItems, savedAt: Date.now() }
      : api
        ? createStoredScene(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles(), libraryItems)
        : null;
    if (!scene) return;

    const fingerprint = sceneFingerprint(scene);
    if (fingerprint === latestFingerprintRef.current) return;
    latestFingerprintRef.current = fingerprint;
    latestSceneRef.current = scene;
    remoteUpdateRef.current = null;
    setRemoteUpdate(null);
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persistLatest(), SAVE_DELAY_MS);
    scheduleSync();
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
    let active = true;
    void getCanvasSyncDeviceId().then((deviceId) => {
      if (active) deviceIdRef.current = deviceId;
    });
    const unsubscribe = subscribeToCanvasSync((manifest) => {
      if (
        manifest.deviceId !== deviceIdRef.current
        && manifest.updatedAt > (latestSceneRef.current?.savedAt ?? 0)
      ) {
        remoteUpdateRef.current = manifest;
        setRemoteUpdate(manifest);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (api && latestSceneRef.current && !lastSyncManifest) scheduleSync();
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

    const current = bookmarkLookup.get(stored.bookmarkId);
    return (
      <BookmarkEmbed
        title={current?.node.title ?? stored.title}
        url={current?.node.url ?? stored.url}
        folderPath={current?.folderPath ?? stored.folderPath}
        missing={!current}
      />
    );
  }, [api, bookmarkLookup]);

  const handleLinkOpen = useCallback<ExcalidrawOnLinkOpen>((element, event) => {
    const stored = getBookmarkElementData(element);
    if (!stored) return;

    event.preventDefault();
    const target = bookmarkLookup.get(stored.bookmarkId)?.node.url ?? stored.url;
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  }, [bookmarkLookup]);

  const addBookmark = useCallback((node: BookmarkNode, folderPath: string) => {
    if (!api || !node.url) return;

    const existing = api.getSceneElements().find((element) => (
      getBookmarkElementData(element)?.bookmarkId === node.id
    ));
    if (existing) {
      api.updateScene({
        appState: { selectedElementIds: { [existing.id]: true } },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.scrollToContent(existing, { animate: true, duration: 260 });
      api.setToast({ message: '这个书签已经在画布中。' });
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
    api.setToast({ message: `已添加“${node.title || '未命名书签'}”。` });
    setSceneRevision((revision) => revision + 1);
  }, [api]);

  const importBookmarkGroups = useCallback((groups: BookmarkImportGroup[]) => {
    if (!api) return;

    const existingIds = new Set(api.getSceneElements().map(getBookmarkElementData).filter(Boolean).map((data) => data!.bookmarkId));
    const pendingGroups = groups.map((group) => ({
      ...group,
      entries: group.entries.filter(({ node }) => !existingIds.has(node.id)),
    })).filter((group) => group.entries.length > 0);

    if (pendingGroups.length === 0) {
      api.setToast({ message: '所选书签已经全部在画布中。' });
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
    api.setToast({ message: `已导入 ${importedCount} 个书签。` });
    setSceneRevision((revision) => revision + 1);
  }, [api]);

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
      api.setToast({ message: bookmarkOnly ? '画布中还没有书签卡片。' : '画布还是空白的。' });
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
    return createStoredScene(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      libraryItemsRef.current,
    );
  }, [api]);

  const exportBackup = useCallback(async () => {
    const scene = getLiveScene();
    if (!scene) throw new Error('画布还没有准备好，请稍后重试。');
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
    <section className="excalidraw-canvas" aria-label="Excalidraw 书签画布">
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
            <span className={`atlas-save-state is-${saveStatus}`} role="status">
              {saveStatus === 'saving' ? <Database size={14} /> : saveStatus === 'error' ? <X size={14} /> : <Check size={14} />}
              {saveStatus === 'saving' ? '保存中' : saveStatus === 'error' ? '保存失败' : '已自动保存'}
            </span>
            <button
              type="button"
              className={`atlas-sync-state is-${remoteUpdate ? 'remote' : syncStatus}`}
              onClick={remoteUpdate ? () => window.location.reload() : undefined}
              title={syncStatusTitle(syncStatus, lastSyncManifest, remoteUpdate)}
            >
              <SyncStatusIcon status={syncStatus} remote={Boolean(remoteUpdate)} />
              {remoteUpdate ? '其他设备有更新' : syncStatusLabel(syncStatus, lastSyncManifest)}
            </button>
            <div className="atlas-zoom-tools" role="group" aria-label="画布缩放">
              <button type="button" onClick={() => zoomBy(0.8)} aria-label="缩小画布"><ZoomOut size={15} /></button>
              <button type="button" onClick={() => zoomBy(1.25)} aria-label="放大画布"><ZoomIn size={15} /></button>
              <button type="button" onClick={() => fitElements(false)} aria-label="适应全部元素" title="适应全部元素（包含绘图、文字和书签）"><Maximize2 size={15} /></button>
              <button type="button" onClick={() => fitElements(true)} aria-label="聚焦全部书签" title="仅聚焦画布中的书签卡片"><BookmarkPlus size={15} /></button>
            </div>
            <button type="button" className="atlas-excalidraw-button" onClick={() => setPickerOpen(true)}>
              <FolderInput size={16} /> 导入书签
            </button>
            <button type="button" className="atlas-excalidraw-button is-secondary" onClick={() => setBackupOpen(true)}>
              <DatabaseBackup size={16} /> 完整备份
            </button>
          </div>
        )}
        langCode="zh-CN"
        name="Bookmark Atlas"
        autoFocus
      />

      {pickerOpen && (
        <BookmarkPicker
          entries={bookmarkEntries}
          groups={importGroups}
          allGroups={topLevelImportGroups}
          importedIds={importedBookmarkIds}
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
      setError(cause instanceof Error ? cause.message : '导出失败，请重试。');
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
      setError(cause instanceof Error ? cause.message : '无法读取备份文件。');
    }
  };

  const runRestore = async () => {
    if (!pendingBackup) return;
    setError('');
    setBusy('restore');
    try {
      await onRestore(pendingBackup);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '恢复未完成，请重试。');
      setBusy(null);
    }
  };

  const restoreScene = pendingBackup?.contents.excalidrawScene;

  return (
    <div className="atlas-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="atlas-bookmark-picker atlas-backup-panel" role="dialog" aria-modal="true" aria-labelledby="atlas-backup-title">
        <header>
          <div>
            <h2 id="atlas-backup-title">完整备份</h2>
            <p>一个 JSON 文件包含画布、图片与附件、素材库，以及视图、主题和搜索引擎配置。</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>

        <div className="atlas-backup-grid">
          <article>
            <span className="atlas-backup-icon"><Download size={20} /></span>
            <div>
              <h3>导出当前完整备份</h3>
              <p>{scene ? `${scene.elements.filter((element) => !element.isDeleted).length} 个画布元素 · ${Object.keys(scene.files).length} 个文件 · ${scene.libraryItems.length} 个素材` : '正在读取画布…'}</p>
            </div>
            <button type="button" className="atlas-excalidraw-button" disabled={!scene || busy !== null} onClick={() => void runExport()}>
              <Download size={15} /> {busy === 'export' ? '正在导出…' : '下载备份'}
            </button>
          </article>

          <article>
            <span className="atlas-backup-icon"><Upload size={20} /></span>
            <div>
              <h3>从完整备份恢复</h3>
              <p>选择此前导出的 JSON。恢复会覆盖本机画布、素材库和插件配置，然后重新加载页面。</p>
            </div>
            <label className="atlas-backup-file">
              <Upload size={15} /> 选择备份文件
              <input type="file" accept="application/json,.json" disabled={busy !== null} onChange={(event) => void readBackup(event.target.files?.[0])} />
            </label>
          </article>
        </div>

        {pendingBackup && restoreScene && (
          <div className="atlas-backup-confirm">
            <div>
              <strong>已验证备份</strong>
              <span>{new Date(pendingBackup.createdAt).toLocaleString()} · {restoreScene.elements.filter((element) => !element.isDeleted).length} 个元素 · {restoreScene.libraryItems.length} 个素材</span>
            </div>
            <button type="button" className="atlas-excalidraw-button" disabled={busy !== null} onClick={() => void runRestore()}>
              {busy === 'restore' ? '正在恢复…' : '确认覆盖并恢复'}
            </button>
          </div>
        )}
        {error && <p className="atlas-backup-error" role="alert">{error}</p>}
        <footer>Chrome 原生书签仍由 Chrome 管理，不会因恢复插件备份而被删除或替换。</footer>
      </section>
    </div>
  );
}

function BookmarkEmbed({
  title,
  url,
  folderPath,
  missing,
}: {
  title: string;
  url: string;
  folderPath?: string;
  missing: boolean;
}) {
  return (
    <div className={`atlas-bookmark-embed ${missing ? 'is-missing' : ''}`}>
      <BookmarkFavicon title={title} url={url} size={42} className="atlas-bookmark-embed__favicon" />
      <div className="atlas-bookmark-embed__copy">
        <strong>{title || '未命名书签'}</strong>
        <span>{hostname(url) || url}</span>
        {folderPath && <small>{folderPath}</small>}
      </div>
      <div className="atlas-bookmark-embed__footer">
        <span>{missing ? 'Chrome 书签已删除' : 'Chrome 书签'}</span>
        <span>使用链接按钮打开</span>
      </div>
    </div>
  );
}

function BookmarkPicker({
  entries,
  groups,
  allGroups,
  importedIds,
  onAdd,
  onImportGroups,
  onClose,
}: {
  entries: BookmarkImportEntry[];
  groups: BookmarkImportGroup[];
  allGroups: BookmarkImportGroup[];
  importedIds: Set<string>;
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
  const importedCount = entries.filter(({ node }) => importedIds.has(node.id)).length;
  const remainingTotal = entries.filter(({ node }) => !importedIds.has(node.id)).length;
  const remainingInGroup = sourceEntries.filter(({ node }) => !importedIds.has(node.id)).length;

  return (
    <div className="atlas-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="atlas-bookmark-picker atlas-bookmark-picker--import" role="dialog" aria-modal="true" aria-labelledby="atlas-picker-title">
        <header>
          <div>
            <h2 id="atlas-picker-title">导入 Chrome 书签</h2>
            <p>Chrome 中新增的书签会自动出现在这里。可以逐个添加、按文件夹导入，或一次导入全部。</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="atlas-import-summary">
          <div>
            <strong>{entries.length}</strong>
            <span>Chrome 书签</span>
          </div>
          <div>
            <strong>{importedCount}</strong>
            <span>已在画布</span>
          </div>
          <button type="button" className="atlas-import-all" disabled={remainingTotal === 0} onClick={() => onImportGroups(allGroups)}>
            <FolderInput size={16} /> {remainingTotal === 0 ? '已全部导入' : `导入剩余 ${remainingTotal} 个`}
          </button>
        </div>
        <div className="atlas-import-layout">
          <aside className="atlas-import-groups" aria-label="书签文件夹组">
            <button type="button" className={!activeGroup ? 'is-active' : ''} onClick={() => setActiveGroupId('all')}>
              <span>全部书签</span><small>{entries.length}</small>
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
                <strong>{activeGroup?.title ?? '全部书签'}</strong>
                <small>{activeGroup?.path || '所有 Chrome 书签'}</small>
              </div>
              {activeGroup && (
                <button type="button" className="secondary-button" disabled={remainingInGroup === 0} onClick={() => onImportGroups([activeGroup])}>
                  <FolderInput size={15} /> {remainingInGroup === 0 ? '本组已导入' : `导入本组 ${remainingInGroup} 个`}
                </button>
              )}
            </div>
            <label className="atlas-bookmark-picker__search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、网址或文件夹" autoFocus />
            </label>
            <div className="atlas-bookmark-picker__list">
              {visible.map(({ node, folderPath }) => {
                const imported = importedIds.has(node.id);
                return (
                  <button type="button" key={node.id} className={`atlas-bookmark-picker__item ${imported ? 'is-imported' : ''}`} disabled={imported} onClick={() => onAdd(node, folderPath)}>
                    <BookmarkFavicon node={node} size={30} />
                    <span>
                      <strong>{node.title || '未命名书签'}</strong>
                      <small>{folderPath || hostname(node.url) || node.url}</small>
                    </span>
                    {imported ? <Check size={17} /> : <BookmarkPlus size={17} />}
                  </button>
                );
              })}
              {visible.length === 0 && <div className="atlas-bookmark-picker__empty">没有匹配的书签。</div>}
            </div>
          </div>
        </div>
        {filtered.length > visible.length && <footer>只显示前 {visible.length} 项，请继续输入关键词缩小范围。</footer>}
      </section>
    </div>
  );
}

async function prepareInitialData(): Promise<{
  data: ImportedDataState;
  stored: StoredExcalidrawScene | null;
  syncManifest: CanvasSyncManifest | null;
}> {
  const [local, synced] = await Promise.all([loadStoredScene(), loadSceneFromSync()]);
  const useSynced = Boolean(synced && (!local || synced.scene.savedAt >= local.savedAt));
  const stored = useSynced && synced
    ? mergeSyncedSceneWithLocalFiles(synced.scene, local)
    : local;
  if (useSynced && stored) await saveStoredScene(stored);

  if (stored) {
    return {
      stored,
      syncManifest: useSynced ? synced?.manifest ?? null : null,
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

function syncStatusLabel(status: SyncStatus, manifest: CanvasSyncManifest | null) {
  if (status === 'syncing') return '同步中';
  if (status === 'too-large') return '画布过大，仅本机';
  if (status === 'error') return '同步失败';
  if (status === 'unavailable') return '仅本机保存';
  if (status === 'synced' && manifest?.excludedFileCount) return '轻量同步 · 附件仅本机';
  if (status === 'synced') return '画布已同步';
  return '等待同步';
}

function syncStatusTitle(
  status: SyncStatus,
  manifest: CanvasSyncManifest | null,
  remote: CanvasSyncManifest | null,
) {
  if (remote) return '其他设备保存了更新。点击重新加载并使用较新的云端画布。';
  if (status === 'too-large') return '压缩后的画布超过 Chrome Sync 安全配额，完整内容仍已保存在本机。';
  if (status === 'error') return 'Chrome Sync 写入失败；完整内容仍已保存在本机。';
  if (status === 'unavailable') return '当前环境没有 Chrome Sync；完整内容保存在本机。';
  if (manifest?.excludedFileCount) return `图形和设置已同步；${manifest.excludedFileCount} 个图片或附件只保存在本机。`;
  return '图形、文字、书签引用、视口和素材库已保存到 Chrome Sync。';
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
