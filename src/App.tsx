import { useEffect, useMemo, useState } from 'react';
import { Columns3, Grid3X3, Plus, Sparkles } from 'lucide-react';
import type { BookmarkCreateInput, BookmarkNode } from './bookmarks/types';
import { BookmarkEditor } from './components/BookmarkEditor';
import { AppLogo } from './components/AppLogo';
import { DeleteConfirm } from './components/DeleteConfirm';
import { EngineManager } from './components/EngineManager';
import { FolderNavigator, ViewBreadcrumb } from './components/navigation';
import { SearchBar } from './components/SearchBar';
import { ToolbarSelectMenu } from './components/ToolbarSelectMenu';
import { GridView } from './components/views/GridView';
import { ExcalidrawCanvas } from './excalidraw/ExcalidrawCanvas';
import { ensureYoutubeEmbedIdentityRule } from './excalidraw/youtubeIdentity';
import { t, type MessageKey } from './i18n';
import { useBookmarkStore } from './store/bookmarkStore';
import { listenForPreferenceSyncChanges, usePreferencesStore } from './store/preferencesStore';
import { applyTheme, THEMES, type ThemeId } from './themes';
import type { CardSize, ViewMode } from './types/ui';
import packageMetadata from '../package.json';

const VIEW_OPTIONS: { id: ViewMode; label: MessageKey; icon: typeof Grid3X3 }[] = [
  { id: 'grid', label: 'viewGrid', icon: Grid3X3 },
  { id: 'canvas', label: 'viewCanvas', icon: Columns3 },
];

const APP_VERSION = globalThis.chrome?.runtime?.getManifest?.().version ?? packageMetadata.version;

export function App() {
  const bookmarkState = useBookmarkStore();
  const preferences = usePreferencesStore();
  const [editorNode, setEditorNode] = useState<BookmarkNode | 'create' | null>(null);
  const [deleteNode, setDeleteNode] = useState<BookmarkNode | null>(null);
  const [enginesOpen, setEnginesOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string>();
  const [undoVisible, setUndoVisible] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string>();
  const [embedIdentityReady, setEmbedIdentityReady] = useState(false);

  useEffect(() => {
    void bookmarkState.initialize();
    void preferences.hydrate();
    const stopPreferenceSync = listenForPreferenceSyncChanges();
    void ensureYoutubeEmbedIdentityRule().finally(() => setEmbedIdentityReady(true));
    return () => stopPreferenceSync();
  }, []);

  useEffect(() => {
    applyTheme(preferences.themeId);
  }, [preferences.themeId]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshBookmarks = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void useBookmarkStore.getState().refresh(), 250);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshBookmarks();
    };

    window.addEventListener('focus', refreshBookmarks);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('focus', refreshBookmarks);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!bookmarkState.lastDeleteSnapshot) return;
    setUndoVisible(true);
    const timer = setTimeout(() => setUndoVisible(false), 10_000);
    return () => clearTimeout(timer);
  }, [bookmarkState.lastDeleteSnapshot]);

  const visibleRoots = bookmarkState.roots[0]?.children ?? bookmarkState.roots;
  const visibleNodes = useMemo(() => indexBookmarkNodes(visibleRoots), [visibleRoots]);
  const folders = useMemo(() => flattenFolders(visibleRoots), [visibleRoots]);
  const selectedNode = bookmarkState.selectedIds[0] ? bookmarkState.nodes[bookmarkState.selectedIds[0]] : undefined;
  const activeFolder = activeFolderId ? bookmarkState.nodes[activeFolderId] : undefined;
  const managedBookmarks = activeFolder?.children ?? visibleRoots;
  const defaultWritableFolder = folders.find((folder) => folder.folderType === 'bookmarks-bar')
    ?? folders.find((folder) => !folder.readonly)
    ?? folders[0];
  const managedParentId = activeFolder?.id ?? defaultWritableFolder?.id ?? bookmarkState.roots[0]?.id;
  const sizeOptions = useMemo(() => ([
    { value: 'sm', label: t('sizeSmall'), description: t('sizeSmallDescription') },
    { value: 'md', label: t('sizeMedium'), description: t('sizeMediumDescription') },
    { value: 'lg', label: t('sizeLarge'), description: t('sizeLargeDescription') },
  ]), []);

  useEffect(() => {
    if (activeFolderId && (!activeFolder || activeFolder.url)) setActiveFolderId(undefined);
  }, [activeFolder, activeFolderId]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input, textarea, select, button')) return;
      if (event.key === 'F2' && selectedNode && !selectedNode.readonly) {
        event.preventDefault();
        setEditorNode(selectedNode);
      }
      if (event.key === 'Delete' && selectedNode && !selectedNode.readonly) {
        event.preventDefault();
        setDeleteNode(selectedNode);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [selectedNode]);

  const select = (node: BookmarkNode) => bookmarkState.setSelected([node.id]);
  const move = async (id: string, parentId: string, index?: number) => {
    await bookmarkState.move(id, parentId, index);
  };
  const saveBookmark = async (value: BookmarkCreateInput) => {
    if (editorNode && editorNode !== 'create') {
      await bookmarkState.update(editorNode.id, { title: value.title, url: editorNode.url ? value.url : undefined });
      if (value.parentId && value.parentId !== editorNode.parentId) {
        await bookmarkState.move(editorNode.id, value.parentId);
      }
    } else {
      await bookmarkState.create(value);
    }
  };
  const confirmDelete = async () => {
    if (!deleteNode) return;
    await bookmarkState.remove(deleteNode.id);
    setDeleteNode(null);
  };
  const openCreate = (parentId?: string) => {
    setCreateParentId(parentId);
    setEditorNode('create');
  };
  const closeEditor = () => {
    setEditorNode(null);
    setCreateParentId(undefined);
  };

  return (
    <main className={`app-shell card-size-${preferences.cardSize}`} data-view={preferences.viewMode}>
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark"><AppLogo /></div>
          <div><h1>{t('brandName')}</h1><small>v{APP_VERSION} · {t('bookmarksCount', String(countBookmarks(visibleRoots)))} · {t('appTagline')}</small></div>
        </div>

        <SearchBar
          engines={preferences.engines}
          activeEngineId={preferences.activeEngineId}
          onEngineChange={preferences.setActiveEngineId}
          onManage={() => setEnginesOpen(true)}
        />

        <div className="topbar__actions">
          <div className="segmented" role="group" aria-label={t('viewGroup')}>
            {VIEW_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} className={preferences.viewMode === id ? 'is-active' : ''} onClick={() => preferences.setViewMode(id)} title={t(label)} aria-label={t(label)}>
                <Icon size={15} />
              </button>
            ))}
          </div>
          <ToolbarSelectMenu
            label={t('cardSize')}
            value={preferences.cardSize}
            options={sizeOptions}
            variant="size"
            onChange={(value) => preferences.setCardSize(value as CardSize)}
          />
          <ToolbarSelectMenu
            label={t('uiStyle')}
            value={preferences.themeId}
            options={Object.values(THEMES).map((theme) => ({
              value: theme.id,
              label: t(theme.nameKey),
              color: theme.tokens.color.accent,
            }))}
            variant="theme"
            onChange={(value) => preferences.setThemeId(value as ThemeId)}
          />
          <button className="primary-button" onClick={() => openCreate(activeFolder && activeFolder.readonlyReason !== 'root' && activeFolder.readonlyReason !== 'managed' ? activeFolder.id : defaultWritableFolder?.id)} title={t('newChromeBookmark')}><Plus size={16} /> {t('newChromeBookmark')}</button>
        </div>
      </header>

      <section className="workspace">
        {bookmarkState.loading && bookmarkState.roots.length === 0 ? (
          <div className="workspace__status"><div className="empty-state__panel"><Sparkles size={24} /><h2>{t('loadingBookmarksTitle')}</h2><p>{t('loadingBookmarksBody')}</p></div></div>
        ) : bookmarkState.error && bookmarkState.roots.length === 0 ? (
          <div className="workspace__status"><div className="empty-state__panel"><h2>{t('readFailed')}</h2><p>{bookmarkState.error}</p><button className="primary-button" onClick={() => void bookmarkState.refresh()}>{t('retry')}</button></div></div>
        ) : preferences.viewMode === 'canvas' ? (
          embedIdentityReady ? (
            <ExcalidrawCanvas roots={visibleRoots} />
          ) : (
            <div className="workspace__status"><div className="empty-state__panel"><Sparkles size={24} /><h2>{t('preparingEmbedsTitle')}</h2><p>{t('preparingEmbedsBody')}</p></div></div>
          )
        ) : (
          <div className="managed-view">
            <FolderNavigator
              roots={visibleRoots}
              selectedFolderId={activeFolderId}
              onSelectFolder={(folder) => setActiveFolderId(folder?.id)}
            />
            <div className="managed-view__content">
              <div className="grid-view">
                <ViewBreadcrumb
                  nodes={visibleNodes}
                  currentFolderId={activeFolderId}
                  onNavigate={(folder) => setActiveFolderId(folder?.id)}
                />
                <GridView
                  bookmarks={managedBookmarks}
                  cardSize={preferences.cardSize}
                  selectedId={bookmarkState.selectedIds[0]}
                  rootParentId={managedParentId}
                  onSelect={select}
                  onOpenFolder={(folder) => setActiveFolderId(folder.id)}
                  onCreateInFolder={(folder) => openCreate(folder.id)}
                  onEdit={setEditorNode}
                  onDelete={setDeleteNode}
                  onMove={move}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {editorNode && (
        <BookmarkEditor
          key={editorNode === 'create' ? 'create' : editorNode.id}
          node={editorNode === 'create' ? undefined : editorNode}
          folders={folders}
          initialParentId={createParentId ?? (activeFolder && activeFolder.readonlyReason !== 'root' && activeFolder.readonlyReason !== 'managed'
            ? activeFolder.id
            : defaultWritableFolder?.id)}
          onSave={saveBookmark}
          onClose={closeEditor}
        />
      )}
      {deleteNode && <DeleteConfirm node={deleteNode} onConfirm={confirmDelete} onClose={() => setDeleteNode(null)} />}
      {enginesOpen && <EngineManager engines={preferences.engines} onChange={preferences.setEngines} onClose={() => setEnginesOpen(false)} />}
      {undoVisible && bookmarkState.lastDeleteSnapshot && (
        <div className="toast" role="status">{t('deletedToast', bookmarkState.lastDeleteSnapshot.node.title)}<button onClick={() => void bookmarkState.undoDelete().then(() => setUndoVisible(false))}>{t('undo')}</button></div>
      )}
      {bookmarkState.error && bookmarkState.roots.length > 0 && <div className="toast" role="alert">{bookmarkState.error}</div>}
    </main>
  );
}

function flattenFolders(nodes: BookmarkNode[]): BookmarkNode[] {
  return nodes.flatMap((node) => node.type === 'folder' ? [node, ...flattenFolders(node.children ?? [])] : []);
}

function indexBookmarkNodes(nodes: BookmarkNode[]): Record<string, BookmarkNode> {
  return Object.fromEntries(nodes.flatMap((node) => [
    [node.id, node] as const,
    ...Object.entries(indexBookmarkNodes(node.children ?? [])),
  ]));
}

function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countBookmarks(node.children ?? []), 0);
}
