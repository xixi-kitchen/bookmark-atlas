import { memo, type DragEvent, type MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ExternalLink, Folder, Grip, LockKeyhole, Pencil, Trash2 } from 'lucide-react';
import type { BookmarkNode } from '../bookmarks/types';
import { BookmarkFavicon } from '../components/BookmarkFavicon';

export type CanvasNodeData = {
  bookmark: BookmarkNode;
  onEdit: (node: BookmarkNode) => void;
  onDelete: (node: BookmarkNode) => void;
  onStructureMove: (id: string, parentId: string, index?: number) => void;
};

function BookmarkCanvasNodeComponent({ data, selected }: NodeProps) {
  const { bookmark, onEdit, onDelete, onStructureMove } = data as CanvasNodeData;
  const isFolder = !bookmark.url;
  const canAcceptChildren = isFolder && bookmark.readonlyReason !== 'root' && bookmark.readonlyReason !== 'managed';

  const beginStructureDrag = (event: DragEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-bookmark-atlas-node', bookmark.id);
  };

  const acceptIntoFolder = (event: DragEvent<HTMLElement>) => {
    if (!canAcceptChildren) return;
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData('application/x-bookmark-atlas-node');
    if (id && id !== bookmark.id) onStructureMove(id, bookmark.id);
  };

  const acceptSiblingOrder = (event: DragEvent<HTMLElement>, after: boolean) => {
    if (!bookmark.parentId || bookmark.readonlyReason === 'system' || bookmark.readonlyReason === 'root') return;
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData('application/x-bookmark-atlas-node');
    if (!id || id === bookmark.id) return;
    onStructureMove(id, bookmark.parentId, Math.max(0, (bookmark.index ?? 0) + (after ? 1 : 0)));
  };

  const openBookmark = (event: MouseEvent) => {
    if (!bookmark.url || (event.target as HTMLElement).closest('button')) return;
    window.location.assign(bookmark.url);
  };

  return (
    <article
      className={`canvas-node ${isFolder ? 'is-folder' : 'is-link'} ${selected ? 'is-selected' : ''}`}
      onDoubleClick={() => !bookmark.readonly && onEdit(bookmark)}
      onClick={openBookmark}
      onDragOver={(event) => canAcceptChildren && event.preventDefault()}
      onDrop={acceptIntoFolder}
      aria-label={`${isFolder ? '文件夹' : '书签'}：${bookmark.title}`}
    >
      <div className="canvas-node__sort-slot canvas-node__sort-slot--before nodrag" onDragOver={(event) => event.preventDefault()} onDrop={(event) => acceptSiblingOrder(event, false)} />
      <Handle type="target" position={Position.Left} className="canvas-node__handle" />
      <div className="canvas-node__mark" aria-hidden="true">
        {!isFolder ? <BookmarkFavicon node={bookmark} size={24} /> : bookmark.readonly ? <LockKeyhole size={16} /> : <Folder size={18} />}
      </div>
      <div className="canvas-node__copy">
        <strong>{bookmark.title || '未命名'}</strong>
        <small>{isFolder ? `${bookmark.children?.length ?? 0} 项` : hostname(bookmark.url)}</small>
      </div>
      <div className="canvas-node__actions nodrag">
        {!bookmark.readonly && (
          <>
            <button draggable onDragStart={beginStructureDrag} title="调整真实书签结构" aria-label="调整真实书签结构">
              <Grip size={14} />
            </button>
            <button onClick={() => onEdit(bookmark)} title="编辑" aria-label="编辑">
              <Pencil size={14} />
            </button>
            <button onClick={() => onDelete(bookmark)} title="删除" aria-label="删除">
              <Trash2 size={14} />
            </button>
          </>
        )}
        {bookmark.url && <ExternalLink size={13} aria-hidden="true" />}
      </div>
      <Handle type="source" position={Position.Right} className="canvas-node__handle" />
      <div className="canvas-node__sort-slot canvas-node__sort-slot--after nodrag" onDragOver={(event) => event.preventDefault()} onDrop={(event) => acceptSiblingOrder(event, true)} />
    </article>
  );
}

function hostname(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const BookmarkCanvasNode = memo(BookmarkCanvasNodeComponent);
