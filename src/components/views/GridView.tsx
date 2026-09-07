import { BookmarkCard } from '../BookmarkCard';
import type { BookmarkNode } from '../../bookmarks/types';
import { ChevronRight, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import {
  getBookmarkDragData,
  isFolder,
  type BookmarkViewProps,
} from './viewTypes';
import { t } from '../../i18n';

type GridSection = {
  folder?: BookmarkNode;
  items: BookmarkNode[];
};

type DropTarget = {
  parentId: string;
  index: number;
  itemId?: string;
  edge: 'before' | 'after' | 'end';
};

export function GridView({
  bookmarks,
  cardSize = 'md',
  selectedId,
  rootParentId = 'root',
  emptyTitle = t('emptyBookmarksTitle'),
  emptyDescription = t('emptyBookmarksBody'),
  onSelect,
  onOpenFolder,
  onCreateInFolder,
  onEdit,
  onDelete,
  onMove,
}: BookmarkViewProps) {
  const [draggedId, setDraggedId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<DropTarget>();
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  const draggedIdRef = useRef<string | undefined>(undefined);
  const nodeLookup = useMemo(() => indexNodes(bookmarks), [bookmarks]);
  const canMoveNode = (sourceId: string, destinationId: string) => {
    const source = nodeLookup.get(sourceId);
    const destination = nodeLookup.get(destinationId);
    if (!source || source.readonly || sourceId === destinationId) return false;
    if (destination?.url || destination?.readonlyReason === 'managed' || destination?.readonlyReason === 'root') return false;
    return !containsNode(source, destinationId);
  };
  const clearDragState = () => {
    setDraggedId(undefined);
    draggedIdRef.current = undefined;
    setDropTarget(undefined);
  };
  const getSourceId = (event: DragEvent<HTMLElement>) => (
    getBookmarkDragData(event.dataTransfer) || draggedIdRef.current || draggedId
  );
  const moveTo = async (sourceId: string, parentId: string, index: number, description: string) => {
    if (!onMove) return;
    const sourceTitle = nodeLookup.get(sourceId)?.title || t('bookmark');
    setMoveAnnouncement(t('movingBookmark', [sourceTitle, description]));
    try {
      await onMove(sourceId, parentId, index);
      setMoveAnnouncement(t('movedBookmark', [sourceTitle, description]));
    } catch {
      setMoveAnnouncement(t('moveBookmarkFailed', [sourceTitle, description]));
    }
    clearDragState();
  };

  if (bookmarks.length === 0) {
    return (
      <section className="bookmark-grid bookmark-grid--empty" aria-label={t('gridViewLabel')}>
        <div className="bookmark-grid__empty">
          <strong>{emptyTitle}</strong>
          <span>{emptyDescription}</span>
        </div>
      </section>
    );
  }

  const sections = buildGridSections(bookmarks);
  return (
    <section className={`bookmark-grid bookmark-grid--${cardSize}`} aria-label={t('gridViewLabel')}>
      {sections.map((section) => {
        const sectionKey = section.folder?.id ?? rootParentId;
        const parentId = section.folder?.id ?? rootParentId;
        const title = section.folder?.title ?? t('topLevelBookmarks');
        const canAcceptDrop = Boolean(onMove && draggedId && canMoveNode(draggedId, parentId));
        const isDropTarget = canAcceptDrop && dropTarget?.parentId === parentId && dropTarget.edge === 'end';

        return (
          <section
            className={`bookmark-grid__section ${isDropTarget ? 'is-drop-target' : ''}`.trim()}
            key={sectionKey}
            aria-label={title}
            data-drop-parent-id={parentId}
            onDragStart={(event) => {
              const sourceId = getBookmarkDragData(event.dataTransfer);
              if (sourceId) {
                draggedIdRef.current = sourceId;
                setDraggedId(sourceId);
              }
            }}
            onDragEnd={() => {
              clearDragState();
            }}
            onDragOver={(event) => {
              const sourceId = getSourceId(event);
              if (!sourceId || !onMove || !canMoveNode(sourceId, parentId)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              autoScrollDuringDrag(event);
              setDraggedId(sourceId);
              draggedIdRef.current = sourceId;
              setDropTarget({
                parentId,
                index: normalizeMoveIndex(nodeLookup.get(sourceId), parentId, section.items.length),
                edge: 'end',
              });
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(undefined);
            }}
            onDrop={async (event) => {
              const sourceId = getSourceId(event);
              if (!sourceId || !onMove || !canMoveNode(sourceId, parentId)) return;
              event.preventDefault();
              event.stopPropagation();
              const index = normalizeMoveIndex(nodeLookup.get(sourceId), parentId, section.items.length);
              await moveTo(sourceId, parentId, index, t('moveToFolderEnd', title));
            }}
          >
            <header className={`bookmark-grid__section-header ${section.folder ? 'is-folder' : ''}`}>
              {section.folder ? (
                <button type="button" className="bookmark-grid__section-open" onClick={() => onOpenFolder?.(section.folder!)}>
                  <FolderOpen size={17} />
                  <span>
                    <strong>{title || t('unnamedFolder')}</strong>
                    <small>{t('directTotalItemCount', [String(section.items.length), String(countDescendants(section.folder))])}</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ) : (
                <div className="bookmark-grid__section-label">
                  <strong>{title}</strong><span>{t('itemCount', String(section.items.length))}</span>
                </div>
              )}
              {section.folder && (
                <div className="bookmark-grid__section-actions" aria-label={t('folderGroupActions', title)}>
                  {section.folder.readonlyReason !== 'root' && section.folder.readonlyReason !== 'managed' && onCreateInFolder && (
                    <button type="button" onClick={() => onCreateInFolder(section.folder!)} aria-label={t('createInFolder', title)} title={t('createHere')}><Plus size={15} /></button>
                  )}
                  {!section.folder.readonly && onEdit && (
                    <button type="button" onClick={() => onEdit(section.folder!)} aria-label={`${t('edit')} ${title}`} title={t('editFolder')}><Pencil size={14} /></button>
                  )}
                  {!section.folder.readonly && onDelete && (
                    <button type="button" className="is-danger" onClick={() => onDelete(section.folder!)} aria-label={`${t('delete')} ${title}`} title={t('deleteFolder')}><Trash2 size={14} /></button>
                  )}
                </div>
              )}
            </header>
            <div className="bookmark-grid__drop-hint" aria-hidden="true">{t('moveToFolder', title)}</div>
            <div className="bookmark-grid__cards" role="list">
              {section.items.map((node, itemIndex) => {
                const itemDrop = dropTarget?.parentId === parentId && dropTarget.itemId === node.id
                  ? dropTarget.edge
                  : undefined;
                return (
                <div
                  className={`bookmark-grid__item ${itemDrop ? `is-drop-${itemDrop}` : ''}`.trim()}
                  role="listitem"
                  key={node.id}
                  data-drop-item-id={node.id}
                  onDragOver={(event) => {
                    const sourceId = getSourceId(event);
                    if (!sourceId || !onMove || !canMoveNode(sourceId, parentId)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = 'move';
                    autoScrollDuringDrag(event);
                    setDraggedId(sourceId);
                    draggedIdRef.current = sourceId;
                    if (sourceId === node.id) {
                      setDropTarget(undefined);
                      return;
                    }
                    const edge = getDropEdge(event);
                    const rawIndex = itemIndex + (edge === 'after' ? 1 : 0);
                    setDropTarget({
                      parentId,
                      itemId: node.id,
                      edge,
                      index: normalizeMoveIndex(nodeLookup.get(sourceId), parentId, rawIndex),
                    });
                  }}
                  onDrop={async (event) => {
                    const sourceId = getSourceId(event);
                    if (!sourceId || !onMove || sourceId === node.id || !canMoveNode(sourceId, parentId)) {
                      event.preventDefault();
                      event.stopPropagation();
                      clearDragState();
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    const edge = getDropEdge(event);
                    const rawIndex = itemIndex + (edge === 'after' ? 1 : 0);
                    const index = normalizeMoveIndex(nodeLookup.get(sourceId), parentId, rawIndex);
                    await moveTo(sourceId, parentId, index, edge === 'before'
                      ? t('moveBeforeItem', node.title || t('unnamed'))
                      : t('moveAfterItem', node.title || t('unnamed')));
                  }}
                >
                  <BookmarkCard
                    node={node}
                    cardSize={cardSize}
                    selected={selectedId === node.id}
                    onSelect={onSelect}
                    onOpenFolder={onOpenFolder}
                    onCreateInFolder={onCreateInFolder}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    activeDraggedId={draggedId}
                  />
                </div>
              )})}
            </div>
          </section>
        );
      })}
      <p className="visually-hidden" aria-live="polite">{moveAnnouncement}</p>
    </section>
  );
}

function getDropEdge(event: DragEvent<HTMLElement>): 'before' | 'after' {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0) return 'before';
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

function normalizeMoveIndex(source: BookmarkNode | undefined, parentId: string, insertionIndex: number): number {
  if (source?.parentId === parentId && typeof source.index === 'number' && source.index < insertionIndex) {
    return Math.max(0, insertionIndex - 1);
  }
  return Math.max(0, insertionIndex);
}

function autoScrollDuringDrag(event: DragEvent<HTMLElement>): void {
  const scroller = event.currentTarget.closest<HTMLElement>('.grid-view');
  if (!scroller || typeof scroller.scrollBy !== 'function') return;
  const rect = scroller.getBoundingClientRect();
  const threshold = Math.min(80, rect.height / 4);
  if (threshold <= 0) return;
  if (event.clientY < rect.top + threshold) scroller.scrollBy({ top: -24, behavior: 'auto' });
  if (event.clientY > rect.bottom - threshold) scroller.scrollBy({ top: 24, behavior: 'auto' });
}

function indexNodes(nodes: BookmarkNode[]): Map<string, BookmarkNode> {
  return new Map(nodes.flatMap((node) => [
    [node.id, node] as const,
    ...indexNodes(node.children ?? []),
  ]));
}

function containsNode(node: BookmarkNode, id: string): boolean {
  return (node.children ?? []).some((child) => child.id === id || containsNode(child, id));
}

function countDescendants(folder: BookmarkNode): number {
  return (folder.children ?? []).reduce((total, child) => total + 1 + (child.url ? 0 : countDescendants(child)), 0);
}

function buildGridSections(bookmarks: BookmarkNode[]): GridSection[] {
  const topLevelLooseItems = bookmarks.filter((node) => !isFolder(node));
  const folderSections = bookmarks.filter(isFolder).flatMap(buildFolderSections);

  return topLevelLooseItems.length
    ? [{ items: topLevelLooseItems }, ...folderSections]
    : folderSections;
}

function buildFolderSections(folder: BookmarkNode): GridSection[] {
  return [
    { folder, items: folder.children ?? [] },
    ...(folder.children ?? []).filter(isFolder).flatMap(buildFolderSections),
  ];
}
