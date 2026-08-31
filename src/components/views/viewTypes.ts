import type { BookmarkNode } from '../../bookmarks/types';
import type { CardSize } from '../../types/ui';

export type { CardSize };

export type BookmarkMoveHandler = (id: string, parentId: string, index?: number) => Promise<void> | void;

export type BookmarkActionHandlers = {
  onSelect?: (node: BookmarkNode) => void;
  onOpenFolder?: (node: BookmarkNode) => void;
  onCreateInFolder?: (node: BookmarkNode) => void;
  onEdit?: (node: BookmarkNode) => void;
  onDelete?: (node: BookmarkNode) => void;
  onMove?: BookmarkMoveHandler;
  canMoveTo?: (draggedId: string, parentId: string) => boolean;
};

export type BookmarkViewProps = BookmarkActionHandlers & {
  bookmarks: BookmarkNode[];
  cardSize?: CardSize;
  selectedId?: string;
  rootParentId?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

export type FlattenedBookmark = {
  node: BookmarkNode;
  depth: number;
};

export const BOOKMARK_DRAG_MIME = 'application/x-bookmark-atlas-node';
export const BOOKMARK_DRAG_TEXT_MIME = 'text/plain';

export function setBookmarkDragData(dataTransfer: DataTransfer, id: string): void {
  dataTransfer.setData(BOOKMARK_DRAG_MIME, id);
  dataTransfer.setData(BOOKMARK_DRAG_TEXT_MIME, id);
}

export function getBookmarkDragData(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(BOOKMARK_DRAG_MIME) || dataTransfer.getData(BOOKMARK_DRAG_TEXT_MIME);
}

export function isFolder(node: BookmarkNode): boolean {
  return !node.url;
}

export function flattenBookmarks(nodes: BookmarkNode[], depth = 0): FlattenedBookmark[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(node.children?.length ? flattenBookmarks(node.children, depth + 1) : []),
  ]);
}

export function getNodeDropParentId(node: BookmarkNode, fallbackParentId: string): string {
  return node.parentId ?? fallbackParentId;
}

export function hostname(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
