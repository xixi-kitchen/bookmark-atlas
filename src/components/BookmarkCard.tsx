import { useState, type DragEvent, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Folder, GripVertical, LockKeyhole, MoreHorizontal } from 'lucide-react';
import type { BookmarkNode } from '../bookmarks/types';
import { BookmarkFavicon } from './BookmarkFavicon';
import {
  getBookmarkDragData,
  hostname,
  isFolder,
  setBookmarkDragData,
  type BookmarkActionHandlers,
  type CardSize,
} from './views/viewTypes';

export type BookmarkCardProps = BookmarkActionHandlers & {
  node: BookmarkNode;
  cardSize?: CardSize;
  depth?: number;
  selected?: boolean;
  className?: string;
  activeDraggedId?: string;
};

export function BookmarkCard({
  node,
  cardSize = 'md',
  depth = 0,
  selected = false,
  className = '',
  activeDraggedId,
  onSelect,
  onOpenFolder,
  onCreateInFolder,
  onEdit,
  onDelete,
  onMove,
  canMoveTo,
}: BookmarkCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const folder = isFolder(node);
  const readonly = Boolean(node.readonly);
  const canAcceptChildren = folder && node.readonlyReason !== 'root' && node.readonlyReason !== 'managed';
  const childCount = node.children?.length ?? 0;
  const faviconSize = cardSize === 'sm' ? 20 : cardSize === 'lg' ? 32 : 24;
  const hasActions = Boolean(node.url || (folder && onOpenFolder) || !readonly);

  const beginStructureDrag = (event: DragEvent<HTMLElement>) => {
    if (readonly) return;
    event.dataTransfer.effectAllowed = 'move';
    setBookmarkDragData(event.dataTransfer, node.id);
    setDragging(true);
  };

  const acceptIntoFolder = (event: DragEvent<HTMLElement>) => {
    if (!canAcceptChildren || !onMove) return;

    const draggedId = getBookmarkDragData(event.dataTransfer) || activeDraggedId;
    if (!draggedId || draggedId === node.id || canMoveTo?.(draggedId, node.id) === false) return;

    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    void Promise.resolve(onMove(draggedId, node.id)).catch(() => undefined);
  };

  const allowFolderDrop = (event: DragEvent<HTMLElement>) => {
    const draggedId = getBookmarkDragData(event.dataTransfer) || activeDraggedId;
    if (canAcceptChildren && onMove && draggedId && canMoveTo?.(draggedId, node.id) !== false) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setDropActive(true);
    }
  };

  const selectNode = () => {
    setActionsOpen(false);
    if (folder && onOpenFolder) {
      onOpenFolder(node);
    } else if (node.url) {
      onSelect?.(node);
      openUrl();
    } else {
      onSelect?.(node);
    }
  };

  const openFolder = (event?: MouseEvent | KeyboardEvent) => {
    event?.stopPropagation();
    setActionsOpen(false);
    if (folder) onOpenFolder?.(node);
  };

  const createInFolder = (event: MouseEvent) => {
    event.stopPropagation();
    setActionsOpen(false);
    if (folder) onCreateInFolder?.(node);
  };

  const requestEdit = (event?: MouseEvent | KeyboardEvent) => {
    event?.stopPropagation();
    setActionsOpen(false);
    if (!readonly) onEdit?.(node);
  };

  const requestDelete = (event: MouseEvent) => {
    event.stopPropagation();
    setActionsOpen(false);
    if (!readonly) onDelete?.(node);
  };

  const openUrl = (event?: MouseEvent) => {
    event?.stopPropagation();
    if (!node.url) return;
    setActionsOpen(false);
    window.open(node.url, '_self', 'noopener,noreferrer');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (node.url) openUrl();
      else selectNode();
    }
    if (event.key === ' ') {
      event.preventDefault();
      selectNode();
    }
    if (event.key === 'F2') requestEdit(event);
    if (event.key === 'Delete' && !readonly) {
      event.preventDefault();
      onDelete?.(node);
    }
  };

  const classes = [
    'bookmark-card',
    `bookmark-card--${cardSize}`,
    folder ? 'bookmark-card--folder' : 'bookmark-card--link',
    selected ? 'is-selected' : '',
    readonly ? 'is-readonly' : '',
    dragging ? 'is-dragging' : '',
    dropActive ? 'is-drop-target' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={classes}
      data-bookmark-id={node.id}
      data-depth={depth}
      data-card-size={cardSize}
      draggable={!readonly}
      onDragStart={beginStructureDrag}
      onDragOver={allowFolderDrop}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
      }}
      onDrop={acceptIntoFolder}
      onDragEnd={() => {
        setDragging(false);
        setDropActive(false);
      }}
    >
      {!readonly && (
        <span className="bookmark-card__drag-handle" draggable aria-label="拖动调整分组或顺序" title="拖动调整分组或顺序">
          <GripVertical size={14} />
        </span>
      )}
      <button
        className={`bookmark-card__main ${selected ? 'is-selected' : ''} ${readonly ? 'is-readonly' : ''}`.trim()}
        type="button"
        data-depth={depth}
        data-card-size={cardSize}
        aria-pressed={selected}
        aria-label={`${folder ? '文件夹' : '书签'}：${node.title || '未命名'}`}
        onClick={selectNode}
        onContextMenu={(event) => {
          if (!hasActions) return;
          event.preventDefault();
          event.stopPropagation();
          setActionsOpen(true);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="bookmark-card__mark" aria-hidden="true">
          {!folder && node.url ? (
            <BookmarkFavicon node={node} size={faviconSize} />
          ) : readonly ? (
            <LockKeyhole size={16} />
          ) : folder ? (
            <Folder size={18} />
          ) : (
            <span />
          )}
        </span>

        <span className="bookmark-card__body">
          <strong className="bookmark-card__title">{node.title || '未命名'}</strong>
          <span className="bookmark-card__meta">
            {folder ? `${childCount} 项` : hostname(node.url)}
          </span>
        </span>
      </button>

      {hasActions && (
        <div
          className={`bookmark-card__actions ${actionsOpen ? 'is-open' : ''}`}
          onBlur={(event: FocusEvent<HTMLDivElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setActionsOpen(false);
          }}
        >
          <button
            className="bookmark-card__menu-trigger"
            type="button"
            aria-label={`${node.title || '未命名'} 的操作`}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            draggable={false}
            onDragStart={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setActionsOpen((open) => !open);
            }}
          >
            <MoreHorizontal size={17} />
          </button>
          {actionsOpen && (
            <div className="bookmark-card__menu" role="menu">
              {node.url && <button type="button" role="menuitem" onClick={openUrl}>打开</button>}
              {folder && onOpenFolder && <button type="button" role="menuitem" onClick={openFolder}>进入文件夹</button>}
              {canAcceptChildren && onCreateInFolder && <button type="button" role="menuitem" onClick={createInFolder}>在此新建</button>}
              {!readonly && <button type="button" role="menuitem" onClick={requestEdit}>编辑</button>}
              {!readonly && <button type="button" role="menuitem" className="is-danger" onClick={requestDelete}>删除</button>}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
