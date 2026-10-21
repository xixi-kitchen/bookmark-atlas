import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns3, Grid3X3, Plus, Sparkles } from 'lucide-react';
import type { BookmarkCreateInput, BookmarkNode } from './bookmarks/types';
import { BookmarkEditor } from './components/BookmarkEditor';
import { AppLogo } from './components/AppLogo';
import { DeleteConfirm } from './components/DeleteConfirm';
import { EngineManager } from './components/EngineManager';
import { FolderNavigator, ViewBreadcrumb } from './components/navigation';
import { LearningGuide } from './onboarding/LearningGuide';
import { AIWalkthroughDemo } from './onboarding/AIWalkthroughDemo';
import { ReleaseInvitation, ReleaseNotes } from './onboarding/ReleaseNotes';
import { useLearningController } from './onboarding/useLearningController';
import type { LearningChapter } from './onboarding/learningState';
import { SearchBar } from './components/SearchBar';
import { SettingsMenu } from './components/SettingsMenu';
import { useLanguagePreference } from './i18n/useLanguagePreference';
import { AISettings } from './ai/AISettings';
import { GridView } from './components/views/GridView';
import { ExcalidrawCanvas } from './excalidraw/ExcalidrawCanvas';
import { ensureYoutubeEmbedIdentityRule } from './excalidraw/youtubeIdentity';
import { getUiLanguage, t, type MessageKey } from './i18n';
import { useBookmarkStore } from './store/bookmarkStore';
import { listenForPreferenceSyncChanges, usePreferencesStore } from './store/preferencesStore';
import { applyTheme } from './themes';
import type { ViewMode } from './types/ui';
import packageMetadata from '../package.json';

const VIEW_OPTIONS: { id: ViewMode; label: MessageKey; icon: typeof Grid3X3 }[] = [
  { id: 'grid', label: 'viewGrid', icon: Grid3X3 },
  { id: 'canvas', label: 'viewCanvas', icon: Columns3 },
];

const APP_VERSION = globalThis.chrome?.runtime?.getManifest?.().version ?? packageMetadata.version;

export function App() {
  useLanguagePreference();
  const bookmarkState = useBookmarkStore();
  const preferences = usePreferencesStore();
  const [editorNode, setEditorNode] = useState<BookmarkNode | 'create' | null>(null);
  const [deleteNode, setDeleteNode] = useState<BookmarkNode | null>(null);
  const [enginesOpen, setEnginesOpen] = useState(false);
  const [aiSettingsOpen, setAISettingsOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string>();
  const [undoVisible, setUndoVisible] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string>();
  const [embedIdentityReady, setEmbedIdentityReady] = useState(false);
  const [aiDemoOpen, setAIDemoOpen] = useState(false);
  const [canvasGuideBlocked, setCanvasGuideBlocked] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [learningAction, setLearningAction] = useState<'import' | 'ai' | 'layout' | 'locate' | null>(null);
  const learning = useLearningController(APP_VERSION, Boolean(editorNode || deleteNode || enginesOpen || aiSettingsOpen || aiDemoOpen || canvasGuideBlocked || bookmarkState.loading || settingsMenuOpen));
  useEffect(() => {
    if (learning.open && learning.progress?.status === 'active') preferences.setViewMode('canvas');
  }, [learning.open, learning.progress?.status]);
  useEffect(() => {
    if (!learningAction || preferences.viewMode !== 'canvas' || !embedIdentityReady || bookmarkState.loading || canvasGuideBlocked) return;
    window.dispatchEvent(new Event(`bookmark-atlas:learning-${learningAction}`));
    setLearningAction(null);
  }, [learningAction, preferences.viewMode, embedIdentityReady, bookmarkState.loading, canvasGuideBlocked]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void bookmarkState.initialize();
    void preferences.hydrate().then(() => {
      if (new URLSearchParams(window.location.search).has('capture')) usePreferencesStore.getState().setViewMode('canvas');
    });
    const stopPreferenceSync = listenForPreferenceSyncChanges();
    void ensureYoutubeEmbedIdentityRule().finally(() => setEmbedIdentityReady(true));
    return () => {
      stopPreferenceSync();
    };
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
  const startChapter = async (chapter: LearningChapter) => {
    if (await learning.start(chapter)) preferences.setViewMode('canvas');
  };
  const canvasGuideAction = (action: 'import' | 'ai' | 'layout' | 'locate') => {
    preferences.setViewMode('canvas');
    // The canvas also exposes these actions through its visible controls.
    setLearningAction(action);
  };
  const openAIConfiguration = () => {
    if (learning.open && learning.progress?.chapter === 'ai') void learning.configureAI();
    setAISettingsOpen(true);
  };

  return (
    <main className={`app-shell card-size-${preferences.cardSize}`} data-view={preferences.viewMode}>
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark"><AppLogo /></div>
          <div><h1>{t('brandName')}</h1><small>v{APP_VERSION} · {t('bookmarksCount', String(countBookmarks(visibleRoots)))} · {t('appTagline')}</small></div>
        </div>

        <SearchBar
          inputRef={searchInputRef}
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
          <button className="primary-button" onClick={() => openCreate(activeFolder && activeFolder.readonlyReason !== 'root' && activeFolder.readonlyReason !== 'managed' ? activeFolder.id : defaultWritableFolder?.id)} aria-label={t('newChromeBookmark')} title={t('newChromeBookmark')}><Plus size={16} /> {t('newChromeBookmark')}</button>
          <SettingsMenu version={APP_VERSION} onManageEngines={() => setEnginesOpen(true)}
            onOpenChange={setSettingsMenuOpen}
            updateUnread={learning.unread}
            newAI={learning.newFeatures.includes('ai')}
            onAISettings={openAIConfiguration}
            onOpenGuide={() => { preferences.setViewMode('canvas'); void learning.show(); }}
            onWhatsNew={() => void learning.showNotes()} />
        </div>
      </header>

      <section className="workspace">
        {bookmarkState.loading && bookmarkState.roots.length === 0 ? (
          <div className="workspace__status"><div className="empty-state__panel"><Sparkles size={24} /><h2>{t('loadingBookmarksTitle')}</h2><p>{t('loadingBookmarksBody')}</p></div></div>
        ) : bookmarkState.error && bookmarkState.roots.length === 0 ? (
          <div className="workspace__status"><div className="empty-state__panel"><h2>{t('readFailed')}</h2><p>{bookmarkState.error}</p><button className="primary-button" onClick={() => void bookmarkState.refresh()}>{t('retry')}</button></div></div>
        ) : preferences.viewMode === 'canvas' ? (
          embedIdentityReady ? (
          <ExcalidrawCanvas roots={visibleRoots} onOpenAISettings={openAIConfiguration} onGuideBlockedChange={setCanvasGuideBlocked}
            learningActive={learning.open && learning.progress?.status === 'active'} learningStep={learning.progress?.step} />
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
      {aiSettingsOpen && <AISettings onClose={() => setAISettingsOpen(false)} />}
      {learning.open && !learning.notesOpen && !aiDemoOpen && !aiSettingsOpen && !canvasGuideBlocked && !editorNode && !deleteNode && !enginesOpen && !settingsMenuOpen && (
        <LearningGuide progress={learning.progress} onStart={(chapter) => void startChapter(chapter)}
          onPause={() => void learning.pause()} onResume={() => void learning.resume()}
          onClose={() => { if (learning.progress?.status !== 'active') void learning.pause(); }}
          onOpenAISettings={openAIConfiguration} onShowAI={() => canvasGuideAction('ai')}
          onPreviewLayout={() => canvasGuideAction('layout')} onLocateBookmarks={() => canvasGuideAction('locate')}
          onOpenImport={() => canvasGuideAction('import')} onDemo={() => setAIDemoOpen(true)} />
      )}
      {aiDemoOpen && <AIWalkthroughDemo onClose={() => setAIDemoOpen(false)} onOpenAISettings={() => { setAIDemoOpen(false); openAIConfiguration(); }} />}
      {learning.notesOpen && <ReleaseNotes version={APP_VERSION} onClose={learning.closeNotes} onStartGuide={(chapter) => void startChapter(chapter)} />}
      {learning.invitation && !learning.open && !learning.notesOpen && !canvasGuideBlocked && !aiSettingsOpen && !editorNode && !deleteNode && !enginesOpen && !settingsMenuOpen && <ReleaseInvitation
        onStart={() => void startChapter(learning.invitation!)} onDefer={() => void learning.deferInvitation()} onReadNotes={() => void learning.showNotes()} />}
      {learning.error && <div className="toast" role="alert">{getUiLanguage() === 'zh-CN' ? '无法保存或恢复使用指南进度，其他功能仍可正常使用。另一标签页可能正在教学。' : 'Could not save or resume learning. Other features still work; another tab may be using the guide.'}<button type="button" onClick={learning.clearError}>{t('close')}</button></div>}
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
